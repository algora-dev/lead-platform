import { isV2Enabled } from '@/lib/v2/feature-flag';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function V2CompaniesPage() {
  if (!(await isV2Enabled())) redirect('/');
  return (
    <div className="page-header">
      <h1>Companies</h1>
      <p>View discovered companies with evidence, scores and outreach rationale.</p>
      <div className="card" style={{ marginTop: 24 }}>
        <div className="empty">
          <p>Companies module — coming in Stage 7.</p>
        </div>
      </div>
    </div>
  );
}
