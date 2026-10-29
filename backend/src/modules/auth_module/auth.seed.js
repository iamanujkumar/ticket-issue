import { UserRole } from './auth.enums.js';
import * as authQuery from './auth.query.js';

export const DEMO_ADMINS = [
  { name: 'Aditi Rao', email: 'aditi.rao@bookleaf.test' },
  { name: 'Karan Mehta', email: 'karan.mehta@bookleaf.test' },
];

export async function seedAdmins(tx, passwordHash) {
  for (const admin of DEMO_ADMINS) {
    await authQuery.upsertUserByEmail({ ...admin, role: UserRole.ADMIN, passwordHash }, tx);
  }
  return DEMO_ADMINS.length;
}

export async function seedAuthors(tx, authors, passwordHash) {
  const authorIdByCode = new Map();

  for (const author of authors) {
    const user = await authQuery.upsertUserByEmail(
      { email: author.email, name: author.name, role: UserRole.AUTHOR, passwordHash },
      tx,
    );
    const profile = await authQuery.upsertAuthorByCode(
      { code: author.code, userId: user.id, phone: author.phone, city: author.city, joinedDate: author.joinedDate },
      tx,
    );
    authorIdByCode.set(author.code, profile.id);
  }

  return authorIdByCode;
}
