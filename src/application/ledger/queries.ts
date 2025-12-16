import { ProjectionsRepo, AccountProjection, MovementProjection } from '../../infra/db/projectionsRepo.js';

export class LedgerQueries {
  constructor(private projectionsRepo: ProjectionsRepo) {}

  async getAccounts(userId: string): Promise<AccountProjection[]> {
    return this.projectionsRepo.getAccountsByUserId(userId);
  }

  async getAccount(accountId: string, userId: string): Promise<AccountProjection | null> {
    return this.projectionsRepo.getAccountById(accountId, userId);
  }

  async getMovements(
    accountId: string,
    userId: string,
    limit: number = 50,
    cursor?: number
  ): Promise<{ movements: MovementProjection[]; nextCursor?: number }> {
    return this.projectionsRepo.getMovements(accountId, userId, limit, cursor);
  }
}

