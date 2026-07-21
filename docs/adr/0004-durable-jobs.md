# ADR-0004: Durable job runner for scans and evidence

Date: 2026-07-21
Status: Accepted (interface defined; provider deferred to Stage 4)

## Context

V1 ran the entire scan pipeline synchronously inside the API request handler.
This caused Vercel function timeouts (default 10s) and made retries, progress
tracking and cancellation impossible.

## Decision

Introduce a `JobRunner` abstraction with a replaceable provider:

- **Interface** in `modules/jobs/` — `createJob`, `getStatus`, `cancel`,
  `subscribe` (optional).
- **Jobs are idempotent** — duplicate submissions for the same scan do not
  double-collect.
- **Jobs are resumable** — a failed provider does not restart completed providers.
- **Jobs are safe to retry** — retries check existing state before re-running.
- **HTTP handlers create jobs and return immediately** — the API responds with
  a job/scan ID and the client polls for progress.

The concrete provider is deferred to Stage 4. Initial implementation can use
an in-process async runner for development, with a durable provider (e.g.
Vercel Background Functions, Inngest, or a self-hosted queue) selected before
production scans.

## Consequences

- Scan API routes become thin: validate input, create job, return ID.
- Frontend needs progress polling or subscription.
- Provider adapters must be resumable and idempotent.
- Cost tracking and rate limits are per-provider-run, not per-scan.
- Vercel `maxDuration` is still set as a safety net, but the handler returns
  in <2s regardless of scan size.
