# v44 Receipt Delete 500 Fix

This update makes receipt deletion safer for production databases.

## Fixed

- Receipt deletion now rolls back inventory using a snapshot of the receipt rows before deleting records.
- Receipt line items are explicitly removed before deleting receipt/product rows, preventing foreign-key order problems.
- Receipt-related store-price entries are removed before current product prices are refreshed.
- Products created only from the deleted receipt are deleted only after dependent price/list rows are cleaned up.
- Uploaded receipt photo deletion is attempted after the database transaction succeeds.
- Backend now logs a clear `Receipt delete failed` traceback if a server-side issue still happens.

## Test after deploy

1. Upload receipt.
2. Review/save receipt with inventory update.
3. Open Receipt History.
4. Delete receipt.
5. Confirm inventory quantity rolls back.
6. Confirm receipt disappears and no 500 is shown.

If it still fails, run:

```bash
docker compose logs backend --tail=200
```

Look for `Receipt delete failed`.
