# PostgreSQL persistence

Phase 4 provides a real Prisma 7.10.1/PostgreSQL adapter. Phase 5A connects it to Better Auth, Server Components and Server Actions in explicit account mode. The default demo remains isolated. A database URL alone does not switch modes; see [account setup](../../../docs/authentication.md).

## Install and validate

`npm ci` generates the Prisma client into the ignored `src/server/db/generated` directory. Client generation and the demo build do not need credentials or a running database.

```sh
npm run db:generate
npm run db:validate
npm run test:db
```

The integration runner requires a running Docker daemon and `postgres:17-alpine` (Docker pulls it if missing). It creates a disposable PostgreSQL 17 container with a random password held in process memory, a random localhost port and tmpfs data. It ignores external `DATABASE_URL`, deploys the checked-in migration twice, runs integration tests, then removes its own container. It does not mount a data volume or migrate an existing database. Unit tests remain independent of Docker.

## Configure a development database

Set `DATABASE_URL` in the process environment or an ignored `.env.local`/`.env`. Use the PostgreSQL connection string for the database you intend to modify. The optional Compose PostgreSQL service binds only to localhost; set its password yourself. Compose also validates the optional MinIO credentials in its configuration.

Review all three migrations (initial, authentication and private_media), then explicitly run:

```sh
npm run db:migrate
```

This command changes the configured database. There is no implicit migration in `dev`, `build`, `start`, Docker startup or client construction. No external database has been configured or migrated by this implementation.

## Boundaries and invariants

- `client.ts`: server-only pool factory with no fallback URL or credentials; the application lifecycle owns `$disconnect()`.
- `authorization.ts`: reads current `FamilyMember` membership on every service call. OWNER/PARENT can write; VIEWER can read. Missing membership/resource and forbidden writes use the same generic error.
- `postgres-journey-repository.ts`: every query scopes by family. Child writes and milestone confirmations serialize on a child row lock. Event + milestone writes share one transaction. Dates use SQL `date`, audit fields use `timestamptz`; client-supplied audit times are ignored on create/update.
- Composite foreign keys enforce the same family and child for events, milestone links, journals, reminders and media. SQL CHECK constraints enforce lifecycle, clock times, future birth dates, content limits and verified image dimensions. These custom constraints live in the migration; preserve them when authoring future migrations.
- Timeline pagination orders by event date, time and UUID, with pages of 25. Cursors are scoped event IDs; a deleted or cross-family cursor fails and the caller must restart pagination. Concurrent edits can move events between pages; this is not a historical snapshot.
- Undated custom milestones create no event. Confirmation/rescheduling creates or updates one linked event and preserves its original creation time. Family choices survive changes to birth/calendar settings. Completion requires a confirmed date that has arrived; only unconfirmed suggestions can be skipped.
- Explicit birth confirmation retains the due date and existing history. Pause/end disables child, event and queued reminder flags atomically; resume does not re-enable old scheduled reminders. Changing event date/time or rescheduling a milestone disables its old queued reminders; the Phase 5D opt-in scheduler creates the new occurrence jobs.
- `postgres-media-repository.ts`: locks child then event before counting/reserving up to 12 pending/ready images. Every lookup and status mutation includes family ID. Compare-and-set status updates prevent a failed concurrent finalizer from rejecting/deleting an already verified image.
- Event deletion keeps journal text, removes reminders, unlinks milestones and queues all private object keys before cascading media records. Rejected uploads also queue cleanup. Phase 5B adds a separate idempotent worker with expiry, leases, retries and orphan reconciliation. The privacy finalizer waits for pending cleanup before hard deletion. Cleanup rows deliberately survive family deletion for late-object reconciliation.

## Remaining integration

Account mode uses `auth/session.ts` to resolve Better Auth's verified DB session and family membership, then injects it into services on each request. The generic unavailable session provider still fails closed for unconfigured consumers. These repositories are internal data access code, not an authorization API; never derive their family ID directly from a request body. No shared cache wraps private queries.

Phase 5B adds the private S3/MinIO adapter, Sharp verification, avatar pointer, leased cleanup worker and expired-upload/orphan reconciliation. See [private media operations](../../../docs/private-media.md). Event images and avatars map to same-origin authenticated endpoints; arbitrary client URLs remain rejected. Existing browser demo data is not automatically imported into PostgreSQL.

Still needed: email verification/recovery, reminder scheduling, audit/backup/retention and family/account deletion workflows. Family deletion is restricted by cleanup records. The selected avatar uses a composite family/child foreign key; services enforce its READY/avatar status. Never update media pointers/status directly from an untrusted request.

Prisma references: [configuration](https://www.prisma.io/docs/orm/v7/reference/prisma-config-reference), [PostgreSQL adapter](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql), [transactions](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions).

## Completed privacy/recovery integration

Phase 5C–5F adds verified email/recovery, reminder delivery, transaction-local audit actor/triggers, active-family/user checks, tombstones and retention. Operator backup/restore uses an exported snapshot, encrypted object stream and deletion ledger; see [privacy runbook](../../../docs/privacy-backup.md) and [security operations](../../../docs/security-operations.md). Physical provider/device/DR acceptance remains external.
