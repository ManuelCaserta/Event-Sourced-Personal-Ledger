import { Account } from '../../domain/ledger/account.js';
import { AccountEvent } from '../../domain/ledger/events.js';
import { EventStoreRepo, EventMetadata } from '../../infra/db/eventStoreRepo.js';
import { CommandDedupRepo } from '../../infra/db/commandDedupRepo.js';

export interface RecordExpenseCommand {
  userId: string;
  accountId: string;
  amountCents: number;
  occurredAt: Date;
  description?: string;
  idempotencyKey: string;
}

export interface RecordExpenseResult {
  correlationId: string;
  newBalance: number;
}

export class RecordExpenseUseCase {
  constructor(
    private eventStore: EventStoreRepo,
    private commandDedup: CommandDedupRepo
  ) {}

  async execute(command: RecordExpenseCommand): Promise<RecordExpenseResult> {
    // Check idempotency
    const dedupResult = await this.commandDedup.beginCommand(
      command.userId,
      command.idempotencyKey
    );

    if (dedupResult.isDuplicate) {
      // Load current state to return current balance
      const events = await this.eventStore.loadStream('account', command.accountId);
      if (events.length === 0) {
        throw new Error('Account not found');
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
      throw new Error('Account not found');
    }

    const account = Account.fromEvents(
      command.accountId,
      events.map((e) => e.payload as AccountEvent)
    );

    // Record expense (domain logic - may throw InsufficientBalanceError)
    const event = account.recordExpense(
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

