import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') || '';
  const minScore = Number(searchParams.get('minScore') || 0);
  const contactable = searchParams.get('contactable') === '1';
  const multi = searchParams.get('multi') === '1';
  const statusFilter = searchParams.get('status') || '';
  const ids = searchParams.get('ids');

  const where: any = {
    tenantId: session.tenantId,
    discarded: false,
  };
  if (ids) {
    where.id = { in: ids.split(',').map(Number) };
  } else {
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { location: { contains: q, mode: 'insensitive' } },
        { recurringTasks: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (minScore) where.opportunityScore = { gte: minScore };
    if (contactable) where.OR = [{ email: { not: null } }, { phone: { not: null } }];
    if (multi) where.activeJobCount = { gte: 2 };
    if (statusFilter) where.status = statusFilter;
  }

  const companies = await prisma.company.findMany({
    where,
    orderBy: [{ opportunityScore: 'desc' }, { lastSeenAt: 'desc' }],
    select: {
      name: true,
      country: true,
      website: true,
      phone: true,
      email: true,
      location: true,
      industry: true,
      employeeRange: true,
      activeJobCount: true,
      totalJobCount: true,
      estimatedSalarySpend: true,
      opportunityScore: true,
      scoreReason: true,
      status: true,
      firstSeenAt: true,
      lastSeenAt: true,
    },
  });

  const headers = [
    'Company', 'Country', 'Website', 'Phone', 'Email', 'Location',
    'Industry', 'Employees', 'Active Jobs', 'Total Jobs',
    'Est. Salary Spend', 'Score', 'Status', 'Score Reason',
    'First Seen', 'Last Seen',
  ];

  const escapeCSV = (val: unknown) => {
    const s = val == null ? '' : String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const rows = companies.map(c => [
    c.name, c.country, c.website, c.phone, c.email, c.location,
    c.industry, c.employeeRange, c.activeJobCount, c.totalJobCount,
    c.estimatedSalarySpend, c.opportunityScore, c.status,
    c.scoreReason,
    new Date(c.firstSeenAt).toLocaleDateString('en-GB'),
    new Date(c.lastSeenAt).toLocaleDateString('en-GB'),
  ].map(escapeCSV).join(','));

  const csv = [headers.join(','), ...rows].join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="leads-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
