import { hash, verify } from '@node-rs/argon2';

// Checked against for unknown emails so a failed login takes the same time whether or not the email exists.
const DUMMY_PASSWORD_HASH = await hash('bookleaf-dummy-password');

export function hashPassword(password) {
  return hash(password);
}

export async function verifyPassword(passwordHash, password) {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

export async function verifyAgainstDummyHash(password) {
  await verifyPassword(DUMMY_PASSWORD_HASH, password);
  return false;
}
