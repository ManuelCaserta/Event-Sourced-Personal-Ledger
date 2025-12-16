/**
 * User domain entity (minimal for auth).
 * In a real system, this might have more fields and behavior.
 */
export interface User {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly createdAt: Date;
}

