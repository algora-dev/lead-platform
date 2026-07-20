const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('admintest', 10);
  const updated = await prisma.user.update({
    where: { email: 'shaun@t3labs.tech' },
    data: { email: 'info@t3play.com', passwordHash: hash }
  });
  console.log('Updated:', updated.email);
  await prisma.$disconnect();
}

main();
