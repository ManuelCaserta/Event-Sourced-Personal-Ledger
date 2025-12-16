import { Password } from '../../domain/auth/password.js';
import { UserRepo } from '../../infra/db/userRepo.js';
import { ConflictError } from '../errors.js';

export interface RegisterCommand {
  email: string;
  password: string;
}

export interface RegisterResult {
  userId: string;
  email: string;
}

export class RegisterUseCase {
  constructor(private userRepo: UserRepo) {}

  async execute(command: RegisterCommand): Promise<RegisterResult> {
    // Check if user already exists
    const existing = await this.userRepo.findByEmail(command.email);
    if (existing) {
      throw new ConflictError('User with this email already exists');
    }

    // Hash password
    const passwordHash = await Password.hash(command.password);

    // Create user
    const user = await this.userRepo.create(command.email, passwordHash);

    return {
      userId: user.id,
      email: user.email,
    };
  }
}

