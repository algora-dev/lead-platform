import { isV2Enabled } from '@/lib/v2/feature-flag';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function V2Dashboard() {
  if (!(await isV2Enabled())) redirect('/');

  return (
    <div className="page-header">
      <h1>V2 Dashboard</h1>
      <p>Evidence-Based Opportunity Discovery Platform</p>
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-head"><h2>Getting Started</h2></div>
        <div style={{ padding: 16 }}>
          <p>The V2 platform is under construction. Available modules will appear here as they are built.</p>
          <ul style={{ lineHeight: 2 }}>
            <li><a href="/v2/product-profiles">Product Profiles</a> — Define what you sell</li>
            <li><a href="/v2/customer-profiles">Customer Profiles</a> — Define who you want to reach</li>
            <li><a href="/v2/scans">Scans</a> — Run discovery scans</li>
            <li><a href="/v2/libraries">Scan Libraries</a> — Organise your scans</li>
            <li><a href="/v2/companies">Companies</a> — View discovered companies</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
