'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';

type Job = {
  id: number;
  title: string;
  location?: string;
  salaryText?: string;
  sourceUrl: string;
  taskSignals?: string;
  advertScore: number;
  lastSeenAt: string;
};

type Company = {
  id: number;
  name: string;
  country?: string;
  website?: string;
  phone?: string;
  email?: string;
  contactSourceUrl?: string;
  employeeCount?: number;
  employeeRange?: string;
  location?: string;
  activeJobCount: number;
  totalJobCount: number;
  estimatedSalarySpend: number;
  opportunityScore: number;
  scoreReason?: string;
  recurringTasks?: string;
  opportunitySummary?: string;
  status: string;
  notes?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  isNew?: boolean;
  jobs: Job[];
};

type Batch = {
  id: number;
  name: string;
  scanArea: string | null;
  createdBy: string | null;
  originalScanDate: string;
  lastScanDate: string | null;
  createdAt: string;
  archivedAt?: string;
  notes?: string;
  _count: { companies: number; scanRuns: number };
};

type LeadList = {
  id: number;
  name: string;
  description: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  batches?: Batch[];
  _count?: { batches: number };
};

type FilterPreset = {
  id: number;
  name: string;
  config: any;
};

const statuses = ['NEW', 'REVIEWING', 'CONTACTED', 'FOLLOW_UP', 'MEETING', 'ASSESSMENT', 'WON', 'PASSED', 'NO_RESPONSE', 'NOT_INTERESTED'];

type View = 'lists' | 'all-leads' | 'list-detail';

