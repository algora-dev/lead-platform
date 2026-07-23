/**
 * POST /api/v2/scans/[id]/evidence
 * Triggers evidence gathering for a scan that has completed discovery.
 * Accepts optional { candidateIds, refresh } in body.
 * - If candidateIds provided: gather evidence for those specific candidates
 * - If candidateIds omitted: use candidates with selectedForEvidence = true
 * - refresh=true: re-gather even if already gathered
 */

import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getSession, getTenantId } from '@/lib/auth';
import { runner } from '@/lib/v2/job-runner';
import '@/lib/v2/evidence-handler'; // register handler

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const tid = getTenantId(session);
  const scanId = parseInt(id);

  const scan = await prisma.discoveryScan.findFirst({
    where: { id: scanId, tenantId: tid },
    include: {
      candidates: { select: { id: true, evidenceGathered: true, selectedForEvidence: true } },
    },
  });

  if (!scan) return NextResponse.json({ error: 'Scan not found' }, { status: 404 });

  if (scan.status !== 'COMPLETED' && scan.status !== 'EVIDENCE_COMPLETE') {
    return NextResponse.json(
      { error: `Cannot gather evidence for scan with status: ${scan.status}. Discovery must be complete.` },
      { status: 400 }
    );
  }

  // Parse body
  let body: { candidateIds?: number[]; refresh?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine
  }

  // Determine which candidates to process
  let targetCandidateIds: number[];

  if (body.candidateIds && Array.isArray(body.candidateIds) && body.candidateIds.length > 0) {
    // Validate all IDs belong to this scan
    const validIds = scan.candidates.map(c => c.id);
    const invalid = body.candidateIds.filter(id => !validIds.includes(id));
    if (invalid.length > 0) {
      return NextResponse.json({
        error: `${invalid.length} candidate ID(s) do not belong to scan ${scanId}`,
      }, { status: 400 });
    }
    targetCandidateIds = body.candidateIds;
  } else {
    // Use selectedForEvidence candidates
    targetCandidateIds = scan.candidates
      .filter(c => c.selectedForEvidence)
      .map(c => c.id);

    if (targetCandidateIds.length === 0) {
      return NextResponse.json({
        error: 'No candidates selected for evidence gathering. Select candidates first or pass candidateIds in body.',
      }, { status: 400 });
    }
  }

  // Filter out already-gathered unless refresh
  if (!body.refresh) {
    const gatheredSet = new Set(scan.candidates.filter(c => c.evidenceGathered).map(c => c.id));
    targetCandidateIds = targetCandidateIds.filter(id => !gatheredSet.has(id));
  }

  if (targetCandidateIds.length === 0) {
    return NextResponse.json({
      error: 'All target candidates already have evidence gathered. Use refresh=true to re-gather.',
    }, { status: 400 });
  }

  // Check for existing active evidence job
  const activeJobs = await runner.listActive(scanId, 'evidence-gathering');
  if (activeJobs.length > 0) {
    return NextResponse.json({
      error: 'Evidence gathering already in progress for this scan',
      jobId: activeJobs[0].id,
    }, { status: 409 });
  }

  // Create evidence gathering job with frozen candidate IDs
  const jobId = await runner.create('evidence-gathering', {
    scanId: scan.id,
    tenantId: tid,
    candidateIds: targetCandidateIds,
    refresh: body.refresh || false,
  });

  return NextResponse.json({
    scanId: scan.id,
    jobId,
    candidateCount: targetCandidateIds.length,
  }, { status: 202 });
}

/**
 * GET /api/v2/scans/[id]/evidence
 * Returns evidence items and claims for a scan.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const tid = getTenantId(session);

  const scan = await prisma.discoveryScan.findFirst({
    where: { id: parseInt(id), tenantId: tid },
    select: { id: true, status: true },
  });

  if (!scan) return NextResponse.json({ error: 'Scan not found' }, { status: 404 });

  const evidenceItems = await prisma.evidenceItem.findMany({
    where: { scanId: scan.id },
    include: {
      claims: {
        select: {
          id: true,
          claimType: true,
          claimValue: true,
          claimData: true,
          supports: true,
        },
      },
      company: {
        select: { id: true, name: true, domain: true, website: true },
      },
    },
    orderBy: { collectedAt: 'desc' },
  });

  const summary = {
    totalItems: evidenceItems.length,
    totalClaims: evidenceItems.reduce((sum, item) => sum + item.claims.length, 0),
    byType: {} as Record<string, number>,
    byCompany: {} as Record<string, { name: string; items: number }>,
  };

  for (const item of evidenceItems) {
    summary.byType[item.evidenceType] = (summary.byType[item.evidenceType] || 0) + 1;
    const key = String(item.companyId);
    if (!summary.byCompany[key]) {
      summary.byCompany[key] = { name: item.company.name, items: 0 };
    }
    summary.byCompany[key].items++;
  }

  return NextResponse.json({ summary, items: evidenceItems });
}
