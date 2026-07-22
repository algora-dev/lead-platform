/**
 * Durable Job Runner — Inngest Integration
 *
 * Production-grade job execution that survives server restarts.
 * Works with Vercel + Inngest (free tier: 10k executions/month).
 *
 * Setup:
 * 1. npm install inngest
 * 2. Set INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY in .env.local
 * 3. Add API route at app/api/inngest/route.ts
 * 4. Replace in-process runner calls with durable runner in production
 *
 * The in-process runner remains for local development.
 * Use DURABLE_JOBS=true env var to switch to Inngest in production.
 */

import { type JobHandler } from './job-runner';

// --- Inngest Job Types ---

export const JOB_TYPES = {
  DISCOVERY_SCAN: 'discovery-scan',
  EVIDENCE_GATHER: 'evidence-gather',
  ASSESSMENT: 'assessment',
} as const;

export type JobType = typeof JOB_TYPES[keyof typeof JOB_TYPES];

// --- Inngest Function Definitions ---

export interface InngestJobPayload {
  scanId: number;
  tenantId: number;
  strategyId: number;
  jobType: JobType;
}

/**
 * Inngest function definitions to register on the server.
 *
 * Usage in app/api/inngest/route.ts:
 *
 * import { inngest } from '@/lib/v2/inngest-client';
 * import { createDurableFunctions } from '@/lib/v2/durable-runner';
 *
 * const functions = createDurableFunctions();
 * export const { GET, POST, PUT } = serve({ client: inngest, functions });
 *
 * The scan handler, evidence handler, and assessment handler are registered
 * as separate Inngest functions, each with their own retry/timeout config.
 */

export function createDurableFunctionSpecs(handlers: Map<string, JobHandler>) {
  const specs = [];

  for (const [type, handler] of handlers) {
    specs.push({
      id: type,
      name: `${type} job`,
      retries: 2,
      // 5 minute timeout per attempt (Vercel max)
      timeout: 300_000,
      handle: async (event: any, step: any) => {
        const payload = event.data as InngestJobPayload;

        // Execute in steps for better observability
        const result = await step.run(`execute-${type}`, async () => {
          const updateProgress = (progress: number, message: string) => {
            // Inngest doesn't have native progress updates,
            // but we can emit events for the frontend to poll
            step.emit('progress', {
              scanId: payload.scanId,
              progress,
              message,
            });
          };

          return handler.execute(
            `inngest-${event.id}`,
            payload,
            updateProgress,
          );
        });

        return result;
      },
    });
  }

  return specs;
}

// --- Durable Job Client (wraps Inngest for production) ---

export interface DurableJobClient {
  enqueue(jobType: JobType, payload: InngestJobPayload): Promise<string>;
  getStatus(jobId: string): Promise<{
    status: 'queued' | 'running' | 'completed' | 'failed';
    progress: number;
    message: string;
    result?: any;
    error?: string;
  }>;
}

/**
 * Factory: creates a durable job client if Inngest is configured,
 * otherwise returns null (caller falls back to in-process runner).
 */
export function createDurableClient(): DurableJobClient | null {
  const eventKey = process.env.INNGEST_EVENT_KEY;
  if (!eventKey) return null;

  // Dynamic import to avoid loading Inngest in development
  // if it's not installed
  return {
    async enqueue(jobType: JobType, payload: InngestJobPayload): Promise<string> {
      // Use fetch directly to Inngest API (no SDK dependency required)
      const response = await fetch('https://inn.gs/e/key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${eventKey}`,
        },
        body: JSON.stringify({
          name: jobType,
          data: payload,
        }),
      });

      if (!response.ok) {
        throw new Error(`Inngest enqueue failed: ${response.status}`);
      }

      const data = await response.json();
      return data.id || `inngest-${Date.now()}`;
    },

    async getStatus(jobId: string) {
      // Inngest doesn't have a direct status API for event-triggered functions.
      // Status is tracked via the DiscoveryScan record in the database,
      // which handlers update as they progress.
      // This method is a placeholder for future Inngest API integration.
      return {
        status: 'running' as const,
        progress: 0,
        message: 'Job dispatched to Inngest',
      };
    },
  };
}

// --- Unified Runner (durable + in-process fallback) ---

import { runner as inProcessRunner } from './job-runner';

export class UnifiedJobRunner {
  private durableClient: DurableJobClient | null = null;
  private useDurable: boolean;

  constructor() {
    this.useDurable = process.env.DURABLE_JOBS === 'true';
    if (this.useDurable) {
      this.durableClient = createDurableClient();
      if (!this.durableClient) {
        console.warn('[JobRunner] DURABLE_JOBS=true but INNGEST_EVENT_KEY not set. Falling back to in-process.');
        this.useDurable = false;
      }
    }
  }

  register(handler: JobHandler) {
    // Always register with in-process runner as fallback
    inProcessRunner.register(handler);
  }

  async create(type: string, payload: any): Promise<string> {
    if (this.useDurable && this.durableClient) {
      // Enqueue to Inngest for production
      try {
        const jobId = await this.durableClient.enqueue(
          type as JobType,
          payload as InngestJobPayload,
        );
        return jobId;
      } catch (e) {
        console.error('[JobRunner] Durable enqueue failed, falling back to in-process:', e);
        // Fall through to in-process
      }
    }

    // In-process (development or fallback)
    return inProcessRunner.create(type, payload);
  }

  getStatus(id: string) {
    // Check in-process first
    const job = inProcessRunner.getStatus(id);
    if (job) return job;

    // If it's an Inngest job, we'd check Inngest status here
    // For now, return null — the frontend polls the DiscoveryScan record directly
    return null;
  }

  cancel(id: string): boolean {
    return inProcessRunner.cancel(id);
  }
}

// Singleton — replaces direct inProcessRunner imports in production code
export const jobRunner = new UnifiedJobRunner();
