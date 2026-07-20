'use client';

import { useState, useRef, useCallback } from 'react';

type Profile = {
  id: number;
  name: string;
  config: any;
};

type UploadResult = {
  ok: boolean;
  message: string;
  stats: {
    total: number;
    created: number;
    updated: number;
    skipped: number;
    scored: number;
    errors: number;
  };
  mapping: Record<string, string>;
  results: { name: string; action: string; id?: number }[];
  batchId?: number;
};

export default function CSVUpload({ profiles }: { profiles: Profile[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [batchName, setBatchName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    setFile(f);
    setError('');
    setResult(null);
    
    // Read and preview
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const lines: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"' && inQuotes && text[i + 1] === '"') { current += '"'; i++; }
        else if (char === '"') { inQuotes = !inQuotes; }
        else if (char === '\n' && !inQuotes) { lines.push(current); current = ''; }
        else if (char !== '\r' || !inQuotes) { current += char; }
      }
      if (current) lines.push(current);
      
      if (lines.length === 0) return;
      
      const parseLine = (line: string): string[] => {
        const fields: string[] = [];
        let field = '';
        let inQ = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"' && inQ && line[i + 1] === '"') { field += '"'; i++; }
          else if (char === '"') { inQ = !inQ; }
          else if (char === ',' && !inQ) { fields.push(field.trim()); field = ''; }
          else { field += char; }
        }
        fields.push(field.trim());
        return fields;
      };
      
      const headers = parseLine(lines[0]);
      const rows = lines.slice(1, 6).filter(l => l.trim()).map(parseLine); // Preview first 5 rows
      setCsvPreview({ headers, rows });
      
      // Auto-suggest batch name from filename
      if (!batchName) {
        const baseName = f.name.replace(/\.csv$/i, '').replace(/[-_]/g, ' ');
        setBatchName(baseName);
      }
    };
    reader.readAsText(f);
  }, [batchName]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith('.csv') || f.type === 'text/csv')) {
      handleFile(f);
    } else {
      setError('Please upload a .csv file');
    }
  };

  const upload = async () => {
    if (!file) { setError('Select a file first'); return; }
    
    setUploading(true);
    setError('');
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (profileId) formData.append('profileId', String(profileId));
      if (batchName) formData.append('batchName', batchName);
      
      const r = await fetch('/api/csv-upload', {
        method: 'POST',
        body: formData,
      });
      
      const d = await r.json();
      
      if (!r.ok) {
        setError(d.error || 'Upload failed');
      } else {
        setResult(d);
      }
    } catch (e: any) {
      setError(e.message);
    }
    
    setUploading(false);
  };

  const reset = () => {
    setFile(null);
    setCsvPreview(null);
    setResult(null);
    setError('');
    setBatchName('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: 6,
    border: '1px solid #d1d5db', fontSize: 14,
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500,
  };

  return (
    <div className="card">
      <div className="card-head">
        <h2>CSV Upload</h2>
      </div>
      
      <p className="muted" style={{ marginTop: 0 }}>
        Upload a CSV with company data from any external source. The system auto-detects columns (company name, website, phone, email, etc.) and scores each company using the selected profile&apos;s rules.
      </p>

      {!result ? (
        <>
          {/* File drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? '#d7ff00' : '#d1d5db'}`,
              borderRadius: 8,
              padding: '32px 20px',
              textAlign: 'center',
              cursor: 'pointer',
              marginBottom: 16,
              background: dragOver ? '#fafdf0' : '#f9fafb',
              transition: 'all 0.15s',
            }}
          >
            {file ? (
              <div>
                <strong>{file.name}</strong>
                <div className="muted" style={{ fontSize: 13 }}>{(file.size / 1024).toFixed(1)} KB</div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
                <div>Drop CSV file here or click to browse</div>
                <div className="muted" style={{ fontSize: 13 }}>Supports .csv files</div>
              </div>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>

          {/* CSV Preview */}
          {csvPreview && (
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Preview (first 5 rows)</label>
              <div style={{ overflow: 'auto', maxHeight: 200, border: '1px solid #e5e7eb', borderRadius: 6 }}>
                <table style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      {csvPreview.headers.map((h, i) => (
                        <th key={i} style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreview.rows.map((row, i) => (
                      <tr key={i}>
                        {csvPreview.headers.map((_, j) => (
                          <td key={j} style={{ padding: '6px 10px', whiteSpace: 'nowrap', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {row[j] || ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Options */}
          <div style={{ display: 'grid', gap: 12, maxWidth: 500, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Scoring Profile (optional)</label>
              <select
                value={profileId || ''}
                onChange={(e) => setProfileId(e.target.value ? parseInt(e.target.value) : null)}
                style={inputStyle}
              >
                <option value="">No scoring profile (basic scoring)</option>
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Scoring rules from this profile will be applied to uploaded companies
              </div>
            </div>

            <div>
              <label style={labelStyle}>Batch Name (optional)</label>
              <input
                style={inputStyle}
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                placeholder="e.g. UK Construction July 2026"
              />
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Companies will be grouped into a batch for easy access
              </div>
            </div>
          </div>

          {error && (
            <div style={{ color: '#dc2626', fontSize: 14, marginBottom: 12 }}>{error}</div>
          )}

          <div className="toolbar">
            <button className="primary" disabled={!file || uploading} onClick={upload}>
              {uploading ? 'Processing…' : 'Upload & Score'}
            </button>
            {file && (
              <button className="secondary" onClick={reset}>Clear</button>
            )}
          </div>
        </>
      ) : (
        /* Results */
        <>
          <div style={{ padding: 16, background: '#f0fdf4', borderRadius: 8, marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>{result.message}</div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 14 }}>
              <div><span className="muted">Total:</span> {result.stats.total}</div>
              <div><span className="muted">Created:</span> {result.stats.created}</div>
              <div><span className="muted">Updated:</span> {result.stats.updated}</div>
              <div><span className="muted">Skipped:</span> {result.stats.skipped}</div>
              <div><span className="muted">Scored:</span> {result.stats.scored}</div>
              {result.stats.errors > 0 && <div style={{ color: '#dc2626' }}><span className="muted">Errors:</span> {result.stats.errors}</div>}
            </div>
          </div>

          {/* Column mapping */}
          {Object.keys(result.mapping).length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Detected column mapping</label>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {Object.entries(result.mapping).map(([field, header]) => (
                  <span key={field} className="pill neutral" style={{ padding: '4px 10px', fontSize: 13 }}>
                    <strong>{field}</strong>: {header}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Company results */}
          {result.results.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Processed companies ({result.results.length} shown{result.stats.total > 100 ? ` of ${result.stats.total}` : ''})</label>
              <div style={{ overflow: 'auto', maxHeight: 300, border: '1px solid #e5e7eb', borderRadius: 6 }}>
                <table style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '6px 10px' }}>Company</th>
                      <th style={{ padding: '6px 10px' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.results.map((r, i) => (
                      <tr key={i}>
                        <td style={{ padding: '6px 10px' }}>{r.name}</td>
                        <td style={{ padding: '6px 10px' }}>
                          <span style={{
                            color: r.action === 'created' ? '#16a34a' : r.action === 'updated' ? '#2563eb' : '#6b7280',
                            fontWeight: 500,
                          }}>
                            {r.action}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="toolbar">
            <button className="primary" onClick={reset}>Upload Another</button>
            <a href="/leads" className="button secondary" style={{ textDecoration: 'none' }}>View Leads →</a>
          </div>
        </>
      )}
    </div>
  );
}
