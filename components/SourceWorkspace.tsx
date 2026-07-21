'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import CSVUpload from './CSVUpload';
import ScanSetupWizard from './ScanSetupWizard';

type ScanProfile = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  config: any;
  createdAt: string;
  _count?: { scanRuns: number };
};

type Source = {
  id: string;
  name: string;
  requiresApiKey: boolean;
  envKey: string;
};

type LeadsParent = {
  id: number;
  name: string;
  description: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  batches?: Array<{
    id: number;
    name: string;
    scanArea: string | null;
    createdBy: string | null;
    originalScanDate: string;
    lastScanDate: string | null;
    _count: { companies: number; scanRuns: number };
  }>;
  _count?: { batches: number };
};

type Run = {
  id: number;
  scanArea: string | null;
  startedAt: string;
  status: string;
  source: string;
  resultsFound: number;
  newCompanies: number;
  updatedCompanies: number;
  errors: number;
  message?: string;
  isRescan: boolean;
  profile?: { id: number; name: string; slug: string } | null;
  batch?: { id: number; name: string; scanArea: string | null; leadsParentId: number | null } | null;
};

type Tab = 'scan' | 'parents' | 'profiles' | 'csv';

export default function SourceWorkspace() {
  const [tab, setTab] = useState<Tab>('scan');
  const [profiles, setProfiles] = useState<ScanProfile[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [parents, setParents] = useState<LeadsParent[]>([]);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState('');

  // Scan form state
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [scanName, setScanName] = useState('');
  const [scanArea, setScanArea] = useState('UK');
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [selectedParentId, setSelectedParentId] = useState<number | null>(null);
  const [showWizard, setShowWizard] = useState(false);

  const loadProfiles = useCallback(() =>
    fetch('/api/scan-profiles').then(r => r.json()).then(d => {
      if (Array.isArray(d)) {
        setProfiles(d.filter((p: ScanProfile) => p.isActive));
        if (d.length > 0 && !selectedProfileId) {
          setSelectedProfileId(d[0].id);
        }
      }
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  []);

  const loadRuns = useCallback(() =>
    fetch('/api/scans').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setRuns(d);
    }),
  []);

  const loadSources = useCallback(() =>
    fetch('/api/sources').then(r => r.json()).then(d => {
      if (d?.sources) {
        setSources(d.sources);
        setSelectedSources(d.sources.map((s: Source) => s.id));
      }
    }),
  []);

  const loadParents = useCallback(() =>
    fetch('/api/leads-parents').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setParents(d);
    }),
  []);

  useEffect(() => {
    loadProfiles();
    loadRuns();
    loadSources();
    loadParents();
  }, [loadProfiles, loadRuns, loadSources, loadParents]);

  const toggleSource = (id: string) => {
    setSelectedSources(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const createParent = async () => {
    const name = prompt('Leads Parent name:');
    if (!name) return;
    const r = await fetch('/api/leads-parents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (r.ok) {
      setNotice(`Created Leads Parent: ${name}`);
      loadParents();
    }
  };

  const scan = async () => {
    if (!selectedProfileId) {
      setNotice('Select a scan profile first');
      return;
    }
    if (!scanArea.trim()) {
      setNotice('Scan area is required');
      return;
    }
    if (selectedSources.length === 0) {
      setNotice('Select at least one source');
      return;
    }

    setRunning(true);
    setNotice(`Scanning ${scanArea}…`);

    try {
      const body: Record<string, unknown> = {
        profileId: selectedProfileId,
        scanName: scanName || `${profiles.find(p => p.id === selectedProfileId)?.name} — ${scanArea}`,
        scanArea,
        sources: selectedSources,
      };
      if (selectedParentId) body.leadsParentId = selectedParentId;

      const r = await fetch('/api/scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (r.ok) {
        setNotice(d.output || 'Scan complete');
        loadRuns();
        loadParents();
      } else {
        setNotice(d.error || 'Scan failed');
      }
    } catch (e: any) {
      setNotice(`Error: ${e.message}`);
    }
    setRunning(false);
  };

  const seedDefaults = async () => {
    setNotice('Seeding default profiles…');
    const r = await fetch('/api/scan-profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed: true }),
    });
    const d = await r.json();
    setNotice(`Seeded: ${d.seeded?.map((s: any) => `${s.name} (${s.status})`).join(', ') || 'done'}`);
    loadProfiles();
  };

  const profile = profiles.find(p => p.id === selectedProfileId);

  const tabBtn = (id: Tab, label: string) => (
    <button
      onClick={() => setTab(id)}
      style={{
        padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer',
        fontWeight: tab === id ? 600 : 400,
        borderBottom: tab === id ? '2px solid #d7ff00' : '2px solid transparent',
      }}
    >
      {label}
    </button>
  );

  return (
    <>
      <div className="page-header">
        <h1>Scan</h1>
        <p>Find companies using configurable scan profiles and multiple sources.</p>
      </div>

      <div className="tab-bar" style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid #e5e7eb' }}>
        {tabBtn('scan', 'Run Scan')}
        {tabBtn('parents', 'Leads Parents')}
        {tabBtn('profiles', 'Scan Profiles')}
        {tabBtn('csv', 'CSV Upload')}
      </div>

      {tab === 'scan' && (
        <>
          {showWizard && (
            <ScanSetupWizard
              onClose={() => setShowWizard(false)}
              onCreated={() => { setShowWizard(false); loadProfiles(); setNotice('Scan profile created!'); }}
            />
          )}

          {!showWizard && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2>New Scan</h2>
                <button className="primary" style={{ fontSize: '0.85rem', padding: '8px 14px' }} onClick={() => setShowWizard(true)}>+ Setup Wizard</button>
              </div>

              {profiles.length === 0 ? (
                <div className="empty" style={{ padding: 20 }}>
                  <p>No scan profiles yet. Seed the default profiles to get started:</p>
                  <button className="primary" onClick={seedDefaults}>Seed Default Profiles</button>
                </div>
              ) : (
                <>
                  {/* Scan Name */}
                  <div style={{ marginBottom: 16 }}>
                    <label className="muted" style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>Scan Name</label>
                    <input
                      value={scanName}
                      onChange={e => setScanName(e.target.value)}
                      placeholder="e.g. UK Sales Leads July"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 }}
                    />
                  </div>

                  {/* Scan Profile */}
                  <div style={{ marginBottom: 16 }}>
                    <label className="muted" style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>Scan Profile</label>
                    <select
                      value={selectedProfileId || ''}
                      onChange={e => setSelectedProfileId(parseInt(e.target.value))}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 }}
                    >
                      {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    {profile?.description && <p className="muted" style={{ marginTop: 6, fontSize: 13 }}>{profile.description}</p>}
                  </div>

                  {/* Scan Area */}
                  <div style={{ marginBottom: 16 }}>
                    <label className="muted" style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>Scan Area</label>
                    <input
                      value={scanArea}
                      onChange={e => setScanArea(e.target.value)}
                      placeholder="Country, state/province, or city (e.g. UK, Texas, London)"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 }}
                    />
                    <p className="muted" style={{ marginTop: 4, fontSize: 12 }}>Enter a country, region, or city. This is where the scan will look for leads.</p>
                  </div>

                  {/* Sources */}
                  <div style={{ marginBottom: 16 }}>
                    <label className="muted" style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>Data Sources</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {sources.map(s => (
                        <button
                          key={s.id}
                          onClick={() => toggleSource(s.id)}
                          disabled={running}
                          style={{
                            padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db',
                            background: selectedSources.includes(s.id) ? '#d7ff00' : '#fff',
                            cursor: 'pointer', fontSize: 14, fontWeight: 500,
                          }}
                        >
                          {s.name}
                        </button>
                      ))}
                      {sources.length === 0 && <span className="muted">No sources configured. Check API keys in .env.local</span>}
                    </div>
                  </div>

                  {/* Leads Parent */}
                  <div style={{ marginBottom: 16 }}>
                    <label className="muted" style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>Leads Parent (optional)</label>
                    <select
                      value={selectedParentId || ''}
                      onChange={e => setSelectedParentId(e.target.value ? parseInt(e.target.value) : null)}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 }}
                    >
                      <option value="">— None —</option>
                      {parents.map(p => <option key={p.id} value={p.id}>{p.name} ({p._count?.batches || 0} scans)</option>)}
                    </select>
                  </div>

                  {/* Profile summary */}
                  {profile && (
                    <div style={{ marginBottom: 16, padding: 12, background: '#f9fafb', borderRadius: 6, fontSize: 13 }}>
                      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                        <div><span className="muted">Queries:</span> {profile.config?.brave?.queryPairs?.length || 0}</div>
                        <div><span className="muted">Task groups:</span> {Object.keys(profile.config?.taskGroups || {}).length}</div>
                        <div><span className="muted">Negative terms:</span> {profile.config?.brave?.negativeTerms?.length || 0}</div>
                        <div><span className="muted">Past runs:</span> {profile._count?.scanRuns || 0}</div>
                      </div>
                    </div>
                  )}

                  <div className="toolbar">
                    <button className="primary" disabled={running || !selectedProfileId} onClick={scan}>
                      {running ? 'Scanning…' : 'Run Scan'}
                    </button>
                  </div>
                  {notice && <div className="muted" style={{ marginTop: 10 }}>{notice}</div>}
                </>
              )}
            </div>
          )}

          {/* Recent scans */}
          <div className="card">
            <div className="card-head"><h2>Recent Scans</h2></div>
            <div style={{ overflow: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Started</th>
                    <th>Profile</th>
                    <th>Area</th>
                    <th>Sources</th>
                    <th>Results</th>
                    <th>New</th>
                    <th>Updated</th>
                    <th>Errors</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map(r => (
                    <tr key={r.id}>
                      <td>{new Date(r.startedAt).toLocaleString()}</td>
                      <td>{r.profile?.name || '—'}</td>
                      <td>{r.scanArea || '—'}</td>
                      <td>{r.source}</td>
                      <td>{r.resultsFound}</td>
                      <td>{r.newCompanies}</td>
                      <td>{r.updatedCompanies}</td>
                      <td>{r.errors}</td>
                      <td>
                        <span className={`pill ${r.status === 'COMPLETED' ? 'good' : r.status === 'FAILED' ? 'urgent' : 'neutral'}`}>
                          {r.status}
                        </span>
                        {r.isRescan && <span className="muted" style={{ marginLeft: 4 }}>(rescan)</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!runs.length && <div className="empty">No scans yet. Configure a profile and run a scan above.</div>}
            </div>
          </div>
        </>
      )}

      {tab === 'parents' && (
        <LeadsParentView parents={parents} onReload={loadParents} />
      )}

      {tab === 'profiles' && (
        <ProfileManager profiles={profiles} onReload={loadProfiles} />
      )}

      {tab === 'csv' && (
        <CSVUpload profiles={profiles} />
      )}
    </>
  );
}

