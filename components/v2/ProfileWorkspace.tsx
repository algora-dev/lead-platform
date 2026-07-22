'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

interface ProfileVersion {
  id: number;
  versionNumber: number;
  createdAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  rawInput: any;
  [key: string]: any;
}

interface Profile {
  id: number;
  name: string;
  description: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  versions: ProfileVersion[];
  _count?: { versions: number };
}

interface ProfileFieldDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'taglist';
}

const PRODUCT_FIELDS: ProfileFieldDef[] = [
  { key: 'problemsSolved', label: 'Problems Solved', type: 'taglist' },
  { key: 'outcomes', label: 'Ideal Outcomes', type: 'taglist' },
  { key: 'industries', label: 'Industries', type: 'taglist' },
  { key: 'keywords', label: 'Keywords', type: 'taglist' },
  { key: 'technologies', label: 'Technologies', type: 'taglist' },
  { key: 'companySizeMin', label: 'Min Company Size', type: 'number' },
  { key: 'companySizeMax', label: 'Max Company Size', type: 'number' },
  { key: 'pricingLevel', label: 'Pricing Level', type: 'text' },
  { key: 'exclusions', label: 'Exclusions', type: 'taglist' },
];

const CUSTOMER_FIELDS: ProfileFieldDef[] = [
  { key: 'industries', label: 'Industries', type: 'taglist' },
  { key: 'locations', label: 'Locations', type: 'taglist' },
  { key: 'employeeCountMin', label: 'Min Employees', type: 'number' },
  { key: 'employeeCountMax', label: 'Max Employees', type: 'number' },
  { key: 'revenueMin', label: 'Min Revenue', type: 'number' },
  { key: 'revenueMax', label: 'Max Revenue', type: 'number' },
  { key: 'technologies', label: 'Technologies', type: 'taglist' },
  { key: 'operationalCharacteristics', label: 'Operational Characteristics', type: 'taglist' },
  { key: 'buyingSignals', label: 'Buying Signals', type: 'taglist' },
  { key: 'hiringSignals', label: 'Hiring Signals', type: 'taglist' },
  { key: 'decisionMakers', label: 'Decision Makers', type: 'taglist' },
  { key: 'exclusions', label: 'Exclusions', type: 'taglist' },
];

