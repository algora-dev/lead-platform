import './globals.css';
import Link from 'next/link';
import { tenant } from '@/lib/tenant';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: `${tenant.branding.productName} — ${tenant.branding.businessName}`,
  description: tenant.branding.tagline,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const b = tenant.branding;
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <header className="site-header">
          <Link href="/" className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/t3labs-logo.png" alt={`${b.businessName} logo`} className="brand-logo" />
            <span className="brand-name">{b.productName}</span>
          </Link>
          <nav className="site-nav">
            <Link href="/">Dashboard</Link>
            <Link href="/companies">{b.leadPlural}</Link>
            <Link href="/batches">Batches</Link>
            <Link href="/sources">Scan</Link>
          </nav>
        </header>
        <div className="shell">{children}</div>
      </body>
    </html>
  );
}
