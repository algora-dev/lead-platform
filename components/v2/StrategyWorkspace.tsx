'use client';

import { useEffect, useState, useCallback } from 'react';

interface Profile {
  id: number;
  name: string;
  description: string | null;
  versions: { id: number; versionNumber: number; createdAt: string }[];
}

interface Strategy {
  id: number;
  name?: string;
  createdAt: string;
  approved: boolean;
  approvedBy: string | null;
  country: string;
  stateProvince: string | null;
  county: string | null;
  city: string | null;
  radiusKm: number | null;
  queries: any[];
  keywords: string[];
  inclusionFilters: string[];
  exclusionFilters: string[];
  evidencePriorities: string[];
  enrichmentPriorities: string[];
  scoringConfig: any;
  scans?: { id: number; name: string; status: string; createdAt: string }[];
}

const COUNTRIES = [
  'United Kingdom', 'New Zealand', 'Australia', 'United States', 'Canada', 'Ireland',
  'Germany', 'France', 'Netherlands', 'Spain', 'Italy', 'UAE', 'Singapore',
];

export default function StrategyWorkspace() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [selected, setSelected] = useState<Strategy | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    fetch('/api/v2/strategies').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setStrategies(d);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const openStrategy = async (id: number) => {
    const d = await fetch(`/api/v2/strategies/${id}`).then(r => r.json());
    setSelected(d);
  };

  const approve = async (id: number, approver: string) => {
    const r = await fetch(`/api/v2/strategies/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved: true, approvedBy: approver }),
    });
    if (r.ok) {
      setNotice('Strategy approved — ready for scans');
      openStrategy(id);
    }
  };

  // --- List View ---
  if (!selected) {
    return (
      <>
        <div className="page-header">
          <h1>Discovery Strategies</h1>
          <p>Compile product and customer profiles into a searchable discovery strategy.</p>
        </div>
        <div className="card">
          <div className="card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>Strategies</h2>
            <button className="primary" style={{ fontSize: '0.85rem', padding: '8px 14px' }} onClick={() => setShowCreate(true)}>+ New Strategy</button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Country</th>
                <th>Queries</th>
                <th>Approved</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {strategies.map(s => (
                <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => openStrategy(s.id)}>
                  <td><strong>{s.name || `Strategy #${s.id}`}</strong></td>
                  <td>{s.country}{s.stateProvince ? `, ${s.stateProvince}` : ''}</td>
                  <td>{Array.isArray(s.queries) ? s.queries.length : 0}</td>
                  <td>
                    {s.approved
                      ? <span className="pill good">Approved</span>
                      : <span className="pill neutral">Draft</span>}
                  </td>
                  <td>{new Date(s.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!strategies.length && (
            <div className="empty">
              <p>No strategies yet.</p>
              <button className="primary" onClick={() => setShowCreate(true)}>Create your first strategy</button>
            </div>
          )}
        </div>
        {notice && <div className="muted" style={{ marginTop: 8, textAlign: 'center' }}>{notice}</div>}
        {showCreate && <CreateWizard onCreated={(id) => { setShowCreate(false); openStrategy(id); }} onClose={() => setShowCreate(false)} />}
      </>
    );
  }

  // --- Detail View ---
  return (
    <>
      <div className="page-header">
        <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, marginBottom: 8 }}>← Back to Strategies</button>
        <h1>{selected.name || `Strategy #${selected.id}`}</h1>
        <p className="muted">
          {selected.country}{selected.stateProvince ? `, ${selected.stateProvince}` : ''}{selected.county ? `, ${selected.county}` : ''}{selected.city ? `, ${selected.city}` : ''}
          {selected.radiusKm ? ` (within ${selected.radiusKm}km)` : ''}
        </p>
      </div>

      <div className="card">
        <div className="card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Search Queries ({Array.isArray(selected.queries) ? selected.queries.length : 0})</h2>
          {!selected.approved && (
            <button className="primary" style={{ fontSize: '0.85rem' }} onClick={() => approve(selected.id, 'Shaun')}>Approve Strategy</button>
          )}
        </div>
        <table>
          <thead>
            <tr>
              <th>Query</th>
              <th>Type</th>
              <th>Rationale</th>
            </tr>
          </thead>
          <tbody>
            {Array.isArray(selected.queries) && selected.queries.map((q: any, i: number) => (
              <tr key={i}>
                <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{q.query}</td>
                <td><span className="pill neutral">{q.type}</span></td>
                <td style={{ fontSize: 12 }} className="muted">{q.rationale}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
        <div className="card">
          <div className="card-head"><h2>Keywords ({selected.keywords?.length || 0})</h2></div>
          <div style={{ padding: 16, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {selected.keywords?.map((k, i) => (
              <span key={i} style={{ background: '#f3f4f6', padding: '2px 8px', borderRadius: 12, fontSize: 13 }}>{k}</span>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2>Filters</h2></div>
          <div style={{ padding: 16 }}>
            <strong style={{ fontSize: 13 }}>Inclusion:</strong>
            <ul style={{ fontSize: 13, marginLeft: 16 }}>
              {selected.inclusionFilters?.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
            {selected.exclusionFilters?.length > 0 && (
              <>
                <strong style={{ fontSize: 13 }}>Exclusion:</strong>
                <ul style={{ fontSize: 13, marginLeft: 16 }}>
                  {selected.exclusionFilters.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
        <div className="card">
          <div className="card-head"><h2>Evidence Priorities</h2></div>
          <div style={{ padding: 16 }}>
            <ol style={{ fontSize: 13, marginLeft: 16 }}>
              {selected.evidencePriorities?.map((e, i) => <li key={i}>{e}</li>)}
            </ol>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2>Scoring Config</h2></div>
          <pre style={{ padding: 16, fontSize: 11, overflow: 'auto', maxHeight: 300 }}>
            {JSON.stringify(selected.scoringConfig, null, 2)}
          </pre>
        </div>
      </div>

      {selected.scans && selected.scans.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-head"><h2>Scans using this strategy</h2></div>
          <table>
            <thead><tr><th>Name</th><th>Status</th><th>Created</th></tr></thead>
            <tbody>
              {selected.scans.map(s => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td><span className={`pill ${s.status === 'COMPLETED' ? 'good' : 'neutral'}`}>{s.status}</span></td>
                  <td>{new Date(s.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {notice && <div className="muted" style={{ marginTop: 8, textAlign: 'center' }}>{notice}</div>}
    </>
  );
}

function CreateWizard({ onCreated, onClose }: { onCreated: (id: number) => void; onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [products, setProducts] = useState<Profile[]>([]);
  const [customers, setCustomers] = useState<Profile[]>([]);
  const [selectedProductVersions, setSelectedProductVersions] = useState<number[]>([]);
  const [selectedCustomerVersions, setSelectedCustomerVersions] = useState<number[]>([]);
  const [country, setCountry] = useState('United Kingdom');
  const [stateProvince, setStateProvince] = useState('');
  const [county, setCounty] = useState('');
  const [city, setCity] = useState('');
  const [radiusKm, setRadiusKm] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/v2/product-profiles').then(r => r.json()).then(d => { if (Array.isArray(d)) setProducts(d); });
    fetch('/api/v2/customer-profiles').then(r => r.json()).then(d => { if (Array.isArray(d)) setCustomers(d); });
  }, []);

  const toggleProduct = (versionId: number) => {
    setSelectedProductVersions(p => p.includes(versionId) ? p.filter(v => v !== versionId) : [...p, versionId]);
  };
  const toggleCustomer = (versionId: number) => {
    setSelectedCustomerVersions(p => p.includes(versionId) ? p.filter(v => v !== versionId) : [...p, versionId]);
  };

  const create = async () => {
    setCreating(true);
    setError('');
    try {
      const r = await fetch('/api/v2/strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productProfileVersionIds: selectedProductVersions,
          customerProfileVersionIds: selectedCustomerVersions,
          country,
          stateProvince: stateProvince || undefined,
          county: county || undefined,
          city: city || undefined,
          radiusKm: radiusKm ? parseInt(radiusKm) : undefined,
        }),
      });
      const d = await r.json();
      if (r.ok) {
        onCreated(d.id);
      } else {
        setError(d.error || 'Failed to create strategy');
      }
    } catch (e: any) {
      setError(e.message);
    }
    setCreating(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, overflow: 'auto', padding: 40 }} onClick={onClose}>
      <div className="card" style={{ width: '100%', maxWidth: 720, margin: 16 }} onClick={e => e.stopPropagation()}>
        <div className="card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Create Strategy — Step {step} of 3</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted)' }}>×</button>
        </div>

        {step === 1 && (
          <div style={{ padding: 16 }}>
            <h3 style={{ marginBottom: 8 }}>Select Product Profile Versions</h3>
            <p className="muted" style={{ fontSize: 12, marginBottom: 16 }}>Choose which product/service profiles to include in this strategy.</p>
            {products.map(p => (
              <div key={p.id} style={{ marginBottom: 12, padding: 8, border: '1px solid #e5e7eb', borderRadius: 4 }}>
                <strong>{p.name}</strong>
                {p.description && <div className="muted" style={{ fontSize: 12 }}>{p.description}</div>}
                <div style={{ marginTop: 4 }}>
                  {p.versions?.map(v => (
                    <label key={v.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 12, fontSize: 13 }}>
                      <input type="checkbox" checked={selectedProductVersions.includes(v.id)} onChange={() => toggleProduct(v.id)} />
                      v{v.versionNumber} ({new Date(v.createdAt).toLocaleDateString()})
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {!products.length && <div className="muted">No product profiles found. <a href="/v2/product-profiles">Create one first</a>.</div>}
            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <button className="primary" disabled={!selectedProductVersions.length} onClick={() => setStep(2)}>Next →</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ padding: 16 }}>
            <h3 style={{ marginBottom: 8 }}>Select Customer Profile Versions</h3>
            <p className="muted" style={{ fontSize: 12, marginBottom: 16 }}>Choose which ideal customer profiles to include.</p>
            {customers.map(c => (
              <div key={c.id} style={{ marginBottom: 12, padding: 8, border: '1px solid #e5e7eb', borderRadius: 4 }}>
                <strong>{c.name}</strong>
                {c.description && <div className="muted" style={{ fontSize: 12 }}>{c.description}</div>}
                <div style={{ marginTop: 4 }}>
                  {c.versions?.map(v => (
                    <label key={v.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 12, fontSize: 13 }}>
                      <input type="checkbox" checked={selectedCustomerVersions.includes(v.id)} onChange={() => toggleCustomer(v.id)} />
                      v{v.versionNumber} ({new Date(v.createdAt).toLocaleDateString()})
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {!customers.length && <div className="muted">No customer profiles found. <a href="/v2/customer-profiles">Create one first</a>.</div>}
            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <button className="secondary" onClick={() => setStep(1)}>← Back</button>
              <button className="primary" disabled={!selectedCustomerVersions.length} onClick={() => setStep(3)}>Next →</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ padding: 16 }}>
            <h3 style={{ marginBottom: 8 }}>Geography & Review</h3>
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Country</label>
                <select value={country} onChange={e => setCountry(e.target.value)} style={{ width: '100%', padding: '6px 10px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 13 }}>
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>State/Province (optional)</label>
                <input value={stateProvince} onChange={e => setStateProvince(e.target.value)} placeholder="e.g. Scotland, Ontario" style={{ width: '100%', padding: '6px 10px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 13 }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>County (optional)</label>
                <input value={county} onChange={e => setCounty(e.target.value)} placeholder="e.g. Greater Manchester" style={{ width: '100%', padding: '6px 10px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 13 }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>City (optional)</label>
                <input value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Edinburgh" style={{ width: '100%', padding: '6px 10px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 13 }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Radius (km, optional)</label>
                <input value={radiusKm} onChange={e => setRadiusKm(e.target.value)} type="number" placeholder="e.g. 50" style={{ width: '100%', padding: '6px 10px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 13 }} />
              </div>
            </div>

            <div style={{ marginTop: 16, padding: 12, background: '#f9fafb', borderRadius: 4 }}>
              <strong style={{ fontSize: 13 }}>Summary:</strong>
              <ul style={{ fontSize: 12, marginLeft: 16, marginTop: 4 }}>
                <li>Product versions: {selectedProductVersions.length}</li>
                <li>Customer versions: {selectedCustomerVersions.length}</li>
                <li>Location: {country}{stateProvince ? `, ${stateProvince}` : ''}{city ? `, ${city}` : ''}{radiusKm ? ` (${radiusKm}km radius)` : ''}</li>
              </ul>
            </div>

            {error && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 8 }}>{error}</div>}

            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <button className="secondary" onClick={() => setStep(2)}>← Back</button>
              <button className="primary" disabled={creating} onClick={create}>{creating ? 'Compiling…' : 'Compile Strategy'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
