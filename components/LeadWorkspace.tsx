'use client';

import { useEffect, useMemo, useState } from 'react';
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
  createdAt: string;
  archivedAt?: string;
  notes?: string;
  _count: { companies: number };
};

type FilterPreset = {
  id: number;
  name: string;
  config: any;
};

const statuses = ['NEW', 'REVIEWING', 'CONTACTED', 'FOLLOW_UP', 'MEETING', 'ASSESSMENT', 'WON', 'PASSED', 'NO_RESPONSE', 'NOT_INTERESTED'];

export default function LeadWorkspace() {
  const [items, setItems] = useState<Company[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [presets, setPresets] = useState<FilterPreset[]>([]);
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

  useEffect(() => { load(); }, [q, min, contact, multi, statusFilter, batchFilter]);
  useEffect(() => { loadBatches(); loadPresets(); }, []);

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

  return (
    <>
      <div className="page-header">
        <h1>Leads</h1>
        <p>Search, filter and manage your lead pipeline.</p>
      </div>

      {/* Filter Presets */}
      {presets.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-head">
            <h2>Filter Presets</h2>
          </div>
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

      {/* Batches */}
      {batches.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-head">
            <h2>Batches</h2>
            <Link href="/scan" className="button secondary" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>New Scan</Link>
          </div>
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

        {/* Save preset dialog */}
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

        {/* Save list dialog */}
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

        {/* Bulk status dialog */}
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

        {/* Action bar for checked items */}
        {checked.length > 0 && (
          <div className="toolbar" style={{ background: 'var(--soft)', padding: 8, borderRadius: 6, marginBottom: 8 }}>
            <strong>{checked.length} selected</strong>
            <button className="secondary" style={{ fontSize: '0.85rem' }} onClick={() => setShowBulkStatus(true)}>Change Status</button>
            <button className="secondary" style={{ fontSize: '0.85rem' }} onClick={() => setShowSaveList(true)}>Save to Batch</button>
            <button className="secondary" style={{ fontSize: '0.85rem' }} onClick={() => exportCSV(true)}>Export Selected</button>
            <button className="secondary" style={{ fontSize: '0.85rem' }} onClick={() => setChecked([])}>Clear</button>
          </div>
        )}

        {/* Export all */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button className="secondary" style={{ fontSize: '0.85rem', padding: '6px 12px' }} onClick={() => exportCSV(false)}>
            Export CSV ({filtered.length})
          </button>
        </div>

        {/* Table */}
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
          {!filtered.length && <div className="empty">No leads match these filters.</div>}
        </div>

        {notice && <div className="muted" style={{ marginTop: 8, textAlign: 'center' }}>{notice}</div>}
      </div>
    </>
  );
}
