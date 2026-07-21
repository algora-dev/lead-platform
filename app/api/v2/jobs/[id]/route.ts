import { NextRequest, NextResponse } from 'next/server';
import { runner } from '@/lib/v2/job-runner';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const job = runner.getStatus(id);

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json({
    id: job.id,
    type: job.type,
    status: job.status,
    progress: job.progress,
    message: job.message,
    error: job.error,
    result: job.result,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
  });
}
