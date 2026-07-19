import { prisma } from '@/lib/prisma';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [total, contactable, multi, sweet, latest] = await Promise.all([
    prisma.company.count({ where: { discarded: false } }),
    prisma.company.count({ where: { discarded: false, OR: [{ email: { not: null } }, { phone: { not: null } }] } }),
    prisma.company.count({ where: { discarded: false, activeJobCount: { gte: 2 } } }),
    prisma.company.count({ where: { discarded: false, employeeCount: { gte: 10, lte: 150 } } }),
    prisma.company.findMany({
      where: { discarded: false },
      orderBy: [{ opportunityScore: 'desc' }, { lastSeenAt: 'desc' }],
      take: 10,
    }),
  ]);

  const topScore = latest[0]?.opportunityScore || 0;

  return (
    <>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>One company profile, supported by every advert we find.</p>
      </div>

      <div className="metrics">
        <div className="card metric">
          <span>Companies</span>
          <strong>{total}</strong>
        </div>
        <div className="card metric">
          <span>Contactable</span>
          <strong>{contactable}</strong>
        </div>
        <div className="card metric">
          <span>Multiple jobs</span>
          <strong>{multi}</strong>
        </div>
        <div className="card metric">
          <span>10–150 staff</span>
          <strong>{sweet}</strong>
        </div>
        <div className="card metric">
          <span>Top score</span>
          <strong>{topScore}</strong>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>Priority companies</h2>
          </div>
          <Link className="button secondary" href="/companies">Open company workspace</Link>
        </div>
        <div style={{ overflow: 'auto', maxHeight: '60vh' }}>
          <table>
            <thead>
              <tr>
                <th>Score</th>
                <th>Company</th>
                <th>Active jobs</th>
                <th>Salary signal</th>
                <th>Size</th>
                <th>Contact</th>
              </tr>
            </thead>
            <tbody>
              {latest.map((c: any) => (
                <tr key={c.id}>
                  <td>
                    <span className={`score ${c.opportunityScore >= 70 ? 'high' : c.opportunityScore >= 45 ? 'mid' : 'low'}`}>
                      {c.opportunityScore}
                    </span>
                  </td>
                  <td>
                    <strong>{c.name}</strong>
                    <div className="muted">{c.location}</div>
                  </td>
                  <td>{c.activeJobCount}</td>
                  <td>{c.estimatedSalarySpend ? `${c.country === 'NZ' ? 'NZ$' : '£'}${c.estimatedSalarySpend.toLocaleString()}` : '—'}</td>
                  <td>{c.employeeRange || 'Unknown'}</td>
                  <td>{c.email || c.phone || 'Not found yet'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!latest.length && (
            <div className="empty">No companies yet. Run a scan from the Scan page.</div>
          )}
        </div>
      </div>
    </>
  );
}
