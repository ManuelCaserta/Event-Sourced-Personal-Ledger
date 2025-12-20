import { Account } from '../../domain/ledger/account.js';
import { AccountCreated } from '../../domain/ledger/events.js';
import { EventStoreRepo, EventMetadata } from '../../infra/db/eventStoreRepo.js';
import { CommandDedupRepo } from '../../infra/db/commandDedupRepo.js';
import { randomUUID } from 'crypto';

export interface CreateAccountCommand {
  userId: string;
  name: string;
  currency: string;
  allowNegative: boolean;
  idempotencyKey: string;
}

export interface CreateAccountResult {
  accountId: string;
  correlationId: string;
}

export class CreateAccountUseCase {
  constructor(
    private eventStore: EventStoreRepo,
    private commandDedup: CommandDedupRepo
  ) {}

  async execute(command: CreateAccountCommand): Promise<CreateAccountResult> {
    // Check idempotency
    const dedupResult = await this.commandDedup.beginCommand(
      command.userId,
      command.idempotencyKey
    );

    if (dedupResult.isDuplicate) {
      // For duplicate, we need to find the account that was created
      // In a real system, you might store the result in command_dedup
      // For now, we'll throw an error indicating it's a duplicate
      throw new Error(
        `Command already executed with correlationId: ${dedupResult.correlationId}`
      );
    }

    const accountId = randomUUID();
    const correlationId = dedupResult.correlationId;

    // Create account aggregate
    const account = Account.create(
      accountId,
      command.name,
      command.currency,
      command.allowNegative
    );

    // Get the AccountCreated event
    const state = account.getState();
    const event: AccountCreated = {
      type: 'AccountCreated',
      eventVersion: 1,
      name: state.name,
      currency: state.currency,
      allowNegative: state.allowNegative,
    };

    // Append event (projections updated automatically)
    const metadata: EventMetadata = {
      userId: command.userId,
      correlationId,
    };

    await this.eventStore.append('account', accountId, [event], -1, metadata);

    return {
      accountId,
      correlationId,
    };
  }
}

