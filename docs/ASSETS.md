# Portfolio Assets

## Screenshots (3 required)

### 1. API Documentation - Swagger UI
- **File**: `docs/assets/api-docs.png`
- **URL**: `http://localhost:3000/docs` (or live demo URL)
- **Steps**:
  1. Start the application (`docker-compose up` or `npm run dev`)
  2. Navigate to `/docs` in browser
  3. Capture full Swagger UI page (showing all endpoints)
  4. Ensure "Try it out" sections are visible
- **Purpose**: Demonstrate API completeness and OpenAPI documentation

### 2. Accounts List View
- **File**: `docs/assets/accounts-view.png`
- **URL**: `http://localhost:3000/api/accounts` (via API client or curl output)
- **Steps**:
  1. Register and login (get JWT token)
  2. Create 2-3 accounts with different currencies
  3. Record some income/expenses
  4. Capture API response showing accounts list with balances
  5. Use Postman, Insomnia, or `curl | jq` formatted output
- **Purpose**: Show account management and balance tracking

### 3. Movements/Transaction History
- **File**: `docs/assets/movements-view.png`
- **URL**: `http://localhost:3000/api/accounts/{id}/movements`
- **Steps**:
  1. Use an account with multiple transactions (income, expense, transfer)
  2. Capture movements list showing transaction history
  3. Include pagination if applicable
  4. Show different movement types (income, expense, transfer_in, transfer_out)
- **Purpose**: Demonstrate transaction history and event sourcing audit trail

## GIF/Demo (1 required)

### End-to-End User Flow
- **File**: `docs/assets/demo.gif`
- **Duration**: 30-45 seconds
- **Steps to Record**:
  1. **Register** (`POST /api/auth/register`)
     - Show request body: `{"email":"demo@example.com","password":"password123"}`
     - Show response: `{"userId":"...","email":"..."}`
  2. **Login** (`POST /api/auth/login`)
     - Show request body
     - Show response with JWT token
  3. **Create Account** (`POST /api/accounts`)
     - Show request with `{"name":"Checking","currency":"USD","allowNegative":false}`
     - Show response with `accountId`
  4. **Record Income** (`POST /api/accounts/{id}/income`)
     - Show request: `{"amountCents":10000,"occurredAt":"...","description":"Salary"}`
     - Show response with new balance
  5. **Transfer** (`POST /api/transfers`)
     - Show transfer between two accounts
     - Show both accounts updated
  6. **View Movements** (`GET /api/accounts/{id}/movements`)
     - Show transaction history
- **Tools**: ScreenToGif, LICEcap, or similar screen recorder
- **Purpose**: Quick visual demonstration of full workflow

## File Structure

```
docs/assets/
  ├── .gitkeep
  ├── api-docs.png          # Swagger UI screenshot
  ├── accounts-view.png     # Accounts list with balances
  ├── movements-view.png    # Transaction history
  └── demo.gif              # End-to-end flow animation
```

## Capture Tips

### Screenshots
- Use browser DevTools for clean API responses
- Format JSON with `jq` for terminal screenshots: `curl ... | jq`
- Use Postman/Insomnia for formatted API views
- Capture at 1920x1080 or higher resolution
- Ensure text is readable (zoom if needed)

### GIF
- Record at 60fps for smooth playback
- Keep terminal/API client window focused
- Pause briefly between steps (1-2 seconds)
- Use consistent window size throughout
- Keep file size under 5MB (optimize if needed)

## Naming Convention

- Screenshots: `{feature}-view.png` or `{feature}-{description}.png`
- GIFs: `demo.gif` or `{feature}-demo.gif`
- All lowercase, hyphens for spaces
- All files in `docs/assets/`

## Tools

- **Screenshots**: 
  - Browser DevTools (Network tab)
  - Postman/Insomnia (formatted responses)
  - Terminal with `jq` for JSON formatting
- **GIF Recording**:
  - Windows: ScreenToGif, ShareX
  - Mac: LICEcap, Kap
  - Linux: Peek, SimpleScreenRecorder
