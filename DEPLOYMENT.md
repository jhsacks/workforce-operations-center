# Deployment

This repository is a complete standalone application. Deploy the repository root as one Docker service.

## Required settings
- Container port: `8000`
- Health endpoint: `/api/health`
- Persistent storage mount: `/app/data`

The persistent mount is required so the SQLite schedule database survives container restarts.

## Optional enterprise LLM settings
- `WORKFORCE_LLM_ENDPOINT`
- `WORKFORCE_LLM_API_KEY`
- `WORKFORCE_LLM_MODEL`

Use only an organization-approved model endpoint. Without these settings, the transparent rules-based staffing assistant remains available.

## Local Docker test

```bash
docker build -t workforce-operations-center .
docker run --rm -p 8000:8000 -v workforce-data:/app/data workforce-operations-center
```

Open `http://localhost:8000` and verify `/api/health` returns status `ok`.
