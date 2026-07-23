'use client';

import { useState, useEffect, useCallback } from 'react';
import { FlaskIcon, CheckIcon } from './Icons';

interface Candidate {
  id: number;
  profileScore: number;
  profileScoreBreakdown: any;
  keywordMatches?: any;
  discoveryProvider: string;
  discoveryQuery?: string | null;
  evidenceGathered: boolean;
  selectedForEvidence: boolean;
  company: {
    id: number;
    name: string;
    website?: string | null;
    country?: string | null;
    industry?: string | null;
    employeeRange?: string | null;
    domain?: string | null;
  };
}

interface CandidateTableProps {
  scanId: number;
  candidates: Candidate[];
  strategyScoreThreshold: number;
  scanStatus: string;
}

export default function CandidateTable({ scanId, candidates: initialCandidates, strategyScoreThreshold, scanStatus }: CandidateTableProps) {
  const [candidates, setCandidates] = useState(initialCandidates);
  const [threshold, setThreshold] = useState(strategyScoreThreshold);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    new Set(initialCandidates.filter(c => c.selectedForEvidence).map(c => c.id))
  );
  const [showAll, setShowAll] = useState(false);
  const [evidenceRunning, setEvidenceRunning] = useState(false);
  const [notice, setNotice] = useState('');

  // Filter by threshold
  const visibleCandidates = showAll
    ? candidates
    : candidates.filter(c => c.profileScore >= threshold);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllAboveThreshold = () => {
    const newSet = new Set<number>();
    for (const c of candidates) {
      if (c.profileScore >= threshold && !c.evidenceGathered) {
        newSet.add(c.id);
      }
    }
    setSelectedIds(newSet);
  };

  const clearSelection = () => setSelectedIds(new Set());

  const persistThreshold = async (value: number) => {
    // Find strategy ID from scan
    setThreshold(value);
    // Persist is done via strategy PATCH, but we need the strategy ID
    // For now, we'll persist locally and let the user save on the strategy page
  };

  const persistSelection = async () => {
    const r = await fetch(`/api/v2/scans/${scanId}/candidate-selection`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateIds: Array.from(selectedIds) }),
    });
    if (r.ok) {
      setNotice(`Selection saved (${selectedIds.size} candidates)`);
      setTimeout(() => setNotice(''), 3000);
    }
  };

  const runEvidence = async () => {
    if (selectedIds.size === 0) return;
    setEvidenceRunning(true);
    setNotice('Starting evidence gathering...');
    try {
      // First persist selection
      await persistSelection();

      const r = await fetch(`/api/v2/scans/${scanId}/evidence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateIds: Array.from(selectedIds) }),
      });
      const d = await r.json();
      if (r.ok) {
        setNotice(`Evidence gathering started for ${d.candidateCount || selectedIds.size} candidates (job: ${d.jobId})`);
      } else {
        setNotice(`Error: ${d.error || 'Failed to start evidence scan'}`);
      }
    } catch (e: any) {
      setNotice(`Error: ${e.message}`);
    }
    setEvidenceRunning(false);
    setTimeout(() => setNotice(''), 5000);
  };

  const canRunEvidence = scanStatus === 'COMPLETED' || scanStatus === 'EVIDENCE_COMPLETE';

  return (
    <div className="card" style={{ marginTop: 24 }}>
      <div className="card-head">
        <h2>Candidates ({candidates.length})</h2>
      </div>

      {/* Controls */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 500 }}>Min Score:</label>
          <input
            type="range"
            min={0}
            max={100}
            value={threshold}
            onChange={e => persistThreshold(parseInt(e.target.value))}
            style={{ width: 150 }}
          />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#2563eb', minWidth: 30 }}>{threshold}</span>
        </div>

        <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
          Show all (ignore threshold)
        </label>

        <div style={{ flex: 1 }} />

        <span style={{ fontSize: 13, color: '#6b7280' }}>
          Showing {visibleCandidates.length} of {candidates.length}
        </span>

        <button onClick={selectAllAboveThreshold} className="secondary" style={{ fontSize: 12, padding: '4px 10px' }}>
          Select all ≥ {threshold}
        </button>

        {selectedIds.size > 0 && (
          <button onClick={clearSelection} className="secondary" style={{ fontSize: 12, padding: '4px 10px' }}>
            Clear ({selectedIds.size})
          </button>
        )}

        {canRunEvidence && (
          <button
            onClick={runEvidence}
            disabled={selectedIds.size === 0 || evidenceRunning}
            className="primary"
            style={{ fontSize: 12, padding: '4px 12px', opacity: (selectedIds.size === 0 || evidenceRunning) ? 0.5 : 1 }}
          >
            {evidenceRunning ? 'Starting...' : <><FlaskIcon size={13} /> Evidence Scan ({selectedIds.size})</>}
          </button>
        )}
      </div>

      {notice && (
        <div style={{ padding: '8px 16px', background: '#f0f9ff', borderBottom: '1px solid #bae6fd', fontSize: 13 }}>
          {notice}
        </div>
      )}

      {/* Table */}
      {visibleCandidates.length === 0 ? (
        <div style={{ padding: 16, color: '#6b7280' }}>
          {candidates.length === 0 ? 'No candidates in this scan.' : `No candidates above score ${threshold}.`}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                <th style={{ padding: '8px 12px', width: 32 }}></th>
                <th style={{ padding: '8px 12px' }}>Company</th>
                <th style={{ padding: '8px 12px' }}>Industry</th>
                <th style={{ padding: '8px 12px' }}>Location</th>
                <th style={{ padding: '8px 12px', textAlign: 'center' }}>Score</th>
                <th style={{ padding: '8px 12px' }}>Matched Keywords</th>
                <th style={{ padding: '8px 12px', textAlign: 'center' }}>Evidence</th>
                <th style={{ padding: '8px 12px' }}>Provider</th>
              </tr>
            </thead>
            <tbody>
              {visibleCandidates.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '8px 12px' }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleSelect(c.id)}
                      disabled={c.evidenceGathered}
                    />
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <a href={`/v2/companies/${c.company.id}`}>{c.company.name}</a>
                    {c.company.domain && (
                      <div style={{ fontSize: 12, color: '#9ca3af' }}>{c.company.domain}</div>
                    )}
                  </td>
                  <td style={{ padding: '8px 12px', color: '#6b7280' }}>{c.company.industry || '—'}</td>
                  <td style={{ padding: '8px 12px', color: '#6b7280' }}>{c.company.country || '—'}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                    <ScorePill score={c.profileScore} />
                  </td>
                  <td style={{ padding: '8px 12px', fontSize: 12 }}>
                    {c.keywordMatches ? (
                      <KeywordBadges matches={c.keywordMatches} />
                    ) : c.profileScoreBreakdown ? (
                      <span style={{ color: '#6b7280' }}>{formatBreakdown(c.profileScoreBreakdown)}</span>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                    {c.evidenceGathered ? <CheckIcon size={14} color='#16a34a' /> : '—'}
                  </td>
                  <td style={{ padding: '8px 12px', color: '#6b7280' }}>{c.discoveryProvider}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ScorePill({ score }: { score: number }) {
  const color = score >= 70 ? '#16a34a' : score >= 40 ? '#ca8a04' : '#dc2626';
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 12,
      fontSize: 13,
      fontWeight: 600,
      color,
      background: `${color}15`,
    }}>
      {score}
    </span>
  );
}

function KeywordBadges({ matches }: { matches: any }) {
  if (!Array.isArray(matches)) return <span>—</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
      {matches.map((m: any, i: number) => (
        <span key={i} style={{
          background: '#eff6ff', padding: '1px 6px', borderRadius: 8,
          fontSize: 11, border: '1px solid #bfdbfe', color: '#1e40af',
        }} title={Array.isArray(m.matchedIn) ? m.matchedIn.join(', ') : m.matchedIn}>
          {m.keyword} +{m.points}
        </span>
      ))}
    </div>
  );
}

function formatBreakdown(breakdown: any): string {
  if (Array.isArray(breakdown)) {
    return breakdown.map((b: any) => `${b.criterion}: ${b.awarded}`).join(', ');
  }
  return JSON.stringify(breakdown).slice(0, 80);
}
