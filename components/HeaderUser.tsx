'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type User = {
  id: number;
  email: string;
  name: string | null;
  role: string;
};

export default function HeaderUser({ user }: { user: User }) {
  const [loggingOut, setLoggingOut] = useState(false);
  const router = useRouter();

  const logout = async () => {
    setLoggingOut(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  const displayName = user.name || user.email.split('@')[0];
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <div className="header-user">
      <span className="header-user-avatar">{initials}</span>
      <span className="header-user-name">{displayName}</span>
      <button
        onClick={logout}
        disabled={loggingOut}
        className="header-logout-btn"
        aria-label="Sign out"
      >
        {loggingOut ? '…' : 'Sign out'}
      </button>
    </div>
  );
}
