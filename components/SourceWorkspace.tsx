'use client';

import { useEffect, useState } from 'react';

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
};

export default function SourceWorkspace() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [running, setRunning] = useState('');
  const [notice, setNotice] = useState('');

  const load = () => fetch('/api/scans').then(r => r.json()).then(setRuns);

  useEffect(() => { load(); }, []);

  const scan = async (country: 'UK' | 'NZ') => {
    setRunning(country);
    setNotice(`Scanning ${country}…`);
    try {
      const r = await fetch('/api/scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country }),
      });
      const d = await r.json();
      setNotice(r.ok ? d.output : d.error);
    } catch (e: any) {
      setNotice(`Error: ${e.message}`);
    }
    setRunning('');
    load();
  };

  return (
    <>
      <div className="page-header">
        <h1>Scan</h1>
        <p>Run a Brave Search scan to find companies advertising operational roles.</p>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-head">
          <h2>Brave Search</h2>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Each scan revisits fresh results and rotates through deeper pages. New adverts strengthen existing company profiles instead of creating duplicate leads.
        </p>
        <div className="toolbar">
          <button
            className="primary"
            disabled={!!running}
            onClick={() => scan('UK')}
          >
            {running === 'UK' ? 'Scanning UK…' : 'Scan UK'}
          </button>
          <button
            className="primary"
            disabled={!!running}
            onClick={() => scan('NZ')}
          >
            {running === 'NZ' ? 'Scanning NZ…' : 'Scan NZ'}
          </button>
        </div>
        {notice && <div className="muted">{notice}</div>}
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
                <th>Country</th>
                <th>Page</th>
                <th>Requests</th>
                <th>Results</th>
                <th>Fetched</th>
                <th>Duplicates</th>
                <th>Adverts</th>
                <th>New companies</th>
                <th>Updated</th>
                <th>Contacts</th>
                <th>Errors</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(r => (
                <tr key={r.id}>
                  <td>{new Date(r.startedAt).toLocaleString()}</td>
                  <td>{r.country}</td>
                  <td>0 + {r.deepOffset}</td>
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
          {!runs.length && <div className="empty">No scans yet. Run a UK or NZ scan above.</div>}
        </div>
      </div>
    </>
  );
}
