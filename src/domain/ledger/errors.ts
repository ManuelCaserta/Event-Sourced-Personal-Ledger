export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidAmountError extends DomainError {
  constructor(message = 'Amount must be greater than zero') {
    super(message);
  }
}

export class InsufficientBalanceError extends DomainError {
  constructor(message = 'Insufficient balance') {
    super(message);
  }
}

export class CurrencyMismatchError extends DomainError {
  constructor(message = 'Currency mismatch') {
    super(message);
  }
}

export class CurrencyImmutableError extends DomainError {
  constructor(message = 'Currency cannot be changed after account creation') {
    super(message);
  }
}

export class InvalidCurrencyError extends DomainError {
  constructor(message = 'Invalid currency code') {
    super(message);
  }
}

