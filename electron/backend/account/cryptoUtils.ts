import { randomUUID } from 'node:crypto';

export class CryptoUtils {
  /**
   * Generates a random unique identifier (UUID v4).
   */
  public static generateId(): string {
    return randomUUID();
  }

  /**
   * Validates Voxel+ username rules.
   * Must be 3-20 characters, containing only letters, numbers, and underscores.
   */
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

    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!usernameRegex.test(trimmed)) {
      return { isValid: false, error: 'Username can only contain letters, numbers, and underscores.' };
    }

    return { isValid: true };
  }

  /**
   * Validates password rules.
   * Must be at least 6 characters long.
   */
  public static validatePassword(password: string): { isValid: boolean; error?: string } {
    if (!password || typeof password !== 'string') {
      return { isValid: false, error: 'Password is required.' };
    }

    if (password.length < 6) {
      return { isValid: false, error: 'Password must be at least 6 characters long.' };
    }

    return { isValid: true };
  }
}
