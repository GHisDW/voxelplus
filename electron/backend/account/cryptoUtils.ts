import crypto from 'node:crypto';

const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 64;
const DIGEST = 'sha256';

export class CryptoUtils {
  public static generateSalt(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  public static hashPassword(password: string, salt: string): string {
    const hash = crypto.pbkdf2Sync(
      password,
      salt,
      PBKDF2_ITERATIONS,
      KEY_LENGTH,
      DIGEST
    );
    return hash.toString('hex');
  }

  public static verifyPassword(password: string, hash: string, salt: string): boolean {
    const candidateHashBuf = crypto.pbkdf2Sync(
      password,
      salt,
      PBKDF2_ITERATIONS,
      KEY_LENGTH,
      DIGEST
    );
    const targetHashBuf = Buffer.from(hash, 'hex');

    if (candidateHashBuf.length !== targetHashBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(candidateHashBuf, targetHashBuf);
  }

  public static generateSessionToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  public static generateId(): string {
    return crypto.randomUUID();
  }

  public static validateUsername(username: string): { isValid: boolean; error?: string } {
    if (!username || typeof username !== 'string') {
      return { isValid: false, error: 'Username is required.' };
    }
    const trimmed = username.trim();
    if (trimmed.length < 3) {
      return { isValid: false, error: 'Username must be at least 3 characters long.' };
    }
    if (trimmed.length > 20) {
      return { isValid: false, error: 'Username cannot exceed 20 characters.' };
    }
    const validRegex = /^[a-zA-Z0-9_-]+$/;
    if (!validRegex.test(trimmed)) {
      return { isValid: false, error: 'Username can only contain letters, numbers, underscores, and hyphens.' };
    }
    return { isValid: true };
  }

  public static validatePassword(password: string): { isValid: boolean; error?: string } {
    if (!password || typeof password !== 'string') {
      return { isValid: false, error: 'Password is required.' };
    }
    if (password.length < 6) {
      return { isValid: false, error: 'Password must be at least 6 characters long.' };
    }
    if (password.length > 128) {
      return { isValid: false, error: 'Password is too long (maximum 128 characters).' };
    }
    return { isValid: true };
  }
}
