import { isV2Enabled } from '@/lib/v2/feature-flag';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getSession, getTenantId } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function V2CompaniesPage() {
  if (!(await isV2Enabled())) redirect('/');

  const session = await getSession();
  if (!session) redirect('/login');
  const tid = getTenantId(session);

  // Get companies with their latest assessment
  const companies = await prisma.company.findMany({
    where: { tenantId: tid, discarded: false },
    orderBy: { lastSeenAt: 'desc' },
    take: 100,
    include: {
      _count: { select: { evidenceItems: true, assessmentSnapshots: true } },
      assessmentSnapshots: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { combinedScore: true, profileScore: true, confidenceScore: true },
      },
    },
  });

  return (
    <div className="page-header">
      <h1>Companies</h1>
      <p>View discovered companies with evidence, scores and outreach rationale.</p>

      <div className="card" style={{ marginTop: 24 }}>
        {companies.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>
            <p>No companies yet. Run a <a href="/v2/scans">scan</a> to discover companies.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px' }}>Company</th>
                  <th style={{ padding: '8px 12px' }}>Industry</th>
                  <th style={{ padding: '8px 12px' }}>Location</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center' }}>Evidence</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center' }}>Profile</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center' }}>Confidence</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center' }}>Combined</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => {
                  const latest = c.assessmentSnapshots[0];
                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '8px 12px' }}>
                        <a href={`/v2/companies/${c.id}`}>{c.name}</a>
                        {c.domain && (
                          <div style={{ fontSize: 12, color: '#9ca3af' }}>{c.domain}</div>
                        )}
                      </td>
                      <td style={{ padding: '8px 12px', color: '#6b7280' }}>{c.industry || '—'}</td>
                      <td style={{ padding: '8px 12px', color: '#6b7280' }}>{c.location || c.country || '—'}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>{c._count.evidenceItems}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        {latest ? <ScorePill score={latest.profileScore} /> : '—'}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        {latest ? <ScorePill score={latest.confidenceScore} /> : '—'}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        {latest ? <ScorePill score={latest.combinedScore} highlight /> : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ScorePill({ score, highlight }: { score: number; highlight?: boolean }) {
  const color = score >= 70 ? '#16a34a' : score >= 40 ? '#ca8a04' : '#dc2626';
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 12,
      fontSize: 13,
      fontWeight: 600,
      ...(highlight ? { background: color, color: '#fff' } : { color, background: `${color}15` }),
    }}>
      {score}
    </span>
  );
}
