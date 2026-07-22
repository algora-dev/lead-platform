import { isV2Enabled } from '@/lib/v2/feature-flag';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getSession, getTenantId } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  if (!(await isV2Enabled())) redirect('/');

  const session = await getSession();
  if (!session) redirect('/login');
  const tid = getTenantId(session);

  const users = await prisma.user.findMany({
    where: { tenantId: tid },
    orderBy: { createdAt: 'asc' },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  return (
    <div className="page-header">
      <h1>Account</h1>
      <p>Manage users and account settings.</p>

      {/* Users */}
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Users</h2>
          <span className="muted" style={{ fontSize: '0.85rem' }}>{users.length} user{users.length !== 1 ? 's' : ''}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Added</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td><strong>{u.name || '—'}</strong></td>
                <td>{u.email}</td>
                <td>
                  <span className={`pill ${u.role === 'ADMIN' ? 'good' : 'neutral'}`}>{u.role}</span>
                </td>
                <td className="muted">{new Date(u.createdAt).toLocaleDateString('en-GB')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Settings placeholders */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><h2>Security</h2></div>
        <div className="empty">
          <p>Change password and session settings — coming soon.</p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><h2>Tenant Settings</h2></div>
        <div className="empty">
          <p>Branding, feature flags, and data source configuration — coming soon.</p>
        </div>
      </div>
    </div>
  );
}
