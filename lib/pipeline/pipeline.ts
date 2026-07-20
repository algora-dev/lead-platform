import { prisma } from '@/lib/prisma';
import { IGNORE_DOMAINS as DEFAULT_IGNORE_DOMAINS, JOB_BOARD_DOMAINS, SCORING as DEFAULT_SCORING } from './config';
import { buildQueries, braveSearch, officialSiteSearch } from './collector';
import { parseJob, canonicalise, countryOk, EMAIL_RE, PHONE_RE, clean } from './parser';
import { taskSignals, advertScore, normalizeCompany, enrichCompany, companyScore, parseEmployeeRange } from './intelligence';
import type { ScanProfileConfig } from './scan-profile';

export interface ScanStats {
  searchRequests: number;
  resultsFound: number;
  pagesFetched: number;
  duplicateAdverts: number;
  advertsSaved: number;
  companiesCreated: number;
  companiesUpdated: number;
  contactsFound: number;
  errors: number;
}

/** Merge profile scoring over defaults */
function mergeScoring(profileScoring: ScanProfileConfig['scoring']) {
  return { ...DEFAULT_SCORING, ...profileScoring };
}

export async function runScan(
  country: string,
  tenantId: number,
  profileConfig: ScanProfileConfig,
  profileId: number | null,
  queryLimit?: number,
  batchId?: number
): Promise<{ message: string; stats: ScanStats }> {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) throw new Error('BRAVE_API_KEY is missing from .env');

  const countryCode = country === 'UK' ? 'GB' : country === 'NZ' ? 'NZ' : 'GB';
  const scoring = mergeScoring(profileConfig.scoring);
  const jobTerms = profileConfig.jobTerms;
  const ignoreDomains = [...DEFAULT_IGNORE_DOMAINS, ...profileConfig.ignoreDomains];
  const taskGroups = profileConfig.taskGroups;
  const queryPairs = profileConfig.brave.queryPairs;
  const limit = queryLimit || profileConfig.brave.defaultQueryLimit || 16;

  // Determine deep offset based on prior scan count for this profile
  const priorScans = await prisma.scanRun.count({
    where: { country, tenantId, profileId },
  });
  const deep = 1 + (priorScans % 9);

  const scanRun = await prisma.scanRun.create({
    data: {
      source: 'BRAVE',
      country,
      status: 'RUNNING',
      deepOffset: deep,
      tenantId,
      profileId,
    },
  });

  const stats: ScanStats = {
    searchRequests: 0,
    resultsFound: 0,
    pagesFetched: 0,
    duplicateAdverts: 0,
    advertsSaved: 0,
    companiesCreated: 0,
    companiesUpdated: 0,
    contactsFound: 0,
    errors: 0,
  };

  const touched = new Set<number>();

  try {
    // Build queries from profile config
    const place = country === 'UK' ? 'UK' : country === 'NZ' ? 'New Zealand' : country;
    const negatives = (profileConfig.brave.negativeTerms || [])
      .map((t: string) => `-${t}`)
      .join(' ');
    const queries = queryPairs.map(
      ([a, b]) => `"${a}" "${b}" job ${place} ${negatives}`.trim()
    ).slice(0, limit);

    for (const query of queries) {
      for (const offset of [0, deep]) {
        let results;
        try {
          results = await braveSearch(apiKey, query, countryCode, profileConfig.brave.resultsPerPage || 20, offset);
          stats.searchRequests++;
        } catch {
          stats.errors++;
          continue;
        }

        stats.resultsFound += results.length;

        for (const item of results) {
          const url = canonicalise(item.url);
          let host: string;
          try { host = new URL(url).hostname.toLowerCase(); } catch { continue; }

          const snippet = `${item.title} ${item.description} ${url}`.toLowerCase();

          if (!url || ignoreDomains.some((d) => host.includes(d))) continue;
          if (!jobTerms.some((x) => snippet.includes(x.toLowerCase()))) continue;
          if (!Object.values(taskGroups).some((terms) => (terms as string[]).some((term) => snippet.includes(term.toLowerCase())))) continue;

          // Check for existing advert
          const existing = await prisma.jobAdvert.findFirst({
            where: { OR: [{ canonicalUrl: url }, { sourceUrl: url }], company: { tenantId } },
          });

          if (existing) {
            await prisma.jobAdvert.update({
              where: { id: existing.id },
              data: { lastSeenAt: new Date(), isActive: true },
            });
            touched.add(existing.companyId);
            stats.duplicateAdverts++;
            continue;
          }

          const page = await parseJob(url);
          stats.pagesFetched++;

          if (!page || !page.company || !countryOk(country, `${page.description} ${page.location}`, page.url)) {
            continue;
          }

          const signals = taskSignals(page.description, taskGroups);
          if (signals.length === 0) continue;

          const norm = normalizeCompany(page.company);
          let company = await prisma.company.findFirst({
            where: { normalizedName: norm, country, tenantId },
          });

          let cid: number;
          if (company) {
            cid = company.id;
            stats.companiesUpdated++;
          } else {
            company = await prisma.company.create({
              data: {
                name: page.company,
                normalizedName: norm,
                country,
                location: page.location,
                tenantId,
              },
            });
            cid = company.id;
            stats.companiesCreated++;
          }

          await prisma.jobAdvert.create({
            data: {
              companyId: cid,
              title: page.title || 'Job advert',
              country,
              location: page.location,
              salaryText: page.salary_text,
              annualSalaryHigh: page.salary_high,
              source: 'BRAVE',
              sourceUrl: page.url,
              canonicalUrl: page.url,
              discoveryQuery: query,
              description: page.description,
              taskSignals: signals.join(', '),
              advertScore: advertScore(signals, scoring),
              isActive: true,
            },
          });
          stats.advertsSaved++;
          touched.add(cid);

          // Link to batch if provided
          if (batchId) {
            await prisma.company.update({
              where: { id: cid },
              data: { batches: { connect: { id: batchId } } },
            });
          }

          // Update company contact info if found on the job page
          if (page.emails.length > 0 || page.phones.length > 0 || page.website) {
            await prisma.company.update({
              where: { id: cid },
              data: {
                email: page.emails[0] || undefined,
                phone: page.phones[0] || undefined,
                website: page.website || undefined,
              },
            });
          }
        }
      }
    }

    // Score all touched companies
    for (const cid of touched) {
      const comp = await prisma.company.findUnique({ where: { id: cid } });
      if (!comp) continue;

      const jobs = await prisma.jobAdvert.findMany({
        where: { companyId: cid, isActive: true },
      });

      const jobsForScoring = jobs.map((j) => ({
        signals: (j.taskSignals || '').split(',').map((s) => s.trim()).filter(Boolean),
        salary_high: j.annualSalaryHigh,
      }));

      let info = {
        website: comp.website,
        email: comp.email,
        phone: comp.phone,
        contact_source: comp.contactSourceUrl,
        employee_range: comp.employeeRange,
        employee_count: comp.employeeCount,
      };

      // Enrich if missing contact or employee data
      if ((!info.email && !info.phone) || info.employee_count === null) {
        try {
          const extra = await enrichCompany(comp.name, apiKey, countryCode, officialSiteSearch);
          stats.searchRequests++;
          info = {
            website: info.website || extra.website,
            email: info.email || extra.email,
            phone: info.phone || extra.phone,
            contact_source: info.contact_source || extra.contact_source,
            employee_range: info.employee_range || extra.employee_range,
            employee_count: info.employee_count ?? extra.employee_count,
          };
        } catch {
          stats.errors++;
        }
      }

      if (info.email || info.phone) stats.contactsFound++;

      const { total, reason, recurring, summary, salary } = companyScore(
        jobsForScoring,
        info.email,
        info.phone,
        info.employee_count,
        scoring
      );

      await prisma.company.update({
        where: { id: cid },
        data: {
          website: info.website,
          email: info.email,
          phone: info.phone,
          contactSourceUrl: info.contact_source,
          employeeRange: info.employee_range,
          employeeCount: info.employee_count,
          activeJobCount: jobs.length,
          totalJobCount: await prisma.jobAdvert.count({ where: { companyId: cid } }),
          estimatedSalarySpend: salary,
          opportunityScore: total,
          scoreReason: reason,
          recurringTasks: recurring,
          opportunitySummary: summary,
          lastSeenAt: new Date(),
        },
      });
    }

    const message = `Saved ${stats.advertsSaved} adverts; created ${stats.companiesCreated} companies and updated ${stats.companiesUpdated} company matches.`;

    await prisma.scanRun.update({
      where: { id: scanRun.id },
      data: {
        completedAt: new Date(),
        status: 'COMPLETED',
        ...stats,
        message,
      },
    });

    return { message, stats };
  } catch (e: any) {
    await prisma.scanRun.update({
      where: { id: scanRun.id },
      data: {
        completedAt: new Date(),
        status: 'FAILED',
        errors: stats.errors + 1,
        message: e.message,
      },
    });
    throw e;
  }
}
