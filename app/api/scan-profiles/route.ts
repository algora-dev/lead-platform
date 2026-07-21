import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getSession, getTenantId } from '@/lib/auth';
import { slugifyProfile, SALES_OUTREACH_PROFILE, CONSTRUCTION_QUOTING_PROFILE } from '@/lib/pipeline/scan-profile';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profiles = await prisma.scanProfile.findMany({
    where: { tenantId: getTenantId(session) },
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { scanRuns: true } } },
  });
  return NextResponse.json(profiles);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();

  // Seed defaults if requested
  if (body.seed === true) {
    return await seedDefaults(getTenantId(session));
  }

  const { name, description, config } = body;

  if (!name || !config) {
    return NextResponse.json({ error: 'name and config are required' }, { status: 400 });
  }

  const slug = slugifyProfile(name);

  // Check slug uniqueness
  const existing = await prisma.scanProfile.findFirst({
    where: { tenantId: getTenantId(session), slug },
  });
  if (existing) {
    return NextResponse.json({ error: 'A profile with that name already exists' }, { status: 409 });
  }

  const profile = await prisma.scanProfile.create({
    data: {
      name,
      slug,
      description: description || null,
      config: config as any as object,
      tenantId: getTenantId(session),
    },
  });

  return NextResponse.json(profile, { status: 201 });
}

async function seedDefaults(tenantId: number) {
  const results: any[] = [];

  for (const [name, config] of [
    ['Sales & Outreach Roles', SALES_OUTREACH_PROFILE],
    ['Construction Quoting', CONSTRUCTION_QUOTING_PROFILE],
  ] as [string, typeof SALES_OUTREACH_PROFILE][]) {
    const slug = slugifyProfile(name);
    const existing = await prisma.scanProfile.findFirst({
      where: { tenantId, slug },
    });
    if (existing) {
      results.push({ name, status: 'already exists', id: existing.id });
      continue;
    }
    const profile = await prisma.scanProfile.create({
      data: {
        name,
        slug,
        description: name === 'Sales & Outreach Roles'
          ? 'Find businesses hiring for sales, lead gen, cold calling, and outreach roles'
          : 'Find construction businesses who quote for work — QuoteCore+ prospects',
        config: config as any as object,
        tenantId,
      },
    });
    results.push({ name, status: 'created', id: profile.id });
  }

  return NextResponse.json({ seeded: results });
}
