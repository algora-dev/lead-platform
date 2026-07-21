export const dynamic = 'force-dynamic';

export default async function V2Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="v2-shell">
      <nav className="v2-nav" style={{ display: 'flex', gap: 16, padding: '12px 24px', borderBottom: '1px solid #e5e7eb', marginBottom: 24 }}>
        <a href="/v2" style={{ fontWeight: 600, color: 'var(--accent, #d7ff00)' }}>V2 Dashboard</a>
        <a href="/v2/product-profiles">Product Profiles</a>
        <a href="/v2/customer-profiles">Customer Profiles</a>
        <a href="/v2/scans">Scans</a>
        <a href="/v2/libraries">Scan Libraries</a>
        <a href="/v2/companies">Companies</a>
        <a href="/v2/settings">Settings</a>
      </nav>
      {children}
    </div>
  );
}
