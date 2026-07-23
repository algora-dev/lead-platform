'use client';

import { useState, useEffect } from 'react';
import KeywordEditor, { type KeywordItem } from './KeywordEditor';
import { TargetIcon, FileTextIcon, EditIcon, SearchIcon, RefreshIcon, CheckIcon, SlidersIcon } from './Icons';

interface AssessmentData {
  id: number;
  understandingSummary: string;
  scoringKeywords: KeywordItem[];
  broadQueries: string[];
  status: string;
}

interface AssessmentModalProps {
  strategyId: number;
  assessment: AssessmentData | null;
  onConfirmed: () => void;
  onClose: () => void;
}

export default function AssessmentModal({ strategyId, assessment, onConfirmed, onClose }: AssessmentModalProps) {
  const [keywords, setKeywords] = useState<KeywordItem[]>([]);
  const [clarification, setClarification] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'confirm' | 'rebuild'>('confirm');
  const [scoreThreshold, setScoreThreshold] = useState(0);

  useEffect(() => {
    if (assessment?.scoringKeywords) {
      setKeywords(assessment.scoringKeywords);
    }
  }, [assessment]);

  if (!assessment) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
        <div className="card" style={{ width: 400, padding: 24, textAlign: 'center' }}>
          <p>Loading assessment...</p>
        </div>
      </div>
    );
  }

  const totalPoints = keywords.reduce((sum, k) => sum + k.points, 0);
  const canConfirm = totalPoints === 100 && keywords.length >= 1 && !loading;
  const hasClarification = clarification.trim().length > 0;

  const handleConfirm = async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`/api/v2/strategies/${strategyId}/assessment/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keywords: keywords.map(k => ({ keyword: k.keyword, points: k.points })),
          scoreThreshold,
        }),
      });
      const d = await r.json();
      if (r.ok) {
        onConfirmed();
      } else {
        setError(d.error || (d.errors || []).map((e: any) => `${e.field}: ${e.message}`).join('; ') || 'Failed to confirm');
      }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const handleRebuild = async () => {
    if (!hasClarification) return;
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`/api/v2/strategies/${strategyId}/assessment/rebuild`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clarification: clarification.trim() }),
      });
      const d = await r.json();
      if (r.ok) {
        // Reload with new assessment
        if (d.assessment) {
          setKeywords(d.assessment.scoringKeywords || []);
          setClarification('');
          setMode('confirm');
        }
      } else {
        setError(d.error || d.detail || 'Rebuild failed');
      }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      zIndex: 1000, overflow: 'auto', padding: 20,
    }}>
      <div className="card" style={{ width: '100%', maxWidth: 680, margin: '16px 0' }}>
        {/* Header */}
        <div className="card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 6 }}><TargetIcon size={18} /> AI Strategy Assessment</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#6b7280' }}>×</button>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Understanding */}
          <div>
            <label style={{ display: 'flex', marginBottom: 6, fontSize: 13, fontWeight: 600, alignItems: 'center', gap: 4 }}><FileTextIcon size={14} /> AI Understanding</label>
            <div style={{
              padding: 12, background: '#f0f9ff', borderRadius: 6,
              border: '1px solid #bae6fd', fontSize: 14, lineHeight: 1.5,
            }}>
              {assessment.understandingSummary}
            </div>
          </div>

          {/* Clarification */}
          <div>
            <label style={{ display: 'flex', marginBottom: 6, fontSize: 13, fontWeight: 600, alignItems: 'center', gap: 4 }}>
              <EditIcon size={14} /> Clarification <span style={{ fontWeight: 400, color: '#6b7280' }}>(optional — AI will rebuild if filled)</span>
            </label>
            <textarea
              value={clarification}
              onChange={e => setClarification(e.target.value)}
              placeholder="If the AI's understanding is off-track, add context here and click Rebuild..."
              rows={2}
              style={{
                width: '100%', padding: '8px 10px', fontSize: 13,
                border: '1px solid #d1d5db', borderRadius: 4,
                resize: 'vertical', fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Keywords */}
          <div>
            <KeywordEditor keywords={keywords} onChange={setKeywords} />
          </div>

          {/* Score Threshold */}
          <div>
            <label style={{ display: 'flex', marginBottom: 6, fontSize: 13, fontWeight: 600, alignItems: 'center', gap: 4 }}>
              <SlidersIcon size={14} /> Score Threshold: <span style={{ color: '#2563eb' }}>{scoreThreshold}</span> <span style={{ fontWeight: 400, color: '#6b7280' }}>(candidates below this score are hidden)</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={scoreThreshold}
              onChange={e => setScoreThreshold(parseInt(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>

          {/* Search Queries Preview */}
          {assessment.broadQueries && assessment.broadQueries.length > 0 && (
            <div>
              <label style={{ display: 'flex', marginBottom: 6, fontSize: 13, fontWeight: 600, alignItems: 'center', gap: 4 }}><SearchIcon size={14} /> Search Queries (preview)</label>
              <ul style={{ fontSize: 13, marginLeft: 16, color: '#6b7280', lineHeight: 1.8 }}>
                {assessment.broadQueries.map((q, i) => <li key={i} style={{ fontFamily: 'monospace' }}>{q}</li>)}
              </ul>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ padding: 10, background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 4, color: '#dc2626', fontSize: 13 }}>
              {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
            <button onClick={onClose} className="secondary" style={{ fontSize: 14, padding: '8px 16px' }}>Cancel</button>

            {hasClarification ? (
              <button
                onClick={handleRebuild}
                disabled={loading}
                className="primary"
                style={{ fontSize: 14, padding: '8px 16px', opacity: loading ? 0.6 : 1 }}
              >
                {loading ? 'Rebuilding...' : <><RefreshIcon size={14} /> Rebuild with Clarification</>}
              </button>
            ) : (
              <button
                onClick={handleConfirm}
                disabled={!canConfirm || loading}
                className="primary"
                style={{ fontSize: 14, padding: '8px 16px', opacity: (!canConfirm || loading) ? 0.6 : 1 }}
              >
                {loading ? 'Confirming...' : <><CheckIcon size={14} /> Confirm Strategy</>}
              </button>
            )}
          </div>

          {/* Helper text */}
          {!canConfirm && !hasClarification && totalPoints !== 100 && (
            <div style={{ fontSize: 12, color: '#ca8a04', textAlign: 'center' }}>
              Points must total exactly 100 (currently {totalPoints})
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
