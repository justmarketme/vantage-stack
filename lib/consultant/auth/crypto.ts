import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { consultantConfig } from "../config";

/**
 * Encryption at rest for small secrets the app must store (calendar OAuth access/refresh
 * tokens). POPIA: a database dump or leaked backup must not hand out working calendar access.
 *
 * Format: `v1.<iv>.<tag>.<ciphertext>`, each part base64url.
 *   - AES-256-GCM (authenticated: any change to iv/tag/ciphertext fails decryption).
 *   - A fresh random 12-byte IV per call, so equal plaintexts never produce equal output.
 *   - The `v1` prefix lets a future key/algorithm rotation decrypt old rows and re-encrypt.
 *
 * Key: `cfg.calendar.tokenEncKey` = base64 of exactly 32 random bytes
 * (`openssl rand -base64 32`). Missing or wrong-length key → `SecretKeyError` (never a silent
 * plaintext fallback). Node runtime only.
 */

const VERSION = "v1";
const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

/** The encryption key is unset or not 32 bytes. Configuration problem, not user input. */
export class SecretKeyError extends Error {
  readonly code = "SECRET_KEY_INVALID" as const;
  constructor(message: string) {
    super(message);
    this.name = "SecretKeyError";
  }
}

/** The ciphertext is malformed, tampered with, or was made with a different key. */
export class SecretDecryptError extends Error {
  readonly code = "SECRET_DECRYPT_FAILED" as const;
  constructor(message = "Encrypted value could not be decrypted") {
    super(message);
    this.name = "SecretDecryptError";
  }
}

/** Decodes and validates a base64 (or base64url) 32-byte key. Exported for tests/tooling. */
export function parseKey(raw: string): Buffer {
  if (!raw) throw new SecretKeyError("CONSULTANT_TOKEN_ENC_KEY is not set");
  const key = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (key.length !== KEY_BYTES) {
    throw new SecretKeyError(`CONSULTANT_TOKEN_ENC_KEY must decode to ${KEY_BYTES} bytes (got ${key.length})`);
  }
  return key;
}

function configuredKey(): Buffer {
  return parseKey(consultantConfig().calendar.tokenEncKey);
}

export function encryptSecret(plain: string, key: Buffer = configuredKey()): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: TAG_BYTES });
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptSecret(enc: string, key: Buffer = configuredKey()): string {
  const parts = enc.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) throw new SecretDecryptError("Unsupported encrypted value format");
  const [, ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  const ct = Buffer.from(ctB64, "base64url");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new SecretDecryptError("Malformed encrypted value");
  try {
    const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: TAG_BYTES });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    // GCM auth failure: tampered data or the wrong key. Never echo the input.
    throw new SecretDecryptError();
  }
}
