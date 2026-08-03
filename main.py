from contextlib import asynccontextmanager
import os
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from openai import AsyncOpenAI
from groq import AsyncGroq
from dotenv import load_dotenv

from services.resume_parser import extract_resume_text
from services.jd_generator  import stream_jd_generation, analyze_and_rank_batch, synthesize_rejection_trends, refine_candidate_feedback_notes
from services.database       import (
    init_db, save_jd, list_jds, get_jd, delete_jd, extract_keywords,
    get_generic_questions, add_generic_question, update_generic_question, delete_generic_question,
    get_client_questions, add_or_update_client_question, enforce_client_questions_cap, get_question_bank_roles,
    list_feedback_datasets, get_feedback_dataset, delete_feedback_dataset
)
from services.feedback_store import init_feedback_store, ingest_feedback_excel, query_rejection_trends, get_feedback_stats, clear_all_feedback

load_dotenv()

openrouter_key = os.getenv("openrouter") or os.getenv("OPENROUTER_API_KEY")
if openrouter_key:
    groq_client = AsyncOpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=openrouter_key
    )
else:
    groq_client = AsyncGroq()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialise databases on startup (guards against reloader lock conflicts)
    init_db()
    init_feedback_store()
    yield

app = FastAPI(title="Protiviti HR Automation API", lifespan=lifespan)



# ── Data Models ───────────────────────────────────────────────────────────────
class DemandPayload(BaseModel):
    demands: str

class SaveJDPayload(BaseModel):
    demands: str
    jd_text: str

class RoleTrendsPayload(BaseModel):
    role: str


# ── Question Bank Data Models ───────────────────────────────────────────────
class GenericQuestionPayload(BaseModel):
    role_id: str
    question_text: str

class GenericQuestionUpdatePayload(BaseModel):
    question_text: str

class FeedbackRefinePayload(BaseModel):
    role_id: str
    raw_notes: str

class RefinedQuestionCommitItem(BaseModel):
    raw_text: str
    clean_text: str
    matched_id: int | None = None

class FeedbackCommitPayload(BaseModel):
    role_id: str
    questions: list[RefinedQuestionCommitItem]


# ── Frontend ──────────────────────────────────────────────────────────────────
@app.get("/", response_class=HTMLResponse)
async def serve_dashboard():
    html_path = os.path.join("templates", "index.html")
    if not os.path.exists(html_path):
        raise HTTPException(status_code=404, detail="Frontend template not found.")
    with open(html_path, "r", encoding="utf-8") as f:
        return f.read()


# ── JD Generation ─────────────────────────────────────────────────────────────
@app.post("/api/generate-jd")
async def generate_jd_stream(payload: DemandPayload):
    if not payload.demands.strip():
        raise HTTPException(status_code=400, detail="Input cannot be empty.")

    async def stream_generator():
        try:
            async for token in stream_jd_generation(groq_client, payload.demands):
                yield token.encode("utf-8")
        except Exception as e:
            yield f"\n[Error] {str(e)}".encode("utf-8")

    return StreamingResponse(stream_generator(), media_type="text/plain; charset=utf-8")


# ── Save JD ───────────────────────────────────────────────────────────────────
@app.post("/api/save-jd")
async def api_save_jd(payload: SaveJDPayload):
    if not payload.jd_text.strip():
        raise HTTPException(status_code=400, detail="JD text is empty.")

    keywords = extract_keywords(payload.demands, payload.jd_text)
    title    = keywords[0] if keywords else "Saved JD"

    jd_id = save_jd(title, payload.demands, payload.jd_text, keywords)
    return JSONResponse({"id": jd_id, "title": title, "keywords": keywords})


# ── List Saved JDs ────────────────────────────────────────────────────────────
@app.get("/api/saved-jds")
async def api_list_jds():
    return JSONResponse(list_jds())


# ── Get Single Saved JD ───────────────────────────────────────────────────────
@app.get("/api/saved-jds/{jd_id}")
async def api_get_jd(jd_id: int):
    jd = get_jd(jd_id)
    if not jd:
        raise HTTPException(status_code=404, detail="JD not found.")
    return JSONResponse(jd)


# ── Delete Saved JD ───────────────────────────────────────────────────────────
@app.delete("/api/saved-jds/{jd_id}")
async def api_delete_jd(jd_id: int):
    if not delete_jd(jd_id):
        raise HTTPException(status_code=404, detail="JD not found.")
    return JSONResponse({"ok": True})


