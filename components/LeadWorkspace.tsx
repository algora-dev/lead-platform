'use client';

import { useEffect, useMemo, useState } from 'react';

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

const statuses = ['NEW', 'REVIEWING', 'CONTACTED', 'FOLLOW_UP', 'MEETING', 'ASSESSMENT', 'WON', 'PASSED', 'NO_RESPONSE', 'NOT_INTERESTED'];

export default function LeadWorkspace() {
  const [items, setItems] = useState<Company[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selected, setSelected] = useState<Company | null>(null);
  const [q, setQ] = useState('');
  const [min, setMin] = useState(0);
  const [contact, setContact] = useState(false);
  const [multi, setMulti] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [checked, setChecked] = useState<number[]>([]);
  const [notice, setNotice] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newListName, setNewListName] = useState('');

  const load = async () => {
    const p = new URLSearchParams({ q, minScore: String(min) });
    if (contact) p.set('contactable', '1');
    if (multi) p.set('multi', '1');
    setItems(await fetch('/api/companies?' + p).then(r => r.json()));
  };

  const loadBatches = () => fetch('/api/batches').then(r => r.json()).then(setBatches);

  useEffect(() => { load(); loadBatches(); }, [q, min, contact, multi]);

  const filtered = useMemo(() => {
    if (!statusFilter) return items;
    return items.filter(c => c.status === statusFilter);
  }, [items, statusFilter]);

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
    setShowSaveDialog(false);
    loadBatches();
  };

  const all = useMemo(() => filtered.length > 0 && filtered.every(x => checked.includes(x.id)), [filtered, checked]);

  return (
    <>
      <div className="page-header">
        <h1>Leads</h1>
        <p>Search, filter and manage your lead pipeline.</p>
      </div>

      {/* Saved lists */}
      {batches.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <h2>Saved Lists</h2>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {batches.map(b => (
              <span
                key={b.id}
                className="pill neutral"
                style={{ padding: '6px 12px', cursor: 'default' }}
              >
                {b.name} ({b._count.companies})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card">
        <div className="toolbar">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search company, location or task"
            style={{ minWidth: 260 }}
          />
          <select value={min} onChange={e => setMin(Number(e.target.value))}>
            <option value="0">All scores</option>
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
          {checked.length > 0 && (
            <button className="secondary" onClick={() => setShowSaveDialog(true)}>
              Save list ({checked.length})
            </button>
          )}
          {notice && <span className="muted">{notice}</span>}
        </div>

        {/* Save dialog */}
        {showSaveDialog && (
          <div className="card" style={{ marginBottom: 12, background: 'var(--soft)' }}>
            <div className="toolbar">
              <input
                value={newListName}
                onChange={e => setNewListName(e.target.value)}
                placeholder="List name (e.g. UK Outreach July)"
                style={{ flex: 1, minWidth: 200 }}
                autoFocus
              />
              <button className="primary" onClick={saveToList} disabled={!newListName.trim()}>Save</button>
              <button className="secondary" onClick={() => setShowSaveDialog(false)}>Cancel</button>
            </div>
          </div>
        )}

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
                  <td onClick={() => setSelected(c)}>
                    <span className={`score ${c.opportunityScore >= 70 ? 'high' : c.opportunityScore >= 45 ? 'mid' : 'low'}`}>
                      {c.opportunityScore}
                    </span>
                  </td>
                  <td onClick={() => setSelected(c)}>
                    <strong>{c.name}</strong>
                    <div className="muted">{c.location}</div>
                  </td>
                  <td>{c.activeJobCount} active / {c.totalJobCount} found</td>
                  <td>{c.estimatedSalarySpend ? `${c.country === 'NZ' ? 'NZ$' : '£'}${c.estimatedSalarySpend.toLocaleString()}` : '—'}</td>
                  <td>{c.employeeRange || 'Unknown'}</td>
                  <td>{c.email || c.phone || '—'}</td>
                  <td>
                    <select
                      value={c.status}
                      onChange={e => update(c.id, { status: e.target.value })}
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
      </div>

      {/* Detail drawer */}
      {selected && (
        <div className="drawer">
          <div className="drawer-head">
            <div>
              <span className={`score ${selected.opportunityScore >= 70 ? 'high' : selected.opportunityScore >= 45 ? 'mid' : 'low'}`}>
                {selected.opportunityScore}
              </span>
              <h2>{selected.name}</h2>
              <div className="muted">{selected.country} · {selected.activeJobCount} active jobs</div>
            </div>
            <button className="secondary" onClick={() => setSelected(null)}>Close</button>
          </div>

          <hr />

          <div className="grid2">
            <Field label="Email" value={selected.email} onChange={v => update(selected.id, { email: v })} />
            <Field label="Phone" value={selected.phone} onChange={v => update(selected.id, { phone: v })} />
            <Field label="Website" value={selected.website} onChange={v => update(selected.id, { website: v })} />
            <Field label="Employee range" value={selected.employeeRange} onChange={v => update(selected.id, { employeeRange: v })} />
          </div>

          <Text label="Why this company scored" value={selected.scoreReason} />
          <Text label="Recurring task evidence" value={selected.recurringTasks} />
          <Text label="Opportunity summary" value={selected.opportunitySummary} />
          <Text label="Notes" value={selected.notes} editable onChange={v => update(selected.id, { notes: v })} />

          <h3 style={{ marginTop: 24, marginBottom: 12 }}>Job evidence</h3>
          {selected.jobs.map(j => (
            <div className="job-card" key={j.id}>
              <strong>{j.title}</strong>
              <div className="muted">{j.location} · {j.salaryText || 'Salary not shown'} · signal {j.advertScore}</div>
              <p>{j.taskSignals || 'No task signals extracted'}</p>
              <a className="button secondary" target="_blank" href={j.sourceUrl} style={{ marginTop: 8, fontSize: '0.8rem', padding: '6px 12px' }}>
                Open advert →
              </a>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Field({ label, value, onChange }: { label: string; value?: string; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      <input value={value || ''} onChange={e => onChange(e.target.value)} />
    </label>
  );
}

function Text({ label, value, editable, onChange }: { label: string; value?: string; editable?: boolean; onChange?: (v: string) => void }) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      {editable ? (
        <textarea value={value || ''} onChange={e => onChange?.(e.target.value)} />
      ) : (
        <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem', color: '#424657' }}>{value || '—'}</div>
      )}
    </div>
  );
}
