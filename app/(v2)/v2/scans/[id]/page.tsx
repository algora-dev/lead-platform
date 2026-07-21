import { isV2Enabled } from '@/lib/v2/feature-flag';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getSession, getTenantId } from '@/lib/auth';
import { runner } from '@/lib/v2/job-runner';
import '@/lib/v2/evidence-handler';
import '@/lib/v2/assessment-handler';
import ScanActions from '@/components/v2/ScanActions';

export const dynamic = 'force-dynamic';

export default async function ScanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isV2Enabled())) redirect('/');

  const session = await getSession();
  if (!session) redirect('/login');
  const tid = getTenantId(session);
  const { id } = await params;
  const scanId = parseInt(id);

  const scan = await prisma.discoveryScan.findFirst({
    where: { id: scanId, tenantId: tid },
    include: {
      strategy: { select: { id: true, country: true, stateProvince: true, city: true } },
      library: { select: { id: true, name: true } },
      candidates: {
        include: {
          company: {
            select: {
              id: true, name: true, website: true, country: true,
              industry: true, employeeRange: true, domain: true,
            },
          },
        },
        orderBy: { profileScore: 'desc' },
      },
      providerRuns: {
        orderBy: { createdAt: 'desc' },
      },
      assessments: {
        include: {
          company: { select: { id: true, name: true, industry: true } },
        },
        orderBy: { combinedScore: 'desc' },
      },
    },
  });

  if (!scan) notFound();

  return (
    <div className="page-header">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>{scan.name}</h1>
          <p style={{ color: '#6b7280' }}>
            {scan.strategy.country}
            {scan.strategy.stateProvince && `, ${scan.strategy.stateProvince}`}
            {scan.strategy.city && `, ${scan.strategy.city}`}
            {scan.library && ` • Library: ${scan.library.name}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <StatusBadge status={scan.status} />
          <span style={{ color: '#6b7280', fontSize: 14 }}>{scan.progress}%</span>
        </div>
      </div>

      {/* Action Buttons */}
      <ScanActions scanId={scan.id} status={scan.status} candidateCount={scan.candidates.length} />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginTop: 16 }}>
        <StatBox label="Candidates" value={scan.candidateCount} />
        <StatBox label="New Companies" value={scan.newCompanies} />
        <StatBox label="Evidence Items" value={scan.providerRuns.filter(pr => pr.role === 'evidence').reduce((sum, pr) => sum + pr.resultCount, 0)} />
        <StatBox label="Assessments" value={scan.assessments.length} />
      </div>

      {/* Provider Runs */}
      {scan.providerRuns.length > 0 && (
        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-head"><h2>Provider Runs</h2></div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px' }}>Provider</th>
                  <th style={{ padding: '8px 12px' }}>Role</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center' }}>Requests</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center' }}>Results</th>
                  <th style={{ padding: '8px 12px' }}>Completed</th>
                </tr>
              </thead>
              <tbody>
                {scan.providerRuns.map((pr) => (
                  <tr key={pr.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px 12px' }}>{pr.provider}</td>
                    <td style={{ padding: '8px 12px' }}>{pr.role}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <StatusBadge status={pr.status} small />
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>{pr.requestCount}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>{pr.resultCount}</td>
                    <td style={{ padding: '8px 12px', color: '#6b7280' }}>
                      {pr.completedAt ? new Date(pr.completedAt).toLocaleString('en-GB') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Assessment Results */}
      {scan.assessments.length > 0 && (
        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-head"><h2>Assessment Results</h2></div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px' }}>Company</th>
                  <th style={{ padding: '8px 12px' }}>Industry</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center' }}>Profile</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center' }}>Confidence</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center' }}>Combined</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center' }}>Change</th>
                </tr>
              </thead>
              <tbody>
                {scan.assessments.map((a) => (
                  <tr key={a.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px 12px' }}>
                      <a href={`/v2/companies/${a.company.id}`}>{a.company.name}</a>
                    </td>
                    <td style={{ padding: '8px 12px', color: '#6b7280' }}>{a.company.industry || '—'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <ScorePill score={a.profileScore} />
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <ScorePill score={a.confidenceScore} />
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <ScorePill score={a.combinedScore} highlight />
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      {a.scoreChange !== null ? (
                        <span style={{ color: a.scoreChange > 0 ? '#16a34a' : a.scoreChange < 0 ? '#dc2626' : '#6b7280' }}>
                          {a.scoreChange > 0 ? '+' : ''}{a.scoreChange}
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Candidates */}
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-head">
          <h2>Candidates ({scan.candidates.length})</h2>
        </div>
        {scan.candidates.length === 0 ? (
          <div style={{ padding: 16, color: '#6b7280' }}>No candidates in this scan.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px' }}>Company</th>
                  <th style={{ padding: '8px 12px' }}>Industry</th>
                  <th style={{ padding: '8px 12px' }}>Location</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center' }}>Profile Score</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center' }}>Evidence</th>
                  <th style={{ padding: '8px 12px' }}>Provider</th>
                </tr>
              </thead>
              <tbody>
                {scan.candidates.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px 12px' }}>
                      <a href={`/v2/companies/${c.company.id}`}>{c.company.name}</a>
                      {c.company.domain && (
                        <div style={{ fontSize: 12, color: '#9ca3af' }}>{c.company.domain}</div>
                      )}
                    </td>
                    <td style={{ padding: '8px 12px', color: '#6b7280' }}>{c.company.industry || '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#6b7280' }}>{c.company.country || '—'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <ScorePill score={c.profileScore} />
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      {c.evidenceGathered ? '✓' : '—'}
                    </td>
                    <td style={{ padding: '8px 12px', color: '#6b7280' }}>{c.discoveryProvider}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="card" style={{ padding: 12, textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#6b7280' }}>{label}</div>
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

function StatusBadge({ status, small }: { status: string; small?: boolean }) {
  const colors: Record<string, string> = {
    PENDING: '#6b7280',
    RUNNING: '#2563eb',
    DISCOVERING: '#2563eb',
    EVIDENCE_GATHERING: '#7c3aed',
    EVIDENCE_COMPLETE: '#0891b2',
    SCORING: '#d97706',
    COMPLETED: '#16a34a',
    FAILED: '#dc2626',
    CANCELLED: '#6b7280',
  };
  const color = colors[status] || '#6b7280';
  return (
    <span style={{
      display: 'inline-block',
      padding: small ? '1px 6px' : '2px 8px',
      borderRadius: 10,
      fontSize: small ? 11 : 12,
      fontWeight: 500,
      color,
      background: `${color}15`,
    }}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
