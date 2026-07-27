# v36 Public Site Polish — No Screenshots or Videos

This update keeps the project clean and does **not** add demo screenshots, product videos, or marketing media files.

## What changed

- Updated the homepage wording to match the current product direction.
- Replaced weak/old receipt wording with **Smart Receipt Scan**.
- Clarified that receipt scanning accepts **JPG and PNG receipt photos only**.
- Added a polished text-based receipt review preview on the homepage, without adding image/video assets.
- Added a homepage plan-access section that shows unlocked and locked features for Free Starter, Basic Home, Family Plus, and Household Pro.
- Updated About, Support, Privacy Policy, Terms, and Pricing copy to match the Tabscanner/JPG-PNG receipt flow.
- Removed public frontend references to technical terms like OCR, PDF upload, Open Food Facts, APIFY token, and actor configuration.

## Important

The project intentionally does not include the previously generated demo screenshot pack. We can add a real screenshot/video section later after the product UI is finalized.

## Deploy

```bash
docker compose down
docker compose up -d --build
```

## Test after deploy

- Home page
- Pricing page
- About page
- Support page
- Privacy Policy
- Terms
- Login
- Houses dashboard
- Receipt upload: JPG/JPEG/PNG accepted, other formats blocked
