import os
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from groq import AsyncGroq
from dotenv import load_dotenv

from services.resume_parser import extract_resume_text
from services.jd_generator  import stream_jd_generation, stream_resume_analysis
from services.database       import init_db, save_jd, list_jds, get_jd, delete_jd, extract_keywords

load_dotenv()
groq_client = AsyncGroq()

app = FastAPI(title="Protiviti HR Automation API")

# Initialise SQLite on startup
init_db()


# ── Data Models ───────────────────────────────────────────────────────────────
class DemandPayload(BaseModel):
    demands: str

class SaveJDPayload(BaseModel):
    demands: str
    jd_text: str


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
async def analyze_resume(jd_text: str = Form(...), resume_file: UploadFile = File(...)):
    file_bytes = await resume_file.read()
    try:
        resume_text = extract_resume_text(file_bytes, resume_file.filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not resume_text:
        raise HTTPException(status_code=400, detail="Could not extract text from resume.")

    async def stream_generator():
        try:
            async for token in stream_resume_analysis(groq_client, jd_text, resume_text):
                yield token.encode("utf-8")
        except Exception as e:
            yield f"\n[Error during analysis: {str(e)}]".encode("utf-8")

    return StreamingResponse(stream_generator(), media_type="text/plain; charset=utf-8")


# ── Static files ──────────────────────────────────────────────────────────────
app.mount("/static", StaticFiles(directory="templates"), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)