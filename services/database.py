import sqlite3
import json
import re
from datetime import datetime
from pathlib import Path

DB_PATH = Path("data/saved_jds.db")


def get_conn():
    DB_PATH.parent.mkdir(exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS saved_jds (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                title       TEXT    NOT NULL,
                demands     TEXT    NOT NULL,
                jd_text     TEXT    NOT NULL,
                keywords    TEXT    NOT NULL,
                created_at  TEXT    NOT NULL
            )
        """)
        conn.commit()


def extract_keywords(demands: str, jd_text: str) -> list[str]:
    """Pull a concise keyword list from the demands + first JD line."""
    # Grab job title from first non-empty JD line
    title = ""
    for line in jd_text.splitlines():
        clean = line.strip().lstrip("#*- ").strip()
        if len(clean) > 3:
            title = clean[:60]
            break

    # Pull meaningful words from demands (skip stop-words)
    stop = {"a","an","the","and","or","for","with","in","of","to","at","on","is",
            "are","we","our","that","this","have","will","can","be","by","from",
            "need","looking","want","role","must","who","which","years","yr","yrs",
            "experience","expertise","skills","team","based","open","travel","work"}
    words = re.findall(r"\b[A-Za-z][A-Za-z0-9+#.]{2,}\b", demands)
    seen, tags = set(), []
    for w in words:
        lw = w.lower()
        if lw not in stop and lw not in seen:
            seen.add(lw)
            tags.append(w)
        if len(tags) >= 6:
            break

    return [title] + tags if title else tags


def save_jd(title: str, demands: str, jd_text: str, keywords: list[str]) -> int:
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO saved_jds (title, demands, jd_text, keywords, created_at) VALUES (?,?,?,?,?)",
            (title, demands, jd_text, json.dumps(keywords), datetime.utcnow().isoformat())
        )
        conn.commit()
        return cur.lastrowid


def list_jds() -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, title, keywords, created_at FROM saved_jds ORDER BY created_at DESC"
        ).fetchall()
    return [
        {
            "id":         r["id"],
            "title":      r["title"],
            "keywords":   json.loads(r["keywords"]),
            "created_at": r["created_at"],
        }
        for r in rows
    ]


def get_jd(jd_id: int) -> dict | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM saved_jds WHERE id = ?", (jd_id,)
        ).fetchone()
    if not row:
        return None
    return {
        "id":         row["id"],
        "title":      row["title"],
        "demands":    row["demands"],
        "jd_text":    row["jd_text"],
        "keywords":   json.loads(row["keywords"]),
        "created_at": row["created_at"],
    }


def delete_jd(jd_id: int) -> bool:
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM saved_jds WHERE id = ?", (jd_id,))
        conn.commit()
        return cur.rowcount > 0
