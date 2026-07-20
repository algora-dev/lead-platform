import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import LeadDetail from '@/components/LeadDetail';

export const dynamic = 'force-dynamic';

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { id } = await params;

  const company = await prisma.company.findFirst({
    where: { id: Number(id), tenantId: session.tenantId },
    include: {
      jobs: { orderBy: { lastSeenAt: 'desc' } },
      contactLogs: { orderBy: { createdAt: 'desc' } },
      batches: { select: { id: true, name: true } },
    },
  });

  if (!company) redirect('/leads');

  return <LeadDetail company={JSON.parse(JSON.stringify(company))} />;
}
