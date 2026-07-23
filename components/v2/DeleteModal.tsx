'use client';

import { TrashIcon } from './Icons';

/**
 * Reusable delete confirmation modal.
 * Warns the user that deletion is permanent and cannot be undone.
 */

interface DeleteModalProps {
  open: boolean;
  count: number;
  itemType: string; // e.g. "scan", "strategy", "profile"
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  error?: string;
}

export default function DeleteModal({ open, count, itemType, onConfirm, onCancel, loading, error }: DeleteModalProps) {
  if (!open) return null;

  const plural = count === 1 ? itemType : `${itemType}s`;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={onCancel}
    >
      <div
        className="card"
        style={{ width: '100%', maxWidth: 420, margin: 16 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ color: '#dc2626' }}>Confirm Deletion</h2>
          <TrashIcon size={20} color="#dc2626" />
        </div>
        <div style={{ padding: 24 }}>
          <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 8 }}>
            You are about to permanently delete <strong>{count} {plural}</strong>.
          </p>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
            This action cannot be undone. All associated data will be removed from the database.
          </p>
          {error && <p style={{ fontSize: 13, color: '#dc2626', marginBottom: 12 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="secondary" onClick={onCancel} disabled={loading}>Cancel</button>
            <button
              onClick={onConfirm}
              disabled={loading}
              style={{
                background: '#dc2626', color: '#fff', border: 'none',
                padding: '8px 16px', borderRadius: 4, cursor: loading ? 'wait' : 'pointer',
                fontSize: 13, fontWeight: 500,
              }}
            >
              {loading ? 'Deleting...' : `Delete ${count} ${plural}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
