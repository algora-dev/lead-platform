const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const u = await prisma.user.findUnique({ where: { email: 'shaun@t3labs.tech' } });
  console.log(JSON.stringify({ id: u?.id, email: u?.email, tenantId: u?.tenantId, role: u?.role }));
  await prisma.$disconnect();
}

main();
