# Agent handoff

## Current state
This is an early working local prototype, not production SaaS. It uses Next.js, Prisma and SQLite for the dashboard and Python for the scan pipeline.

The repository has been reorganised so tenant-specific behaviour starts in `tenants/internal/`. The first goal is to get this tenant running reliably on Windows before expanding the platform.

## Environment
Create `.env` in the project root. Expected values:

```env
BRAVE_API_KEY=replace_me
DATABASE_URL="file:./dev.db"
TENANT_ID=internal
```

Do not commit `.env`, `prisma/dev.db`, `.venv`, `node_modules` or `.next`.

## Setup on Windows
```powershell
cd "C:\path\to\lead-intelligence-platform-agent-handoff"
npm install
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
npm run db:push
npm run dev
```

Open `http://localhost:3000`, choose Sources, and run a UK or NZ scan.

## What is already implemented
- company-centred database;
- job adverts linked as evidence;
- repeat advert and repeat task scoring;
- positive-only score calculation;
- salary, contact and employee-size signals;
- UK and NZ Brave scans;
- rotating deeper Brave pages;
- scan history;
- company filters, status, notes and batches;
- tenant branding and scoring configuration files.

## Known limitations
- company name matching is simplistic;
- employee count extraction is weak and relies on public-page text;
- generic contact extraction may collect irrelevant addresses;
- active advert expiry is not yet implemented;
- scan execution is synchronous through a web request;
- only one tenant is loaded at runtime;
- tenant fields and columns are not yet fully dynamic;
- no authentication, permissions, outreach or production hosting.

## Definition of a good next change
A change should either improve lead quality/reliability for the internal tenant or make customer demos configurable without duplicating application code. Avoid broad rewrites until the existing local scan is tested.
