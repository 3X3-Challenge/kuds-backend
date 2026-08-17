import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const SALT_ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Since accounts have no email, a recovery code is the only self-service way
 * to reset a lost password. Shown once at registration/reset — the caller is
 * responsible for storing it.
 */
export function generateRecoveryCode(): string {
  const bytes = randomBytes(10).toString("hex").toUpperCase(); // 20 hex chars, 80 bits
  return bytes.match(/.{1,4}/g)!.join("-");
}

export function hashRecoveryCode(code: string): Promise<string> {
  return bcrypt.hash(code, SALT_ROUNDS);
}

export function verifyRecoveryCode(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code, hash);
}
