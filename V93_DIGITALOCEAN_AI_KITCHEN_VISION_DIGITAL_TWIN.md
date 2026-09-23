# Grocery House Manager V93 — DigitalOcean AI, Kitchen Vision & Household Digital Twin

V93 upgrades the V92 choice-aware Autopilot with a production-oriented DigitalOcean AI layer while keeping PostgreSQL and deterministic FastAPI rules as the source of truth.

## What is new

### Kitchen Vision
- Household Pro users can upload kitchen photos or short videos.
- Video is sampled into still frames with FFmpeg before analysis.
- When DigitalOcean multimodal inference is configured, Kitchen Vision can identify generic physical products even without readable labels (for example bananas, tomatoes, eggs, bread, milk containers and household consumables).
- Exact brand/SKU/size is only accepted when visual evidence supports it.
- Each detection includes confidence, evidence source, inventory match, current quantity, estimated quantity and optional visible remaining percentage.
- Every detection is user-reviewable: keep inventory unchanged, update an existing product, or add a new product.
- Optional "Act on confirmed depletion" can add newly low/depleted staples to the active grocery list after the user approves the scan.
- If DigitalOcean inference is unavailable, Kitchen Vision falls back to OCR label recognition instead of breaking.

### Household Digital Twin
- Deterministic model built from receipt purchase history, current inventory and Autopilot decision history.
- Calculates average purchase interval, average purchased quantity, estimated daily use and predicted days remaining when enough evidence exists.
- Flags products likely to be needed within 7 days.
- Uses confidence labels rather than pretending sparse history is precise.
- Shows the household's learned trip-choice pattern and average extra cost accepted for convenience/premium choices.

### DigitalOcean Household Agent connector
- New backend-only connection to a DigitalOcean Agent endpoint.
- Sends current household inventory, active shopping list, preference strategy and Digital Twin context to the configured agent.
- Keeps DigitalOcean endpoint access keys off the frontend.
- If the agent is not configured, the UI explains exactly what is missing instead of failing.

### Admin AI diagnostics
- New Admin panel for:
  - DigitalOcean multimodal inference
  - Household Agent endpoint
  - kitchen video pipeline
  - media privacy behavior
  - optional DigitalOcean Spaces readiness
- One-click system test validates the configured inference key and agent endpoint.

### Privacy and safety
- Kitchen media is processed ephemerally by default and is not stored in the GHM database.
- V93 defaults to `KITCHEN_MEDIA_DELETE_AFTER_ANALYSIS=true`.
- AI detections never silently delete inventory.
- User approval remains the boundary between AI detection and database mutation.
- Exact brand/size/quantity should be treated as uncertain unless sufficient visual evidence exists.

## DigitalOcean setup

Create a **Model Access Key** in DigitalOcean Inference and configure:

```env
DIGITALOCEAN_AI_ENABLED=true
DIGITALOCEAN_INFERENCE_KEY=doo-v1-...
DIGITALOCEAN_VISION_MODEL=nemotron-nano-12b-v2-vl
```

Create a DigitalOcean Agent and Endpoint Access Key, then configure:

```env
DIGITALOCEAN_AGENT_ENABLED=true
DIGITALOCEAN_AGENT_URL=https://YOUR-AGENT-ENDPOINT.agents.do-ai.run
DIGITALOCEAN_AGENT_ACCESS_KEY=...
```

Kitchen Vision works without DigitalOcean Spaces. Optional private Spaces configuration is included in `.env.example` for deployments that later choose to retain private AI media.

## Deployment

```bash
docker compose up -d --build
```

The backend Docker image now installs FFmpeg in addition to Tesseract so Kitchen Vision can safely sample short video scans.

## Validation performed in this package
- Backend Python source modules compile successfully.
- All frontend TS/TSX source files parse/transpile successfully with TypeScript syntax validation.
- Full stylesheet parses with zero structural CSS errors.
- Full npm dependency installation was not completed in this build environment because registry installation timed out; normal Docker/frontend dependency installation still uses the existing `package-lock.json`.
