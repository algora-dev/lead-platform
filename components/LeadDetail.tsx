'use client';

import { useState } from 'react';
import Link from 'next/link';

type Job = {
  id: number;
  title: string;
  location?: string;
  salaryText?: string;
  sourceUrl: string;
  taskSignals?: string;
  advertScore: number;
  isActive: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
};

type ContactLog = {
  id: number;
  createdAt: string;
  type: string;
  content: string;
  authorName?: string;
  oldStatus?: string | null;
  newStatus?: string | null;
};

type Batch = { id: number; name: string };

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
  industry?: string;
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
  jobs: Job[];
  contactLogs: ContactLog[];
  batches: Batch[];
};

const statuses = ['NEW', 'REVIEWING', 'CONTACTED', 'FOLLOW_UP', 'MEETING', 'ASSESSMENT', 'WON', 'PASSED', 'NO_RESPONSE', 'NOT_INTERESTED'];

export default function LeadDetail({ company: initial }: { company: Company }) {
  const [c, setC] = useState<Company>(initial);
  const [logs, setLogs] = useState<ContactLog[]>(initial.contactLogs);
  const [noteText, setNoteText] = useState('');
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [saved, setSaved] = useState(false);

  const update = async (patch: Partial<Company>) => {
    const d = await fetch('/api/companies/' + c.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).then(r => r.json());
    setC(d);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const addNote = async () => {
    if (!noteText.trim()) return;
    const log = await fetch('/api/companies/' + c.id + '/contact-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: noteText.trim(), type: 'note' }),
    }).then(r => r.json());
    setLogs([log, ...logs]);
    setNoteText('');
  };

  const changeStatus = async (newStatus: string) => {
    const oldStatus = c.status;
    const d = await fetch('/api/companies/' + c.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    }).then(r => r.json());
    setC(d);

    if (newStatus !== oldStatus) {
      // Prompt for contact note on status change
      const note = window.prompt(`Status changed to ${newStatus.replaceAll('_', ' ')}. Add a note? (optional)`);
      if (note?.trim()) {
        const log = await fetch('/api/companies/' + c.id + '/contact-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: note.trim(), type: 'status_change', newStatus }),
        }).then(r => r.json());
        setLogs([log, ...logs]);
      }
    }
  };

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/leads" className="button secondary" style={{ fontSize: '0.85rem', padding: '6px 12px' }}>← Back</Link>
          <span className={`score ${c.opportunityScore >= 70 ? 'high' : c.opportunityScore >= 45 ? 'mid' : 'low'}`}>
            {c.opportunityScore}
          </span>
          <div>
            <h1 style={{ margin: 0 }}>{c.name}</h1>
            <p className="muted" style={{ margin: 0 }}>{c.country} · {c.location || 'Location unknown'} · {c.industry || 'Industry unknown'}</p>
          </div>
        </div>
        {saved && <span className="pill good" style={{ marginLeft: 'auto' }}>Saved</span>}
      </div>

      {/* Contact Actions Bar */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {c.email && (
            <>
              <a href={`mailto:${c.email}`} className="button primary" style={{ fontSize: '0.85rem' }}>📧 Email</a>
              <button className="secondary" style={{ fontSize: '0.85rem', padding: '8px 14px' }} onClick={() => setShowEmailModal(true)}>
                📧 Use Template
              </button>
            </>
          )}
          {c.phone && (
            <a href={`tel:${c.phone}`} className="button secondary" style={{ fontSize: '0.85rem' }}>📞 Call</a>
          )}
          {c.website && (
            <a href={c.website} target="_blank" rel="noopener noreferrer" className="button secondary" style={{ fontSize: '0.85rem' }}>🌐 Website</a>
          )}
          {!c.email && !c.phone && <span className="muted">No contact details — add them below.</span>}
        </div>
      </div>

      {/* Email Template Modal Stub */}
      {showEmailModal && (
        <div className="card" style={{ marginBottom: 16, background: 'var(--soft)', border: '1px dashed var(--accent-line)' }}>
          <div className="card-head">
            <h3>Email Templates</h3>
            <button className="secondary" style={{ fontSize: '0.8rem', padding: '4px 10px' }} onClick={() => setShowEmailModal(false)}>Close</button>
          </div>
          <p className="muted" style={{ fontSize: '0.9rem' }}>
            Template selection will be available here. This opens your email client with a pre-filled template.
            For now, clicking the Email button above opens a standard mailto link.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <a href={`mailto:${c.email}?subject=Following up on opportunities&body=Hi ${c.name} team,%0D%0A%0D%0AI'd like to discuss...`} className="button primary" style={{ fontSize: '0.85rem' }}>
              Open with default template →
            </a>
          </div>
        </div>
      )}

      <div className="widget-grid">
        {/* Left: Editable details */}
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-head">
              <h2>Company Details</h2>
            </div>
            <div className="grid2">
              <Field label="Company Name" value={c.name} onChange={v => update({ name: v })} />
              <Field label="Status">
                <select value={c.status} onChange={e => changeStatus(e.target.value)} style={{ width: '100%', padding: '8px' }}>
                  {statuses.map(s => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}
                </select>
              </Field>
              <Field label="Email" value={c.email} onChange={v => update({ email: v })} />
              <Field label="Phone" value={c.phone} onChange={v => update({ phone: v })} />
              <Field label="Website" value={c.website} onChange={v => update({ website: v })} />
              <Field label="Location" value={c.location} onChange={v => update({ location: v })} />
              <Field label="Industry" value={c.industry} onChange={v => update({ industry: v })} />
              <Field label="Employee Range" value={c.employeeRange} onChange={v => update({ employeeRange: v })} />
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-head">
              <h2>Notes</h2>
            </div>
            <textarea
              value={c.notes || ''}
              onChange={e => setC({ ...c, notes: e.target.value })}
              onBlur={e => update({ notes: e.target.value })}
              placeholder="Add internal notes about this lead..."
              style={{ width: '100%', minHeight: 80, padding: 12 }}
            />
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Score Breakdown</h2>
            </div>
            <Text label="Why this company scored" value={c.scoreReason} />
            <Text label="Recurring task evidence" value={c.recurringTasks} />
            <Text label="Opportunity summary" value={c.opportunitySummary} />
          </div>
        </div>

        {/* Right: Contact log + jobs */}
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-head">
              <h2>Contact History</h2>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="Add a note or log a call..."
                style={{ flex: 1, padding: 8 }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addNote(); } }}
              />
              <button className="primary" onClick={addNote} disabled={!noteText.trim()}>Add</button>
            </div>
            {logs.length === 0 && <div className="muted" style={{ padding: '12px 0' }}>No contact activity yet.</div>}
            <ul className="widget-list">
              {logs.map(log => (
                <li key={log.id}>
                  <span className={`pill ${log.type === 'status_change' ? 'warn' : 'neutral'}`} style={{ minWidth: 90, textAlign: 'center' }}>
                    {log.type === 'status_change' ? `${log.oldStatus?.replaceAll('_', ' ')} → ${log.newStatus?.replaceAll('_', ' ')}` : log.type}
                  </span>
                  <div>
                    <div>{log.content}</div>
                    <div className="muted" style={{ fontSize: '0.8rem' }}>
                      {new Date(log.createdAt).toLocaleString('en-GB')} · {log.authorName || 'Unknown'}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {c.batches.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-head">
                <h2>In Batches</h2>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {c.batches.map(b => (
                  <span key={b.id} className="pill neutral" style={{ padding: '6px 12px' }}>{b.name}</span>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-head">
              <h2>Job Evidence ({c.jobs.length})</h2>
            </div>
            {c.jobs.map(j => (
              <div className="job-card" key={j.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <strong>{j.title}</strong>
                  {!j.isActive && <span className="pill neutral" style={{ fontSize: '0.7rem' }}>inactive</span>}
                </div>
                <div className="muted">{j.location} · {j.salaryText || 'Salary not shown'} · signal {j.advertScore}</div>
                <p>{j.taskSignals || 'No task signals extracted'}</p>
                <a className="button secondary" target="_blank" href={j.sourceUrl} style={{ marginTop: 8, fontSize: '0.8rem', padding: '6px 12px' }}>
                  Open advert →
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function Field({ label, value, onChange, children }: { label: string; value?: string; onChange?: (v: string) => void; children?: React.ReactNode }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      {children || (
        <input value={value || ''} onChange={e => onChange?.(e.target.value)} />
      )}
    </label>
  );
}

function Text({ label, value }: { label: string; value?: string }) {
  return (
    <div className="field" style={{ marginBottom: 12 }}>
      <span className="label">{label}</span>
      <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem', color: '#424657' }}>{value || '—'}</div>
    </div>
  );
}
