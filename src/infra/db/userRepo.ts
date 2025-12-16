import { pool } from './pool.js';
import { User } from '../../domain/auth/user.js';

export class UserRepo {
  async findByEmail(email: string): Promise<User | null> {
    const result = await pool.query<{
      id: string;
      email: string;
      password_hash: string;
      created_at: Date;
    }>(
      'SELECT id, email, password_hash, created_at FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      createdAt: row.created_at,
    };
  }

  async findById(id: string): Promise<User | null> {
    const result = await pool.query<{
      id: string;
      email: string;
      password_hash: string;
      created_at: Date;
    }>('SELECT id, email, password_hash, created_at FROM users WHERE id = $1', [
      id,
    ]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      createdAt: row.created_at,
    };
  }

  async create(email: string, passwordHash: string): Promise<User> {
    const result = await pool.query<{
      id: string;
      email: string;
      password_hash: string;
      created_at: Date;
    }>(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email, password_hash, created_at`,
      [email, passwordHash]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      createdAt: row.created_at,
    };
  }
}

