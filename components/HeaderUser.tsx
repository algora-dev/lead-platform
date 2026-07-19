'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type User = {
  id: number;
  email: string;
  name: string | null;
  role: string;
};

export default function HeaderUser({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const logout = async () => {
    setLoggingOut(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  const initials = (user.name || user.email).charAt(0).toUpperCase();

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius)',
          background: '#fff',
          cursor: 'pointer',
          fontSize: '0.85rem',
          fontWeight: 600,
          color: 'var(--ink)',
          transition: 'border-color 180ms ease, box-shadow 180ms ease',
        }}
      >
        <span style={{
          display: 'inline-flex',
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #050608, #242832)',
          color: '#fff',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.75rem',
          fontWeight: 700,
        }}>
          {initials}
        </span>
        {user.name || user.email.split('@')[0]}
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          right: 0,
          top: 'calc(100% + 6px)',
          minWidth: 200,
          background: '#fff',
          border: '1px solid var(--line)',
          borderRadius: '10px',
          boxShadow: '0 10px 32px rgba(24, 31, 51, 0.12)',
          padding: 8,
          zIndex: 50,
        }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)', marginBottom: 4 }}>
            <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{user.name || 'User'}</div>
            <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>{user.email}</div>
            <div style={{ marginTop: 4 }}>
              <span className={`pill ${user.role === 'ADMIN' ? 'good' : 'neutral'}`} style={{ fontSize: '0.7rem' }}>
                {user.role}
              </span>
            </div>
          </div>
          <button
            onClick={logout}
            disabled={loggingOut}
            className="secondary"
            style={{ width: '100%', fontSize: '0.85rem', padding: '8px 12px' }}
          >
            {loggingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  );
}