function LeadsParentView({ parents, onReload }: { parents: LeadsParent[]; onReload: () => void }) {
  const [selectedParent, setSelectedParent] = useState<LeadsParent | null>(null);
  const [showMove, setShowMove] = useState(false);
  const [checkedBatches, setCheckedBatches] = useState<number[]>([]);
  const [moveTarget, setMoveTarget] = useState('');

  const createParent = async () => {
    const name = prompt('Leads Parent name:');
    if (!name) return;
    await fetch('/api/leads-parents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    onReload();
  };

  const deleteParent = async (id: number) => {
    if (!confirm('Delete this Leads Parent? Scans inside will be unparented, not deleted.')) return;
    await fetch('/api/leads-parents/' + id, { method: 'DELETE' });
    setSelectedParent(null);
    onReload();
  };

  const moveBatches = async () => {
    if (!checkedBatches.length) return;
    const targetId = moveTarget ? parseInt(moveTarget) : null;
    await fetch('/api/batches/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchIds: checkedBatches, leadsParentId: targetId }),
    });
    setCheckedBatches([]);
    setShowMove(false);
    setMoveTarget('');
    onReload();
    if (selectedParent) {
      const updated = await fetch('/api/leads-parents/' + selectedParent.id).then(r => r.json());
      setSelectedParent(updated);
    }
  };

  if (selectedParent) {
    return (
      <div className="card">
        <div className="card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2>{selectedParent.name}</h2>
            {selectedParent.description && <p className="muted" style={{ fontSize: 13 }}>{selectedParent.description}</p>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="secondary" style={{ fontSize: '0.85rem' }} onClick={() => setSelectedParent(null)}>← Back</button>
            <button className="secondary" style={{ fontSize: '0.85rem', color: '#dc2626' }} onClick={() => deleteParent(selectedParent.id)}>Delete</button>
          </div>
        </div>

        {checkedBatches.length > 0 && (
          <div className="toolbar" style={{ background: 'var(--soft)', padding: 8, borderRadius: 6, marginBottom: 8 }}>
            <strong>{checkedBatches.length} scans selected</strong>
            <button className="secondary" style={{ fontSize: '0.85rem' }} onClick={() => setShowMove(!showMove)}>Move to…</button>
            <button className="secondary" style={{ fontSize: '0.85rem' }} onClick={() => setCheckedBatches([])}>Clear</button>
            {showMove && (
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select value={moveTarget} onChange={e => setMoveTarget(e.target.value)} style={{ padding: '6px' }}>
                  <option value="">— Unparent —</option>
                  {parents.filter(p => p.id !== selectedParent.id).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button className="primary" style={{ fontSize: '0.85rem' }} onClick={moveBatches}>Move</button>
              </span>
            )}
          </div>
        )}

        <div style={{ overflow: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Scan Name</th>
                <th>Area</th>
                <th>By</th>
                <th>Companies</th>
                <th>Scan Runs</th>
                <th>Original Date</th>
                <th>Last Scan</th>
              </tr>
            </thead>
            <tbody>
              {selectedParent.batches?.map(b => (
                <tr key={b.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={checkedBatches.includes(b.id)}
                      onChange={e => setCheckedBatches(prev =>
                        e.target.checked ? [...prev, b.id] : prev.filter(id => id !== b.id)
                      )}
                    />
                  </td>
                  <td><strong>{b.name}</strong></td>
                  <td>{b.scanArea || '—'}</td>
                  <td>{b.createdBy || '—'}</td>
                  <td>{b._count.companies}</td>
                  <td>{b._count.scanRuns}</td>
                  <td>{new Date(b.originalScanDate).toLocaleDateString()}</td>
                  <td>{b.lastScanDate ? new Date(b.lastScanDate).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!selectedParent.batches?.length && <div className="empty">No scans in this parent yet. Run a scan and assign it here.</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Leads Parents</h2>
        <button className="primary" onClick={createParent}>+ New Parent</button>
      </div>
      <div style={{ overflow: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Scans</th>
              <th>Created By</th>
              <th>Created</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {parents.map(p => (
              <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => {
                fetch('/api/leads-parents/' + p.id).then(r => r.json()).then(d => setSelectedParent(d));
              }}>
                <td><strong>{p.name}</strong>{p.description && <div className="muted" style={{ fontSize: 12 }}>{p.description}</div>}</td>
                <td>{p._count?.batches || 0}</td>
                <td>{p.createdBy || '—'}</td>
                <td>{new Date(p.createdAt).toLocaleDateString()}</td>
                <td>{new Date(p.updatedAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!parents.length && <div className="empty">No Leads Parents yet. Create one to group your scans.</div>}
      </div>
    </div>
  );
}

function ProfileManager({ profiles, onReload }: { profiles: ScanProfile[]; onReload: () => void }) {
  const [editing, setEditing] = useState<ScanProfile | null>(null);
  const [creating, setCreating] = useState(false);

  if (creating) {
    return <ProfileEditor mode="create" onSave={() => { setCreating(false); onReload(); }} onCancel={() => setCreating(false)} />;
  }

  if (editing) {
    return <ProfileEditor mode="edit" profile={editing} onSave={() => { setEditing(null); onReload(); }} onCancel={() => setEditing(null)} />;
  }

  return (
    <div className="card">
      <div className="card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Scan Profiles</h2>
        <button className="primary" onClick={() => setCreating(true)}>+ New Profile</button>
      </div>
      <div style={{ overflow: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>Queries</th>
              <th>Runs</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map(p => (
              <tr key={p.id}>
                <td style={{ fontWeight: 600 }}>{p.name}</td>
                <td className="muted" style={{ maxWidth: 300 }}>{p.description || '—'}</td>
                <td>{p.config?.brave?.queryPairs?.length || 0}</td>
                <td>{p._count?.scanRuns || 0}</td>
                <td>{new Date(p.createdAt).toLocaleDateString()}</td>
                <td>
                  <button
                    onClick={() => setEditing(p)}
                    style={{ padding: '4px 10px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 4, background: '#fff', cursor: 'pointer' }}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!profiles.length && (
          <div className="empty">No profiles yet. Click &quot;New Profile&quot; or seed defaults from the Run Scan tab.</div>
        )}
      </div>
    </div>
  );
}

function ProfileEditor({
  mode,
  profile,
  onSave,
  onCancel,
}: {
  mode: 'create' | 'edit';
  profile?: ScanProfile;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(profile?.name || '');
  const [description, setDescription] = useState(profile?.description || '');
  const [countries, setCountries] = useState(
    (profile?.config?.brave?.countries || ['UK']).join(', ')
  );
  const [queryPairs, setQueryPairs] = useState(
    (profile?.config?.brave?.queryPairs || [['', '']])
      .map(([a, b]: [string, string]) => `${a} | ${b}`).join('\n')
  );
  const [negativeTerms, setNegativeTerms] = useState(
    (profile?.config?.brave?.negativeTerms || []).join(', ')
  );
  const [jobTerms, setJobTerms] = useState(
    (profile?.config?.jobTerms || ['job', 'vacancy', 'career', 'position', 'role', 'hiring', 'employment']).join(', ')
  );
  const [ignoreDomains, setIgnoreDomains] = useState(
    (profile?.config?.ignoreDomains || ['linkedin.com', 'facebook.com', 'instagram.com', 'youtube.com', 'reddit.com']).join(', ')
  );
  const [taskGroups, setTaskGroups] = useState(
    JSON.stringify(profile?.config?.taskGroups || {}, null, 2)
  );
  const [scoring, setScoring] = useState(
    JSON.stringify(profile?.config?.scoring || {}, null, 2)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true);
    setError('');

    try {
      const parsedQueryPairs = queryPairs
        .split('\n')
        .map((line: string) => line.trim())
        .filter(Boolean)
        .map((line: string) => {
          const [a, b] = line.split('|').map((s: string) => s.trim());
          return [a || '', b || ''];
        });

      const config = {
        brave: {
          countries: countries.split(',').map((c: string) => c.trim()).filter(Boolean),
          freshness: 'pm',
          resultsPerPage: 20,
          defaultQueryLimit: 16,
          negativeTerms: negativeTerms.split(',').map((t: string) => t.trim()).filter(Boolean),
          queryPairs: parsedQueryPairs,
        },
        jobTerms: jobTerms.split(',').map((t: string) => t.trim()).filter(Boolean),
        ignoreDomains: ignoreDomains.split(',').map((d: string) => d.trim()).filter(Boolean),
        taskGroups: JSON.parse(taskGroups),
        scoring: JSON.parse(scoring),
      };

      const url = mode === 'create'
        ? '/api/scan-profiles'
        : `/api/scan-profiles/${profile!.id}`;
      const method = mode === 'create' ? 'POST' : 'PUT';

      const body: any = { name, description, config };
      if (mode === 'create') delete body.id;

      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!r.ok) {
        const d = await r.json();
        setError(d.error || 'Failed to save');
        setSaving(false);
        return;
      }

      onSave();
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: 6,
    border: '1px solid #d1d5db', fontSize: 14, fontFamily: 'inherit',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500,
  };

  return (
    <div className="card">
      <div className="card-head">
        <h2>{mode === 'create' ? 'New Scan Profile' : `Edit: ${profile?.name}`}</h2>
      </div>

      <div style={{ display: 'grid', gap: 16, maxWidth: 800 }}>
        <div>
          <label style={labelStyle}>Name</label>
          <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sales & Outreach Roles" />
        </div>

        <div>
          <label style={labelStyle}>Description</label>
          <input style={inputStyle} value={description} onChange={e => setDescription(e.target.value)} placeholder="What this profile searches for" />
        </div>

        <div>
          <label style={labelStyle}>Countries (comma-separated, used as defaults)</label>
          <input style={inputStyle} value={countries} onChange={e => setCountries(e.target.value)} placeholder="UK, NZ" />
        </div>

        <div>
          <label style={labelStyle}>Query Pairs (one per line, format: term1 | term2)</label>
          <textarea
            style={{ ...inputStyle, fontFamily: 'monospace', minHeight: 120 }}
            value={queryPairs}
            onChange={e => setQueryPairs(e.target.value)}
            placeholder={'cold calling | sales\ncold email | outreach\nlead generation | sales'}
          />
        </div>

        <div>
          <label style={labelStyle}>Negative Terms (comma-separated)</label>
          <input style={inputStyle} value={negativeTerms} onChange={e => setNegativeTerms(e.target.value)} placeholder="student, internship, volunteer, graduate" />
        </div>

        <div>
          <label style={labelStyle}>Job Terms (comma-separated)</label>
          <input style={inputStyle} value={jobTerms} onChange={e => setJobTerms(e.target.value)} />
        </div>

        <div>
          <label style={labelStyle}>Ignore Domains (comma-separated)</label>
          <input style={inputStyle} value={ignoreDomains} onChange={e => setIgnoreDomains(e.target.value)} />
        </div>

        <div>
          <label style={labelStyle}>Task Groups (JSON)</label>
          <textarea
            style={{ ...inputStyle, fontFamily: 'monospace', minHeight: 200 }}
            value={taskGroups}
            onChange={e => setTaskGroups(e.target.value)}
          />
        </div>

        <div>
          <label style={labelStyle}>Scoring Weights (JSON)</label>
          <textarea
            style={{ ...inputStyle, fontFamily: 'monospace', minHeight: 200 }}
            value={scoring}
            onChange={e => setScoring(e.target.value)}
          />
        </div>

        {error && <div style={{ color: '#dc2626', fontSize: 14 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="primary" disabled={saving || !name} onClick={save}>
            {saving ? 'Saving…' : 'Save Profile'}
          </button>
          <button onClick={onCancel} style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
