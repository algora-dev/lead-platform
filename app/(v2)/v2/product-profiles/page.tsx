import { isV2Enabled } from '@/lib/v2/feature-flag';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function ProductProfilesPage() {
  if (!(await isV2Enabled())) redirect('/');
  return (
    <div className="page-header">
      <h1>Product Profiles</h1>
      <p>Define what you sell — problems solved, outcomes, keywords, technologies.</p>
      <div className="card" style={{ marginTop: 24 }}>
        <div className="empty">
          <p>Product Profiles module — coming in Stage 2.</p>
        </div>
      </div>
    </div>
  );
}
