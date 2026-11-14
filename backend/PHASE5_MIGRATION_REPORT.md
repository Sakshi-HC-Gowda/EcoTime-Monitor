# Phase 5 database migration report

## Files changed

- `backend/extensions.py` registers Flask-Migrate.
- `backend/app.py` initializes Flask-Migrate and no longer calls `db.create_all()`
  or either legacy schema/data migration during application startup.
- `backend/requirements.txt` adds `Flask-Migrate==4.1.0`.
- `backend/migrations/` contains the Alembic environment, configuration, and
  revision `20261114_phase5`.
- `backend/phase5_db_checks.py` reports foreign keys, unique constraints,
  indexes, and reward ownership orphan counts without printing credentials.
- `backend/tests/test_phase5_migrations.py` covers migration registration and
  the no-schema-alteration startup contract.
- `README.md` documents the reviewed-backup and explicit-upgrade workflow.

## Schema changes

The revision creates missing tables from the current SQLAlchemy metadata and
adds missing ownership, scheduling, upload idempotency, recommendation
ownership, and leaderboard opt-in columns. It creates the existing activity
and upload idempotency indexes only when absent, and preserves the required
unique constraints:

- `uq_ecopoint_user_event`
- `uq_badge_user_type`
- `uq_org_member`

Activity and recommendation ownership foreign keys are added only when
existing non-null values have no orphaned parent IDs. Missing or orphaned
ownership values are not guessed, overwritten, or deleted.

Reward-table `user_id` and `organization_id` columns remain strings. No
integer conversion or foreign keys were added because existing values must be
reviewed and mapped explicitly before such a change can preserve all records.

Legacy `idle` activities are moved to `pending` in the migration and receive a
status-history row. The downgrade is intentionally a no-op because that data
change is not safely reversible.

## Validation and tests

- SQLite disposable migration upgrade: passed.
- Migration revision lookup on the persistent disposable SQLite database:
  passed.
- Backend suite: 216 passed, 1 failed. The failure is the existing
  `test_first_completion_starts_streak_and_awards_starter_badge` assertion,
  which compared a current UTC date with a stored previous date; it is
  unrelated to Phase 5 files.
- PostgreSQL disposable-database upgrade: not run in this environment because
  no disposable PostgreSQL service/URL was available. The migration uses
  PostgreSQL-specific SQL only behind a PostgreSQL dialect branch.

## Remaining risks and required review

1. Run `python phase5_db_checks.py` against a reviewed backup or disposable
   PostgreSQL clone and record all orphan counts before production approval.
2. Resolve any orphaned integer activity/recommendation ownership explicitly,
   then rerun the migration validation so the corresponding foreign keys can
   be added.
3. Do not apply `flask db upgrade` to the development database until the
   migration and validation output have been approved.
