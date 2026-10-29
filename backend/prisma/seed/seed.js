import { readFileSync } from 'node:fs';
import { disconnectDatabase, prisma } from '../../src/core/database/prisma.js';
import { logger } from '../../src/core/logger.js';
import { hashPassword } from '../../src/modules/auth_module/auth.password.js';
import { seedAdmins, seedAuthors } from '../../src/modules/auth_module/auth.seed.js';
import { seedBooks } from '../../src/modules/book_module/book.seed.js';
import { parseDataset } from './dataset.js';

const DATASET_FILE = new URL('../../../bookleaf_sample_data.json', import.meta.url);
const MIN_SEED_PASSWORD_LENGTH = 8;
const SEED_TRANSACTION_OPTIONS = { maxWait: 10000, timeout: 120000 };

function readSeedPassword(name) {
  const password = process.env[name];
  if (!password || password.length < MIN_SEED_PASSWORD_LENGTH) {
    throw new Error(`${name} must be set and at least ${MIN_SEED_PASSWORD_LENGTH} characters long`);
  }
  return password;
}

async function seed() {
  const authorPassword = readSeedPassword('SEED_AUTHOR_PASSWORD');
  const adminPassword = readSeedPassword('SEED_ADMIN_PASSWORD');

  const { authors, warnings } = parseDataset(JSON.parse(readFileSync(DATASET_FILE, 'utf8')));
  for (const warning of warnings) {
    logger.warn(warning);
  }

  const [authorPasswordHash, adminPasswordHash] = await Promise.all([
    hashPassword(authorPassword),
    hashPassword(adminPassword),
  ]);

  const summary = await prisma.$transaction(async (tx) => {
    const authorIdByCode = await seedAuthors(tx, authors, authorPasswordHash);
    const admins = await seedAdmins(tx, adminPasswordHash);
    const books = await seedBooks(tx, authors, authorIdByCode);
    return { authors: authorIdByCode.size, admins, books, warnings: warnings.length };
  }, SEED_TRANSACTION_OPTIONS);

  logger.info(summary, 'Seed complete');
}

try {
  await seed();
} catch (error) {
  logger.fatal({ err: error }, 'Seed failed');
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
