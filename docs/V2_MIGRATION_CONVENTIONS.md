# V2 Migration Conventions

## Principles

1. **Additive first** — new tables are added without dropping or altering V1 tables.
2. **Checked-in Prisma migrations** — every schema change is a numbered migration file.
3. **Backfill before switch** — data is migrated into new tables before reads move.
4. **Switch reads before retiring writes** — V1 writes remain until V2 is confirmed.
5. **No destructive changes during cutover** — legacy tables are dropped only in a later approved migration after V2 is stable.
6. **Backfills are resumable/idempotent** — they can be re-run safely.

## Production data inventory (as of 2026-07-21)

Database: Supabase PostgreSQL (lead-intelligence, ref: gvffuwhnmpbnjpzdnwpu)

### V1 Tables

| Table | Purpose | V2 Fate |
|---|---|---|
| Tenant | Multi-tenant org | **Keep** — add branding/features columns if needed |
| User | Auth users | **Keep** — no changes |
| Company | Lead companies | **Keep** — stable identity fields preserved; scores become legacy |
| JobAdvert | Job evidence | **Migrate** → EvidenceItem/EvidenceClaim (Stage 9) |
| Batch | Scan containers | **Migrate** → ScanLibrary + DiscoveryScan (Stage 9) |
| ScanProfile | Combined offer/ICP/queries | **Migrate** → legacy strategy snapshots (Stage 9) |
| ScanRun | Scan execution records | **Migrate** → DiscoveryScan (Stage 9) |
| ContactLog | Contact history | **Keep** — may become EvidenceClaim subtype or stay as-is |
| FilterPreset | UI filter presets | **Keep** — UI-only, no domain impact |
| LeadsParent | Lead list containers | **Migrate** → ScanLibrary (Stage 9) |
| ScanLeadFlag | Rescan change flags | **Retire** — replaced by AssessmentSnapshot comparison |

### New V2 Tables (Stage 1)

| Table | Purpose |
|---|---|
| ProductProfile + ProductProfileVersion | Offer definitions with immutable versions |
| CustomerProfile + CustomerProfileVersion | ICP definitions with immutable versions |
| DiscoveryStrategy | Compiled strategy snapshot |
| ScanLibrary | User-managed scan container |
| DiscoveryScan | Scan execution record |
| ScanCandidate | Links scan to company with Profile Score |
| CompanyAlias | Known aliases for identity resolution |
| CompanyProviderIdentity | Provider-specific IDs (Apollo, etc.) |
| EvidenceItem | Immutable source observation |
| EvidenceClaim | Atomic normalised fact from evidence |
| ProviderRun | Provider execution tracking |
| AssessmentSnapshot | Immutable score snapshot |

## Migration procedure per stage

1. Write the Prisma migration (additive only unless explicitly approved).
2. Test migration locally against a copy of production data.
3. Run `npx prisma migrate dev --name <descriptive_name>`.
4. Commit the migration file.
5. If backfill is needed, write an idempotent `scripts/migrate-*.ts` script.
6. Run backfill against staging, validate counts and samples.
7. Run backfill against production after deploy.
8. Switch reads to new tables in application code.
9. Legacy writes remain active until explicitly retired.

## Rollback

- Additive migrations are safe to leave in place if rolled back.
- Backfill scripts must be idempotent and track progress.
- If a read switch fails, revert the code change — old tables still work.
- Destructive migrations (dropping legacy tables) are a separate, explicitly approved step after V2 is confirmed stable.

## Backup

Before any migration stage:
```bash
pg_dump "$DATABASE_URL" > backup-YYYY-MM-DD-stageN.sql
```
Store backups in the project's backup directory (not in git).
