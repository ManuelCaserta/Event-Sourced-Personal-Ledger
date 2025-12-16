export class ApplicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NotFoundError extends ApplicationError {}
export class UnauthorizedError extends ApplicationError {}
export class ConflictError extends ApplicationError {}


