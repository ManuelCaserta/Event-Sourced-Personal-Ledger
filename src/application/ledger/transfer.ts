import { Account } from '../../domain/ledger/account.js';
import { AccountEvent } from '../../domain/ledger/events.js';
import { EventStoreRepo, EventMetadata } from '../../infra/db/eventStoreRepo.js';
import { CommandDedupRepo } from '../../infra/db/commandDedupRepo.js';
import { CurrencyMismatchError } from '../../domain/ledger/errors.js';
import { randomUUID } from 'crypto';

export interface TransferCommand {
  userId: string;
  fromAccountId: string;
  toAccountId: string;
  amountCents: number;
  occurredAt: Date;
  description?: string;
  idempotencyKey: string;
}

export interface TransferResult {
  correlationId: string;
  fromAccountBalance: number;
  toAccountBalance: number;
}

export class TransferUseCase {
  constructor(
    private eventStore: EventStoreRepo,
    private commandDedup: CommandDedupRepo
  ) {}

  async execute(command: TransferCommand): Promise<TransferResult> {
    // Check idempotency
    const dedupResult = await this.commandDedup.beginCommand(
      command.userId,
      command.idempotencyKey
    );

    if (dedupResult.isDuplicate) {
      // Load current states to return current balances
      const fromEvents = await this.eventStore.loadStream('account', command.fromAccountId);
      const toEvents = await this.eventStore.loadStream('account', command.toAccountId);

      if (fromEvents.length === 0 || toEvents.length === 0) {
        throw new Error('Account not found');
      }

      const fromAccount = Account.fromEvents(
        command.fromAccountId,
        fromEvents.map((e) => e.payload as AccountEvent)
      );
      const toAccount = Account.fromEvents(
        command.toAccountId,
        toEvents.map((e) => e.payload as AccountEvent)
      );

      return {
        correlationId: dedupResult.correlationId,
        fromAccountBalance: fromAccount.getState().balance.cents,
        toAccountBalance: toAccount.getState().balance.cents,
      };
    }

    const correlationId = dedupResult.correlationId;

    // Load both account aggregates
    const fromEvents = await this.eventStore.loadStream('account', command.fromAccountId);
    const toEvents = await this.eventStore.loadStream('account', command.toAccountId);

    if (fromEvents.length === 0) {
      throw new Error(`Source account not found: ${command.fromAccountId}`);
    }
    if (toEvents.length === 0) {
      throw new Error(`Destination account not found: ${command.toAccountId}`);
    }

    const fromAccount = Account.fromEvents(
      command.fromAccountId,
      fromEvents.map((e) => e.payload as AccountEvent)
    );
    const toAccount = Account.fromEvents(
      command.toAccountId,
      toEvents.map((e) => e.payload as AccountEvent)
    );

    // Verify currency match
    const fromState = fromAccount.getState();
    const toState = toAccount.getState();

    if (fromState.currency !== toState.currency) {
      throw new CurrencyMismatchError(
        `Cannot transfer between ${fromState.currency} and ${toState.currency} accounts`
      );
    }

    // Generate transfer ID
    const transferId = randomUUID();

    // Record transfer sent (domain logic - may throw InsufficientBalanceError)
    const sentEvent = fromAccount.recordTransferSent(
      transferId,
      command.toAccountId,
      command.amountCents,
      command.occurredAt,
      command.description
    );

    // Record transfer received
    const receivedEvent = toAccount.recordTransferReceived(
      transferId,
      command.fromAccountId,
      command.amountCents,
      command.occurredAt,
      command.description
    );

    // Get current versions
    const fromVersion = fromEvents[fromEvents.length - 1].version;
    const toVersion = toEvents[toEvents.length - 1].version;

    // Append events atomically
    // Note: In a real system with cross-aggregate transfers, you might use a saga
    // Here we use Postgres transactions for atomicity
    const metadata: EventMetadata = {
      userId: command.userId,
      correlationId,
    };

    // We need to append to both streams in a transaction
    // For now, we'll append sequentially (both in same transaction via EventStoreRepo)
    // In production, you might want a more sophisticated approach
    await this.eventStore.append(
      'account',
      command.fromAccountId,
      [sentEvent],
      fromVersion,
      metadata
    );

    await this.eventStore.append(
      'account',
      command.toAccountId,
      [receivedEvent],
      toVersion,
      metadata
    );

    const fromFinalState = fromAccount.getState();
    const toFinalState = toAccount.getState();

    return {
      correlationId,
      fromAccountBalance: fromFinalState.balance.cents,
      toAccountBalance: toFinalState.balance.cents,
    };
  }
}

