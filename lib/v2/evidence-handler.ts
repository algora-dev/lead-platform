/**
 * Evidence Gathering Job Handler
 *
 * Registered with the JobRunner. Runs the Evidence Engine for a scan
 * that has already completed discovery. Can be triggered:
 *  - Automatically after discovery (if strategy has evidence priorities)
 *  - Manually via POST /api/v2/scans/[id]/evidence
 */

import { prisma } from '@/lib/prisma';
import { runner, type JobHandler } from '@/lib/v2/job-runner';
import { runEvidenceEngine } from '@/lib/v2/evidence-engine';

export const evidenceGatheringHandler: JobHandler = {
  type: 'evidence-gathering',
  async execute(jobId, payload, updateProgress) {
    const { scanId, tenantId } = payload as { scanId: number; tenantId: number };

    const result = await runEvidenceEngine(scanId, tenantId, updateProgress);

    return result;
  },
};

// Register handler
runner.register(evidenceGatheringHandler);
