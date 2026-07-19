'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Login failed');
      } else {
        router.push('/');
        router.refresh();
      }
    } catch {
      setError('Network error');
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      background: `radial-gradient(circle at 50% 20%, rgba(215, 255, 0, 0.08), transparent 30rem), var(--paper)`,
    }}>
      <div className="card" style={{ width: 'min(400px, 100%)', padding: 32 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/t3labs-logo.png" alt="T3 Labs" style={{ height: 48, margin: '0 auto 16px' }} />
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>Lead Intelligence</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: '0.9rem' }}>Sign in to your workspace</p>
        </div>

        <form onSubmit={submit}>
          <div className="field">
            <span className="label">Email</span>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              autoFocus
              style={{ width: '100%' }}
            />
          </div>
          <div className="field">
            <span className="label">Password</span>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{ width: '100%' }}
            />
          </div>
          {error && (
            <div style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius)',
              background: '#feeceb',
              border: '1px solid #fccfc8',
              color: 'var(--bad)',
              fontSize: '0.85rem',
              marginBottom: 14,
            }}>
              {error}
            </div>
          )}
          <button
            type="submit"
            className="primary"
            disabled={loading}
            style={{ width: '100%', minHeight: 48 }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
