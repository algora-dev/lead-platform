'use client';

import { useState } from 'react';
import { AlertIcon, CheckIcon } from './Icons';

export default function ScanActions({
  scanId,
  status,
  candidateCount,
}: {
  scanId: number;
  status: string;
  candidateCount: number;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canRunEvidence = candidateCount > 0 && (status === 'COMPLETED' || status === 'EVIDENCE_COMPLETE');
  const canRunAssessment = candidateCount > 0 && (status === 'EVIDENCE_COMPLETE' || status === 'COMPLETED');

  async function runAction(endpoint: string, label: string) {
    setLoading(label);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/v2/scans/${scanId}/${endpoint}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong');
      } else {
        setSuccess(`${label} started. Job ID: ${data.jobId}`);
        // Poll for completion
        pollJob(data.jobId, label);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(null);
    }
  }

  async function pollJob(jobId: string, label: string) {
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes at 5s intervals
    const interval = setInterval(async () => {
      attempts++;
      if (attempts >= maxAttempts) {
        clearInterval(interval);
        setError(`${label} is taking longer than expected. Check back later.`);
        return;
      }
      try {
        const res = await fetch(`/api/v2/jobs/${jobId}`);
        const job = await res.json();
        if (job.status === 'completed') {
          clearInterval(interval);
          setSuccess(`${label} complete! ${job.result?.totalItems || job.result?.snapshots || ''} items processed.`);
          setTimeout(() => window.location.reload(), 1500);
        } else if (job.status === 'failed') {
          clearInterval(interval);
          setError(`${label} failed: ${job.error}`);
        }
      } catch {
        // Ignore poll errors
      }
    }, 5000);
  }

  return (
    <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      {canRunEvidence && (
        <button
          onClick={() => runAction('evidence', 'Evidence gathering')}
          disabled={loading !== null}
          style={{
            padding: '6px 16px',
            borderRadius: 6,
            border: '1px solid #7c3aed',
            background: '#7c3aed',
            color: '#fff',
            cursor: loading ? 'wait' : 'pointer',
            fontSize: 14,
          }}
        >
          {loading === 'Evidence gathering' ? 'Gathering...' : 'Gather Evidence'}
        </button>
      )}
      {canRunAssessment && (
        <button
          onClick={() => runAction('assess', 'Assessment')}
          disabled={loading !== null}
          style={{
            padding: '6px 16px',
            borderRadius: 6,
            border: '1px solid #d97706',
            background: '#d97706',
            color: '#fff',
            cursor: loading ? 'wait' : 'pointer',
            fontSize: 14,
          }}
        >
          {loading === 'Assessment' ? 'Assessing...' : 'Run Assessment'}
        </button>
      )}
      {loading && (
        <span style={{ fontSize: 13, color: '#6b7280' }}>Working... (this may take a minute)</span>
      )}
      {error && (
        <span style={{ fontSize: 13, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 4 }}><AlertIcon size={13} color="#dc2626" /> {error}</span>
      )}
      {success && (
        <span style={{ fontSize: 13, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}><CheckIcon size={13} color="#16a34a" /> {success}</span>
      )}
    </div>
  );
}
