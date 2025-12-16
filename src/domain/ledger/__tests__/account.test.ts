import { describe, it, expect } from 'vitest';
import { Account } from '../account.js';
import {
  AccountCreated,
  IncomeRecorded,
  ExpenseRecorded,
  TransferSent,
  TransferReceived,
  AccountEvent,
} from '../events.js';
import {
  InvalidAmountError,
  InsufficientBalanceError,
  CurrencyMismatchError,
} from '../errors.js';
import { Money } from '../money.js';

describe('Account', () => {
  const accountId = 'account-123';
  const name = 'Test Account';
  const currency = 'USD';

  describe('create', () => {
    it('should create a new account with zero balance', () => {
      const account = Account.create(accountId, name, currency, false);
      const state = account.getState();

      expect(state.accountId).toBe(accountId);
      expect(state.name).toBe(name);
      expect(state.currency).toBe(currency);
      expect(state.allowNegative).toBe(false);
      expect(state.balance.cents).toBe(0);
      expect(state.balance.currency).toBe(currency);
      expect(state.version).toBe(0);
      expect(state.isArchived).toBe(false);
    });

    it('should create account with allowNegative=true', () => {
      const account = Account.create(accountId, name, currency, true);
      const state = account.getState();

      expect(state.allowNegative).toBe(true);
    });
  });

  describe('fromEvents', () => {
    it('should reconstruct account state from events', () => {
      const events: AccountEvent[] = [
        {
          type: 'AccountCreated',
          eventVersion: 1,
          name,
          currency,
          allowNegative: false,
        },
        {
          type: 'IncomeRecorded',
          eventVersion: 1,
          amountCents: 1000,
          occurredAt: new Date('2024-01-01'),
        },
        {
          type: 'IncomeRecorded',
          eventVersion: 1,
          amountCents: 500,
          occurredAt: new Date('2024-01-02'),
        },
        {
          type: 'ExpenseRecorded',
          eventVersion: 1,
          amountCents: 300,
          occurredAt: new Date('2024-01-03'),
        },
      ];

      const account = Account.fromEvents(accountId, events);
      const state = account.getState();

      expect(state.name).toBe(name);
      expect(state.currency).toBe(currency);
      expect(state.balance.cents).toBe(1200); // 1000 + 500 - 300
      expect(state.version).toBe(4);
    });
  });

  describe('recordIncome', () => {
    it('should record income and update balance', () => {
      const account = Account.create(accountId, name, currency, false);
      const occurredAt = new Date('2024-01-01');

      const event = account.recordIncome(1000, occurredAt, 'Salary');

      expect(event.type).toBe('IncomeRecorded');
      expect(event.amountCents).toBe(1000);
      expect(event.description).toBe('Salary');

      const state = account.getState();
      expect(state.balance.cents).toBe(1000);
      expect(state.version).toBe(1);
    });

    it('should accumulate multiple incomes', () => {
      const account = Account.create(accountId, name, currency, false);

      account.recordIncome(1000, new Date('2024-01-01'));
      account.recordIncome(500, new Date('2024-01-02'));

      const state = account.getState();
      expect(state.balance.cents).toBe(1500);
      expect(state.version).toBe(2);
    });

    it('should throw InvalidAmountError for zero amount', () => {
      const account = Account.create(accountId, name, currency, false);

      expect(() => {
        account.recordIncome(0, new Date());
      }).toThrow(InvalidAmountError);
    });

    it('should throw InvalidAmountError for negative amount', () => {
      const account = Account.create(accountId, name, currency, false);

      expect(() => {
        account.recordIncome(-100, new Date());
      }).toThrow(InvalidAmountError);
    });
  });

  describe('recordExpense', () => {
    it('should record expense and update balance', () => {
      const account = Account.create(accountId, name, currency, false);
      account.recordIncome(1000, new Date('2024-01-01'));

      const event = account.recordExpense(300, new Date('2024-01-02'), 'Groceries');

      expect(event.type).toBe('ExpenseRecorded');
      expect(event.amountCents).toBe(300);
      expect(event.description).toBe('Groceries');

      const state = account.getState();
      expect(state.balance.cents).toBe(700);
      expect(state.version).toBe(2);
    });

    it('should allow expense that brings balance to zero', () => {
      const account = Account.create(accountId, name, currency, false);
      account.recordIncome(1000, new Date('2024-01-01'));

      account.recordExpense(1000, new Date('2024-01-02'));

      const state = account.getState();
      expect(state.balance.cents).toBe(0);
    });

    it('should throw InsufficientBalanceError when allowNegative=false', () => {
      const account = Account.create(accountId, name, currency, false);
      account.recordIncome(1000, new Date('2024-01-01'));

      expect(() => {
        account.recordExpense(1500, new Date('2024-01-02'));
      }).toThrow(InsufficientBalanceError);
    });

    it('should allow negative balance when allowNegative=true', () => {
      const account = Account.create(accountId, name, currency, true);
      account.recordIncome(1000, new Date('2024-01-01'));

      account.recordExpense(1500, new Date('2024-01-02'));

      const state = account.getState();
      expect(state.balance.cents).toBe(-500);
    });

    it('should throw InvalidAmountError for zero amount', () => {
      const account = Account.create(accountId, name, currency, false);

      expect(() => {
        account.recordExpense(0, new Date());
      }).toThrow(InvalidAmountError);
    });

    it('should throw InvalidAmountError for negative amount', () => {
      const account = Account.create(accountId, name, currency, false);

      expect(() => {
        account.recordExpense(-100, new Date());
      }).toThrow(InvalidAmountError);
    });
  });

  describe('recordTransferSent', () => {
    it('should record transfer sent and update balance', () => {
      const account = Account.create(accountId, name, currency, false);
      account.recordIncome(1000, new Date('2024-01-01'));

      const transferId = 'transfer-123';
      const toAccountId = 'account-456';
      const event = account.recordTransferSent(
        transferId,
        toAccountId,
        300,
        new Date('2024-01-02'),
        'Transfer to savings'
      );

      expect(event.type).toBe('TransferSent');
      expect(event.transferId).toBe(transferId);
      expect(event.toAccountId).toBe(toAccountId);
      expect(event.amountCents).toBe(300);

      const state = account.getState();
      expect(state.balance.cents).toBe(700);
      expect(state.version).toBe(2);
    });

    it('should throw InsufficientBalanceError when allowNegative=false', () => {
      const account = Account.create(accountId, name, currency, false);
      account.recordIncome(1000, new Date('2024-01-01'));

      expect(() => {
        account.recordTransferSent('transfer-123', 'account-456', 1500, new Date());
      }).toThrow(InsufficientBalanceError);
    });

    it('should allow negative balance when allowNegative=true', () => {
      const account = Account.create(accountId, name, currency, true);
      account.recordIncome(1000, new Date('2024-01-01'));

      account.recordTransferSent('transfer-123', 'account-456', 1500, new Date());

      const state = account.getState();
      expect(state.balance.cents).toBe(-500);
    });

    it('should throw InvalidAmountError for zero amount', () => {
      const account = Account.create(accountId, name, currency, false);

      expect(() => {
        account.recordTransferSent('transfer-123', 'account-456', 0, new Date());
      }).toThrow(InvalidAmountError);
    });
  });

  describe('recordTransferReceived', () => {
    it('should record transfer received and update balance', () => {
      const account = Account.create(accountId, name, currency, false);
      account.recordIncome(1000, new Date('2024-01-01'));

      const transferId = 'transfer-123';
      const fromAccountId = 'account-456';
      const event = account.recordTransferReceived(
        transferId,
        fromAccountId,
        500,
        new Date('2024-01-02'),
        'Transfer from checking'
      );

      expect(event.type).toBe('TransferReceived');
      expect(event.transferId).toBe(transferId);
      expect(event.fromAccountId).toBe(fromAccountId);
      expect(event.amountCents).toBe(500);

      const state = account.getState();
      expect(state.balance.cents).toBe(1500);
      expect(state.version).toBe(2);
    });

    it('should throw InvalidAmountError for zero amount', () => {
      const account = Account.create(accountId, name, currency, false);

      expect(() => {
        account.recordTransferReceived('transfer-123', 'account-456', 0, new Date());
      }).toThrow(InvalidAmountError);
    });
  });

  describe('event application', () => {
    it('should correctly apply AccountCreated event', () => {
      const events: AccountEvent[] = [
        {
          type: 'AccountCreated',
          eventVersion: 1,
          name: 'Savings',
          currency: 'EUR',
          allowNegative: true,
        },
      ];

      const account = Account.fromEvents(accountId, events);
      const state = account.getState();

      expect(state.name).toBe('Savings');
      expect(state.currency).toBe('EUR');
      expect(state.allowNegative).toBe(true);
      expect(state.balance.cents).toBe(0);
    });

    it('should correctly apply IncomeRecorded event', () => {
      const events: AccountEvent[] = [
        {
          type: 'AccountCreated',
          eventVersion: 1,
          name,
          currency,
          allowNegative: false,
        },
        {
          type: 'IncomeRecorded',
          eventVersion: 1,
          amountCents: 2000,
          occurredAt: new Date('2024-01-01'),
          description: 'Bonus',
        },
      ];

      const account = Account.fromEvents(accountId, events);
      const state = account.getState();

      expect(state.balance.cents).toBe(2000);
    });

    it('should correctly apply ExpenseRecorded event', () => {
      const events: AccountEvent[] = [
        {
          type: 'AccountCreated',
          eventVersion: 1,
          name,
          currency,
          allowNegative: false,
        },
        {
          type: 'IncomeRecorded',
          eventVersion: 1,
          amountCents: 1000,
          occurredAt: new Date('2024-01-01'),
        },
        {
          type: 'ExpenseRecorded',
          eventVersion: 1,
          amountCents: 400,
          occurredAt: new Date('2024-01-02'),
        },
      ];

      const account = Account.fromEvents(accountId, events);
      const state = account.getState();

      expect(state.balance.cents).toBe(600);
    });

    it('should correctly apply TransferSent event', () => {
      const events: AccountEvent[] = [
        {
          type: 'AccountCreated',
          eventVersion: 1,
          name,
          currency,
          allowNegative: false,
        },
        {
          type: 'IncomeRecorded',
          eventVersion: 1,
          amountCents: 1000,
          occurredAt: new Date('2024-01-01'),
        },
        {
          type: 'TransferSent',
          eventVersion: 1,
          transferId: 'transfer-1',
          toAccountId: 'account-2',
          amountCents: 300,
          occurredAt: new Date('2024-01-02'),
        },
      ];

      const account = Account.fromEvents(accountId, events);
      const state = account.getState();

      expect(state.balance.cents).toBe(700);
    });

    it('should correctly apply TransferReceived event', () => {
      const events: AccountEvent[] = [
        {
          type: 'AccountCreated',
          eventVersion: 1,
          name,
          currency,
          allowNegative: false,
        },
        {
          type: 'TransferReceived',
          eventVersion: 1,
          transferId: 'transfer-1',
          fromAccountId: 'account-2',
          amountCents: 500,
          occurredAt: new Date('2024-01-01'),
        },
      ];

      const account = Account.fromEvents(accountId, events);
      const state = account.getState();

      expect(state.balance.cents).toBe(500);
    });

    it('should correctly apply AccountArchived event', () => {
      const events: AccountEvent[] = [
        {
          type: 'AccountCreated',
          eventVersion: 1,
          name,
          currency,
          allowNegative: false,
        },
        {
          type: 'AccountArchived',
          eventVersion: 1,
        },
      ];

      const account = Account.fromEvents(accountId, events);
      const state = account.getState();

      expect(state.isArchived).toBe(true);
    });

    it('should handle complex event sequence', () => {
      const events: AccountEvent[] = [
        {
          type: 'AccountCreated',
          eventVersion: 1,
          name,
          currency,
          allowNegative: false,
        },
        {
          type: 'IncomeRecorded',
          eventVersion: 1,
          amountCents: 1000,
          occurredAt: new Date('2024-01-01'),
        },
        {
          type: 'ExpenseRecorded',
          eventVersion: 1,
          amountCents: 200,
          occurredAt: new Date('2024-01-02'),
        },
        {
          type: 'IncomeRecorded',
          eventVersion: 1,
          amountCents: 500,
          occurredAt: new Date('2024-01-03'),
        },
        {
          type: 'TransferSent',
          eventVersion: 1,
          transferId: 'transfer-1',
          toAccountId: 'account-2',
          amountCents: 300,
          occurredAt: new Date('2024-01-04'),
        },
        {
          type: 'TransferReceived',
          eventVersion: 1,
          transferId: 'transfer-2',
          fromAccountId: 'account-3',
          amountCents: 100,
          occurredAt: new Date('2024-01-05'),
        },
      ];

      const account = Account.fromEvents(accountId, events);
      const state = account.getState();

      // 1000 - 200 + 500 - 300 + 100 = 1100
      expect(state.balance.cents).toBe(1100);
      expect(state.version).toBe(6);
    });
  });
});

