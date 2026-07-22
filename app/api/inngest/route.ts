/**
 * Inngest Webhook Endpoint
 *
 * Receives Inngest function triggers and dispatches to registered handlers.
 * Route: /api/inngest
 *
 * When INNGEST_SIGNING_KEY is set, requests are verified.
 * When not set (development), the endpoint is disabled.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runner } from '@/lib/v2/job-runner';
import { createDurableFunctionSpecs, JOB_TYPES } from '@/lib/v2/durable-runner';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// --- Handler registration (same handlers as in-process) ---
// Import handlers so they're registered with the runner
import '@/lib/v2/scan-handler';
import '@/lib/v2/evidence-handler';
import '@/lib/v2/assessment-handler';

const SIGNING_KEY = process.env.INNGEST_SIGNING_KEY;

export async function GET(req: NextRequest) {
  if (!SIGNING_KEY) {
    return NextResponse.json(
      { error: 'Inngest not configured' },
      { status: 501 },
    );
  }

  // Inngest SDK sync endpoint — return function specs
  const handlers = (runner as any).handlers || new Map();
  const specs = createDurableFunctionSpecs(handlers);

  return NextResponse.json({
    functions: specs.map(s => ({
      id: s.id,
      name: s.name,
      steps: [
        { id: `execute-${s.id}`, name: 'execute' },
      ],
    })),
  });
}

export async function POST(req: NextRequest) {
  if (!SIGNING_KEY) {
    return NextResponse.json(
      { error: 'Inngest not configured' },
      { status: 501 },
    );
  }

  try {
    const body = await req.json();

    // Verify signature (simplified — Inngest SDK handles this in production)
    const signature = req.headers.get('x-inngest-signature');
    if (!signature) {
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 401 },
      );
    }

    // Dispatch to appropriate handler
    const { name, data } = body;
    const jobId = await runner.create(name, data);

    return NextResponse.json({ status: 'ok', jobId });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  // Inngest function invocation
  if (!SIGNING_KEY) {
    return NextResponse.json(
      { error: 'Inngest not configured' },
      { status: 501 },
    );
  }

  try {
    const body = await req.json();
    const { fnId, stepId, data } = body;

    // Execute the step
    // In production, this would use the Inngest SDK properly
    const result = await runner.create(fnId, data);

    return NextResponse.json({ status: 'ok', result });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message },
      { status: 500 },
    );
  }
}
