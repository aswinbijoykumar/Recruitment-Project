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
        conn.execute("""
            CREATE TABLE IF NOT EXISTS roles_generic_questions (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                role_id        TEXT    NOT NULL,
                question_text  TEXT    NOT NULL,
                created_at     TEXT    NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS roles_client_questions (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                role_id          TEXT    NOT NULL,
                raw_text         TEXT    NOT NULL,
                clean_text       TEXT    NOT NULL,
                frequency_count  INTEGER DEFAULT 1,
                updated_at       TEXT    NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS feedback_datasets (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                filename    TEXT    NOT NULL,
                row_count   INTEGER NOT NULL,
                roles_json  TEXT    NOT NULL,
                created_at  TEXT    NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS feedback_records (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                dataset_id     INTEGER NOT NULL,
                role           TEXT    NOT NULL,
                job_family     TEXT,
                candidate_name TEXT    NOT NULL,
                status_raw     TEXT    NOT NULL,
                feedback_type  TEXT    NOT NULL,
                feedback_text  TEXT    NOT NULL,
                skills         TEXT,
                summary        TEXT,
                experience     TEXT,
                created_at     TEXT    NOT NULL,
                FOREIGN KEY (dataset_id) REFERENCES feedback_datasets (id) ON DELETE CASCADE
            )
        """)
        # Migration: Ensure job_family column exists if table was created previously
        try:
            conn.execute("ALTER TABLE feedback_records ADD COLUMN job_family TEXT")
        except Exception:
            pass
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


# ── Question Bank Generic CRUD ───────────────────────────────────────────────

def get_generic_questions(role_id: str) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, question_text, created_at FROM roles_generic_questions WHERE role_id = ? ORDER BY created_at DESC",
            (role_id,)
        ).fetchall()
    return [{"id": r["id"], "question_text": r["question_text"], "created_at": r["created_at"]} for r in rows]


def add_generic_question(role_id: str, question_text: str) -> int:
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO roles_generic_questions (role_id, question_text, created_at) VALUES (?, ?, ?)",
            (role_id, question_text, datetime.utcnow().isoformat())
        )
        conn.commit()
        return cur.lastrowid


def update_generic_question(q_id: int, question_text: str) -> bool:
    with get_conn() as conn:
        cur = conn.execute(
            "UPDATE roles_generic_questions SET question_text = ? WHERE id = ?",
            (question_text, q_id)
        )
        conn.commit()
        return cur.rowcount > 0


def delete_generic_question(q_id: int) -> bool:
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM roles_generic_questions WHERE id = ?", (q_id,))
        conn.commit()
        return cur.rowcount > 0


# ── Question Bank Client / Dynamic Functions ─────────────────────────────────

def get_client_questions(role_id: str) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, raw_text, clean_text, frequency_count, updated_at FROM roles_client_questions WHERE role_id = ? ORDER BY frequency_count DESC, updated_at DESC",
            (role_id,)
        ).fetchall()
    return [
        {
            "id": r["id"],
            "raw_text": r["raw_text"],
            "clean_text": r["clean_text"],
            "frequency_count": r["frequency_count"],
            "updated_at": r["updated_at"]
        }
        for r in rows
    ]


def add_or_update_client_question(role_id: str, raw_text: str, clean_text: str, matched_id: int | None = None) -> int:
    with get_conn() as conn:
        if matched_id is not None:
            # Check if this matched question exists
            row = conn.execute("SELECT id, frequency_count FROM roles_client_questions WHERE id = ?", (matched_id,)).fetchone()
            if row:
                new_freq = row["frequency_count"] + 1
                conn.execute(
                    "UPDATE roles_client_questions SET frequency_count = ?, updated_at = ? WHERE id = ?",
                    (new_freq, datetime.utcnow().isoformat(), matched_id)
                )
                conn.commit()
                return matched_id

        # Insert new
        cur = conn.execute(
            "INSERT INTO roles_client_questions (role_id, raw_text, clean_text, frequency_count, updated_at) VALUES (?, ?, ?, 1, ?)",
            (role_id, raw_text, clean_text, datetime.utcnow().isoformat())
        )
        conn.commit()
        return cur.lastrowid


def enforce_client_questions_cap(role_id: str, max_cap: int = 20) -> int:
    """If count exceeds max_cap, delete those with lowest frequency_count and oldest updated_at."""
    with get_conn() as conn:
        row = conn.execute("SELECT COUNT(*) as cnt FROM roles_client_questions WHERE role_id = ?", (role_id,)).fetchone()
        count = row["cnt"] if row else 0
        if count <= max_cap:
            return 0
        
        excess = count - max_cap
        rows = conn.execute(
            "SELECT id FROM roles_client_questions WHERE role_id = ? ORDER BY frequency_count ASC, updated_at ASC LIMIT ?",
            (role_id, excess)
        ).fetchall()
        
        ids_to_delete = [r["id"] for r in rows]
        if ids_to_delete:
            placeholders = ",".join("?" for _ in ids_to_delete)
            conn.execute(f"DELETE FROM roles_client_questions WHERE id IN ({placeholders})", ids_to_delete)
            conn.commit()
            return len(ids_to_delete)
        return 0


