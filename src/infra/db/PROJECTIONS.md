# Projections System

## Overview

The projections system maintains read-optimized views (`read_accounts` and `read_movements`) that are updated synchronously within the same transaction as event appends. This provides immediate consistency for reads.

## Architecture

### Projector

The `Projector` class applies events to read models:

- **AccountCreated**: Creates account in `read_accounts` with zero balance
- **IncomeRecorded**: Increases balance, creates `income` movement
- **ExpenseRecorded**: Decreases balance, creates `expense` movement
- **TransferSent**: Decreases balance, creates `transfer_out` movement
- **TransferReceived**: Increases balance, creates `transfer_in` movement
- **AccountArchived**: Updates account metadata

### Integration

The projector is integrated into `EventStoreRepo.append()`:

1. Events are appended to the event store
2. Each event is immediately projected to read models
3. All operations happen in a single transaction
4. If any step fails, the entire transaction rolls back

### Usage

```typescript
import { EventStoreRepo } from './eventStoreRepo.js';
import { Projector } from './projector.js';

const projector = new Projector();
const eventStore = new EventStoreRepo(projector);

// Events are automatically projected when appended
await eventStore.append('account', accountId, events, expectedVersion, metadata);
```

## Rebuild Script

The rebuild script (`npm run projections:rebuild`) replays all events from scratch:

1. Truncates all projection tables
2. Loads all events ordered by `event_seq`
3. Replays events in order using the same projector logic
4. Ensures deterministic results

### When to Use

- After schema changes to projections
- To fix corrupted projection data
- During development/testing
- **NOT during production writes** (warns before running)

### Safety

The rebuild script:
- Warns about running during writes
- Processes events in batches
- Uses transactions for consistency
- Can be safely run in development

## Determinism

Projections are deterministic:
- Same events in same order → same projection state
- Rebuild produces identical results to incremental updates
- No external dependencies or timestamps affect results

## Testing

Integration tests verify:
- Projector correctly updates balances
- Movements are created correctly
- Rebuild produces same state as incremental updates
- Transfer operations update both accounts correctly

