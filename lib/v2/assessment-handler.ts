/**
 * Assessment Job Handler
 *
 * Runs confidence scoring and combined assessment generation for all
 * candidates in a scan that has completed evidence gathering.
 */

import { prisma } from '@/lib/prisma';
import { runner, type JobHandler } from '@/lib/v2/job-runner';
import { runAssessmentForScan } from '@/lib/v2/assessment';

export const assessmentHandler: JobHandler = {
  type: 'assessment',
  async execute(jobId, payload, updateProgress) {
    const { scanId, tenantId } = payload as { scanId: number; tenantId: number };

    // Verify scan belongs to tenant
    const scan = await prisma.discoveryScan.findFirst({
      where: { id: scanId, tenantId },
      select: { id: true, status: true },
    });

    if (!scan) throw new Error(`Scan ${scanId} not found for tenant ${tenantId}`);

    const result = await runAssessmentForScan(scanId, updateProgress);
    return result;
  },
};

runner.register(assessmentHandler);
