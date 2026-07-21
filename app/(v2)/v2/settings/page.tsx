import { isV2Enabled } from '@/lib/v2/feature-flag';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function V2SettingsPage() {
  if (!(await isV2Enabled())) redirect('/');
  return (
    <div className="page-header">
      <h1>Settings</h1>
      <p>Platform configuration, branding, data sources and feature flags.</p>
      <div className="card" style={{ marginTop: 24 }}>
        <div className="empty">
          <p>Settings module — coming soon.</p>
        </div>
      </div>
    </div>
  );
}
