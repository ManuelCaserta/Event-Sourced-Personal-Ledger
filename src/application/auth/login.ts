import { Password } from '../../domain/auth/password.js';
import { UserRepo } from '../../infra/db/userRepo.js';
import jwt from 'jsonwebtoken';

export interface LoginCommand {
  email: string;
  password: string;
}

export interface LoginResult {
  token: string;
  userId: string;
  email: string;
}

export class LoginUseCase {
  constructor(
    private userRepo: UserRepo,
    private jwtSecret: string
  ) {}

  async execute(command: LoginCommand): Promise<LoginResult> {
    // Find user
    const user = await this.userRepo.findByEmail(command.email);
    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Verify password
    const isValid = await Password.verify(command.password, user.passwordHash);
    if (!isValid) {
      throw new Error('Invalid email or password');
    }

    // Generate JWT
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
      },
      this.jwtSecret,
      {
        expiresIn: '7d',
      }
    );

    return {
      token,
      userId: user.id,
      email: user.email,
    };
  }
}

