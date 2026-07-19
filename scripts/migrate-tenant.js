const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Create Tenant table
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Tenant" (
    id SERIAL PRIMARY KEY,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    branding JSONB,
    features JSONB
  )`);
  console.log('Tenant table ready');

  // Insert T3 Labs tenant
  await prisma.$executeRawUnsafe(`INSERT INTO "Tenant" (name, slug, branding, features)
    VALUES ('T3 Labs', 't3-labs', '{"businessName":"T3 Labs","productName":"Lead Intelligence","accentColor":"#d7ff00"}', '{"scanUK":true,"scanNZ":true}')
    ON CONFLICT (slug) DO NOTHING`);
  console.log('T3 Labs tenant inserted');

  // Add tenantId columns with default = 1
  const tables = ['User', 'Company', 'Batch', 'ScanRun'];
  for (const table of tables) {
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "tenantId" INTEGER NOT NULL DEFAULT 1`);
      console.log(`Added tenantId to ${table}`);
    } catch(e) { console.log(`Skipped ${table}: ${e.message}`); }
  }

  // Add foreign keys
  for (const table of tables) {
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD CONSTRAINT "${table}_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON DELETE CASCADE`);
      console.log(`FK added for ${table}`);
    } catch(e) { console.log(`FK skipped for ${table}: ${e.message}`); }
  }

  // Update Company unique constraint
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Company" DROP CONSTRAINT IF EXISTS "Company_normalizedName_country_key"`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Company" ADD CONSTRAINT "Company_tenantId_normalizedName_country_key" UNIQUE ("tenantId", "normalizedName", "country")`);
    console.log('Company unique constraint updated');
  } catch(e) { console.log(`Company constraint: ${e.message}`); }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
