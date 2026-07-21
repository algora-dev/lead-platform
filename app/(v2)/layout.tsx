import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function V2Layout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const userName = session?.name || 'User';

  return (
    <div className="v2-shell">
      <nav className="v2-nav" style={{
        display: 'flex',
        gap: 24,
        padding: '12px 24px',
        borderBottom: '1px solid #e5e7eb',
        marginBottom: 24,
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <a href="/v2" style={{ fontWeight: 700, color: 'var(--accent, #d7ff00)', fontSize: 16 }}>Lead Intelligence</a>
          <div style={{ display: 'flex', gap: 20 }}>
            <a href="/v2/product-profiles">Product Profiles</a>
            <a href="/v2/customer-profiles">Customer Profiles</a>
            <a href="/v2/scans">Scans</a>
            <a href="/v2/libraries">Libraries</a>
            <a href="/v2/companies">Companies</a>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 14, color: '#6b7280' }}>{userName}</span>
          <a href="/api/auth/logout" style={{ fontSize: 13, color: '#9ca3af' }}>Logout</a>
        </div>
      </nav>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
        {children}
      </div>
    </div>
  );
}
