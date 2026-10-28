import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const POOL_SIZE = Number(process.env.DATABASE_POOL_SIZE ?? 10);

// Prisma's 2 s default was too short for the first TLS connection to a sleeping Neon database.
const TRANSACTION_OPTIONS = {
  maxWait: 5000,
  timeout: 10000,
};

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: POOL_SIZE,
});

export const prisma = new PrismaClient({ adapter, transactionOptions: TRANSACTION_OPTIONS });

export async function checkDatabase() {
  await prisma.$queryRaw`SELECT 1`;
}

export async function disconnectDatabase() {
  await prisma.$disconnect();
}
