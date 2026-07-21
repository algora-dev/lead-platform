import { isV2Enabled } from '@/lib/v2/feature-flag';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getSession, getTenantId } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isV2Enabled())) redirect('/');

  const session = await getSession();
  if (!session) redirect('/login');
  const tid = getTenantId(session);
  const { id } = await params;
  const companyId = parseInt(id);

  const company = await prisma.company.findFirst({
    where: { id: companyId, tenantId: tid },
    include: {
      evidenceItems: {
        include: { claims: true },
        orderBy: { collectedAt: 'desc' },
      },
      assessmentSnapshots: {
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
      companyAliases: true,
      scanCandidates: {
        include: { scan: { select: { id: true, name: true, createdAt: true } } },
        orderBy: { profileScore: 'desc' },
      },
    },
  });

  if (!company) notFound();

  const latestAssessment = company.assessmentSnapshots[0];
  const facts = (company.materialisedFacts as any) || {};

  return (
    <div className="page-header">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>{company.name}</h1>
          <p style={{ color: '#6b7280' }}>
            {company.industry || 'Unknown industry'}
            {company.location && ` • ${company.location}`}
            {company.website && ` • `}
            {company.website && <a href={company.website} target="_blank" rel="noopener">{company.website}</a>}
          </p>
        </div>
        {latestAssessment && (
          <div style={{ display: 'flex', gap: 12 }}>
            <ScoreCard label="Profile" score={latestAssessment.profileScore} />
            <ScoreCard label="Confidence" score={latestAssessment.confidenceScore} />
            <ScoreCard label="Combined" score={latestAssessment.combinedScore} highlight />
          </div>
        )}
      </div>

      {/* Score Breakdown */}
      {latestAssessment && latestAssessment.confidenceBreakdown && (
        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-head"><h2>Score Breakdown</h2></div>
          <div style={{ padding: 16 }}>
            {(latestAssessment.confidenceBreakdown as any[]).map((c) => (
              <div key={c.criterionId} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <strong>{c.label}</strong>
                  <span>{c.awardedPoints}/{c.maxPoints} pts</span>
                </div>
                <div style={{ background: '#f3f4f6', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                  <div style={{
                    width: `${(c.awardedPoints / c.maxPoints) * 100}%`,
                    height: '100%',
                    background: c.awardedPoints / c.maxPoints >= 0.7 ? '#16a34a' : c.awardedPoints / c.maxPoints >= 0.4 ? '#ca8a04' : '#dc2626',
                  }} />
                </div>
                <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{c.explanation}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Summary + Outreach Rationale */}
      {latestAssessment && (latestAssessment.aiSummary || latestAssessment.outreachRationale) && (
        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-head"><h2>Assessment Summary</h2></div>
          <div style={{ padding: 16 }}>
            {latestAssessment.aiSummary && (
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 14, color: '#6b7280', marginBottom: 4 }}>Summary</h3>
                <p>{latestAssessment.aiSummary}</p>
              </div>
            )}
            {latestAssessment.outreachRationale && (
              <div>
                <h3 style={{ fontSize: 14, color: '#6b7280', marginBottom: 4 }}>Outreach Rationale</h3>
                <p>{latestAssessment.outreachRationale}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Contradictions & Unknowns */}
      {(latestAssessment?.contradictions?.length || latestAssessment?.unknowns?.length) ? (
        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-head"><h2>Contradictions & Unknowns</h2></div>
          <div style={{ padding: 16 }}>
            {latestAssessment?.contradictions?.map((c, i) => (
              <div key={i} style={{ padding: '4px 0', color: '#dc2626' }}>⚠ {c}</div>
            ))}
            {latestAssessment?.unknowns?.map((u, i) => (
              <div key={i} style={{ padding: '4px 0', color: '#6b7280' }}>? {u}</div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Materialised Facts */}
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-head"><h2>Company Facts (from Evidence)</h2></div>
        <div style={{ padding: 16 }}>
          <FactsGrid facts={facts} company={company} />
        </div>
      </div>

      {/* Evidence Timeline */}
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-head"><h2>Evidence Timeline ({company.evidenceItems.length} items)</h2></div>
        {company.evidenceItems.length === 0 ? (
          <div style={{ padding: 16, color: '#6b7280' }}>No evidence collected yet.</div>
        ) : (
          <div style={{ padding: 16 }}>
            {company.evidenceItems.map((item) => (
              <div key={item.id} style={{ borderBottom: '1px solid #f3f4f6', padding: '12px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontWeight: 500 }}>{item.evidenceType.replace(/_/g, ' ')}</span>
                    {item.sourceDomain && (
                      <span style={{ color: '#9ca3af', marginLeft: 8 }}>{item.sourceDomain}</span>
                    )}
                    <span style={{
                      marginLeft: 8,
                      padding: '1px 6px',
                      borderRadius: 8,
                      fontSize: 11,
                      background: item.reliability >= 70 ? '#dcfce7' : item.reliability >= 50 ? '#fef9c3' : '#fee2e2',
                      color: item.reliability >= 70 ? '#16a34a' : item.reliability >= 50 ? '#ca8a04' : '#dc2626',
                    }}>
                      {item.reliability}% reliable
                    </span>
                  </div>
                  <span style={{ fontSize: 12, color: '#9ca3af' }}>
                    {item.observedAt ? new Date(item.observedAt).toLocaleDateString('en-GB') : new Date(item.collectedAt).toLocaleDateString('en-GB')}
                  </span>
                </div>
                {item.sourceUrl && (
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    <a href={item.sourceUrl} target="_blank" rel="noopener" style={{ color: '#2563eb' }}>{item.sourceUrl}</a>
                  </div>
                )}
                {item.claims.length > 0 && (
                  <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {item.claims.map((claim) => (
                      <span key={claim.id} style={{
                        padding: '2px 8px',
                        borderRadius: 10,
                        fontSize: 12,
                        background: claim.supports ? '#f0fdf4' : '#fef2f2',
                        color: claim.supports ? '#16a34a' : '#dc2626',
                        border: `1px solid ${claim.supports ? '#bbf7d0' : '#fecaca'}`,
                      }}>
                        {claim.claimType.replace(/_/g, ' ').toLowerCase()}: {claim.claimValue.slice(0, 80)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Scan History */}
      {company.scanCandidates.length > 0 && (
        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-head"><h2>Scan History</h2></div>
          <div style={{ padding: 16 }}>
            {company.scanCandidates.map((sc) => (
              <div key={sc.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <a href={`/v2/scans/${sc.scan.id}`}>{sc.scan.name}</a>
                <span style={{ color: '#6b7280' }}>
                  Profile Score: {sc.profileScore} • {new Date(sc.scan.createdAt).toLocaleDateString('en-GB')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreCard({ label, score, highlight }: { label: string; score: number; highlight?: boolean }) {
  const color = score >= 70 ? '#16a34a' : score >= 40 ? '#ca8a04' : '#dc2626';
  return (
    <div style={{
      textAlign: 'center',
      padding: '8px 16px',
      borderRadius: 8,
      background: highlight ? color : `${color}10`,
      color: highlight ? '#fff' : color,
    }}>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{score}</div>
      <div style={{ fontSize: 12 }}>{label}</div>
    </div>
  );
}

function FactsGrid({ facts, company }: { facts: any; company: any }) {
  const sections: { label: string; values: string[] }[] = [];

  if (facts.technologies?.values?.length) {
    sections.push({ label: 'Technologies', values: facts.technologies.values });
  }
  if (facts.contacts?.emails?.length) {
    sections.push({ label: 'Emails', values: facts.contacts.emails });
  }
  if (facts.contacts?.phones?.length) {
    sections.push({ label: 'Phones', values: facts.contacts.phones });
  }
  if (facts.contacts?.socialLinks?.length) {
    sections.push({ label: 'Social Links', values: facts.contacts.socialLinks });
  }
  if (facts.operationalSignals?.values?.length) {
    sections.push({ label: 'Operational Signals', values: facts.operationalSignals.values });
  }
  if (facts.jobAdverts?.count) {
    sections.push({ label: 'Job Adverts', values: [`${facts.jobAdverts.count} advert(s)`] });
  }
  if (facts.signals?.values?.length) {
    sections.push({ label: 'Hiring Signals', values: facts.signals.values });
  }

  if (!sections.length) {
    return <p style={{ color: '#6b7280' }}>No materialised facts yet. Run evidence gathering to collect data.</p>;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 16 }}>
      {sections.map((s) => (
        <div key={s.label}>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>{s.label}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {s.values.map((v, i) => (
              <span key={i} style={{
                padding: '2px 8px',
                borderRadius: 10,
                fontSize: 12,
                background: '#f3f4f6',
              }}>{v}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
