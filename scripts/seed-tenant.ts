import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';

async function main() {
  // 1. Create T3 Labs tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 't3-labs' },
    update: {},
    create: {
      name: 'T3 Labs',
      slug: 't3-labs',
      branding: {
        businessName: 'T3 Labs',
        productName: 'Lead Intelligence',
        tagline: 'Find your next customer',
        primaryColor: '#0a0b10',
        accentColor: '#d7ff00',
        backgroundColor: '#fbfcff',
      },
      features: {
        scanUK: true,
        scanNZ: true,
        batches: true,
      },
    },
  });
  console.log(`Tenant: ${tenant.name} (id: ${tenant.id}, slug: ${tenant.slug})`);

  // 2. Update existing user to have tenantId
  const existing = await prisma.user.findFirst({ where: { email: 'shaun@t3labs.tech' } });
  if (existing && !existing.tenantId) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { tenantId: tenant.id },
    });
    console.log(`Updated user ${existing.email} → tenantId: ${tenant.id}`);
  } else if (existing) {
    console.log(`User ${existing.email} already has tenantId: ${existing.tenantId}`);
  } else {
    // Create admin user
    const passwordHash = await hashPassword('LeadIntel2026!');
    const user = await prisma.user.create({
      data: {
        email: 'shaun@t3labs.tech',
        passwordHash,
        name: 'Shaun',
        role: 'ADMIN',
        tenantId: tenant.id,
      },
    });
    console.log(`Created admin user: ${user.email} (tenantId: ${tenant.id})`);
  }

  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
