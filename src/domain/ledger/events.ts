/**
 * Domain events for the Account aggregate.
 * All events are immutable and versioned.
 */

export type AccountEvent =
  | AccountCreated
  | IncomeRecorded
  | ExpenseRecorded
  | TransferSent
  | TransferReceived
  | AccountArchived;

export interface AccountCreated {
  readonly type: 'AccountCreated';
  readonly eventVersion: 1;
  readonly name: string;
  readonly currency: string;
  readonly allowNegative: boolean;
}

export interface IncomeRecorded {
  readonly type: 'IncomeRecorded';
  readonly eventVersion: 1;
  readonly amountCents: number;
  readonly occurredAt: Date;
  readonly description?: string;
}

export interface ExpenseRecorded {
  readonly type: 'ExpenseRecorded';
  readonly eventVersion: 1;
  readonly amountCents: number;
  readonly occurredAt: Date;
  readonly description?: string;
}

export interface TransferSent {
  readonly type: 'TransferSent';
  readonly eventVersion: 1;
  readonly transferId: string;
  readonly toAccountId: string;
  readonly amountCents: number;
  readonly occurredAt: Date;
  readonly description?: string;
}

export interface TransferReceived {
  readonly type: 'TransferReceived';
  readonly eventVersion: 1;
  readonly transferId: string;
  readonly fromAccountId: string;
  readonly amountCents: number;
  readonly occurredAt: Date;
  readonly description?: string;
}

export interface AccountArchived {
  readonly type: 'AccountArchived';
  readonly eventVersion: 1;
}

