'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/v2', label: 'Dashboard', exact: true },
  { href: '/v2/profiles', label: 'Profiles', exact: false },
  { href: '/v2/scans', label: 'Scans', exact: false },
];

export default function PrimaryNav() {
  const pathname = usePathname();

  const isActive = (href: string, exact: boolean) => {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <nav className="primary-nav" aria-label="Primary navigation">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`nav-btn${isActive(item.href, item.exact) ? ' active' : ''}`}
          aria-current={isActive(item.href, item.exact) ? 'page' : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
