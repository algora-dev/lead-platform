'use client';

import { useState } from 'react';
import { AlertIcon, FolderIcon } from './Icons';

interface Library {
  id: number;
  name: string;
  description: string | null;
  _count: { scans: number };
}

export default function LibraryManager({
  initialLibraries,
  initialUnfiledScans,
}: {
  initialLibraries: Library[];
  initialUnfiledScans: { id: number; name: string }[];
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [libraries, setLibraries] = useState(initialLibraries);

  async function createLibrary() {
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
        setLibraries([...libraries, { ...data, _count: { scans: 0 } }]);
        setName('');
        setDescription('');
        setShowCreate(false);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteLibrary(id: number) {
    if (!confirm('Archive this library? Scans inside will be kept but unfiled.')) return;
    try {
      await fetch(`/api/v2/libraries/${id}`, { method: 'DELETE' });
      setLibraries(libraries.filter(l => l.id !== id));
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={() => setShowCreate(!showCreate)}
          style={{
            padding: '6px 16px',
            borderRadius: 6,
            border: '1px solid var(--accent, #d7ff00)',
            background: 'transparent',
            color: 'var(--accent, #d7ff00)',
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          {showCreate ? 'Cancel' : '+ New Library'}
        </button>
        {error && <span style={{ fontSize: 13, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 4 }}><AlertIcon size={13} color="#dc2626" /> {error}</span>}
      </div>

      {showCreate && (
        <div className="card" style={{ marginTop: 12, padding: 16 }}>
          <div style={{ display: 'grid', gap: 12 }}>
            <input
              type="text"
              placeholder="Library name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 }}
            />
            <textarea
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 }}
            />
            <button
              onClick={createLibrary}
              disabled={loading || !name.trim()}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: 'none',
                background: loading || !name.trim() ? '#9ca3af' : 'var(--accent, #d7ff00)',
                color: loading || !name.trim() ? '#fff' : '#000',
                cursor: loading ? 'wait' : 'pointer',
                fontSize: 14,
                justifySelf: 'start',
              }}
            >
              {loading ? 'Creating...' : 'Create Library'}
            </button>
          </div>
        </div>
      )}

      {/* Delete buttons for existing libraries */}
      <div style={{ marginTop: 8 }}>
        {libraries.map((lib) => (
          <div key={lib.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
            <span style={{ fontSize: 13, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4 }}><FolderIcon size={13} color="#9ca3af" /> {lib.name}</span>
            <button
              onClick={() => deleteLibrary(lib.id)}
              style={{
                padding: '2px 8px',
                borderRadius: 4,
                border: '1px solid #e5e7eb',
                background: 'transparent',
                color: '#dc2626',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              Archive
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
