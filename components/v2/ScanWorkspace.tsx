'use client';

import { useEffect, useState, useCallback } from 'react';

interface Strategy {
  id: number;
  country: string;
  stateProvince: string | null;
  approved: boolean;
}

interface Scan {
  id: number;
  name: string;
  status: string;
  progress: number;
  candidateCount: number;
  newCompanies: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  strategy?: { id: number; country: string; stateProvince: string | null };
  library?: { id: number; name: string } | null;
  _count?: { candidates: number };
  candidates?: {
    id: number;
    profileScore: number;
    company: { id: number; name: string; website: string | null; country: string | null; industry: string | null };
  }[];
  providerRuns?: {
    id: number;
    provider: string;
    role: string;
    status: string;
    requestCount: number;
    resultCount: number;
    errorMessage: string | null;
  }[];
}

interface JobStatus {
  id: string;
  status: string;
  progress: number;
  message: string;
  error: string | null;
}

export default function ScanWorkspace() {
  const [scans, setScans] = useState<Scan[]>([]);
  const [selected, setSelected] = useState<Scan | null>(null);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    fetch('/api/v2/scans').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setScans(d);
    });
    fetch('/api/v2/strategies').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setStrategies(d.filter((s: Strategy) => s.approved));
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  // Poll job status
  useEffect(() => {
    if (!activeJobId) return;
    const interval = setInterval(async () => {
      const r = await fetch(`/api/v2/jobs/${activeJobId}`);
      const d = await r.json();
      if (r.ok) {
        setJobStatus(d);
        if (d.status === 'completed' || d.status === 'failed') {
          clearInterval(interval);
          setActiveJobId(null);
          setNotice(d.status === 'completed' ? d.message || 'Scan completed' : `Scan failed: ${d.error}`);
          load();
          if (selected) {
            fetch(`/api/v2/scans/${selected.id}`).then(r => r.json()).then(d => setSelected(d));
          }
        }
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [activeJobId, selected]);

  const openScan = async (id: number) => {
    const d = await fetch(`/api/v2/scans/${id}`).then(r => r.json());
    setSelected(d);
    setNotice('');
  };

  const startScan = async (strategyId: number, name: string) => {
    const r = await fetch('/api/v2/scans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategyId, name }),
    });
    const d = await r.json();
    if (r.ok) {
      setNotice(`Scan started: ${d.scan.name}`);
      setActiveJobId(d.jobId);
      setShowCreate(false);
      load();
    } else {
      setNotice(d.error || 'Failed to start scan');
    }
  };

  // --- List View ---
  if (!selected) {
    return (
      <>
        <div className="page-header">
          <h1>Discovery Scans</h1>
          <p>Run discovery scans using approved strategies.</p>
        </div>

        {jobStatus && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <strong>{jobStatus.message}</strong>
                <span className={`pill ${jobStatus.status === 'completed' ? 'good' : jobStatus.status === 'failed' ? 'urgent' : 'neutral'}`}>
                  {jobStatus.status}
                </span>
              </div>
              <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${jobStatus.progress}%`, height: '100%', background: 'var(--accent, #d7ff00)', transition: 'width 0.3s' }} />
              </div>
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>Scans</h2>
            <button className="primary" style={{ fontSize: '0.85rem', padding: '8px 14px' }} onClick={() => setShowCreate(true)}>+ New Scan</button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Candidates</th>
                <th>New</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {scans.map(s => (
                <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => openScan(s.id)}>
                  <td><strong>{s.name}</strong></td>
                  <td>
                    <span className={`pill ${s.status === 'COMPLETED' ? 'good' : s.status === 'FAILED' ? 'urgent' : 'neutral'}`}>
                      {s.status}
                    </span>
                  </td>
                  <td>{s._count?.candidates || s.candidateCount || 0}</td>
                  <td>{s.newCompanies || 0}</td>
                  <td>{new Date(s.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!scans.length && (
            <div className="empty">
              <p>No scans yet.</p>
              {strategies.length > 0 ? (
                <button className="primary" onClick={() => setShowCreate(true)}>Run your first scan</button>
              ) : (
                <p className="muted">No approved strategies available. <a href="/v2/scans">Create and approve a strategy first</a>.</p>
              )}
            </div>
          )}
        </div>
        {notice && <div className="muted" style={{ marginTop: 8, textAlign: 'center' }}>{notice}</div>}

        {showCreate && (
          <CreateScanModal strategies={strategies} onCreate={startScan} onClose={() => setShowCreate(false)} />
        )}
      </>
    );
  }

  // --- Detail View ---
  return (
    <>
      <div className="page-header">
        <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, marginBottom: 8 }}>← Back to Scans</button>
        <h1>{selected.name}</h1>
        <p className="muted">
          {selected.strategy?.country}{selected.strategy?.stateProvince ? `, ${selected.strategy.stateProvince}` : ''}
          {' · '}Status: {selected.status}
          {' · '}{selected._count?.candidates || 0} candidates
        </p>
      </div>

      {selected.providerRuns && selected.providerRuns.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head"><h2>Provider Runs</h2></div>
          <table>
            <thead><tr><th>Provider</th><th>Role</th><th>Status</th><th>Requests</th><th>Results</th></tr></thead>
            <tbody>
              {selected.providerRuns.map(pr => (
                <tr key={pr.id}>
                  <td>{pr.provider}</td>
                  <td>{pr.role}</td>
                  <td><span className={`pill ${pr.status === 'COMPLETED' ? 'good' : pr.status === 'FAILED' ? 'urgent' : 'neutral'}`}>{pr.status}</span></td>
                  <td>{pr.requestCount}</td>
                  <td>{pr.resultCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <div className="card-head"><h2>Candidates ({selected._count?.candidates || 0})</h2></div>
        <table>
          <thead>
            <tr>
              <th>Profile Score</th>
              <th>Company</th>
              <th>Industry</th>
              <th>Website</th>
            </tr>
          </thead>
          <tbody>
            {selected.candidates?.map(c => (
              <tr key={c.id}>
                <td>
                  <span className={`score ${c.profileScore >= 70 ? 'high' : c.profileScore >= 40 ? 'mid' : 'low'}`}>
                    {c.profileScore}
                  </span>
                </td>
                <td><strong>{c.company.name}</strong></td>
                <td>{c.company.industry || '—'}</td>
                <td>{c.company.website ? <a href={c.company.website} target="_blank" rel="noopener">{c.company.website}</a> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(!selected.candidates || selected.candidates.length === 0) && (
          <div className="empty"><p>No candidates in this scan yet.</p></div>
        )}
      </div>

      {notice && <div className="muted" style={{ marginTop: 8, textAlign: 'center' }}>{notice}</div>}
    </>
  );
}

function CreateScanModal({ strategies, onCreate, onClose }: {
  strategies: Strategy[];
  onCreate: (strategyId: number, name: string) => void;
  onClose: () => void;
}) {
  const [strategyId, setStrategyId] = useState<number | null>(strategies[0]?.id || null);
  const [name, setName] = useState('');

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div className="card" style={{ width: '100%', maxWidth: 480, margin: 16 }} onClick={e => e.stopPropagation()}>
        <div className="card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>New Discovery Scan</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted)' }}>×</button>
        </div>
        <div style={{ display: 'grid', gap: 16, padding: 16 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500 }}>Strategy</label>
            <select value={strategyId || ''} onChange={e => setStrategyId(parseInt(e.target.value))} style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 }}>
              {strategies.map(s => (
                <option key={s.id} value={s.id}>
                  Strategy #{s.id} — {s.country}{s.stateProvince ? `, ${s.stateProvince}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500 }}>Scan Name (optional)</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Scotland Construction Q3" style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="primary" disabled={!strategyId} onClick={() => onCreate(strategyId!, name.trim() || `Scan ${new Date().toLocaleString()}`)}>
              Start Scan
            </button>
            <button className="secondary" onClick={onClose}>Cancel</button>
          </div>
          {!strategies.length && (
            <p className="muted" style={{ fontSize: 12 }}>No approved strategies. Create and approve one in the Strategies tab.</p>
          )}
        </div>
      </div>
    </div>
  );
}
