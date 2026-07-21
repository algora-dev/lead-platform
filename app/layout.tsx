import './globals.css';
import Link from 'next/link';
import { tenant } from '@/lib/tenant';
import { getSession } from '@/lib/auth';
import HeaderUser from '@/components/HeaderUser';
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: `${tenant.branding.productName} — ${tenant.branding.businessName}`,
  description: tenant.branding.tagline,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const b = tenant.branding;
  const user = await getSession();
  const headerList = await headers();
  const pathname = headerList.get('x-pathname') || '';
  const isLoginPage = pathname === '/login';
  const isV2 = pathname.startsWith('/v2');

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        {isLoginPage || isV2 ? (
          children
        ) : (
          <>
            <header className="site-header">
              <Link href="/" className="brand">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/t3labs-logo.png" alt={`${b.businessName} logo`} className="brand-logo" />
                <span className="brand-name">{b.productName}</span>
              </Link>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <nav className="site-nav">
                  <Link href="/">Dashboard</Link>
                  <Link href="/scan">Scan</Link>
                  <Link href="/leads">Leads</Link>
                </nav>
                {user && <HeaderUser user={user} />}
              </div>
            </header>
            <div className="shell">{children}</div>
          </>
        )}
      </body>
    </html>
  );
}
