const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function clean() {
  await prisma.jobAdvert.deleteMany({});
  await prisma.company.deleteMany({});
  await prisma.batch.deleteMany({});
  await prisma.scanRun.deleteMany({});
  console.log('Test data cleaned');
  await prisma.$disconnect();
}

clean().catch(e => { console.error(e); process.exit(1); });
