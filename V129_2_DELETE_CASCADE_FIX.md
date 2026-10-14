# V129.2 — House & Account Delete Reliability

## Fixed
- House deletion no longer relies solely on historical PostgreSQL `ON DELETE CASCADE` constraints.
- Account deletion explicitly cleans solo-owned houses and all account-dependent rows before deleting the user.
- Shared-house records with nullable attribution are anonymized instead of leaving broken user references.
- Rows that require a non-null participant (for example, the deleted user's expense participation) are explicitly removed.
- Delete routes now rollback the full transaction on failure, so users are not left with a half-deleted account/house.
- Server logs include a precise traceback for any remaining deletion failure while the user sees a safe actionable message.

## Why this was necessary
GHM has used additive schema compatibility updates for many releases. `Base.metadata.create_all()` and `ALTER TABLE ... ADD COLUMN` do not rewrite foreign-key constraints that were created by older versions. A long-lived production database can therefore contain older FK delete behavior even though current SQLAlchemy models specify CASCADE/SET NULL.

V129.2 performs explicit application-level cleanup so deletion works across old and new GHM databases.

## Database migration
No migration is required.
