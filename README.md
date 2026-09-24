# Workforce Operations Center

A separate React + FastAPI workforce scheduling application modeled on the pediatric cardiology daily huddle.

## Included
- Location by role daily huddle board
- MD, RN, MA, Sonographer, FOS and All Roles views
- Drag and drop between cells and Admin / Off / Remote / Hospital lanes
- Searchable type-or-select assignment inside each cell
- Editable roster
- Unlimited clinic types: in-person, hybrid, telemedicine, remote diagnostics, administrative
- Explicit baseline requirements per clinic type
- Daily and weekly staffing overrides
- Color-coded covered, missing, excess, and not-needed states
- Draft coverage generation using role and availability constraints
- Requirement explanations
- Weekly overview, audit log, JSON export
- SQLite persistence through FastAPI
- Optional organization-approved LLM endpoint; absence of an endpoint uses the transparent rules engine

## Run locally

### 1. Build the frontend
```bash
cd frontend
npm install
npm run build
```

### 2. Start the API and built app
```bash
cd ..
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

Open `http://localhost:8000`.

## Development mode
Run `npm run dev` in `frontend` and `uvicorn backend.main:app --reload --port 8000` from the project root. Vite serves the frontend and FastAPI serves `/api`.

## Optional LLM settings
Set only an enterprise-approved endpoint and credentials:
- `WORKFORCE_LLM_ENDPOINT`
- `WORKFORCE_LLM_API_KEY`
- `WORKFORCE_LLM_MODEL`

The LLM is advisory only. It cannot publish schedules and must not evaluate employee performance or use protected characteristics.
