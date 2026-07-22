'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import ProfileWorkspace from '@/components/v2/ProfileWorkspace';

export default function ProfilesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const tab = searchParams.get('tab') || 'product';

  const setTab = (t: 'product' | 'customer') => {
    router.push(`/v2/profiles?tab=${t}`);
  };

  return (
    <>
      <div className="tab-bar">
        <button
          className={`tab-btn${tab === 'product' ? ' active' : ''}`}
          onClick={() => setTab('product')}
        >
          Product Profiles
        </button>
        <button
          className={`tab-btn${tab === 'customer' ? ' active' : ''}`}
          onClick={() => setTab('customer')}
        >
          Lead Profiles
        </button>
      </div>
      <ProfileWorkspace type={tab === 'product' ? 'product' : 'customer'} key={tab} />
    </>
  );
}
