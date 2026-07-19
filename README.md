# Lead Intelligence Platform — agent handoff build

A configurable, company-centred lead-intelligence prototype. The current tenant uses UK and New Zealand job adverts as evidence that an employer is actively spending money to solve operational problems.

## Start here
1. Read `AGENTS.md`.
2. Read `docs/PRODUCT_BRIEF.md` and `docs/HANDOFF.md`.
3. Copy `.env.example` to `.env` and add your Brave API key.
4. Install and run locally using the commands below.

```powershell
npm install
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
npm run db:push
npm run dev
```

Open `http://localhost:3000`.

## Modular business logic
```text
scripts/config.py         tenant configuration loader
scripts/collector.py      Brave queries and result collection
scripts/parser.py         job-page extraction
scripts/intelligence.py   signals, enrichment and scoring
scripts/pipeline.py       orchestration and database writes
```

Customer-specific inputs live in:

```text
tenants/internal/
  branding.json
  sources.json
  fields.json
  scoring.json
  features.json
```

Create another configuration template with:

```powershell
.\.venv\Scripts\python.exe scripts\create_tenant.py demo-acme --business-name "Acme Ltd"
```

This is a local prototype. Read the documented limitations before treating it as a commercial multi-tenant system.
