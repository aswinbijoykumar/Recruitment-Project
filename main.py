import os
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from groq import AsyncGroq
from dotenv import load_dotenv

from services.resume_parser import extract_resume_text
from services.jd_generator  import stream_jd_generation, analyze_and_rank_batch, synthesize_rejection_trends
from services.database       import init_db, save_jd, list_jds, get_jd, delete_jd, extract_keywords
from services.feedback_store import init_feedback_store, ingest_feedback_excel, query_rejection_trends, get_feedback_stats, clear_all_feedback

load_dotenv()
groq_client = AsyncGroq()

app = FastAPI(title="Protiviti HR Automation API")

@app.on_event("startup")
async def startup_event():
    # Initialise databases on startup (guards against reloader lock conflicts)
    init_db()
    init_feedback_store()


# ── Data Models ───────────────────────────────────────────────────────────────
class DemandPayload(BaseModel):
    demands: str

class SaveJDPayload(BaseModel):
    demands: str
    jd_text: str

class RoleTrendsPayload(BaseModel):
    role: str


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
# SOURCING INTELLIGENCE — Feedback Upload & Rejection Trends
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/api/upload-feedback")
async def api_upload_feedback(file: UploadFile = File(...)):
    """Upload an Excel (.xlsx) feedback file and ingest into Qdrant vector store."""
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Only .xlsx files are supported.")
    
    try:
        file_bytes = await file.read()
        result = ingest_feedback_excel(file_bytes)
        
        if result["errors"] and result["processed"] == 0:
            raise HTTPException(status_code=400, detail=result["errors"][0])
        
        return JSONResponse(result)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing feedback file: {str(e)}")


@app.post("/api/clear-feedback")
async def api_clear_feedback():
    """Clear all stored candidate feedback entries from vector memory."""
    if clear_all_feedback():
        return JSONResponse({"ok": True, "message": "Vector memory cleared successfully."})
    else:
        raise HTTPException(status_code=500, detail="Failed to clear vector memory collection.")


@app.post("/api/rejection-trends")
async def api_rejection_trends(payload: RoleTrendsPayload):
    """Query rejection trends for a specific role using Qdrant + LLM synthesis."""
    if not payload.role.strip():
        raise HTTPException(status_code=400, detail="Role name is required.")
    
    try:
        # Step 1: Get negative feedback entries from Qdrant (strict role filter)
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
        
        # Step 2: LLM synthesis of common rejection patterns
        synthesis = await synthesize_rejection_trends(groq_client, payload.role.strip(), feedback_entries)
        
        # Include the raw feedback entries for the UI to display
        synthesis["feedback_entries"] = [
            {
                "candidate_name": e.get("candidate_name", "Unknown"),
                "feedback_text": e.get("feedback_text", ""),
                "experience": e.get("experience", ""),
                "status_raw": e.get("status_raw", ""),
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


# ── Static files ──────────────────────────────────────────────────────────────
app.mount("/static", StaticFiles(directory="templates"), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)