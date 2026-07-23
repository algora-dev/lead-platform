'use client';

import { useState } from 'react';
import { CheckIcon, ArrowUpIcon, ArrowDownIcon, EditIcon, CloseIcon } from './Icons';

export interface KeywordItem {
  keyword: string;
  points: number;
  rationale?: string;
}

interface KeywordEditorProps {
  keywords: KeywordItem[];
  onChange: (keywords: KeywordItem[]) => void;
  maxKeywords?: number;
}

export default function KeywordEditor({ keywords, onChange, maxKeywords = 10 }: KeywordEditorProps) {
  const [newKeyword, setNewKeyword] = useState('');
  const [newPoints, setNewPoints] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editKeyword, setEditKeyword] = useState('');
  const [editPoints, setEditPoints] = useState('');

  const totalPoints = keywords.reduce((sum, k) => sum + k.points, 0);
  const pointsValid = totalPoints === 100;

  const moveUp = (index: number) => {
    if (index === 0) return;
    const next = [...keywords];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next);
  };

  const moveDown = (index: number) => {
    if (index === keywords.length - 1) return;
    const next = [...keywords];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    onChange(next);
  };

  const remove = (index: number) => {
    onChange(keywords.filter((_, i) => i !== index));
  };

  const startEdit = (index: number) => {
    setEditingIndex(index);
    setEditKeyword(keywords[index].keyword);
    setEditPoints(String(keywords[index].points));
  };

  const saveEdit = () => {
    if (editingIndex === null) return;
    const points = parseInt(editPoints) || 0;
    if (!editKeyword.trim() || points < 1 || points > 100) return;
    const next = [...keywords];
    next[editingIndex] = { ...next[editingIndex], keyword: editKeyword.trim(), points };
    onChange(next);
    setEditingIndex(null);
  };

  const addKeyword = () => {
    if (keywords.length >= maxKeywords) return;
    const points = parseInt(newPoints) || 0;
    if (!newKeyword.trim() || points < 1 || points > 100) return;
    onChange([...keywords, { keyword: newKeyword.trim(), points }]);
    setNewKeyword('');
    setNewPoints('');
  };

  const pointsColor = pointsValid ? '#16a34a' : totalPoints > 100 ? '#dc2626' : '#ca8a04';

  return (
    <div>
      <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 14 }}>Scoring Keywords ({keywords.length}/{maxKeywords})</strong>
        <span style={{ fontSize: 13, fontWeight: 600, color: pointsColor, display: 'flex', alignItems: 'center', gap: 4 }}>
          Total: {totalPoints}/100 {pointsValid && <CheckIcon size={13} color={pointsColor} />}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {keywords.map((kw, i) => (
          <div key={i} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 10px',
            border: '1px solid #e5e7eb',
            borderRadius: 4,
            background: '#fafafa',
          }}>
            <span style={{ color: '#9ca3af', fontSize: 12, minWidth: 20 }}>{i + 1}.</span>

            {editingIndex === i ? (
              <>
                <input
                  value={editKeyword}
                  onChange={e => setEditKeyword(e.target.value)}
                  style={{ flex: 1, padding: '2px 6px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 3 }}
                />
                <input
                  type="number"
                  value={editPoints}
                  onChange={e => setEditPoints(e.target.value)}
                  style={{ width: 60, padding: '2px 6px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 3 }}
                  min={1}
                  max={100}
                />
                <button onClick={saveEdit} style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 12 }}>Save</button>
                <button onClick={() => setEditingIndex(null)} style={{ background: '#e5e7eb', border: 'none', borderRadius: 3, padding: '2px 8px', cursor: 'pointer', fontSize: 12 }}>Cancel</button>
              </>
            ) : (
              <>
                <span style={{ flex: 1, fontSize: 13 }}>{kw.keyword}</span>
                <span style={{ fontSize: 13, fontWeight: 600, minWidth: 50, textAlign: 'right', color: '#2563eb' }}>{kw.points} pts</span>
                <button onClick={() => moveUp(i)} disabled={i === 0} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 3, cursor: i === 0 ? 'default' : 'pointer', padding: '2px 4px', opacity: i === 0 ? 0.4 : 1, display: 'flex', alignItems: 'center' }}><ArrowUpIcon size={12} /></button>
                <button onClick={() => moveDown(i)} disabled={i === keywords.length - 1} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 3, cursor: i === keywords.length - 1 ? 'default' : 'pointer', padding: '2px 4px', opacity: i === keywords.length - 1 ? 0.4 : 1, display: 'flex', alignItems: 'center' }}><ArrowDownIcon size={12} /></button>
                <button onClick={() => startEdit(i)} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 3, cursor: 'pointer', padding: '2px 6px', display: 'flex', alignItems: 'center' }}><EditIcon size={12} /></button>
                <button onClick={() => remove(i)} style={{ background: 'none', border: '1px solid #fca5a5', borderRadius: 3, cursor: 'pointer', padding: '2px 6px', color: '#dc2626', display: 'flex', alignItems: 'center' }}><CloseIcon size={12} /></button>
              </>
            )}
          </div>
        ))}
      </div>

      {keywords.length < maxKeywords && (
        <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
          <input
            value={newKeyword}
            onChange={e => setNewKeyword(e.target.value)}
            placeholder="Keyword"
            style={{ flex: 1, padding: '4px 8px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 3 }}
            onKeyDown={e => e.key === 'Enter' && addKeyword()}
          />
          <input
            type="number"
            value={newPoints}
            onChange={e => setNewPoints(e.target.value)}
            placeholder="pts"
            style={{ width: 60, padding: '4px 8px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 3 }}
            min={1}
            max={100}
            onKeyDown={e => e.key === 'Enter' && addKeyword()}
          />
          <button onClick={addKeyword} className="secondary" style={{ fontSize: 12, padding: '4px 10px' }}>+ Add</button>
        </div>
      )}

      {keywords.length > 0 && keywords[0].rationale && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: 12, cursor: 'pointer', color: '#6b7280' }}>AI rationale for each keyword</summary>
          <ul style={{ fontSize: 12, marginLeft: 16, marginTop: 4, color: '#6b7280' }}>
            {keywords.filter(k => k.rationale).map((k, i) => (
              <li key={i}><strong>{k.keyword}</strong> ({k.points}pts): {k.rationale}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
