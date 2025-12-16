import { InvalidAmountError, InvalidCurrencyError } from './errors.js';

/**
 * Money value object representing an amount in cents with currency.
 * Amounts are stored as integer cents to avoid floating-point precision issues.
 * Note: Money can represent negative values (for balances), but fromCents validates input.
 */
export class Money {
  private constructor(
    public readonly cents: number,
    public readonly currency: string
  ) {
    // Only validate currency, not cents (allows negative for balances)
    if (!currency || currency.length !== 3) {
      throw new InvalidCurrencyError('Currency must be a 3-letter ISO code');
    }
  }

  static fromCents(cents: number, currency: string): Money {
    // Validate input amounts (should not be negative for income/expense)
    if (cents < 0) {
      throw new InvalidAmountError('Amount cannot be negative');
    }
    return new Money(cents, currency);
  }

  /**
   * Create Money from balance calculation (allows negative values).
   * Use this for balance calculations, not for input validation.
   */
  static fromBalanceCents(cents: number, currency: string): Money {
    return new Money(cents, currency);
  }

  static zero(currency: string): Money {
    return new Money(0, currency);
  }

  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new InvalidCurrencyError(
        `Cannot add ${this.currency} and ${other.currency}`
      );
    }
    return new Money(this.cents + other.cents, this.currency);
  }

  subtract(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new InvalidCurrencyError(
        `Cannot subtract ${this.currency} and ${other.currency}`
      );
    }
    // Allow negative results (for balance calculations)
    return Money.fromBalanceCents(this.cents - other.cents, this.currency);
  }

  isGreaterThan(other: Money): boolean {
    if (this.currency !== other.currency) {
      throw new InvalidCurrencyError(
        `Cannot compare ${this.currency} and ${other.currency}`
      );
    }
    return this.cents > other.cents;
  }

  isGreaterThanOrEqual(other: Money): boolean {
    if (this.currency !== other.currency) {
      throw new InvalidCurrencyError(
        `Cannot compare ${this.currency} and ${other.currency}`
      );
    }
    return this.cents >= other.cents;
  }

  equals(other: Money): boolean {
    return this.cents === other.cents && this.currency === other.currency;
  }

  isZero(): boolean {
    return this.cents === 0;
  }

  isNegative(): boolean {
    return this.cents < 0;
  }
}

