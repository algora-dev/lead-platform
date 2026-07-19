import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];
  const name = process.argv[4] || '';
  const tenantSlug = process.argv[5] || 't3-labs';

  if (!email || !password) {
    console.log('Usage: npx tsx scripts/seed-user.ts <email> <password> [name] [tenant-slug]');
    process.exit(1);
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) {
    console.error(`Tenant "${tenantSlug}" not found. Create it first.`);
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    console.log(`User ${email} already exists.`);
    process.exit(0);
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash,
      name,
      role: 'ADMIN',
      tenantId: tenant.id,
    },
  });

  console.log(`Created user: ${user.email} (id: ${user.id}, tenant: ${tenant.slug})`);
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
