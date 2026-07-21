import { NextResponse } from 'next/server';
import { getSession, getTenantId } from '@/lib/auth';
import { isV2Enabled } from '@/lib/v2/feature-flag';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isV2Enabled())) return NextResponse.json({ error: 'V2 not enabled' }, { status: 404 });

  const tid = getTenantId(session);
  return NextResponse.json({
    v2: true,
    tenantId: tid,
    modules: ['product-profiles', 'customer-profiles', 'scans', 'libraries', 'companies', 'settings'],
    status: 'under_construction',
  });
}
