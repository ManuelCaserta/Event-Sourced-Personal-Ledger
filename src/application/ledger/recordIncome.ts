import { Account } from '../../domain/ledger/account.js';
import { AccountEvent } from '../../domain/ledger/events.js';
import { EventStoreRepo, EventMetadata } from '../../infra/db/eventStoreRepo.js';
import { CommandDedupRepo } from '../../infra/db/commandDedupRepo.js';
import { NotFoundError } from '../errors.js';

export interface RecordIncomeCommand {
  userId: string;
  accountId: string;
  amountCents: number;
  occurredAt: Date;
  description?: string;
  idempotencyKey: string;
}

export interface RecordIncomeResult {
  correlationId: string;
  newBalance: number;
}

export class RecordIncomeUseCase {
  constructor(
    private eventStore: EventStoreRepo,
    private commandDedup: CommandDedupRepo
  ) {}

  async execute(command: RecordIncomeCommand): Promise<RecordIncomeResult> {
    // Check idempotency
    const dedupResult = await this.commandDedup.beginCommand(
      command.userId,
      command.idempotencyKey
    );

    if (dedupResult.isDuplicate) {
      // Load current state to return current balance
      const events = await this.eventStore.loadStream('account', command.accountId);
      if (events.length === 0) {
        throw new NotFoundError('Account not found');
      }

      const account = Account.fromEvents(command.accountId, events.map((e) => e.payload as AccountEvent));
      const state = account.getState();

      return {
        correlationId: dedupResult.correlationId,
        newBalance: state.balance.cents,
      };
    }

    const correlationId = dedupResult.correlationId;

    // Load account aggregate
    const events = await this.eventStore.loadStream('account', command.accountId);
    if (events.length === 0) {
      throw new NotFoundError('Account not found');
    }

    const account = Account.fromEvents(
      command.accountId,
      events.map((e) => e.payload as AccountEvent)
    );

    // Record income (domain logic)
    const event = account.recordIncome(
      command.amountCents,
      command.occurredAt,
      command.description
    );

    // Get current version
    const currentVersion = events[events.length - 1].version;

    // Append event
    const metadata: EventMetadata = {
      userId: command.userId,
      correlationId,
    };

    await this.eventStore.append(
      'account',
      command.accountId,
      [event],
      currentVersion,
      metadata
    );

    const newState = account.getState();

    return {
      correlationId,
      newBalance: newState.balance.cents,
    };
  }
}

