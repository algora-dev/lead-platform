'use client';

import { useEffect, useState, useCallback } from 'react';

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

type Run = {
  id: number;
  country: string;
  startedAt: string;
  status: string;
  deepOffset: number;
  searchRequests: number;
  resultsFound: number;
  pagesFetched: number;
  duplicateAdverts: number;
  advertsSaved: number;
  companiesCreated: number;
  companiesUpdated: number;
  contactsFound: number;
  errors: number;
  message?: string;
  profile?: { id: number; name: string; slug: string } | null;
};

type Tab = 'scan' | 'profiles';

export default function SourceWorkspace() {
  const [tab, setTab] = useState<Tab>('scan');
  const [profiles, setProfiles] = useState<ScanProfile[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [selectedCountry, setSelectedCountry] = useState('UK');
  const [createBatch, setCreateBatch] = useState(true);

  const loadProfiles = useCallback(() =>
    fetch('/api/scan-profiles').then(r => r.json()).then(d => {
      if (Array.isArray(d)) {
        setProfiles(d.filter((p: ScanProfile) => p.isActive));
        if (d.length > 0 && !selectedProfileId) {
          setSelectedProfileId(d[0].id);
          const cfg = d[0].config;
          if (cfg?.brave?.countries?.length) setSelectedCountry(cfg.brave.countries[0]);
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

  useEffect(() => {
    loadProfiles();
    loadRuns();
  }, [loadProfiles, loadRuns]);

  const handleProfileChange = (id: number) => {
    setSelectedProfileId(id);
    const profile = profiles.find(p => p.id === id);
    if (profile?.config?.brave?.countries?.length) {
      setSelectedCountry(profile.config.brave.countries[0]);
    }
  };

  const scan = async () => {
    if (!selectedProfileId) {
      setNotice('Select a scan profile first');
      return;
    }
    setRunning(true);
    setNotice(`Scanning ${selectedCountry}…`);
    try {
      const r = await fetch('/api/scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: selectedProfileId,
          country: selectedCountry,
          batchId: createBatch ? undefined : undefined, // batch creation handled separately for now
        }),
      });
      const d = await r.json();
      setNotice(r.ok ? d.output : d.error);
    } catch (e: any) {
      setNotice(`Error: ${e.message}`);
    }
    setRunning(false);
    loadRuns();
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
  const availableCountries = profile?.config?.brave?.countries || ['UK'];

  return (
    <>
      <div className="page-header">
        <h1>Scan</h1>
        <p>Find companies using configurable scan profiles.</p>
      </div>

      {/* Tab bar */}
      <div className="tab-bar" style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid #e5e7eb' }}>
        <button
          className={`tab ${tab === 'scan' ? 'active' : ''}`}
          onClick={() => setTab('scan')}
          style={{
            padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: tab === 'scan' ? 600 : 400,
            borderBottom: tab === 'scan' ? '2px solid #d7ff00' : '2px solid transparent',
          }}
        >
          Run Scan
        </button>
        <button
          className={`tab ${tab === 'profiles' ? 'active' : ''}`}
          onClick={() => setTab('profiles')}
          style={{
            padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: tab === 'profiles' ? 600 : 400,
            borderBottom: tab === 'profiles' ? '2px solid #d7ff00' : '2px solid transparent',
          }}
        >
          Scan Profiles
        </button>
      </div>

      {tab === 'scan' && (
        <>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-head">
              <h2>New Scan</h2>
            </div>

            {profiles.length === 0 ? (
              <div className="empty" style={{ padding: 20 }}>
                <p>No scan profiles yet. Seed the default profiles to get started:</p>
                <button className="primary" onClick={seedDefaults}>Seed Default Profiles</button>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 16 }}>
                  <label className="muted" style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>
                    Scan Profile
                  </label>
                  <select
                    value={selectedProfileId || ''}
                    onChange={(e) => handleProfileChange(parseInt(e.target.value))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 14 }}
                  >
                    {profiles.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  {profile?.description && (
                    <p className="muted" style={{ marginTop: 6, fontSize: 13 }}>{profile.description}</p>
                  )}
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label className="muted" style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>
                    Country
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {availableCountries.map((c: string) => (
                      <button
                        key={c}
                        onClick={() => setSelectedCountry(c)}
                        disabled={running}
                        style={{
                          padding: '6px 16px', borderRadius: 6, border: '1px solid #d1d5db',
                          background: selectedCountry === c ? '#d7ff00' : '#fff',
                          cursor: 'pointer', fontSize: 14, fontWeight: 500,
                        }}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={createBatch}
                      onChange={(e) => setCreateBatch(e.target.checked)}
                    />
                    Create a new batch for this scan&apos;s results
                  </label>
                </div>

                {/* Profile summary */}
                {profile && (
                  <div style={{ marginBottom: 16, padding: 12, background: '#f9fafb', borderRadius: 6, fontSize: 13 }}>
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                      <div>
                        <span className="muted">Queries:</span> {profile.config?.brave?.queryPairs?.length || 0}
                      </div>
                      <div>
                        <span className="muted">Task groups:</span> {Object.keys(profile.config?.taskGroups || {}).length}
                      </div>
                      <div>
                        <span className="muted">Negative terms:</span> {profile.config?.brave?.negativeTerms?.length || 0}
                      </div>
                      <div>
                        <span className="muted">Past runs:</span> {profile._count?.scanRuns || 0}
                      </div>
                    </div>
                  </div>
                )}

                <div className="toolbar">
                  <button
                    className="primary"
                    disabled={running || !selectedProfileId}
                    onClick={scan}
                  >
                    {running ? 'Scanning…' : `Scan ${selectedCountry}`}
                  </button>
                </div>
                {notice && <div className="muted" style={{ marginTop: 10 }}>{notice}</div>}
              </>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Recent scans</h2>
            </div>
            <div style={{ overflow: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Started</th>
                    <th>Profile</th>
                    <th>Country</th>
                    <th>Requests</th>
                    <th>Results</th>
                    <th>Fetched</th>
                    <th>Dupes</th>
                    <th>Adverts</th>
                    <th>New cos</th>
                    <th>Updated</th>
                    <th>Contacts</th>
                    <th>Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map(r => (
                    <tr key={r.id}>
                      <td>{new Date(r.startedAt).toLocaleString()}</td>
                      <td>{r.profile?.name || '—'}</td>
                      <td>{r.country}</td>
                      <td>{r.searchRequests}</td>
                      <td>{r.resultsFound}</td>
                      <td>{r.pagesFetched}</td>
                      <td>{r.duplicateAdverts}</td>
                      <td>{r.advertsSaved}</td>
                      <td>{r.companiesCreated}</td>
                      <td>{r.companiesUpdated}</td>
                      <td>{r.contactsFound}</td>
                      <td>{r.errors}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!runs.length && <div className="empty">No scans yet. Select a profile and run a scan above.</div>}
            </div>
          </div>
        </>
      )}

      {tab === 'profiles' && (
        <ProfileManager profiles={profiles} onReload={loadProfiles} />
      )}
    </>
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
              <th>Countries</th>
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
                <td>{(p.config?.brave?.countries || []).join(', ')}</td>
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
          <label style={labelStyle}>Countries (comma-separated)</label>
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
