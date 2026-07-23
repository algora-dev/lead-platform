'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertIcon } from './Icons';
import Link from 'next/link';

interface Library {
  id: number;
  name: string;
  description: string | null;
  archivedAt: string | null;
  _count: { scans: number };
  scans: {
    id: number;
    name: string;
    status: string;
    createdAt: string;
    candidateCount: number;
  }[];
}

interface Scan {
  id: number;
  name: string;
  status: string;
  createdAt: string;
  candidateCount: number;
  libraryId: number | null;
}

export default function LibrariesView() {
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [unfiledScans, setUnfiledScans] = useState<Scan[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([
      fetch('/api/v2/libraries').then(r => r.json()),
      fetch('/api/v2/scans').then(r => r.json()),
    ]).then(([libs, scans]) => {
      if (Array.isArray(libs)) setLibraries(libs);
      if (Array.isArray(scans)) {
        setUnfiledScans(scans.filter((s: Scan) => !s.libraryId));
      }
    }).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const createLibrary = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v2/libraries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create library');
      } else {
        setName('');
        setDescription('');
        setShowCreate(false);
        load();
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const archiveLibrary = async (id: number) => {
    if (!confirm('Archive this library? Scans inside will be kept but unfiled.')) return;
    await fetch(`/api/v2/libraries/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div>
      <div className="page-header">
        <h1>Scan Libraries</h1>
        <p>Organise your scans into libraries for easy comparison and management.</p>
      </div>

      <div style={{ marginBottom: 16 }}>
        <button className="primary" style={{ fontSize: '0.85rem', padding: '8px 14px' }} onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? 'Cancel' : '+ New Library'}
        </button>
        {error && <span style={{ fontSize: 13, color: 'var(--bad)', marginLeft: 12, display: 'flex', alignItems: 'center', gap: 4 }}><AlertIcon size={13} color="var(--bad)" /> {error}</span>}
      </div>

      {showCreate && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'grid', gap: 12, padding: 4 }}>
            <div>
              <label className="label">Library Name</label>
              <input
                type="text"
                placeholder="e.g. UK Construction Q3"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label className="label">Description (optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <button className="primary" disabled={loading || !name.trim()} onClick={createLibrary}>
                {loading ? 'Creating…' : 'Create Library'}
              </button>
            </div>
          </div>
        </div>
      )}

      {libraries.length === 0 && unfiledScans.length === 0 ? (
        <div className="card">
          <div className="empty">
            <p>No libraries or scans yet.</p>
            <p className="muted" style={{ fontSize: '0.85rem' }}>
              Create a library, then add a scan from the Scans tab.
            </p>
          </div>
        </div>
      ) : (
        <>
          {libraries.map((lib) => (
            <div key={lib.id} className="card" style={{ marginBottom: 12 }}>
              <div className="card-head">
                <h2>{lib.name}</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="muted" style={{ fontSize: 14 }}>{lib._count.scans} scan(s)</span>
                  <button
                    className="secondary"
                    style={{ fontSize: '0.75rem', padding: '4px 10px', color: 'var(--bad)' }}
                    onClick={() => archiveLibrary(lib.id)}
                  >
                    Archive
                  </button>
                </div>
              </div>
              {lib.description && <p className="muted" style={{ marginBottom: 12 }}>{lib.description}</p>}
              {lib.scans.length === 0 ? (
                <p className="muted" style={{ fontSize: '0.85rem' }}>No scans in this library yet.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Scan</th>
                      <th>Status</th>
                      <th>Candidates</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lib.scans.map((scan) => (
                      <tr key={scan.id}>
                        <td>
                          <Link href={`/v2/scans/${scan.id}`}>{scan.name}</Link>
                        </td>
                        <td>
                          <span className={`pill ${scan.status === 'COMPLETED' ? 'good' : scan.status === 'FAILED' ? 'urgent' : 'neutral'}`}>
                            {scan.status}
                          </span>
                        </td>
                        <td>{scan.candidateCount}</td>
                        <td className="muted">{new Date(scan.createdAt).toLocaleDateString('en-GB')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}

          {unfiledScans.length > 0 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="card-head">
                <h2>Unfiled Scans</h2>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Scan</th>
                    <th>Status</th>
                    <th>Candidates</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {unfiledScans.map((scan) => (
                    <tr key={scan.id}>
                      <td>
                        <Link href={`/v2/scans/${scan.id}`}>{scan.name}</Link>
                      </td>
                      <td>
                        <span className={`pill ${scan.status === 'COMPLETED' ? 'good' : scan.status === 'FAILED' ? 'urgent' : 'neutral'}`}>
                          {scan.status}
                        </span>
                      </td>
                      <td>{scan.candidateCount}</td>
                      <td className="muted">{new Date(scan.createdAt).toLocaleDateString('en-GB')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
