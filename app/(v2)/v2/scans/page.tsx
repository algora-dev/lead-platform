import { isV2Enabled } from '@/lib/v2/feature-flag';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function V2ScansPage() {
  if (!(await isV2Enabled())) redirect('/');
  return (
    <div className="page-header">
      <h1>Discovery Scans</h1>
      <p>Run scans using compiled discovery strategies.</p>
      <div className="card" style={{ marginTop: 24 }}>
        <div className="empty">
          <p>Scans module — coming in Stage 4.</p>
        </div>
      </div>
    </div>
  );
}