export default function LeadWorkspace() {
  const [view, setView] = useState<View>('lists');
  const [items, setItems] = useState<Company[]>([]);
  const [leadLists, setLeadLists] = useState<LeadList[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [selectedList, setSelectedList] = useState<LeadList | null>(null);
  const [selected, setSelected] = useState<Company | null>(null);
  const [q, setQ] = useState('');
  const [min, setMin] = useState(0);
  const [contact, setContact] = useState(false);
  const [multi, setMulti] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [checked, setChecked] = useState<number[]>([]);
  const [notice, setNotice] = useState('');
  const [showSaveList, setShowSaveList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [showBulkStatus, setShowBulkStatus] = useState(false);
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkNote, setBulkNote] = useState('');

  const buildQuery = () => {
    const p = new URLSearchParams({ q, minScore: String(min) });
    if (contact) p.set('contactable', '1');
    if (multi) p.set('multi', '1');
    if (statusFilter) p.set('status', statusFilter);
    if (batchFilter) p.set('batchId', batchFilter);
    return p;
  };

  const load = async () => {
    const items = await fetch('/api/companies?' + buildQuery()).then(r => r.json());
    setItems(items);
  };

  const loadBatches = () => fetch('/api/batches').then(r => r.json()).then(setBatches);
  const loadPresets = () => fetch('/api/filter-presets').then(r => r.json()).then(setPresets);
  const loadLeadLists = useCallback(() => fetch('/api/leads-parents').then(r => r.json()).then(d => {
    if (Array.isArray(d)) setLeadLists(d);
  }), []);

  useEffect(() => { loadLeadLists(); loadBatches(); loadPresets(); }, [loadLeadLists]);
  useEffect(() => { if (view === 'all-leads') load(); }, [q, min, contact, multi, statusFilter, batchFilter]);

  const filtered = items;

  const update = async (id: number, patch: Partial<Company>) => {
    const d = await fetch('/api/companies/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).then(r => r.json());
    setItems(x => x.map(v => v.id === id ? d : v));
    if (selected?.id === id) setSelected(d);
  };

  const saveToList = async () => {
    if (!checked.length || !newListName.trim()) return;
    await fetch('/api/batches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newListName.trim(), companyIds: checked }),
    });
    setNotice(`Saved ${checked.length} leads to "${newListName.trim()}"`);
    setChecked([]);
    setNewListName('');
    setShowSaveList(false);
    loadBatches();
  };

  const exportCSV = (selectedOnly: boolean) => {
    const p = buildQuery();
    if (selectedOnly && checked.length) p.set('ids', checked.join(','));
    window.open('/api/export?' + p, '_blank');
  };

  const applyPreset = (preset: FilterPreset) => {
    const cfg = preset.config;
    setQ(cfg.q || '');
    setMin(cfg.minScore || 0);
    setContact(cfg.contactable || false);
    setMulti(cfg.multi || false);
    setStatusFilter(cfg.status || '');
    setBatchFilter(cfg.batchId || '');
    setNotice(`Loaded preset: ${preset.name}`);
  };

  const savePreset = async () => {
    if (!presetName.trim()) return;
    const config = { q, minScore: min, contactable: contact, multi, status: statusFilter, batchId: batchFilter };
    await fetch('/api/filter-presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: presetName.trim(), config }),
    });
    setNotice(`Saved preset: ${presetName.trim()}`);
    setPresetName('');
    setShowSavePreset(false);
    loadPresets();
  };

  const deletePreset = async (id: number) => {
    await fetch('/api/filter-presets/' + id, { method: 'DELETE' });
    loadPresets();
  };

  const doBulkStatus = async () => {
    if (!checked.length || !bulkStatus) return;
    const res = await fetch('/api/companies/bulk', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: checked, status: bulkStatus, note: bulkNote }),
    }).then(r => r.json());
    setNotice(`Updated ${res.updated} leads to ${bulkStatus.replaceAll('_', ' ')}`);
    setChecked([]);
    setShowBulkStatus(false);
    setBulkStatus('');
    setBulkNote('');
    load();
  };

  const all = useMemo(() => filtered.length > 0 && filtered.every(x => checked.includes(x.id)), [filtered, checked]);

  // --- Lead List helpers ---
  const createLeadList = async () => {
    const name = prompt('Lead List name:');
    if (!name) return;
    const desc = prompt('Description (optional):') || '';
    const r = await fetch('/api/leads-parents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: desc }),
    });
    if (r.ok) { setNotice(`Created Lead List: ${name}`); loadLeadLists(); }
  };

  const deleteLeadList = async (id: number) => {
    if (!confirm('Delete this Lead List? Scans inside will be unparented, not deleted.')) return;
    await fetch('/api/leads-parents/' + id, { method: 'DELETE' });
    setSelectedList(null);
    loadLeadLists();
  };

  const openList = async (id: number) => {
    const d = await fetch('/api/leads-parents/' + id).then(r => r.json());
    setSelectedList(d);
    setView('list-detail');
  };

  // --- Tab bar ---
  const tabBtn = (id: View, label: string) => (
    <button
      onClick={() => setView(id)}
      style={{
        padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer',
        fontWeight: view === id ? 600 : 400,
        borderBottom: view === id ? '2px solid #d7ff00' : '2px solid transparent',
        fontSize: 14,
      }}
    >
      {label}
    </button>
  );

  // --- Lead Lists View ---
  if (view === 'lists') {
    return (
      <>
        <div className="page-header">
          <h1>Leads</h1>
          <p>Group your scans into Lead Lists. Run scans into a list, then filter and manage leads.</p>
        </div>

        <div className="tab-bar" style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid #e5e7eb' }}>
          {tabBtn('lists', 'Lead Lists')}
          {tabBtn('all-leads', 'All Leads')}
        </div>

        <div className="card">
          <div className="card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>Lead Lists</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link href="/scan" className="button primary" style={{ fontSize: '0.85rem', padding: '8px 14px' }}>+ New Scan</Link>
              <button className="secondary" style={{ fontSize: '0.85rem', padding: '8px 14px' }} onClick={createLeadList}>+ New List</button>
            </div>
          </div>
          <div style={{ overflow: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>List Name</th>
                  <th>Scans</th>
                  <th>Created By</th>
                  <th>Created</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {leadLists.map(l => (
                  <tr key={l.id} style={{ cursor: 'pointer' }} onClick={() => openList(l.id)}>
                    <td>
                      <strong>{l.name}</strong>
                      {l.description && <div className="muted" style={{ fontSize: 12 }}>{l.description}</div>}
                    </td>
                    <td>{l._count?.batches || 0}</td>
                    <td>{l.createdBy || '—'}</td>
                    <td>{new Date(l.createdAt).toLocaleDateString()}</td>
                    <td>{new Date(l.updatedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!leadLists.length && (
              <div className="empty">
                <p>No Lead Lists yet.</p>
                <p style={{ marginTop: 8 }}>
                  <button className="primary" onClick={createLeadList}>Create your first Lead List</button>
                  {' '}or{' '}
                  <Link href="/scan">run a scan</Link>
                </p>
              </div>
            )}
          </div>
        </div>
        {notice && <div className="muted" style={{ marginTop: 8, textAlign: 'center' }}>{notice}</div>}
      </>
    );
  }

  // --- Lead List Detail View ---
  if (view === 'list-detail' && selectedList) {
    const [showMove, setShowMove] = useState(false);
    const [checkedBatches, setCheckedBatches] = useState<number[]>([]);
    const [moveTarget, setMoveTarget] = useState('');

    return (
      <>
        <div className="page-header">
          <h1>{selectedList.name}</h1>
          {selectedList.description && <p className="muted">{selectedList.description}</p>}
        </div>

        <div className="tab-bar" style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid #e5e7eb' }}>
          <button onClick={() => { setView('lists'); setSelectedList(null); }} style={{ padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 400, fontSize: 14 }}>← Back to Lists</button>
        </div>

        <div className="card">
          <div className="card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>Scans in this List</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link href="/scan" className="button primary" style={{ fontSize: '0.85rem', padding: '8px 14px' }}>+ Run New Scan</Link>
              <button className="secondary" style={{ fontSize: '0.85rem', color: '#dc2626' }} onClick={() => deleteLeadList(selectedList.id)}>Delete List</button>
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
                    {leadLists.filter(l => l.id !== selectedList.id).map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                  <button className="primary" style={{ fontSize: '0.85rem' }} onClick={async () => {
                    await fetch('/api/batches/move', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ batchIds: checkedBatches, leadsParentId: moveTarget ? parseInt(moveTarget) : null }),
                    });
                    setCheckedBatches([]); setShowMove(false); setMoveTarget('');
                    openList(selectedList.id);
                  }}>Move</button>
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
                  <th>Runs</th>
                  <th>First Scan</th>
                  <th>Last Scan</th>
                </tr>
              </thead>
              <tbody>
                {selectedList.batches?.map(b => (
                  <tr key={b.id} style={{ cursor: 'pointer' }} onClick={() => { setBatchFilter(String(b.id)); setView('all-leads'); }}>
                    <td onClick={e => e.stopPropagation()}>
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
            {!selectedList.batches?.length && (
              <div className="empty">
                <p>No scans in this list yet.</p>
                <Link href="/scan" className="button primary" style={{ fontSize: '0.85rem' }}>Run a scan into this list</Link>
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  // --- All Leads View ---
  return (
    <>
      <div className="page-header">
        <h1>Leads</h1>
        <p>Search, filter and manage your lead pipeline.</p>
      </div>

      <div className="tab-bar" style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid #e5e7eb' }}>
        {tabBtn('lists', 'Lead Lists')}
        {tabBtn('all-leads', 'All Leads')}
      </div>

      {/* Filter Presets */}
      {presets.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-head"><h2>Filter Presets</h2></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {presets.map(p => (
              <span key={p.id} className="pill neutral" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', cursor: 'pointer' }} onClick={() => applyPreset(p)}>
                {p.name}
                <button onClick={e => { e.stopPropagation(); deletePreset(p.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '0.8rem' }}>×</button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Quick batch filter */}
      {batches.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-head"><h2>Scans</h2></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {batches.map(b => (
              <span
                key={b.id}
                className={`pill ${batchFilter === String(b.id) ? 'urgent' : 'neutral'}`}
                style={{ padding: '6px 12px', cursor: 'pointer' }}
                onClick={() => setBatchFilter(batchFilter === String(b.id) ? '' : String(b.id))}
              >
                {b.name} ({b._count.companies})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card">
        <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search company, location or task"
            style={{ minWidth: 220, flex: 1 }}
          />
          <select value={min} onChange={e => setMin(Number(e.target.value))}>
            <option value="0">All scores</option>
            <option value="20">20+</option>
            <option value="40">40+</option>
            <option value="60">60+</option>
            <option value="80">80+</option>
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {statuses.map(s => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}
          </select>
          <label>
            <input type="checkbox" checked={contact} onChange={e => setContact(e.target.checked)} />
            Contactable
          </label>
          <label>
            <input type="checkbox" checked={multi} onChange={e => setMulti(e.target.checked)} />
            Multiple jobs
          </label>
          <button className="secondary" style={{ fontSize: '0.85rem', padding: '8px 12px' }} onClick={() => setShowSavePreset(true)}>
            Save Preset
          </button>
        </div>

        {showSavePreset && (
          <div className="card" style={{ marginBottom: 12, background: 'var(--soft)' }}>
            <div className="toolbar">
              <input
                value={presetName}
                onChange={e => setPresetName(e.target.value)}
                placeholder="Preset name (e.g. UK High Score Contactable)"
                style={{ flex: 1, minWidth: 200 }}
                autoFocus
              />
              <button className="primary" onClick={savePreset} disabled={!presetName.trim()}>Save</button>
              <button className="secondary" onClick={() => setShowSavePreset(false)}>Cancel</button>
            </div>
          </div>
        )}

        {showSaveList && (
          <div className="card" style={{ marginBottom: 12, background: 'var(--soft)' }}>
            <div className="toolbar">
              <input
                value={newListName}
                onChange={e => setNewListName(e.target.value)}
                placeholder="Batch name (e.g. UK Outreach July)"
                style={{ flex: 1, minWidth: 200 }}
                autoFocus
              />
              <button className="primary" onClick={saveToList} disabled={!newListName.trim()}>Save</button>
              <button className="secondary" onClick={() => setShowSaveList(false)}>Cancel</button>
            </div>
          </div>
        )}

        {showBulkStatus && (
          <div className="card" style={{ marginBottom: 12, background: 'var(--soft)' }}>
            <h3 style={{ margin: '0 0 8px 0' }}>Bulk Update {checked.length} leads</h3>
            <div className="toolbar" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value)} style={{ padding: 8 }}>
                <option value="">Select status...</option>
                {statuses.map(s => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}
              </select>
              <input
                value={bulkNote}
                onChange={e => setBulkNote(e.target.value)}
                placeholder="Note (optional, e.g. 'Emailed batch 1')"
                style={{ padding: 8 }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="primary" onClick={doBulkStatus} disabled={!bulkStatus}>Update {checked.length} leads</button>
                <button className="secondary" onClick={() => setShowBulkStatus(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {checked.length > 0 && (
          <div className="toolbar" style={{ background: 'var(--soft)', padding: 8, borderRadius: 6, marginBottom: 8 }}>
            <strong>{checked.length} selected</strong>
            <button className="secondary" style={{ fontSize: '0.85rem' }} onClick={() => setShowBulkStatus(true)}>Change Status</button>
            <button className="secondary" style={{ fontSize: '0.85rem' }} onClick={() => setShowSaveList(true)}>Save to Batch</button>
            <button className="secondary" style={{ fontSize: '0.85rem' }} onClick={() => exportCSV(true)}>Export Selected</button>
            <button className="secondary" style={{ fontSize: '0.85rem' }} onClick={() => setChecked([])}>Clear</button>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button className="secondary" style={{ fontSize: '0.85rem', padding: '6px 12px' }} onClick={() => exportCSV(false)}>
            Export CSV ({filtered.length})
          </button>
        </div>

        <div style={{ overflow: 'auto', maxHeight: '60vh' }}>
          <table>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={all}
                    onChange={e => setChecked(e.target.checked ? filtered.map(x => x.id) : [])}
                  />
                </th>
                <th>Score</th>
                <th>Company</th>
                <th>Jobs</th>
                <th>Salary</th>
                <th>Size</th>
                <th>Contact</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} style={{ cursor: 'pointer' }}>
                  <td>
                    <input
                      type="checkbox"
                      checked={checked.includes(c.id)}
                      onChange={e => setChecked(x => e.target.checked ? [...x, c.id] : x.filter(id => id !== c.id))}
                    />
                  </td>
                  <td>
                    <Link href={`/leads/${c.id}`}>
                      <span className={`score ${c.opportunityScore >= 70 ? 'high' : c.opportunityScore >= 45 ? 'mid' : 'low'}`}>
                        {c.opportunityScore}
                      </span>
                    </Link>
                  </td>
                  <td>
                    <Link href={`/leads/${c.id}`}>
                      <strong>{c.name}</strong>
                      <div className="muted">{c.location}</div>
                    </Link>
                  </td>
                  <td>{c.activeJobCount} active / {c.totalJobCount} found</td>
                  <td>{c.estimatedSalarySpend ? `${c.country === 'NZ' ? 'NZ$' : '£'}${c.estimatedSalarySpend.toLocaleString()}` : '—'}</td>
                  <td>{c.employeeRange || 'Unknown'}</td>
                  <td>
                    {c.email && <a href={`mailto:${c.email}`} onClick={e => e.stopPropagation()} style={{ marginRight: 8 }}>📧</a>}
                    {c.phone && <a href={`tel:${c.phone}`} onClick={e => e.stopPropagation()} style={{ marginRight: 8 }}>📞</a>}
                    {c.website && <a href={c.website} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>🌐</a>}
                    {!c.email && !c.phone && !c.website && '—'}
                  </td>
                  <td>
                    <select
                      value={c.status}
                      onChange={e => { e.stopPropagation(); update(c.id, { status: e.target.value }); }}
                      onClick={e => e.stopPropagation()}
                      style={{ padding: '6px 8px', fontSize: '0.85rem' }}
                    >
                      {statuses.map(s => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && <div className="empty">No leads match these filters. Run a scan or adjust your filters.</div>}
        </div>

        {notice && <div className="muted" style={{ marginTop: 8, textAlign: 'center' }}>{notice}</div>}
      </div>
    </>
  );
}
