import { hash, verify } from 'argon2';

/**
 * Password hashing using Argon2 (more secure than bcrypt).
 */
export class Password {
  /**
   * Hash a plain text password.
   */
  static async hash(plainPassword: string): Promise<string> {
    return await hash(plainPassword);
  }

  /**
   * Verify a plain password against a hash.
   */
  static async verify(plainPassword: string, hash: string): Promise<boolean> {
    try {
      return await verify(hash, plainPassword);
    } catch {
      return false;
    }
  }
}

