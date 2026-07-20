'use client';

import { useState } from 'react';

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;

type FormConfig = {
  // Step 1: What are you looking for?
  profileName: string;
  description: string;
  industry: string;
  leadType: string; // 'hiring' | 'quoting' | 'custom'

  // Step 2: Where?
  countries: string[];

  // Step 3: Search terms
  queryPairs: string; // textarea, one per line, "term1 | term2"
  negativeTerms: string; // comma-separated
  jobTerms: string; // comma-separated

  // Step 4: Task signals (what tasks = good lead?)
  taskGroups: string; // textarea, "Group Name: term1, term2, term3"

  // Step 5: Scoring
  scoreName: string;
  baseHiringSignal: number;
  advertTaskPointsPerGroup: number;
  advertTaskPointsCap: number;
  companyTaskPointsPerGroup: number;
  companyTaskPointsCap: number;
  salaryBands: string; // "30000:7, 70000:10"
  contactEmailPoints: number;
  contactPhonePoints: number;
  companySizeBands: string; // "10-150:15, 151-300:10"
  maxScore: number;

  // Step 6: Ignore domains
  ignoreDomains: string;
};

const DEFAULTS: FormConfig = {
  profileName: '',
  description: '',
  industry: '',
  leadType: 'hiring',
  countries: ['UK'],
  queryPairs: '',
  negativeTerms: 'student, internship, volunteer, graduate',
  jobTerms: 'job, vacancy, career, position, role, hiring, employment',
  taskGroups: '',
  scoreName: 'Opportunity Score',
  baseHiringSignal: 12,
  advertTaskPointsPerGroup: 8,
  advertTaskPointsCap: 40,
  companyTaskPointsPerGroup: 5,
  companyTaskPointsCap: 30,
  salaryBands: '1:4, 30000:7, 70000:10',
  contactEmailPoints: 5,
  contactPhonePoints: 5,
  companySizeBands: '10-150:15, 151-300:10, 1-9:7, 301+:5',
  maxScore: 100,
  ignoreDomains: 'linkedin.com, facebook.com, instagram.com, youtube.com, reddit.com',
};

const INDUSTRY_TEMPLATES: Record<string, Partial<FormConfig>> = {
  'Sales & Outreach': {
    leadType: 'hiring',
    queryPairs: 'cold calling | sales\ncold email | outreach\nlead generation | sales\noutbound | sales\nappointment setting | CRM\nsales development | pipeline\nbusiness development | prospecting\ntelesales | leads\nsales representative | new business\naccount executive | outbound',
    taskGroups: 'Outbound Sales: cold calling, cold call, cold email, outbound, outreach, prospecting, cold outreach\nLead Generation: lead generation, lead gen, pipeline, qualified leads, new business, prospects\nAppointment Setting: appointment setting, book meetings, schedule calls, book appointments\nCRM Management: CRM, pipeline management, salesforce, hubspot, pipedrive, update CRM\nClient Acquisition: new clients, win new business, client acquisition, account winning\nSales Reporting: sales targets, KPI, sales reports, conversion rates, weekly targets',
    companySizeBands: '10-150:15, 151-300:10, 1-9:7, 301+:5',
    salaryBands: '1:4, 30000:7, 70000:10',
  },
  'Construction & Trades': {
    leadType: 'hiring',
    queryPairs: 'quoting | construction\nestimator | building\nquantity surveyor | construction\nproject surveyor | quotes\nestimating | builder\ntender | construction\npricing | construction\ncost estimation | building\nsurveyor | contractor\nestimator | contractor',
    taskGroups: 'Quoting & Estimating: quoting, estimating, estimator, quotations, quotes, pricing, cost estimation, tender pricing\nSurveying: surveyor, quantity surveyor, project surveyor, measured survey, bill of quantities\nTendering: tender, tendering, bid, bidding, bid manager, tender submissions, pre-qualification\nProject Management: project manager, site manager, construction management, programme, scheduling\nContractor Operations: contractor, subcontractor, building contractor, civil engineering, groundworks\nTechnical & Trade: roofing, plumbing, electrical, carpentry, bricklaying, plastering, tiling',
    companySizeBands: '5-50:15, 51-200:12, 1-4:7, 201+:5',
    salaryBands: '1:4, 35000:7, 80000:10',
  },
  'IT & Software': {
    leadType: 'hiring',
    queryPairs: 'software developer | hiring\nfull stack | engineer\nDevOps | infrastructure\nfrontend developer | react\nbackend developer | API\ntech lead | engineering\nsoftware engineer | senior\npython developer | django\n.NET developer | C#\ncloud engineer | AWS',
    taskGroups: 'Development: software development, coding, programming, full stack, frontend, backend, API\nDevOps & Cloud: DevOps, CI/CD, AWS, Azure, cloud infrastructure, Kubernetes, Docker\nArchitecture: system design, architecture, microservices, scalability, technical lead\nProject Delivery: sprint, agile, scrum, project delivery, stakeholder management',
    companySizeBands: '10-200:15, 201-500:12, 1-9:8, 501+:5',
    salaryBands: '1:4, 45000:7, 90000:10',
  },
  'Healthcare & Medical': {
    leadType: 'hiring',
    queryPairs: 'nurse | hiring\nhealthcare assistant | vacancy\ncare coordinator | role\npractice manager | position\ndentist | hiring\npharmacist | vacancy\nmental health | role\ncare worker | position',
    taskGroups: 'Clinical Care: patient care, clinical, treatment, diagnosis, medical procedures\nCare Coordination: care coordinator, patient scheduling, care plans, discharge planning\nPractice Management: practice manager, clinic operations, appointment management, patient records\nCompliance: CQC, safeguarding, clinical governance, infection control',
    companySizeBands: '10-100:15, 101-300:12, 1-9:8, 301+:5',
    salaryBands: '1:4, 28000:7, 65000:10',
  },
  'Custom': {},
};

