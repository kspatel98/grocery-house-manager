# V37 Receipt Scan Limits Update

This update adds plan-based monthly limits for Smart Receipt Scan using the current Tabscanner allowance of 200 scans/month.

## Monthly limits

- Free Starter: 0 Smart Receipt Scans/month; manual receipt entry only.
- Basic Home: 5 Smart Receipt Scans/month.
- Family Plus: 20 Smart Receipt Scans/month.
- Household Pro: 50 Smart Receipt Scans/month.

These limits are counted against the **house owner's plan quota across all houses they own**, so invited members cannot multiply the owner's scan allowance. Manual receipt price entry does not consume scan quota.

## User-facing behavior

- The receipt upload section shows remaining scans: `remaining of total Smart Receipt Scans remaining`.
- Plans and feature cards show the scan limits clearly.
- If the user is about to use the last scan, the browser asks for confirmation before uploading.
- If the monthly limit is used up, the scan button is disabled and users can still use manual receipt entry.

## Safety cap

Add this to backend `.env`:

```env
TABSCANNER_MONTHLY_ACCOUNT_SCAN_CAP=200
```

This prevents the backend from continuing to scan after the current Tabscanner account allowance is reached. Set it to `0` only if you want to disable the global safety cap.

## New endpoint

```http
GET /houses/{house_id}/receipts/scan-usage
```

Returns used, limit, remaining, plan name, month label, allowed status, and last-scan status.