export default function ProfileWorkspace({ type }: { type: 'product' | 'customer' }) {
  const apiBase = type === 'product' ? '/api/v2/product-profiles' : '/api/v2/customer-profiles';
  const fields = type === 'product' ? PRODUCT_FIELDS : CUSTOMER_FIELDS;
  const title = type === 'product' ? 'Product Profiles' : 'Lead Profiles';
  const subtitle = type === 'product'
    ? 'Define what you sell — problems solved, outcomes, keywords, technologies.'
    : 'Define your ideal lead — industries, locations, signals, decision makers.';

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showVersion, setShowVersion] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);
  const [notice, setNotice] = useState('');
  const [editVersion, setEditVersion] = useState<Record<string, any>>({});

  const load = useCallback(() => {
    fetch(apiBase).then(r => r.json()).then(d => {
      if (Array.isArray(d)) setProfiles(d);
    });
  }, [apiBase]);

  useEffect(() => { load(); }, [load]);

  const openProfile = async (id: number) => {
    const d = await fetch(`${apiBase}/${id}`).then(r => r.json());
    setSelected(d);
    setEditVersion({});
    setAiResult(null);
    setAiInput('');
  };

  const createProfile = async (name: string, description: string, rawInput: string) => {
    const r = await fetch(apiBase, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        description: description || null,
        rawInput: rawInput ? { text: rawInput, name, description } : { name, description },
      }),
    });
    const d = await r.json();
    if (r.ok) {
      setNotice(`Created: ${name}`);
      setShowCreate(false);
      load();
    } else {
      setNotice(d.error || 'Failed to create');
    }
  };

  const runAi = async () => {
    if (!aiInput.trim()) return;
    setAiLoading(true);
    try {
      const r = await fetch('/api/v2/ai/structure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawInput: aiInput, type }),
      });
      const d = await r.json();
      if (r.ok && d.structured) {
        setAiResult(d);
        setEditVersion(d.structured);
        setNotice('AI structured the input — review and save as a new version');
      } else {
        setNotice(d.error || 'AI structuring failed');
      }
    } catch (e: any) {
      setNotice(`Error: ${e.message}`);
    }
    setAiLoading(false);
  };

  const saveVersion = async () => {
    if (!selected) return;
    const latest = selected.versions[0];
    const body: any = { ...editVersion };

    // Merge with latest version data for fields not edited
    for (const f of fields) {
      if (body[f.key] === undefined) {
        body[f.key] = latest?.[f.key] || (f.type === 'taglist' ? [] : null);
      }
    }

    if (aiResult) {
      body.aiModel = aiResult.aiModel;
      body.aiPromptVersion = aiResult.aiPromptVersion;
    }
    body.rawInput = latest?.rawInput || { name: selected.name, description: selected.description || '' };

    const r = await fetch(`${apiBase}/${selected.id}/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      setNotice(`Saved version ${selected.versions.length + 1}`);
      setShowVersion(false);
      setAiResult(null);
      setEditVersion({});
      openProfile(selected.id);
    } else {
      const d = await r.json();
      setNotice(d.error || 'Failed to save version');
    }
  };

  const archiveProfile = async (id: number) => {
    if (!confirm('Archive this profile? It will be hidden from lists but versions are preserved.')) return;
    await fetch(`${apiBase}/${id}`, { method: 'DELETE' });
    setSelected(null);
    setNotice('Profile archived');
    load();
  };

  // --- Tag input helper ---
  const TagInput = ({ field }: { field: ProfileFieldDef }) => {
    const vals: string[] = editVersion[field.key] || [];
    const [input, setInput] = useState('');
    return (
      <div>
        <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>{field.label}</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4, minHeight: 32, padding: vals.length ? 4 : 0, border: vals.length ? '1px solid #e5e7eb' : 'none', borderRadius: 4 }}>
          {vals.map((v, i) => (
            <span key={i} style={{ background: '#f3f4f6', padding: '2px 8px', borderRadius: 12, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
              {v}
              <button onClick={() => setEditVersion(p => ({ ...p, [field.key]: vals.filter((_, j) => j !== i) }))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#9ca3af' }}>×</button>
            </span>
          ))}
        </div>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && input.trim()) {
              e.preventDefault();
              setEditVersion(p => ({ ...p, [field.key]: [...vals, input.trim()] }));
              setInput('');
            }
          }}
          placeholder="Type and press Enter"
          style={{ width: '100%', padding: '6px 10px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 13 }}
        />
      </div>
    );
  };

  // --- List View ---
  if (!selected) {
    return (
      <>
        <div className="page-header">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <div style={{ marginBottom: 16 }}>
          <button className="primary" style={{ fontSize: '0.85rem', padding: '8px 14px' }} onClick={() => setShowCreate(true)}>+ New Profile</button>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>{title}</h2>
          </div>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Versions</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map(p => (
                <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => openProfile(p.id)}>
                  <td>
                    <strong>{p.name}</strong>
                    {p.description && <div className="muted" style={{ fontSize: 12 }}>{p.description}</div>}
                  </td>
                  <td>{p._count?.versions || p.versions?.length || 0}</td>
                  <td>{new Date(p.updatedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!profiles.length && (
            <div className="empty">
              <p>No {type} profiles yet.</p>
              <button className="primary" onClick={() => setShowCreate(true)}>Create your first profile</button>
            </div>
          )}
        </div>
        {notice && <div className="muted" style={{ marginTop: 8, textAlign: 'center' }}>{notice}</div>}

        {showCreate && <CreateModal title={`New ${type === 'product' ? 'Product' : 'Lead'} Profile`} type={type} onCreate={createProfile} onClose={() => setShowCreate(false)} />}
      </>
    );
  }

  // --- Detail View ---
  const latest = selected.versions[0];
  return (
    <>
      <div className="page-header">
        <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, marginBottom: 8 }}>← Back to {title}</button>
        <h1>{selected.name}</h1>
        {selected.description && <p className="muted">{selected.description}</p>}
      </div>

      <div className="card">
        <div className="card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Current Version (v{latest?.versionNumber || 0})</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="primary" style={{ fontSize: '0.85rem', padding: '8px 14px' }} onClick={() => { setShowVersion(true); setEditVersion({}); setAiInput(''); setAiResult(null); }}>+ New Version</button>
            <button className="secondary" style={{ fontSize: '0.85rem', color: '#dc2626' }} onClick={() => archiveProfile(selected.id)}>Archive</button>
          </div>
        </div>

        {latest && (
          <div style={{ display: 'grid', gap: 12, padding: 16 }}>
            {/* Show raw input text (detailed description) if present */}
            {latest.rawInput?.text && (
              <div style={{ padding: 12, background: 'var(--soft)', borderRadius: 8, border: '1px solid var(--line)' }}>
                <strong style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Detailed Description</strong>
                <p style={{ margin: 0, fontSize: '0.9rem', color: '#424657', whiteSpace: 'pre-wrap' }}>{latest.rawInput.text}</p>
              </div>
            )}
            {fields.map(f => {
              const val = latest[f.key];
              if (f.type === 'taglist') {
                return (
                  <div key={f.key}>
                    <strong style={{ fontSize: 13 }}>{f.label}:</strong>{' '}
                    {Array.isArray(val) && val.length ? val.join(', ') : <span className="muted">—</span>}
                  </div>
                );
              }
              return (
                <div key={f.key}>
                  <strong style={{ fontSize: 13 }}>{f.label}:</strong>{' '}
                  {val ?? <span className="muted">—</span>}
                </div>
              );
            })}
            {latest.notes && <div><strong>Notes:</strong> {latest.notes}</div>}
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Created {new Date(latest.createdAt).toLocaleString()}
              {latest.aiModel && ` · AI: ${latest.aiModel}`}
              {latest.approvedBy && ` · Approved by ${latest.approvedBy}`}
            </div>
          </div>
        )}
      </div>

      {/* Version History */}
      {selected.versions.length > 1 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-head"><h2>Version History</h2></div>
          <table>
            <thead>
              <tr>
                <th>Version</th>
                <th>Created</th>
                <th>AI</th>
                <th>Approved</th>
              </tr>
            </thead>
            <tbody>
              {selected.versions.map(v => (
                <tr key={v.id}>
                  <td>v{v.versionNumber}</td>
                  <td>{new Date(v.createdAt).toLocaleString()}</td>
                  <td>{v.aiModel || '—'}</td>
                  <td>{v.approvedBy || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {notice && <div className="muted" style={{ marginTop: 8, textAlign: 'center' }}>{notice}</div>}

      {/* New Version Modal */}
      {showVersion && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, overflow: 'auto', padding: 40 }}>
          <div className="card" style={{ width: '100%', maxWidth: 640, margin: 16 }}>
            <div className="card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>New Version for {selected.name}</h2>
              <button onClick={() => !aiLoading && setShowVersion(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted)' }}>×</button>
            </div>

            {/* AI Structuring */}
            <div style={{ padding: 16, borderBottom: '1px solid #e5e7eb' }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500 }}>AI Structuring (optional)</label>
              <p className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Describe your {type === 'product' ? 'product/service' : 'ideal lead'} in plain text. AI will extract structured fields you can review and edit before saving.</p>
              <textarea
                value={aiInput}
                onChange={e => setAiInput(e.target.value)}
                placeholder={type === 'product'
                  ? 'We sell a construction quoting SaaS that helps builders create accurate quotes quickly. It solves slow manual quoting, inconsistent pricing, and lost opportunities...'
                  : 'We target construction companies with 10-200 employees in the UK and NZ. They use spreadsheets or paper for quoting. Key signals: hiring for estimators, growing teams, multiple ongoing projects...'}
                rows={4}
                style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 13, marginBottom: 8 }}
              />
              <button className="secondary" disabled={aiLoading || !aiInput.trim()} onClick={runAi} style={{ fontSize: '0.85rem' }}>
                {aiLoading ? 'AI thinking…' : 'Structure with AI'}
              </button>
            </div>

            {/* Editable Fields */}
            <div style={{ padding: 16, display: 'grid', gap: 12, maxHeight: '50vh', overflow: 'auto' }}>
              {fields.map(f => {
                if (f.type === 'taglist') return <TagInput key={f.key} field={f} />;
                return (
                  <div key={f.key}>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>{f.label}</label>
                    <input
                      value={editVersion[f.key] ?? ''}
                      onChange={e => setEditVersion(p => ({ ...p, [f.key]: e.target.value }))}
                      style={{ width: '100%', padding: '6px 10px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 13 }}
                    />
                  </div>
                );
              })}
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Notes</label>
                <textarea
                  value={editVersion.notes ?? ''}
                  onChange={e => setEditVersion(p => ({ ...p, notes: e.target.value }))}
                  rows={2}
                  style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 13 }}
                />
              </div>
            </div>

            <div style={{ padding: 16, display: 'flex', gap: 8 }}>
              <button className="primary" onClick={saveVersion}>Save Version</button>
              <button className="secondary" onClick={() => !aiLoading && setShowVersion(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function CreateModal({ title, type, onCreate, onClose }: { title: string; type: 'product' | 'customer'; onCreate: (name: string, desc: string, rawInput: string) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [rawInput, setRawInput] = useState('');

  const isProduct = type === 'product';
  const descLabel = isProduct ? 'Description of product' : 'Description of lead';
  const detailLabel = isProduct ? 'Detailed Description' : 'Detailed Description';
  const detailPlaceholder = isProduct
    ? 'Describe what the product or service is in a sentence, include everything that the product is good at, what problems it solves'
    : 'Describe your ideal lead/customer, what they do, the problems they encounter, their pain points, tasks they do, etc';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card" style={{ width: '100%', maxWidth: 480, margin: 16 }}>
        <div className="card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted)' }}>×</button>
        </div>
        <div style={{ display: 'grid', gap: 16, padding: 16 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500 }}>Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. QuoteCore+ Construction" autoFocus style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500 }}>{descLabel}</label>
            <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Short summary" style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500 }}>{detailLabel}</label>
            <textarea value={rawInput} onChange={e => setRawInput(e.target.value)} rows={4} placeholder={detailPlaceholder} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="primary" disabled={!name.trim()} onClick={() => onCreate(name.trim(), desc.trim(), rawInput.trim())}>Create</button>
            <button className="secondary" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