def get_question_bank_roles() -> list[str]:
    with get_conn() as conn:
        rows_gen = conn.execute("SELECT DISTINCT role_id FROM roles_generic_questions").fetchall()
        rows_cli = conn.execute("SELECT DISTINCT role_id FROM roles_client_questions").fetchall()
        
        roles = set()
        for r in rows_gen:
            if r["role_id"]: roles.add(r["role_id"])
        for r in rows_cli:
            if r["role_id"]: roles.add(r["role_id"])
            
        return sorted(list(roles))


# ── SQLite Feedback Store Functions ───────────────────────────────────────────

def save_feedback_dataset(filename: str, records: list[dict]) -> dict:
    """Save an ingested feedback dataset and its candidate rows into SQLite."""
    now_iso = datetime.utcnow().isoformat()
    roles_seen = sorted(list({r["role"] for r in records if r.get("role")}))
    
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO feedback_datasets (filename, row_count, roles_json, created_at) VALUES (?, ?, ?, ?)",
            (filename, len(records), json.dumps(roles_seen), now_iso)
        )
        dataset_id = cur.lastrowid
        
        for r in records:
            conn.execute(
                """
                INSERT INTO feedback_records 
                (dataset_id, role, job_family, candidate_name, status_raw, feedback_type, feedback_text, skills, summary, experience, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    dataset_id,
                    r.get("role", "Unknown"),
                    r.get("job_family", ""),
                    r.get("candidate_name", "Unknown"),
                    r.get("status_raw", ""),
                    r.get("feedback_type", "unknown"),
                    r.get("feedback_text", ""),
                    r.get("skills", ""),
                    r.get("summary", ""),
                    r.get("experience", ""),
                    now_iso
                )
            )
        conn.commit()
        
    return {
        "dataset_id": dataset_id,
        "filename": filename,
        "processed": len(records),
        "roles_found": roles_seen,
        "created_at": now_iso
    }


def list_feedback_datasets() -> list[dict]:
    """Return all saved Excel feedback datasets."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, filename, row_count, roles_json, created_at FROM feedback_datasets ORDER BY created_at DESC"
        ).fetchall()
    return [
        {
            "id": r["id"],
            "filename": r["filename"],
            "row_count": r["row_count"],
            "roles": json.loads(r["roles_json"]),
            "created_at": r["created_at"],
        }
        for r in rows
    ]


def get_feedback_dataset(dataset_id: int) -> dict | None:
    """Get dataset meta and its individual feedback records."""
    with get_conn() as conn:
        dataset_row = conn.execute(
            "SELECT * FROM feedback_datasets WHERE id = ?", (dataset_id,)
        ).fetchone()
        if not dataset_row:
            return None
            
        record_rows = conn.execute(
            "SELECT * FROM feedback_records WHERE dataset_id = ? ORDER BY id ASC", (dataset_id,)
        ).fetchall()
        
    return {
        "id": dataset_row["id"],
        "filename": dataset_row["filename"],
        "row_count": dataset_row["row_count"],
        "roles": json.loads(dataset_row["roles_json"]),
        "created_at": dataset_row["created_at"],
        "records": [dict(r) for r in record_rows]
    }


def delete_feedback_dataset(dataset_id: int) -> bool:
    """Delete a feedback dataset and its associated records."""
    with get_conn() as conn:
        conn.execute("DELETE FROM feedback_records WHERE dataset_id = ?", (dataset_id,))
        cur = conn.execute("DELETE FROM feedback_datasets WHERE id = ?", (dataset_id,))
        conn.commit()
        return cur.rowcount > 0


def get_feedback_records_by_role(role: str, negative_only: bool = True) -> list[dict]:
    """Fetch candidate feedback records matching a role."""
    with get_conn() as conn:
        if negative_only:
            rows = conn.execute(
                "SELECT * FROM feedback_records WHERE LOWER(role) = LOWER(?) AND feedback_type = 'negative' ORDER BY id DESC",
                (role.strip(),)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM feedback_records WHERE LOWER(role) = LOWER(?) ORDER BY id DESC",
                (role.strip(),)
            ).fetchall()
    return [dict(r) for r in rows]


def get_sqlite_feedback_stats() -> dict:
    """Return feedback counts grouped by role and type across all datasets."""
    with get_conn() as conn:
        rows = conn.execute("SELECT role, feedback_type, COUNT(*) as cnt FROM feedback_records GROUP BY role, feedback_type").fetchall()
        
    roles = {}
    total_count = 0
    for r in rows:
        role = r["role"] or "Unknown"
        ftype = r["feedback_type"] or "unknown"
        cnt = r["cnt"]
        total_count += cnt
        
        if role not in roles:
            roles[role] = {"positive": 0, "negative": 0, "total": 0}
            
        if ftype == "positive":
            roles[role]["positive"] += cnt
        elif ftype == "negative":
            roles[role]["negative"] += cnt
        roles[role]["total"] += cnt
        
    return {
        "roles": roles,
        "total": total_count
    }


def clear_all_sqlite_feedback() -> bool:
    """Clear all stored feedback datasets and records from SQLite."""
    with get_conn() as conn:
        conn.execute("DELETE FROM feedback_records")
        conn.execute("DELETE FROM feedback_datasets")
        conn.commit()
    return True

