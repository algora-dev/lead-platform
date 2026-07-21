import { isV2Enabled } from '@/lib/v2/feature-flag';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function CustomerProfilesPage() {
  if (!(await isV2Enabled())) redirect('/');
  return (
    <div className="page-header">
      <h1>Customer Profiles</h1>
      <p>Define your ideal customer — industries, locations, signals, decision makers.</p>
      <div className="card" style={{ marginTop: 24 }}>
        <div className="empty">
          <p>Customer Profiles module — coming in Stage 2.</p>
        </div>
      </div>
    </div>
  );
}
