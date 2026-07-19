import './globals.css';
import Link from 'next/link';
import {tenant} from '@/lib/tenant';

export const metadata={
  title:tenant.branding.productName,
  description:tenant.branding.tagline,
};

export default function RootLayout({children}:{children:React.ReactNode}){
 const b=tenant.branding;
 const style={
  '--accent':b.primaryColor,
  '--text':b.secondaryColor,
  '--bg':b.backgroundColor,
  '--card':b.cardColor,
  '--button-radius':b.buttonRadius,
 } as React.CSSProperties;
 return <html lang="en"><body style={style}><div className="shell"><div className="topbar"><div><h1 style={{margin:0}}>{b.productName}</h1><div className="muted">{b.tagline}</div></div><nav className="nav"><Link href="/">Dashboard</Link><Link href="/companies">{b.leadPlural}</Link><Link href="/batches">Batches</Link><Link href="/sources">Sources</Link></nav></div>{children}</div></body></html>
}