export default function ScanSetupWizard({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormConfig>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (field: keyof FormConfig, value: any) => setForm(f => ({ ...f, [field]: value }));

  const applyTemplate = (template: string) => {
    const tpl = INDUSTRY_TEMPLATES[template] || {};
    setForm(f => ({ ...f, ...tpl, industry: template, profileName: f.profileName || template }));
  };

  const parseQueryPairs = (text: string): [string, string][] =>
    text.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const [a, b] = l.split('|').map(s => s.trim());
      return [a || '', b || ''];
    });

  const parseTaskGroups = (text: string): Record<string, string[]> => {
    const groups: Record<string, string[]> = {};
    text.split('\n').map(l => l.trim()).filter(Boolean).forEach(l => {
      const [name, terms] = l.split(':').map(s => s.trim());
      if (name && terms) groups[name] = terms.split(',').map(t => t.trim()).filter(Boolean);
    });
    return groups;
  };

  const parseSalaryBands = (text: string) =>
    text.split(',').map(s => s.trim()).filter(Boolean).map(s => {
      const [min, pts] = s.split(':').map(x => x.trim());
      return { minimum: Number(min), points: Number(pts) };
    });

  const parseSizeBands = (text: string) =>
    text.split(',').map(s => s.trim()).filter(Boolean).map(s => {
      const [range, pts] = s.split(':').map(x => x.trim());
      const label = range;
      if (range.endsWith('+')) {
        return { minimum: Number(range.replace('+', '')), maximum: 999999, points: Number(pts), label };
      }
      const [min, max] = range.split('-').map(x => x.trim());
      return { minimum: Number(min), maximum: Number(max), points: Number(pts), label };
    });

  const buildConfig = () => ({
    brave: {
      countries: form.countries,
      freshness: 'pm',
      resultsPerPage: 20,
      defaultQueryLimit: 16,
      negativeTerms: form.negativeTerms.split(',').map(t => t.trim()).filter(Boolean),
      queryPairs: parseQueryPairs(form.queryPairs),
    },
    jobTerms: form.jobTerms.split(',').map(t => t.trim()).filter(Boolean),
    ignoreDomains: form.ignoreDomains.split(',').map(d => d.trim()).filter(Boolean),
    taskGroups: parseTaskGroups(form.taskGroups),
    scoring: {
      scoreName: form.scoreName,
      baseHiringSignal: form.baseHiringSignal,
      advertTaskPointsPerGroup: form.advertTaskPointsPerGroup,
      advertTaskPointsCap: form.advertTaskPointsCap,
      companyTaskPointsPerGroup: form.companyTaskPointsPerGroup,
      companyTaskPointsCap: form.companyTaskPointsCap,
      activeJobPoints: { '1': 8, '2': 16, '3': 23, '4_plus': 30 },
      repeatTaskPointsPerExtraAdvert: 5,
      repeatTaskPointsCap: 15,
      salaryBands: parseSalaryBands(form.salaryBands),
      contactPoints: { email: form.contactEmailPoints, phone: form.contactPhonePoints },
      companySizeBands: parseSizeBands(form.companySizeBands),
      maximumScore: form.maxScore,
      principle: 'Positive evidence only. Never subtract points because of job title, industry, physical work, clinical work, technical work, or company type.',
    },
  });

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const config = buildConfig();
      const slug = form.profileName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'profile';
      const r = await fetch('/api/scan-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.profileName, slug, description: form.description, config }),
      });
      if (!r.ok) {
        const d = await r.json();
        setError(d.error || 'Failed to create profile');
        setSaving(false);
        return;
      }
      onCreated();
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  };

  const next = () => setStep(s => (s + 1) as Step);
  const back = () => setStep(s => (s - 1) as Step);

  const canNext = () => {
    switch (step) {
      case 1: return form.profileName.trim() && form.industry;
      case 2: return form.countries.length > 0;
      case 3: return form.queryPairs.trim().length > 0;
      case 4: return form.taskGroups.trim().length > 0;
      default: return true;
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: 6,
    border: '1px solid #d1d5db', fontSize: 14, fontFamily: 'inherit',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600,
  };

  return (
    <div className="card">
      <div className="card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Scan Setup Wizard</h2>
          <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>Step {step} of 7 — creates a complete scan profile in 2 minutes</p>
        </div>
        <button className="secondary" onClick={onClose}>Close</button>
      </div>

      {/* Progress bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {[1, 2, 3, 4, 5, 6, 7].map(n => (
          <div key={n} style={{
            flex: 1, height: 4, borderRadius: 2,
            background: n <= step ? 'var(--accent)' : 'var(--line)',
          }} />
        ))}
      </div>

      {/* Step 1: What are you looking for? */}
      {step === 1 && (
        <div style={{ maxWidth: 600 }}>
          <h3>What are you looking for?</h3>
          <p className="muted">Pick a template to pre-fill the form, or start from scratch.</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, marginBottom: 20 }}>
            {Object.keys(INDUSTRY_TEMPLATES).map(t => (
              <button
                key={t}
                onClick={() => applyTemplate(t)}
                style={{
                  padding: '10px 12px', borderRadius: 6, border: '1px solid #d1d5db',
                  background: form.industry === t ? 'var(--accent)' : '#fff',
                  cursor: 'pointer', fontSize: 13, fontWeight: 500, textAlign: 'center',
                }}
              >
                {t}
              </button>
            ))}
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Profile Name *</label>
            <input style={inputStyle} value={form.profileName} onChange={e => set('profileName', e.target.value)}
              placeholder="e.g. UK Construction Estimators" />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Description</label>
            <input style={inputStyle} value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="What this scan finds" />
          </div>
          <div>
            <label style={labelStyle}>Lead Type</label>
            <select style={inputStyle} value={form.leadType} onChange={e => set('leadType', e.target.value)}>
              <option value="hiring">Companies actively hiring (job adverts)</option>
              <option value="quoting">Companies quoting for work</option>
              <option value="custom">Custom search terms</option>
            </select>
          </div>
        </div>
      )}

      {/* Step 2: Where? */}
      {step === 2 && (
        <div style={{ maxWidth: 600 }}>
          <h3>Which countries?</h3>
          <p className="muted">Select all countries you want to scan.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['UK', 'US', 'NZ', 'AU', 'CA', 'IE', 'DE', 'FR', 'AE', 'SG'].map(c => (
              <button
                key={c}
                onClick={() => set('countries', form.countries.includes(c)
                  ? form.countries.filter(x => x !== c)
                  : [...form.countries, c])}
                style={{
                  padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db',
                  background: form.countries.includes(c) ? 'var(--accent)' : '#fff',
                  cursor: 'pointer', fontSize: 14, fontWeight: 500,
                }}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Search terms */}
      {step === 3 && (
        <div style={{ maxWidth: 800 }}>
          <h3>Search Terms</h3>
          <p className="muted">These are the Brave Search query pairs. Each line searches for both terms together. Format: <code>term1 | term2</code></p>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Query Pairs (one per line)</label>
            <textarea style={{ ...inputStyle, fontFamily: 'monospace', minHeight: 180 }}
              value={form.queryPairs} onChange={e => set('queryPairs', e.target.value)}
              placeholder={'cold calling | sales\ncold email | outreach\nlead generation | sales'} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Negative Terms (exclude these)</label>
              <input style={inputStyle} value={form.negativeTerms} onChange={e => set('negativeTerms', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Job Terms (what makes a result a job advert)</label>
              <input style={inputStyle} value={form.jobTerms} onChange={e => set('jobTerms', e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Task signals */}
      {step === 4 && (
        <div style={{ maxWidth: 800 }}>
          <h3>Task Signals</h3>
          <p className="muted">What tasks or keywords in a job advert indicate a good lead? Group them by theme. Format: <code>Group Name: term1, term2, term3</code></p>
          <textarea style={{ ...inputStyle, fontFamily: 'monospace', minHeight: 200 }}
            value={form.taskGroups} onChange={e => set('taskGroups', e.target.value)}
            placeholder={'Outbound Sales: cold calling, cold email, outreach, prospecting\nLead Generation: lead gen, pipeline, qualified leads, new business'} />
        </div>
      )}

      {/* Step 5: Scoring */}
      {step === 5 && (
        <div style={{ maxWidth: 800 }}>
          <h3>Scoring Rules</h3>
          <p className="muted">Positive signals only. How many points for each signal?</p>
          <div className="grid2" style={{ marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Score Name</label>
              <input style={inputStyle} value={form.scoreName} onChange={e => set('scoreName', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Base Hiring Signal (any job advert)</label>
              <input type="number" style={inputStyle} value={form.baseHiringSignal} onChange={e => set('baseHiringSignal', Number(e.target.value))} />
            </div>
            <div>
              <label style={labelStyle}>Task Points Per Group (per advert)</label>
              <input type="number" style={inputStyle} value={form.advertTaskPointsPerGroup} onChange={e => set('advertTaskPointsPerGroup', Number(e.target.value))} />
            </div>
            <div>
              <label style={labelStyle}>Task Points Cap (per advert)</label>
              <input type="number" style={inputStyle} value={form.advertTaskPointsCap} onChange={e => set('advertTaskPointsCap', Number(e.target.value))} />
            </div>
            <div>
              <label style={labelStyle}>Task Points Per Group (company-wide)</label>
              <input type="number" style={inputStyle} value={form.companyTaskPointsPerGroup} onChange={e => set('companyTaskPointsPerGroup', Number(e.target.value))} />
            </div>
            <div>
              <label style={labelStyle}>Task Points Cap (company-wide)</label>
              <input type="number" style={inputStyle} value={form.companyTaskPointsCap} onChange={e => set('companyTaskPointsCap', Number(e.target.value))} />
            </div>
            <div>
              <label style={labelStyle}>Email Found Points</label>
              <input type="number" style={inputStyle} value={form.contactEmailPoints} onChange={e => set('contactEmailPoints', Number(e.target.value))} />
            </div>
            <div>
              <label style={labelStyle}>Phone Found Points</label>
              <input type="number" style={inputStyle} value={form.contactPhonePoints} onChange={e => set('contactPhonePoints', Number(e.target.value))} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Salary Bands (min:points, ...)</label>
            <input style={inputStyle} value={form.salaryBands} onChange={e => set('salaryBands', e.target.value)} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Company Size Bands (min-max:points, ...)</label>
            <input style={inputStyle} value={form.companySizeBands} onChange={e => set('companySizeBands', e.target.value)} />
            <span className="muted" style={{ fontSize: '0.8rem' }}>Sweet spot companies get more points</span>
          </div>
          <div>
            <label style={labelStyle}>Maximum Score</label>
            <input type="number" style={inputStyle} value={form.maxScore} onChange={e => set('maxScore', Number(e.target.value))} />
          </div>
        </div>
      )}

      {/* Step 6: Ignore domains */}
      {step === 6 && (
        <div style={{ maxWidth: 600 }}>
          <h3>Ignore Domains</h3>
          <p className="muted">Domains to skip (social media, job boards, etc.)</p>
          <textarea style={{ ...inputStyle, minHeight: 100 }} value={form.ignoreDomains} onChange={e => set('ignoreDomains', e.target.value)} />
        </div>
      )}

      {/* Step 7: Review */}
      {step === 7 && (
        <div style={{ maxWidth: 800 }}>
          <h3>Review & Create</h3>
          <p className="muted">Check the generated config below. This will create a new scan profile.</p>

          <div className="card" style={{ background: 'var(--soft)', marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.9rem' }}>
              <div><strong>Name:</strong> {form.profileName}</div>
              <div><strong>Countries:</strong> {form.countries.join(', ')}</div>
              <div><strong>Query Pairs:</strong> {parseQueryPairs(form.queryPairs).length}</div>
              <div><strong>Task Groups:</strong> {Object.keys(parseTaskGroups(form.taskGroups)).length}</div>
              <div><strong>Lead Type:</strong> {form.leadType}</div>
              <div><strong>Max Score:</strong> {form.maxScore}</div>
            </div>
          </div>

          <details>
            <summary style={{ cursor: 'pointer', fontWeight: 600, marginBottom: 8 }}>Full JSON Config</summary>
            <pre style={{ background: 'var(--soft)', padding: 12, borderRadius: 6, overflow: 'auto', fontSize: '0.8rem', maxHeight: 300 }}>
{JSON.stringify(buildConfig(), null, 2)}
            </pre>
          </details>

          {error && <div style={{ color: '#dc2626', fontSize: 14, marginTop: 8 }}>{error}</div>}
        </div>
      )}

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
        {step > 1 ? (
          <button className="secondary" onClick={back}>← Back</button>
        ) : <span />}
        {step < 7 ? (
          <button className="primary" onClick={next} disabled={!canNext()}>Next →</button>
        ) : (
          <button className="primary" onClick={save} disabled={saving}>
            {saving ? 'Creating…' : 'Create Scan Profile'}
          </button>
        )}
      </div>
    </div>
  );
}
