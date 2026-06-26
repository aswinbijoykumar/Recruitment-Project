import os
import sys
import time
import subprocess
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import ollama

app = FastAPI(title="HR Automation Platform API")

# Schema tracking the JSON payload structure from the web frontend
class DemandPayload(BaseModel):
    demands: str

def verify_ollama_status():
    """Validates if the local Ollama background server is active; sparks it if offline."""
    try:
        ollama.list()
    except Exception:
        if sys.platform == "win32":
            subprocess.Popen(["cmd", "/c", "start", "/B", "ollama", "serve"],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            subprocess.Popen(["ollama", "serve"],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(4)

# Run verification check immediately upon application startup
verify_ollama_status()

@app.get("/", response_class=HTMLResponse)
async def serve_dashboard():
    """Serves the main recruitment HTML interface directly to the user's browser."""
    html_path = os.path.join("templates", "index.html")
    if not os.path.exists(html_path):
        raise HTTPException(status_code=404, detail="Frontend template index.html not found.")
    with open(html_path, "r", encoding="utf-8") as file:
        return file.read()

@app.post("/api/generate-jd")
async def generate_jd_stream(payload: DemandPayload):
    """API endpoint that receives client demands and streams text tokens from Ollama."""
    if not payload.demands.strip():
        raise HTTPException(status_code=400, detail="Demand input text cannot be empty.")
        
    def stream_generator():
        try:
            # Query custom Ollama model with stream enabled
            response_stream = ollama.generate(
                model='jd-generator',
                prompt=payload.demands,
                stream=True
            )
            for chunk in response_stream:
                yield chunk['response']
        except Exception as api_error:
            yield f"\n[System Error: Unable to compute model stream. {str(api_error)}]"

    return StreamingResponse(stream_generator(), media_type="text/plain")

# Serve static assets (CSS, JS) from the templates directory
# Placed after routes to avoid mount shadowing API endpoints
app.mount("/static", StaticFiles(directory="templates"), name="static")

if __name__ == "__main__":
    import uvicorn
    # Start the server locally on Port 8000
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)