# ── Resume Analysis ───────────────────────────────────────────────────────────
@app.post("/api/analyze-resume")
async def analyze_resume(
    jd_text: str = Form(...),
    resume_files: list[UploadFile] = File(...)
):
    if not resume_files:
        raise HTTPException(status_code=400, detail="No resume files uploaded.")
    
    resumes_data = []
    for resume_file in resume_files:
        try:
            file_bytes = await resume_file.read()
            resume_text = extract_resume_text(file_bytes, resume_file.filename)
            if not resume_text.strip():
                continue
            resumes_data.append({"name": resume_file.filename, "text": resume_text})
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error parsing file '{resume_file.filename}': {str(e)}")
            
    if not resumes_data:
        raise HTTPException(status_code=400, detail="No readable content found in any of the uploaded resumes.")
        
    try:
        results = await analyze_and_rank_batch(groq_client, jd_text, resumes_data)
        return JSONResponse(results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error running batch evaluation: {str(e)}")


# ══════════════════════════════════════════════════════════════════════════════
# ══════════════════════════════════════════════════════════════════════════════
# SOURCING INTELLIGENCE — Feedback Upload & Rejection Trends
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/api/upload-feedback")
async def api_upload_feedback(file: UploadFile = File(...)):
    """Upload an Excel (.xlsx) feedback file and save as an SQLite dataset."""
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Only .xlsx files are supported.")
    
    try:
        file_bytes = await file.read()
        result = ingest_feedback_excel(file_bytes, filename=file.filename)
        
        if result.get("errors") and result.get("processed", 0) == 0:
            raise HTTPException(status_code=400, detail=result["errors"][0])
        
        return JSONResponse(result)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing feedback file: {str(e)}")


@app.get("/api/feedback-datasets")
async def api_list_feedback_datasets():
    """List all uploaded Excel feedback datasets."""
    try:
        return JSONResponse(list_feedback_datasets())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/feedback-datasets/{dataset_id}")
async def api_get_feedback_dataset(dataset_id: int):
    """Get metadata and records for a specific feedback dataset."""
    dataset = get_feedback_dataset(dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Feedback dataset not found.")
    return JSONResponse(dataset)


@app.delete("/api/feedback-datasets/{dataset_id}")
async def api_delete_feedback_dataset(dataset_id: int):
    """Delete a specific feedback dataset."""
    if not delete_feedback_dataset(dataset_id):
        raise HTTPException(status_code=404, detail="Feedback dataset not found.")
    return JSONResponse({"ok": True})


@app.post("/api/clear-feedback")
async def api_clear_feedback():
    """Clear all stored candidate feedback datasets and records."""
    if clear_all_feedback():
        return JSONResponse({"ok": True, "message": "Feedback memory cleared successfully."})
    else:
        raise HTTPException(status_code=500, detail="Failed to clear feedback memory.")


@app.post("/api/rejection-trends")
async def api_rejection_trends(payload: RoleTrendsPayload):
    """Query rejection trends for a specific role using SQLite + Gemma 31B LLM context synthesis."""
    if not payload.role.strip():
        raise HTTPException(status_code=400, detail="Role name is required.")
    
    try:
        # Step 1: Get negative feedback entries from SQLite for this role
        feedback_entries = query_rejection_trends(payload.role.strip())
        
        if not feedback_entries:
            return JSONResponse({
                "common_gaps": [],
                "sourcing_refinement": "",
                "candidate_count": 0,
                "confidence": "None",
                "message": f"No rejection feedback found for role: {payload.role}",
                "feedback_entries": [],
            })
        
        # Step 2: LLM synthesis of common rejection patterns via 256k Gemma context
        synthesis = await synthesize_rejection_trends(groq_client, payload.role.strip(), feedback_entries)
        
        # Include raw feedback entries for the UI dashboard
        synthesis["feedback_entries"] = [
            {
                "candidate_name": e.get("candidate_name", "Unknown"),
                "feedback_text": e.get("feedback_text", ""),
                "experience": e.get("experience", ""),
                "status_raw": e.get("status_raw", ""),
                "skills": e.get("skills", ""),
            }
            for e in feedback_entries
        ]
        
        return JSONResponse(synthesis)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analyzing rejection trends: {str(e)}")


@app.get("/api/feedback-stats")
async def api_feedback_stats():
    """Get per-role feedback counts."""
    try:
        stats = get_feedback_stats()
        return JSONResponse(stats)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching feedback stats: {str(e)}")


# ── Question Bank API routes ──────────────────────────────────────────────────

@app.get("/api/question-bank/roles")
async def api_question_bank_roles():
    try:
        roles = get_question_bank_roles()
        return JSONResponse({"roles": roles})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/question-bank/generic")
async def api_get_generic_questions(role_id: str):
    if not role_id.strip():
        raise HTTPException(status_code=400, detail="role_id is required")
    try:
        questions = get_generic_questions(role_id.strip())
        return JSONResponse({"questions": questions})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/question-bank/generic")
async def api_add_generic_question(payload: GenericQuestionPayload):
    if not payload.role_id.strip() or not payload.question_text.strip():
        raise HTTPException(status_code=400, detail="role_id and question_text are required")
    try:
        raw_lines = payload.question_text.splitlines()
        questions_to_add = [line.strip() for line in raw_lines if line.strip()]
        
        if not questions_to_add:
            raise HTTPException(status_code=400, detail="No valid question text provided")
            
        inserted_ids = []
        for q_text in questions_to_add:
            q_id = add_generic_question(payload.role_id.strip(), q_text)
            inserted_ids.append(q_id)

        return JSONResponse({"ok": True, "ids": inserted_ids, "count": len(inserted_ids)})
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@app.put("/api/question-bank/generic/{q_id}")
async def api_update_generic_question(q_id: int, payload: GenericQuestionUpdatePayload):
    if not payload.question_text.strip():
        raise HTTPException(status_code=400, detail="question_text is required")
    try:
        ok = update_generic_question(q_id, payload.question_text.strip())
        return JSONResponse({"ok": ok})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/question-bank/generic/{q_id}")
async def api_delete_generic_question(q_id: int):
    try:
        ok = delete_generic_question(q_id)
        return JSONResponse({"ok": ok})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/question-bank/refine-feedback")
async def api_refine_feedback(payload: FeedbackRefinePayload):
    if not payload.role_id.strip() or not payload.raw_notes.strip():
        raise HTTPException(status_code=400, detail="role_id and raw_notes are required")
    try:
        # Get existing questions for role
        existing = get_client_questions(payload.role_id.strip())
        # Call LLM refiner
        result = await refine_candidate_feedback_notes(groq_client, payload.role_id.strip(), payload.raw_notes.strip(), existing)
        return JSONResponse(result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/question-bank/commit-feedback")
async def api_commit_feedback(payload: FeedbackCommitPayload):
    if not payload.role_id.strip():
        raise HTTPException(status_code=400, detail="role_id is required")
    try:
        inserted = 0
        updated = 0
        for q in payload.questions:
            if not q.clean_text.strip():
                continue
            add_or_update_client_question(
                payload.role_id.strip(),
                q.raw_text.strip(),
                q.clean_text.strip(),
                q.matched_id
            )
            if q.matched_id is not None:
                updated += 1
            else:
                inserted += 1
        
        # Enforce FIFO / Frequency capping to max 20 questions
        purged = enforce_client_questions_cap(payload.role_id.strip(), max_cap=20)
        return JSONResponse({
            "ok": True,
            "inserted": inserted,
            "updated": updated,
            "purged": purged
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/question-bank/pack")
async def api_question_bank_pack(role_id: str):
    if not role_id.strip():
        raise HTTPException(status_code=400, detail="role_id is required")
    try:
        # Fetch active client questions sorted by freq DESC, update DESC
        client_qs = get_client_questions(role_id.strip())
        
        # Fetch generic questions
        generic_qs = get_generic_questions(role_id.strip())
        
        # Merge logic
        pack = []
        for q in client_qs:
            pack.append({
                "id": q["id"],
                "text": q["clean_text"],
                "type": "client",
                "frequency": q["frequency_count"]
            })
            
        # Target question pack size: 15 to 20. Let's target 15 questions as default limit
        if len(pack) < 15:
            needed = 15 - len(pack)
            for g in generic_qs[:needed]:
                pack.append({
                    "id": g["id"],
                    "text": g["question_text"],
                    "type": "generic",
                    "frequency": 0
                })
                
        return JSONResponse({
            "role_id": role_id,
            "questions": pack,
            "client_count": len(client_qs),
            "generic_count": len(generic_qs)
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Static files ──────────────────────────────────────────────────────────────
app.mount("/static", StaticFiles(directory="templates"), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)