import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getAvailableSources } from '@/lib/sources/registry';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sources = getAvailableSources().map(s => ({
    id: s.id,
    name: s.name,
    requiresApiKey: s.requiresApiKey,
    envKey: s.envKey,
  }));

  return NextResponse.json({ sources });
}
