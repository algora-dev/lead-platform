'use client';

import { useEffect, useState } from 'react';

type Batch = {
  id: number;
  name: string;
  createdAt: string;
  archivedAt?: string;
  notes?: string;
  _count: { companies: number };
};

export default function BatchWorkspace() {
  const [items, setItems] = useState<Batch[]>([]);

  const load = () => fetch('/api/batches').then(r => r.json()).then(setItems);

  useEffect(() => { load(); }, []);

  const archive = async (id: number) => {
    await fetch('/api/batches/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archivedAt: new Date().toISOString() }),
    });
    load();
  };

  return (
    <>
      <div className="page-header">
        <h1>Batches</h1>
        <p>Group companies for a calling or email campaign.</p>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Created</th>
              <th>Companies</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map(b => (
              <tr key={b.id}>
                <td>
                  <strong>{b.name}</strong>
                  {b.notes && <div className="muted">{b.notes}</div>}
                </td>
                <td>{new Date(b.createdAt).toLocaleString()}</td>
                <td>{b._count.companies}</td>
                <td>{b.archivedAt ? 'Archived' : 'Active'}</td>
                <td>
                  {!b.archivedAt && (
                    <button className="secondary" onClick={() => archive(b.id)} style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                      Archive
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && <div className="empty">Create a batch from the Companies page.</div>}
      </div>
    </>
  );
}
