import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getSession, getTenantId } from '@/lib/auth';
import { normalizeCompany, companyScore } from '@/lib/pipeline/intelligence';
import type { ScanProfileConfig } from '@/lib/pipeline/scan-profile';

/**
 * CSV Upload Pipeline
 * 
 * Process 1, input method (b): User uploads CSV with data from external sources.
 * The system parses it, maps columns, creates/updates companies, and scores them.
 * 
 * Phase 1: Column mapping is automatic (heuristic-based) with manual override.
 * Phase 3: This becomes a UI wizard with preview.
 */

interface CSVParseResult {
  headers: string[];
  rows: string[][];
}

/** Parse CSV text into headers + rows. Handles quoted fields, commas in quotes, etc. */
function parseCSV(text: string): CSVParseResult {
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === '\n' && !inQuotes) {
      lines.push(current);
      current = '';
    } else if (char === '\r' && !inQuotes) {
      // Skip \r
    } else {
      current += char;
    }
  }
  if (current) lines.push(current);
  
  if (lines.length === 0) return { headers: [], rows: [] };
  
  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let field = '';
    let inQ = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const next = line[i + 1];
      
      if (char === '"' && inQ && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQ = !inQ;
      } else if (char === ',' && !inQ) {
        fields.push(field.trim());
        field = '';
      } else {
        field += char;
      }
    }
    fields.push(field.trim());
    return fields;
  };
  
  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).filter(l => l.trim()).map(parseLine);
  
  return { headers, rows };
}

/** Column mapping heuristics — match header names to known fields */
const FIELD_HINTS: Record<string, string[]> = {
  name: ['company', 'company name', 'business', 'business name', 'organisation', 'organization', 'employer', 'firm', 'name'],
  website: ['website', 'url', 'web', 'domain', 'site', 'homepage'],
  phone: ['phone', 'tel', 'telephone', 'mobile', 'contact number', 'phone number'],
  email: ['email', 'e-mail', 'mail', 'contact email', 'enquiries'],
  country: ['country', 'region', 'nation'],
  location: ['location', 'address', 'city', 'town', 'area', 'postcode', 'zip'],
  industry: ['industry', 'sector', 'type', 'business type', 'category'],
  employeeRange: ['employees', 'employee range', 'company size', 'size', 'staff'],
  notes: ['notes', 'description', 'details', 'comments', 'info', 'about'],
};

function mapColumns(headers: string[]): Record<string, number> {
  const mapping: Record<string, number> = {};
  
  for (const [field, hints] of Object.entries(FIELD_HINTS)) {
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i].toLowerCase().trim();
      if (hints.some(h => header === h || header.includes(h))) {
        if (mapping[field] === undefined) {
          mapping[field] = i;
        }
      }
    }
  }
  
  return mapping;
}

interface UploadedCompany {
  name: string;
  website?: string;
  phone?: string;
  email?: string;
  country?: string;
  location?: string;
  industry?: string;
  employeeRange?: string;
  notes?: string;
}

function extractCompanies(rows: string[][], mapping: Record<string, number>): UploadedCompany[] {
  return rows
    .map(row => {
      const get = (field: string): string | undefined => {
        const idx = mapping[field];
        if (idx === undefined || idx >= row.length) return undefined;
        const val = row[idx]?.trim();
        return val || undefined;
      };
      
      const name = get('name');
      if (!name) return null;
      
      return {
        name,
        website: get('website'),
        phone: get('phone'),
        email: get('email'),
        country: get('country'),
        location: get('location'),
        industry: get('industry'),
        employeeRange: get('employeeRange'),
        notes: get('notes'),
      } as UploadedCompany;
    })
    .filter((c): c is UploadedCompany => c !== null);
}

