/**
 * Job Runner Abstraction
 * Interface for durable background job execution.
 * Initial implementation: in-process async runner for development.
 * Future: Vercel Background Functions, Inngest, or self-hosted queue.
 */

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Job {
  id: string;
  type: string;
  status: JobStatus;
  progress: number; // 0-100
  message: string;
  result: any;
  error: string | null;
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
}

export interface JobHandler {
  type: string;
  execute: (jobId: string, payload: any, updateProgress: (progress: number, message: string) => void) => Promise<any>;
}

// --- In-Process Job Runner (development) ---

class InProcessJobRunner {
  private jobs = new Map<string, Job>();
  private handlers = new Map<string, JobHandler>();
  private counter = 0;

  register(handler: JobHandler) {
    this.handlers.set(handler.type, handler);
  }

  async create(type: string, payload: any): Promise<string> {
    const id = `job-${++this.counter}-${Date.now()}`;
    const job: Job = {
      id,
      type,
      status: 'pending',
      progress: 0,
      message: 'Queued',
      result: null,
      error: null,
      startedAt: new Date(),
      completedAt: null,
      createdAt: new Date(),
    };
    this.jobs.set(id, job);

    // Execute async (don't await)
    this.execute(id, type, payload).catch(err => {
      const j = this.jobs.get(id);
      if (j) {
        j.status = 'failed';
        j.error = err.message;
        j.completedAt = new Date();
        j.message = `Failed: ${err.message}`;
      }
    });

    return id;
  }

  private async execute(id: string, type: string, payload: any) {
    const handler = this.handlers.get(type);
    if (!handler) throw new Error(`No handler registered for job type: ${type}`);

    const job = this.jobs.get(id)!;
    job.status = 'running';
    job.message = 'Running';

    const updateProgress = (progress: number, message: string) => {
      const j = this.jobs.get(id);
      if (j) {
        j.progress = Math.min(100, Math.max(0, progress));
        j.message = message;
      }
    };

    const result = await handler.execute(id, payload, updateProgress);

    const j = this.jobs.get(id);
    if (j) {
      j.status = 'completed';
      j.progress = 100;
      j.message = 'Completed';
      j.result = result;
      j.completedAt = new Date();
    }
  }

  getStatus(id: string): Job | null {
    return this.jobs.get(id) || null;
  }

  listActive(scanId?: number, type?: string): Job[] {
    const result: Job[] = [];
    for (const job of this.jobs.values()) {
      if (job.status === 'pending' || job.status === 'running') {
        if (type && job.type !== type) continue;
        if (scanId && (!job.result || job.result.scanId !== scanId)) {
          // Also check payload — but we don't store payload on Job
          // For now, include if type matches; the caller can verify
        }
        result.push(job);
      }
    }
    return result;
  }

  cancel(id: string): boolean {
    const job = this.jobs.get(id);
    if (job && (job.status === 'pending' || job.status === 'running')) {
      job.status = 'cancelled';
      job.completedAt = new Date();
      job.message = 'Cancelled';
      return true;
    }
    return false;
  }

  /**
   * Wait for a job to reach a terminal state.
   * Used with Next.js after() to keep serverless functions alive.
   */
  async waitForCompletion(id: string, timeoutMs = 55000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const job = this.jobs.get(id);
      if (!job) return;
      if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') return;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

// Singleton
const runner = new InProcessJobRunner();
export { runner };
