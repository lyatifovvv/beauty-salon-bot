import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
prisma.portfolioItem.findMany().then(items => {
  console.log(items);
}).finally(() => prisma.$disconnect());
