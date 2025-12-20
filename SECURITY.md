# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

Please report security vulnerabilities to: **security@example.com** (replace with your email)

Do **not** open public issues for security vulnerabilities.

## Security Practices

### Secrets Management

- Never commit `.env` files
- Use environment variables for `JWT_SECRET` and `DATABASE_URL`
- Rotate `JWT_SECRET` periodically in production

### Authentication

- Passwords hashed with Argon2
- JWT tokens expire (configure in production)
- Rate limiting on login endpoint

### Database

- Use parameterized queries (prevents SQL injection)
- Connection strings stored as environment variables
- Database credentials never logged

### API

- All ledger endpoints require JWT authentication
- Input validation via Zod schemas
- Error messages don't leak sensitive information

## Known Limitations

- No refresh token mechanism (JWT only)
- No account lockout after failed login attempts
- No 2FA support

