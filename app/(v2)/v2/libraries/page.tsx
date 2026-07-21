import { isV2Enabled } from '@/lib/v2/feature-flag';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getSession, getTenantId } from '@/lib/auth';
import LibraryManager from '@/components/v2/LibraryManager';

export const dynamic = 'force-dynamic';

export default async function V2LibrariesPage() {
  if (!(await isV2Enabled())) redirect('/');

  const session = await getSession();
  if (!session) redirect('/login');
  const tid = getTenantId(session);

  const libraries = await prisma.scanLibrary.findMany({
    where: { tenantId: tid, archivedAt: null },
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { scans: true } },
      scans: {
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, name: true, status: true, createdAt: true, candidateCount: true },
      },
    },
  });

  // Also get unfiled scans (no library)
  const unfiledScans = await prisma.discoveryScan.findMany({
    where: { tenantId: tid, libraryId: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, status: true, createdAt: true, candidateCount: true },
  });

  return (
    <div className="page-header">
      <h1>Scan Libraries</h1>
      <p>Organise your scans into libraries for easy comparison and management.</p>

      <LibraryManager initialLibraries={JSON.parse(JSON.stringify(libraries))} initialUnfiledScans={JSON.parse(JSON.stringify(unfiledScans))} />

      {/* Libraries List */}
      <div style={{ marginTop: 24 }}>
        {libraries.length === 0 && unfiledScans.length === 0 ? (
          <div className="card">
            <div style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>
              <p>No libraries or scans yet. <a href="/v2/strategies">Create a strategy</a> and run a scan to get started.</p>
            </div>
          </div>
        ) : (
          <>
            {libraries.map((lib) => (
              <div key={lib.id} className="card" style={{ marginTop: 12 }}>
                <div className="card-head">
                  <h2>{lib.name}</h2>
                  <span style={{ color: '#6b7280', fontSize: 14 }}>{lib._count.scans} scan(s)</span>
                </div>
                <div style={{ padding: 16 }}>
                  {lib.description && <p style={{ color: '#6b7280', marginBottom: 12 }}>{lib.description}</p>}
                  {lib.scans.length === 0 ? (
                    <p style={{ color: '#9ca3af' }}>No scans in this library yet.</p>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <tbody>
                        {lib.scans.map((scan) => (
                          <tr key={scan.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '6px 12px' }}>
                              <a href={`/v2/scans/${scan.id}`}>{scan.name}</a>
                            </td>
                            <td style={{ padding: '6px 12px', textAlign: 'right', color: '#6b7280' }}>
                              {scan.candidateCount} candidates
                            </td>
                            <td style={{ padding: '6px 12px', textAlign: 'right', color: '#6b7280' }}>
                              {new Date(scan.createdAt).toLocaleDateString('en-GB')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ))}

            {unfiledScans.length > 0 && (
              <div className="card" style={{ marginTop: 12 }}>
                <div className="card-head">
                  <h2>Unfiled Scans</h2>
                </div>
                <div style={{ padding: 16 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {unfiledScans.map((scan) => (
                        <tr key={scan.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '6px 12px' }}>
                            <a href={`/v2/scans/${scan.id}`}>{scan.name}</a>
                          </td>
                          <td style={{ padding: '6px 12px', textAlign: 'right', color: '#6b7280' }}>
                            {scan.candidateCount} candidates
                          </td>
                          <td style={{ padding: '6px 12px', textAlign: 'right', color: '#6b7280' }}>
                            {new Date(scan.createdAt).toLocaleDateString('en-GB')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