describe('Money', () => {
  describe('fromCents', () => {
    it('should create Money from cents', () => {
      const money = Money.fromCents(1000, 'USD');
      expect(money.cents).toBe(1000);
      expect(money.currency).toBe('USD');
    });

    it('should throw InvalidAmountError for negative cents', () => {
      expect(() => {
        Money.fromCents(-100, 'USD');
      }).toThrow('Amount cannot be negative');
    });

    it('should throw InvalidCurrencyError for invalid currency', () => {
      expect(() => {
        Money.fromCents(100, 'US');
      }).toThrow('Currency must be a 3-letter ISO code');
    });
  });

  describe('add', () => {
    it('should add two Money objects with same currency', () => {
      const m1 = Money.fromCents(1000, 'USD');
      const m2 = Money.fromCents(500, 'USD');
      const result = m1.add(m2);

      expect(result.cents).toBe(1500);
      expect(result.currency).toBe('USD');
    });

    it('should throw CurrencyMismatchError for different currencies', () => {
      const m1 = Money.fromCents(1000, 'USD');
      const m2 = Money.fromCents(500, 'EUR');

      expect(() => {
        m1.add(m2);
      }).toThrow('Cannot add USD and EUR');
    });
  });

  describe('subtract', () => {
    it('should subtract two Money objects with same currency', () => {
      const m1 = Money.fromCents(1000, 'USD');
      const m2 = Money.fromCents(300, 'USD');
      const result = m1.subtract(m2);

      expect(result.cents).toBe(700);
      expect(result.currency).toBe('USD');
    });

    it('should allow negative result', () => {
      const m1 = Money.fromCents(300, 'USD');
      const m2 = Money.fromCents(500, 'USD');
      const result = m1.subtract(m2);

      expect(result.cents).toBe(-200);
      expect(result.isNegative()).toBe(true);
    });
  });
});