function parseEmployeeCount(range?: string): number | null {
  if (!range) return null;
  const m = range.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (m) return Math.round((parseInt(m[1]) + parseInt(m[2])) / 2);
  const single = range.match(/(\d+)/);
  if (single) return parseInt(single[1]);
  return null;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const contentType = req.headers.get('content-type') || '';
  
  let csvText: string;
  let profileId: number | null = null;
  let batchName: string | null = null;
  
  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    
    csvText = await file.text();
    profileId = formData.get('profileId') ? parseInt(formData.get('profileId') as string) : null;
    batchName = formData.get('batchName') as string || null;
  } else {
    const body = await req.json();
    csvText = body.csvText;
    profileId = body.profileId || null;
    batchName = body.batchName || null;
  }
  
  if (!csvText || csvText.trim().length === 0) {
    return NextResponse.json({ error: 'CSV data is empty' }, { status: 400 });
  }
  
  // Parse CSV
  const { headers, rows } = parseCSV(csvText);
  if (headers.length === 0 || rows.length === 0) {
    return NextResponse.json({ error: 'Could not parse CSV — no headers or rows found' }, { status: 400 });
  }
  
  // Auto-map columns
  const mapping = mapColumns(headers);
  
  if (mapping.name === undefined) {
    return NextResponse.json({ 
      error: 'Could not identify a company name column. Headers found: ' + headers.join(', '),
      headers,
      mapping,
    }, { status: 400 });
  }
  
  // Extract companies from CSV
  const uploaded = extractCompanies(rows, mapping);
  
  if (uploaded.length === 0) {
    return NextResponse.json({ error: 'No valid company rows found in CSV' }, { status: 400 });
  }
  
  // Load scan profile for scoring (if provided)
  let profileConfig: ScanProfileConfig | null = null;
  if (profileId) {
    const profile = await prisma.scanProfile.findFirst({
      where: { id: profileId, tenantId: getTenantId(session) },
    });
    if (profile) {
      profileConfig = profile.config as unknown as ScanProfileConfig;
    }
  }
  
  const scoring = profileConfig?.scoring || null;
  
  // Create batch if requested
  let batchId: number | null = null;
  if (batchName) {
    const batch = await prisma.batch.create({
      data: {
        name: batchName,
        tenantId: getTenantId(session),
        profileId: profileId || null,
      },
    });
    batchId = batch.id;
  }
  
  // Process companies
  const stats = {
    total: uploaded.length,
    created: 0,
    updated: 0,
    skipped: 0,
    scored: 0,
    errors: 0,
  };
  
  const results: { name: string; action: 'created' | 'updated' | 'skipped'; id?: number; score?: number }[] = [];
  
  for (const u of uploaded) {
    try {
      const country = u.country || 'UK';
      const norm = normalizeCompany(u.name);
      
      // Check for existing company
      let company = await prisma.company.findFirst({
        where: { normalizedName: norm, country, tenantId: getTenantId(session) },
      });
      
      if (company) {
        // Update with any new data
        const updateData: any = {};
        if (u.website && !company.website) updateData.website = u.website;
        if (u.phone && !company.phone) updateData.phone = u.phone;
        if (u.email && !company.email) updateData.email = u.email;
        if (u.location && !company.location) updateData.location = u.location;
        if (u.industry && !company.industry) updateData.industry = u.industry;
        if (u.employeeRange && !company.employeeRange) {
          updateData.employeeRange = u.employeeRange;
          const count = parseEmployeeCount(u.employeeRange);
          if (count !== null && !company.employeeCount) updateData.employeeCount = count;
        }
        if (u.notes && !company.notes) updateData.notes = u.notes;
        
        if (Object.keys(updateData).length > 0) {
          company = await prisma.company.update({
            where: { id: company.id },
            data: updateData,
          });
          stats.updated++;
          results.push({ name: u.name, action: 'updated', id: company.id });
        } else {
          stats.skipped++;
          results.push({ name: u.name, action: 'skipped', id: company.id });
        }
      } else {
        // Create new company
        const employeeCount = parseEmployeeCount(u.employeeRange);
        company = await prisma.company.create({
          data: {
            name: u.name,
            normalizedName: norm,
            country,
            website: u.website || null,
            phone: u.phone || null,
            email: u.email || null,
            location: u.location || null,
            industry: u.industry || null,
            employeeRange: u.employeeRange || null,
            employeeCount: employeeCount,
            notes: u.notes || null,
            tenantId: getTenantId(session),
          },
        });
        stats.created++;
        results.push({ name: u.name, action: 'created', id: company.id });
      }
      
      // Link to batch if created
      if (batchId) {
        await prisma.company.update({
          where: { id: company.id },
          data: { batches: { connect: { id: batchId } } },
        });
      }
      
      // Score the company (using profile scoring if available)
      const jobs = await prisma.jobAdvert.findMany({
        where: { companyId: company.id, isActive: true },
      });
      
      const jobsForScoring = jobs.map(j => ({
        signals: (j.taskSignals || '').split(',').map(s => s.trim()).filter(Boolean),
        salary_high: j.annualSalaryHigh,
      }));
      
      const { total, reason, recurring, summary, salary } = companyScore(
        jobsForScoring,
        company.email,
        company.phone,
        company.employeeCount,
        scoring
      );
      
      await prisma.company.update({
        where: { id: company.id },
        data: {
          activeJobCount: jobs.length,
          totalJobCount: await prisma.jobAdvert.count({ where: { companyId: company.id } }),
          estimatedSalarySpend: salary,
          opportunityScore: total,
          scoreReason: reason,
          recurringTasks: recurring || (company.recurringTasks || ''),
          opportunitySummary: summary,
          lastSeenAt: new Date(),
        },
      });
      
      stats.scored++;
    } catch (e: any) {
      stats.errors++;
      results.push({ name: u.name, action: 'skipped' });
    }
  }
  
  const message = `Processed ${stats.total} companies: ${stats.created} created, ${stats.updated} updated, ${stats.skipped} skipped, ${stats.scored} scored.`;
  
  return NextResponse.json({
    ok: true,
    message,
    stats,
    mapping: Object.fromEntries(
      Object.entries(mapping).map(([k, v]) => [k, headers[v]])
    ),
    results: results.slice(0, 100), // Limit results in response
    batchId,
  });
}

/** GET — return field hints for UI preview/mapping */
export async function GET() {
  return NextResponse.json({
    fields: Object.keys(FIELD_HINTS),
    hints: FIELD_HINTS,
  });
}
