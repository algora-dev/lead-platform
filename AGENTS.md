# Agent instructions

## Product goal
This repository is a configurable lead-intelligence platform. The company or organisation is the lead. Source records such as job adverts are evidence that strengthens a living company profile.

The current internal tenant finds UK and New Zealand businesses advertising jobs that contain operational tasks. Recruitment activity proves willingness to spend money solving a problem. The platform then scores the business using only positive evidence and helps the operator contact it.

## Non-negotiable principles
- Never score whether a whole job can be replaced.
- Never subtract points because work is physical, clinical, technical, sales-related, or industry-specific.
- A low-detail advert may still identify a valuable company; do not discard it merely for a low score.
- Multiple adverts for the same company, especially repeated task signals, must strengthen the company profile.
- Customer-specific branding, queries, task fields, scoring and feature visibility belong in `tenants/<tenant-id>/`, not hard-coded in application code.
- Keep the collector/parser/intelligence/pipeline modules small and interchangeable.
- Preserve `.env`, local databases and user data.
- Do not reinstall dependencies, delete folders, run destructive database commands or push to GitHub without explicit approval.

## Current architecture
- `app/`, `components/`, `lib/`: Next.js dashboard and API routes.
- `prisma/`: SQLite data model. Company is the primary lead entity; JobAdvert is supporting evidence.
- `scripts/config.py`: loads tenant configuration.
- `scripts/collector.py`: source search and collection.
- `scripts/parser.py`: page parsing and field extraction.
- `scripts/intelligence.py`: task extraction, enrichment and positive-only scoring.
- `scripts/pipeline.py`: orchestration and storage.
- `tenants/internal/`: first live tenant configuration.
- `docs/`: product brief, handoff and roadmap.

## Working method
1. Read `docs/PRODUCT_BRIEF.md` and `docs/HANDOFF.md` before changing architecture.
2. Inspect `git status` and avoid overwriting uncommitted user changes.
3. Make the smallest modular change that satisfies the request.
4. Run relevant checks.
5. Report changed files, commands run, results, risks and any migration needed.

## Commands
```powershell
npm install
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
npm run db:push
npm run dev
npm run build
.\.venv\Scripts\python.exe -m unittest discover -s tests
```

## Near-term priorities
1. Validate the current scanner end to end using Brave in UK and NZ.
2. Improve company matching and deduplication without losing legitimate businesses.
3. Add CSV upload through the same normalisation/scoring pipeline.
4. Make dashboard labels and columns tenant-configurable.
5. Add a demo-tenant generator and safe demo data isolation.
6. Only then add outreach queues, templates, users and integrations.
