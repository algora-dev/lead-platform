import { prisma } from '@/lib/prisma';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [
    totalLeads,
    contactable,
    highScore,
    mediumScore,
    newLeads,
    reviewing,
    contacted,
    multiJob,
    sweetSpot,
    recentScans,
    topLeads,
    uncontacted,
  ] = await Promise.all([
    prisma.company.count({ where: { discarded: false } }),
    prisma.company.count({ where: { discarded: false, OR: [{ email: { not: null } }, { phone: { not: null } }] } }),
    prisma.company.count({ where: { discarded: false, opportunityScore: { gte: 70 } } }),
    prisma.company.count({ where: { discarded: false, opportunityScore: { gte: 45, lt: 70 } } }),
    prisma.company.count({ where: { discarded: false, status: 'NEW' } }),
    prisma.company.count({ where: { discarded: false, status: 'REVIEWING' } }),
    prisma.company.count({ where: { discarded: false, status: 'CONTACTED' } }),
    prisma.company.count({ where: { discarded: false, activeJobCount: { gte: 2 } } }),
    prisma.company.count({ where: { discarded: false, employeeCount: { gte: 10, lte: 150 } } }),
    prisma.scanRun.findMany({ orderBy: { startedAt: 'desc' }, take: 3 }),
    prisma.company.findMany({
      where: { discarded: false, status: { in: ['NEW', 'REVIEWING'] } },
      orderBy: [{ opportunityScore: 'desc' }, { lastSeenAt: 'desc' }],
      take: 5,
    }),
    prisma.company.count({
      where: {
        discarded: false,
        opportunityScore: { gte: 60 },
        status: 'NEW',
        OR: [{ email: { not: null } }, { phone: { not: null } }],
      },
    }),
  ]);

  const lastScan = recentScans[0];
  const hasData = totalLeads > 0;

  return (
    <>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Your lead intelligence overview.</p>
      </div>

      {/* Alerts */}
      {!hasData && (
        <div className="alert info">
          No leads yet. <Link href="/scan" style={{ fontWeight: 600, textDecoration: 'underline' }}>Run your first scan</Link> to start finding companies.
        </div>
      )}
      {hasData && uncontacted > 0 && (
        <div className="alert success">
          <span className="pill urgent">{uncontacted}</span>
          high-value leads ready to contact. <Link href="/leads" style={{ fontWeight: 600, textDecoration: 'underline' }}>View leads →</Link>
        </div>
      )}

      {/* Metrics row */}
      <div className="metrics">
        <div className="card metric">
          <span>Total Leads</span>
          <strong>{totalLeads}</strong>
          <div className="metric-sub">{newLeads} new · {reviewing} reviewing</div>
        </div>
        <div className="card metric">
          <span>Contactable</span>
          <strong>{contactable}</strong>
          <div className="metric-sub">{Math.round(totalLeads ? (contactable / totalLeads) * 100 : 0)}% of total</div>
        </div>
        <div className="card metric">
          <span>High Priority</span>
          <strong>{highScore}</strong>
          <div className="metric-sub">score 70+</div>
        </div>
        <div className="card metric">
          <span>Contacted</span>
          <strong>{contacted}</strong>
          <div className="metric-sub">{Math.round(totalLeads ? (contacted / totalLeads) * 100 : 0)}% outreach rate</div>
        </div>
      </div>

      {/* Widget grid */}
      <div className="widget-grid">
        {/* To-do list */}
        <div className="card">
          <div className="card-head">
            <h2>To Do</h2>
            <Link href="/leads" className="button secondary" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>View all</Link>
          </div>
          {!hasData && <div className="empty" style={{ padding: '24px 0' }}>Nothing to action yet.</div>}
          {hasData && topLeads.length === 0 && <div className="muted" style={{ padding: '12px 0' }}>All caught up — no pending leads.</div>}
          <ul className="widget-list">
            {topLeads.map(c => (
              <li key={c.id}>
                <span className={`score ${c.opportunityScore >= 70 ? 'high' : c.opportunityScore >= 45 ? 'mid' : 'low'}`}>
                  {c.opportunityScore}
                </span>
                <div>
                  <strong>{c.name}</strong>
                  <div className="muted" style={{ fontSize: '0.8rem' }}>
                    {c.activeJobCount} job(s) · {c.email || c.phone || 'no contact yet'}
                  </div>
                </div>
                <span className={`pill ${c.opportunityScore >= 70 ? 'urgent' : 'warn'}`} style={{ marginLeft: 'auto' }}>
                  {c.status.replaceAll('_', ' ')}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Scan status */}
        <div className="card">
          <div className="card-head">
            <h2>Scan Activity</h2>
            <Link href="/scan" className="button secondary" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>New scan</Link>
          </div>
          {!lastScan && <div className="muted" style={{ padding: '12px 0' }}>No scans run yet.</div>}
          {lastScan && (
            <>
              <div className="stat-row" style={{ marginBottom: 12 }}>
                <span className="big">{lastScan.advertsSaved}</span>
                <span className="label-inline">adverts from last scan</span>
              </div>
              <ul className="widget-list">
                {recentScans.map(s => (
                  <li key={s.id}>
                    <span className={`pill ${s.status === 'COMPLETED' ? 'good' : s.status === 'FAILED' ? 'urgent' : 'neutral'}`}>
                      {s.status}
                    </span>
                    <div>
                      <strong>{s.country}</strong>
                      <div className="muted" style={{ fontSize: '0.8rem' }}>
                        {new Date(s.startedAt).toLocaleDateString()} · {s.advertsSaved} adverts · {s.companiesCreated} new
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {/* Lead breakdown */}
      <div className="card">
        <div className="card-head">
          <h2>Lead Pipeline</h2>
        </div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <div className="stat-row">
              <span className="big" style={{ color: 'var(--muted)' }}>{newLeads}</span>
              <span className="label-inline">New</span>
            </div>
          </div>
          <div>
            <div className="stat-row">
              <span className="big" style={{ color: 'var(--warn)' }}>{reviewing}</span>
              <span className="label-inline">Reviewing</span>
            </div>
          </div>
          <div>
            <div className="stat-row">
              <span className="big" style={{ color: 'var(--ink)' }}>{contacted}</span>
              <span className="label-inline">Contacted</span>
            </div>
          </div>
          <div>
            <div className="stat-row">
              <span className="big" style={{ color: 'var(--good)' }}>{highScore}</span>
              <span className="label-inline">High score (70+)</span>
            </div>
          </div>
          <div>
            <div className="stat-row">
              <span className="big" style={{ color: 'var(--muted)' }}>{mediumScore}</span>
              <span className="label-inline">Medium (45–69)</span>
            </div>
          </div>
          <div>
            <div className="stat-row">
              <span className="big" style={{ color: 'var(--muted)' }}>{multiJob}</span>
              <span className="label-inline">Multiple jobs</span>
            </div>
          </div>
          <div>
            <div className="stat-row">
              <span className="big" style={{ color: 'var(--muted)' }}>{sweetSpot}</span>
              <span className="label-inline">10–150 staff</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
