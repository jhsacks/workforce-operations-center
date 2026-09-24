from __future__ import annotations

import json
import os
import sqlite3
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parents[1]
SEED = ROOT / "data" / "seed.json"

# Render persistent disks are commonly mounted under /var/data. The path can be
# overridden without changing code. Local development continues to use ./data.
configured_db = os.getenv("WORKFORCE_DB_PATH", "").strip()
if configured_db:
    DB = Path(configured_db)
elif Path("/var/data").exists():
    DB = Path("/var/data/workforce.db")
else:
    DB = ROOT / "data" / "workforce.db"
DB.parent.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Workforce Operations Center", version="2.3.1")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def connection() -> sqlite3.Connection:
    db = sqlite3.connect(DB, timeout=30)
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA synchronous=FULL")
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            payload TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS state_backup (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            payload TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    return db


def seed_state() -> dict[str, Any]:
    if not SEED.exists():
        return {}
    return json.loads(SEED.read_text(encoding="utf-8"))


def load_state() -> dict[str, Any]:
    with connection() as db:
        row = db.execute("SELECT payload FROM state WHERE id = 1").fetchone()
    if row:
        return json.loads(row[0])
    initial = seed_state()
    save_state(initial, create_backup=False)
    return initial


def save_state(data: dict[str, Any], create_backup: bool = True) -> None:
    if not isinstance(data, dict):
        raise ValueError("State must be a JSON object")
    payload = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
    now = datetime.now(timezone.utc).isoformat()
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        current = db.execute("SELECT payload FROM state WHERE id = 1").fetchone()
        if create_backup and current:
            db.execute(
                "INSERT INTO state_backup(payload, created_at) VALUES (?, ?)",
                (current[0], now),
            )
            # Retain the 25 most recent backups.
            db.execute(
                """
                DELETE FROM state_backup
                WHERE id NOT IN (
                    SELECT id FROM state_backup ORDER BY id DESC LIMIT 25
                )
                """
            )
        db.execute(
            """
            INSERT INTO state(id, payload, updated_at)
            VALUES(1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                payload = excluded.payload,
                updated_at = excluded.updated_at
            """,
            (payload, now),
        )
        db.commit()


@app.get("/api/health")
def health() -> dict[str, Any]:
    with connection() as db:
        row = db.execute("SELECT updated_at FROM state WHERE id = 1").fetchone()
    return {
        "status": "ok",
        "application": "Workforce Operations Center",
        "version": "2.3.1",
        "database_path": str(DB),
        "persistent_path_detected": str(DB).startswith("/var/data/"),
        "last_saved_at": row[0] if row else None,
    }


@app.get("/api/state")
def get_state() -> dict[str, Any]:
    return load_state()


@app.put("/api/state")
def put_state(state: dict[str, Any]) -> dict[str, Any]:
    save_state(state)
    return {
        "ok": True,
        "saved_at": datetime.now(timezone.utc).isoformat(),
        "database_path": str(DB),
    }


@app.get("/api/backups")
def list_backups() -> list[dict[str, Any]]:
    with connection() as db:
        rows = db.execute(
            "SELECT id, created_at FROM state_backup ORDER BY id DESC LIMIT 25"
        ).fetchall()
    return [{"id": row[0], "created_at": row[1]} for row in rows]


@app.post("/api/backups/{backup_id}/restore")
def restore_backup(backup_id: int) -> dict[str, Any]:
    with connection() as db:
        row = db.execute(
            "SELECT payload FROM state_backup WHERE id = ?", (backup_id,)
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Backup not found")
    save_state(json.loads(row[0]))
    return {"ok": True, "restored_backup_id": backup_id}


@app.post("/api/assistant")
def assistant(body: dict[str, Any]) -> dict[str, str]:
    prompt = str(body.get("prompt", "")).strip()
    context = body.get("context", {})
    endpoint = os.getenv("WORKFORCE_LLM_ENDPOINT", "").strip()
    api_key = os.getenv("WORKFORCE_LLM_API_KEY", "").strip()
    model = os.getenv("WORKFORCE_LLM_MODEL", "").strip()
    if not endpoint or not api_key:
        return {
            "mode": "rules",
            "answer": (
                "An approved LLM endpoint is not configured. The transparent "
                "rules-based staffing assistant remains available."
            ),
        }
    payload = json.dumps(
        {
            "model": model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a workforce scheduling assistant. Use only supplied "
                        "operational data. Explain recommendations. Do not evaluate "
                        "employee performance, infer protected traits, or publish "
                        "changes without human approval."
                    ),
                },
                {
                    "role": "user",
                    "content": prompt + "\n\n" + json.dumps(context),
                },
            ],
            "temperature": 0.1,
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        endpoint,
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            result = json.loads(response.read())
        return {"mode": "llm", "answer": result["choices"][0]["message"]["content"]}
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"LLM request failed: {type(exc).__name__}",
        ) from exc


DIST = ROOT / "frontend" / "dist"
if DIST.exists():
    assets = DIST / "assets"
    if assets.exists():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{path:path}")
    def spa(path: str) -> FileResponse:
        return FileResponse(DIST / "index.html")
