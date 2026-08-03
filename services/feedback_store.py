"""
SQLite-backed Feedback Store for Sourcing Intelligence.
Stores candidate feedback datasets and records in SQLite for LLM-based context analysis.
"""

import io
from openpyxl import load_workbook
from services.database import (
    init_db,
    save_feedback_dataset,
    get_feedback_records_by_role,
    get_sqlite_feedback_stats,
    clear_all_sqlite_feedback,
)


def init_feedback_store():
    """Initialise SQLite tables."""
    init_db()


def _derive_feedback_type(status: str) -> str:
    """Derive 'positive' or 'negative' from the Status column value."""
    if not status:
        return "unknown"
    lower = status.strip().lower()
    if "reject" in lower:
        return "negative"
    return "positive"


def _find_col(headers: list[str], candidates: list[str]) -> int:
    """Find column index matching candidate header names (case-insensitive substring/match)."""
    headers_lower = [h.lower() for h in headers]
    for cand in candidates:
        cand_lower = cand.lower()
        for idx, h in enumerate(headers_lower):
            if cand_lower in h:
                return idx
    return -1


def ingest_feedback_excel(file_bytes: bytes, filename: str = "feedback_sheet.xlsx") -> dict:
    """
    Parse an .xlsx file and store each feedback row as a record in SQLite.
    Strictly extracts Role of candidate, Job Family, and Client Feedback.
    """
    wb = load_workbook(filename=io.BytesIO(file_bytes), read_only=True, data_only=True)
    ws = wb.active

    # Read header row
    headers = [str(cell.value).strip() if cell.value else "" for cell in next(ws.iter_rows(min_row=1, max_row=1))]

    # Find column indices
    role_idx = _find_col(headers, ["HSBC Role Mapping", "Role of the candidate", "Role", "Job Role"])
    job_family_idx = _find_col(headers, ["Job Family", "Role Family", "Domain", "Job Track"])
    feedback_idx = _find_col(headers, ["Client Feedback", "Feedback", "Rejection Reason"])
    candidate_idx = _find_col(headers, ["Resource Name", "Candidate Name", "Candidate"])
    status_idx = _find_col(headers, ["Status", "Decision"])

    # Fallback to column index 0, 1, etc., if specific header not found
    if role_idx == -1: role_idx = 0
    if feedback_idx == -1 and len(headers) > 3: feedback_idx = 3

    if role_idx == -1 or feedback_idx == -1:
        wb.close()
        return {
            "processed": 0,
            "skipped": 0,
            "errors": ["Excel file must contain columns for Role of candidate and Client Feedback."],
            "roles_found": [],
        }

    processed = 0
    skipped = 0
    errors = []
    records = []

    for row in ws.iter_rows(min_row=2, values_only=True):
        try:
            role = str(row[role_idx] or "").strip() if role_idx < len(row) else ""
            feedback = str(row[feedback_idx] or "").strip() if feedback_idx < len(row) else ""
            job_family = str(row[job_family_idx] or "").strip() if (job_family_idx != -1 and job_family_idx < len(row)) else ""
            candidate = str(row[candidate_idx] or "").strip() if (candidate_idx != -1 and candidate_idx < len(row)) else "Candidate"
            status_raw = str(row[status_idx] or "").strip() if (status_idx != -1 and status_idx < len(row)) else "Rejected"

            if role == "None": role = ""
            if feedback == "None": feedback = ""
            if job_family == "None": job_family = ""
            if candidate == "None": candidate = "Candidate"
            if status_raw == "None": status_raw = "Rejected"

            # Skip rows without role or feedback
            if not role or not feedback:
                skipped += 1
                continue

            feedback_type = _derive_feedback_type(status_raw)

            records.append({
                "role": role,
                "job_family": job_family or "General",
                "candidate_name": candidate,
                "status_raw": status_raw,
                "feedback_type": feedback_type,
                "feedback_text": feedback,
            })
            processed += 1

        except Exception as e:
            errors.append(f"Row parsing error: {str(e)}")

    wb.close()

    if not records:
        return {
            "processed": 0,
            "skipped": skipped,
            "errors": errors or ["No valid feedback rows found in file."],
            "roles_found": [],
        }

    save_result = save_feedback_dataset(filename, records)
    save_result["skipped"] = skipped
    save_result["errors"] = errors
    return save_result


def query_rejection_trends(role: str) -> list[dict]:
    """Fetch negative feedback records for a specific role from SQLite."""
    return get_feedback_records_by_role(role, negative_only=True)


def get_feedback_stats() -> dict:
    """Returns feedback counts grouped by role and type from SQLite."""
    return get_sqlite_feedback_stats()


def clear_all_feedback() -> bool:
    """Clear all candidate feedback datasets and records from SQLite."""
    return clear_all_sqlite_feedback()
