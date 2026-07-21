const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  // Create T3 Labs tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 't3-labs' },
    update: {},
    create: {
      name: 'T3 Labs',
      slug: 't3-labs',
      branding: { primaryColor: '#d7ff00', name: 'T3 Labs' },
      features: { v2: true, csv: true },
    },
  });
  console.log('Tenant created:', tenant.id, tenant.name);

  // Create admin user
  const hashed = await bcrypt.hash('T3Labs2024!', 10);
  const user = await prisma.user.upsert({
    where: { email: 'shaun@t3labs.co.uk' },
    update: {},
    create: {
      id: 1,
      email: 'shaun@t3labs.co.uk',
      passwordHash: hashed,
      name: 'Shaun',
      role: 'ADMIN',
      tenantId: tenant.id,
    },
  });
  console.log('User created:', user.id, user.email);

  // Create default scan library
  const lib = await prisma.scanLibrary.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Default' } },
    update: {},
    create: { tenantId: tenant.id, name: 'Default', description: 'Default scan library' },
  });
  console.log('Library created:', lib.id, lib.name);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
