import { isV2Enabled } from '@/lib/v2/feature-flag';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getSession, getTenantId } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function V2Dashboard() {
  if (!(await isV2Enabled())) redirect('/');

  const session = await getSession();
  if (!session) redirect('/login');
  const tid = getTenantId(session);

  // Fetch summary stats
  const [scans, companies, productProfiles, customerProfiles, strategies, assessments] = await Promise.all([
    prisma.discoveryScan.count({ where: { tenantId: tid } }),
    prisma.company.count({ where: { tenantId: tid, discarded: false } }),
    prisma.productProfile.count({ where: { tenantId: tid } }),
    prisma.customerProfile.count({ where: { tenantId: tid } }),
    prisma.discoveryStrategy.count({ where: { tenantId: tid } }),
    prisma.assessmentSnapshot.count({
      where: { scan: { tenantId: tid } },
    }),
  ]);

  // Recent scans
  const recentScans = await prisma.discoveryScan.findMany({
    where: { tenantId: tid },
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: {
      strategy: { select: { id: true } },
      _count: { select: { candidates: true, assessments: true } },
    },
  });

  // Top opportunities (by combined score)
  const topOpportunities = await prisma.assessmentSnapshot.findMany({
    where: { scan: { tenantId: tid } },
    orderBy: { combinedScore: 'desc' },
    take: 10,
    include: {
      company: {
        select: { id: true, name: true, industry: true, country: true, website: true },
      },
    },
  });

  return (
    <div className="page-header">
      <h1>V2 Dashboard</h1>
      <p>Evidence-Based Opportunity Discovery Platform</p>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginTop: 24 }}>
        <StatCard label="Scans" value={scans} href="/v2/scans?tab=scans" />
        <StatCard label="Companies" value={companies} href="/v2/companies" />
        <StatCard label="Assessments" value={assessments} />
        <StatCard label="Product Profiles" value={productProfiles} href="/v2/profiles?tab=product" />
        <StatCard label="Customer Profiles" value={customerProfiles} href="/v2/profiles?tab=customer" />
        <StatCard label="Strategies" value={strategies} href="/v2/scans?tab=strategies" />
      </div>

      {/* Top Opportunities */}
      {topOpportunities.length > 0 && (
        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-head">
            <h2>Top Opportunities</h2>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px' }}>Company</th>
                  <th style={{ padding: '8px 12px' }}>Industry</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center' }}>Profile</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center' }}>Confidence</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center' }}>Combined</th>
                </tr>
              </thead>
              <tbody>
                {topOpportunities.map((opp) => (
                  <tr key={opp.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px 12px' }}>
                      <a href={`/v2/companies/${opp.company.id}`}>{opp.company.name}</a>
                    </td>
                    <td style={{ padding: '8px 12px', color: '#6b7280' }}>{opp.company.industry || '—'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <ScoreBadge score={opp.profileScore} />
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <ScoreBadge score={opp.confidenceScore} />
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <ScoreBadge score={opp.combinedScore} highlight />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Scans */}
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-head">
          <h2>Recent Scans</h2>
        </div>
        {recentScans.length === 0 ? (
          <div style={{ padding: 16 }}>
            <p>No scans yet. <a href="/v2/scans">Run your first scan</a>.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px' }}>Scan</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center' }}>Candidates</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center' }}>Assessed</th>
                  <th style={{ padding: '8px 12px' }}>Created</th>
                </tr>
              </thead>
              <tbody>
                {recentScans.map((scan) => (
                  <tr key={scan.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px 12px' }}>
                      <a href={`/v2/scans/${scan.id}`}>{scan.name}</a>
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <StatusBadge status={scan.status} />
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>{scan._count.candidates}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>{scan._count.assessments}</td>
                    <td style={{ padding: '8px 12px', color: '#6b7280' }}>
                      {new Date(scan.createdAt).toLocaleDateString('en-GB')}
                    </td>
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

function StatCard({ label, value, href }: { label: string; value: number; href?: string }) {
  const content = (
    <div className="card" style={{ padding: 16, textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div>
      <div style={{ color: '#6b7280', fontSize: 14 }}>{label}</div>
    </div>
  );
  return href ? <a href={href} style={{ textDecoration: 'none', color: 'inherit' }}>{content}</a> : content;
}

function ScoreBadge({ score, highlight }: { score: number; highlight?: boolean }) {
  const color = score >= 70 ? '#16a34a' : score >= 40 ? '#ca8a04' : '#dc2626';
  const bg = score >= 70 ? '#dcfce7' : score >= 40 ? '#fef9c3' : '#fee2e2';
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 12,
      fontSize: 13,
      fontWeight: 600,
      color,
      background: highlight ? color : bg,
      ...(highlight ? { color: '#fff' } : {}),
    }}>
      {score}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    PENDING: '#6b7280',
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
      padding: '2px 8px',
      borderRadius: 10,
      fontSize: 12,
      fontWeight: 500,
      color,
      background: `${color}15`,
    }}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
