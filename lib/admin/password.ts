import { pbkdf2, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import bcrypt from "bcryptjs";

const pbkdf2Async = promisify(pbkdf2);
const LEGACY_ITERATIONS = 310_000;
const KEYLEN = 64;
const DIGEST = "sha256";
const BCRYPT_ROUNDS = 12;

/** New passwords: bcrypt (12 rounds). Stored as standard `$2a$...` hash. */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/** Legacy format: pbkdf2$310000$<salt_hex>$<hash_hex> */
export async function hashPasswordLegacyPbkdf2(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await pbkdf2Async(plain, salt, LEGACY_ITERATIONS, KEYLEN, DIGEST);
  return `pbkdf2$${LEGACY_ITERATIONS}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (stored.startsWith("$2a$") || stored.startsWith("$2b$") || stored.startsWith("$2y$")) {
    return bcrypt.compare(plain, stored);
  }
  const parts = stored.split("$");
  if (parts.length === 4 && parts[0] === "pbkdf2") {
    const iter = Number(parts[1]);
    const salt = Buffer.from(parts[2], "hex");
    const expected = Buffer.from(parts[3], "hex");
    if (!Number.isFinite(iter) || iter < 1000 || salt.length < 8 || expected.length < 16) return false;
    const derived = await pbkdf2Async(plain, salt, iter, expected.length, DIGEST);
    try {
      return derived.length === expected.length && timingSafeEqual(derived, expected);
    } catch {
      return false;
    }
  }
  return false;
}
