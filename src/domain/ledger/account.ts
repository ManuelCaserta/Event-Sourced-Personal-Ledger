import { Money } from './money.js';
import {
  AccountEvent,
  AccountCreated,
  IncomeRecorded,
  ExpenseRecorded,
  TransferSent,
  TransferReceived,
} from './events.js';
import {
  InvalidAmountError,
  InsufficientBalanceError,
} from './errors.js';

/**
 * Account aggregate state (reconstructed from events).
 */
export interface AccountState {
  readonly accountId: string;
  readonly name: string;
  readonly currency: string;
  readonly allowNegative: boolean;
  readonly balance: Money;
  readonly version: number;
  readonly isArchived: boolean;
}

/**
 * Account aggregate - the core domain entity.
 * State is reconstructed by applying events in sequence.
 */
export class Account {
  private constructor(private state: AccountState) {}

  /**
   * Create a new Account from its initial state.
   */
  static create(
    accountId: string,
    name: string,
    currency: string,
    allowNegative: boolean
  ): Account {
    const initialState: AccountState = {
      accountId,
      name,
      currency,
      allowNegative,
      balance: Money.zero(currency),
      version: 0,
      isArchived: false,
    };

    return new Account(initialState);
  }

  /**
   * Reconstruct Account state by applying events in sequence.
   */
  static fromEvents(accountId: string, events: AccountEvent[]): Account {
    if (events.length === 0) {
      throw new Error('Cannot reconstruct account from empty event stream');
    }

    // Find AccountCreated event to get initial values
    const createdEvent = events.find((e) => e.type === 'AccountCreated');
    if (!createdEvent || createdEvent.type !== 'AccountCreated') {
      throw new Error('AccountCreated event must be first in event stream');
    }

    // Create initial state from AccountCreated event
    const initialState: AccountState = {
      accountId,
      name: createdEvent.name,
      currency: createdEvent.currency,
      allowNegative: createdEvent.allowNegative,
      balance: Money.zero(createdEvent.currency),
      version: 0,
      isArchived: false,
    };

    const account = new Account(initialState);

    // Apply all events (including AccountCreated to increment version)
    for (const event of events) {
      account.applyEvent(event);
    }

    return account;
  }

  /**
   * Get current state (immutable snapshot).
   */
  getState(): AccountState {
    return { ...this.state };
  }

  /**
   * Record income on this account.
   * Returns the event that should be persisted.
   */
  recordIncome(
    amountCents: number,
    occurredAt: Date,
    description?: string
  ): IncomeRecorded {
    if (amountCents <= 0) {
      throw new InvalidAmountError('Income amount must be greater than zero');
    }

    const event: IncomeRecorded = {
      type: 'IncomeRecorded',
      eventVersion: 1,
      amountCents,
      occurredAt,
      description,
    };

    this.applyEvent(event);
    return event;
  }

  /**
   * Record expense on this account.
   * Returns the event that should be persisted.
   */
  recordExpense(
    amountCents: number,
    occurredAt: Date,
    description?: string
  ): ExpenseRecorded {
    if (amountCents <= 0) {
      throw new InvalidAmountError('Expense amount must be greater than zero');
    }

    // Check balance constraint before creating Money (to avoid validation error)
    const newBalanceCents = this.state.balance.cents - amountCents;

    if (!this.state.allowNegative && newBalanceCents < 0) {
      throw new InsufficientBalanceError(
        `Cannot record expense: balance would be ${newBalanceCents} cents`
      );
    }

    const event: ExpenseRecorded = {
      type: 'ExpenseRecorded',
      eventVersion: 1,
      amountCents,
      occurredAt,
      description,
    };

    this.applyEvent(event);
    return event;
  }

  /**
   * Record a transfer sent from this account.
   * Returns the event that should be persisted.
   */
  recordTransferSent(
    transferId: string,
    toAccountId: string,
    amountCents: number,
    occurredAt: Date,
    description?: string
  ): TransferSent {
    if (amountCents <= 0) {
      throw new InvalidAmountError('Transfer amount must be greater than zero');
    }

    // Check balance constraint before creating Money (to avoid validation error)
    const newBalanceCents = this.state.balance.cents - amountCents;

    if (!this.state.allowNegative && newBalanceCents < 0) {
      throw new InsufficientBalanceError(
        `Cannot send transfer: balance would be ${newBalanceCents} cents`
      );
    }

    const event: TransferSent = {
      type: 'TransferSent',
      eventVersion: 1,
      transferId,
      toAccountId,
      amountCents,
      occurredAt,
      description,
    };

    this.applyEvent(event);
    return event;
  }

  /**
   * Record a transfer received to this account.
   * Returns the event that should be persisted.
   */
  recordTransferReceived(
    transferId: string,
    fromAccountId: string,
    amountCents: number,
    occurredAt: Date,
    description?: string
  ): TransferReceived {
    if (amountCents <= 0) {
      throw new InvalidAmountError('Transfer amount must be greater than zero');
    }

    // Currency matching is verified at application layer

    const event: TransferReceived = {
      type: 'TransferReceived',
      eventVersion: 1,
      transferId,
      fromAccountId,
      amountCents,
      occurredAt,
      description,
    };

    this.applyEvent(event);
    return event;
  }

  /**
   * Apply an event to update the aggregate state.
   * This is the core event-sourcing mechanism.
   */
  private applyEvent(event: AccountEvent): void {
    switch (event.type) {
      case 'AccountCreated':
        this.applyAccountCreated(event);
        break;
      case 'IncomeRecorded':
        this.applyIncomeRecorded(event);
        break;
      case 'ExpenseRecorded':
        this.applyExpenseRecorded(event);
        break;
      case 'TransferSent':
        this.applyTransferSent(event);
        break;
      case 'TransferReceived':
        this.applyTransferReceived(event);
        break;
      case 'AccountArchived':
        this.applyAccountArchived();
        break;
    }

    this.state = {
      ...this.state,
      version: this.state.version + 1,
    };
  }

  private applyAccountCreated(event: AccountCreated): void {
    this.state = {
      ...this.state,
      name: event.name,
      currency: event.currency,
      allowNegative: event.allowNegative,
      balance: Money.zero(event.currency),
    };
  }

  private applyIncomeRecorded(event: IncomeRecorded): void {
    const incomeAmount = Money.fromCents(event.amountCents, this.state.currency);
    this.state = {
      ...this.state,
      balance: this.state.balance.add(incomeAmount),
    };
  }

  private applyExpenseRecorded(event: ExpenseRecorded): void {
    const expenseAmount = Money.fromCents(
      event.amountCents,
      this.state.currency
    );
    this.state = {
      ...this.state,
      balance: this.state.balance.subtract(expenseAmount),
    };
  }

  private applyTransferSent(event: TransferSent): void {
    const transferAmount = Money.fromCents(
      event.amountCents,
      this.state.currency
    );
    this.state = {
      ...this.state,
      balance: this.state.balance.subtract(transferAmount),
    };
  }

  private applyTransferReceived(event: TransferReceived): void {
    const transferAmount = Money.fromCents(
      event.amountCents,
      this.state.currency
    );
    this.state = {
      ...this.state,
      balance: this.state.balance.add(transferAmount),
    };
  }

  private applyAccountArchived(): void {
    this.state = {
      ...this.state,
      isArchived: true,
    };
  }
}

