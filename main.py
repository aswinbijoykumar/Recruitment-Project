import os
import sys
import time
import subprocess
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import ollama

from groq import Groq
from dotenv import load_dotenv

load_dotenv()

groq_client = Groq()

app = FastAPI(title="HR Automation Platform API")

SYSTEM_PROMPT = """You are an expert HR and Technical Recruiter. Your sole task is to generate professional, well-structured Job Descriptions (JDs) based on client demands. 

When the user gives you demands, immediately output a JD with these sections:
1. Job Title (extrapolated from demands)
2. Role Overview
3. Key Responsibilities (bullet points)
4. Required Skills & Qualifications (must-haves vs nice-to-haves)
5. Preferred Experience

Keep the tone professional, attractive to candidates, and highly organized. Do not add conversational filler before or after the JD.
"""


# Schema tracking the JSON payload structure from the web frontend
class DemandPayload(BaseModel):
    demands: str
    engine: str

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
    """API endpoint that dynamically routes traffic to Ollama or Groq based on user input."""
    if not payload.demands.strip():
        raise HTTPException(status_code=400, detail="Demand input text cannot be empty.")
        
    def stream_generator():
        try:
            # PATH A: Local Execution via Ollama (Mistral)
            if payload.engine == "local-mistral":
                response_stream = ollama.generate(
                    model='mistral',
                    system=SYSTEM_PROMPT,
                    prompt=payload.demands,
                    stream=True
                )
                for chunk in response_stream:
                    yield chunk['response']
            
            # PATH B: Cloud Execution via Groq (Llama 3)
            elif payload.engine == "cloud-groq":
                # Ensure you initialized `groq_client = Groq()` at the top of your main.py
                groq_stream = groq_client.chat.completions.create(
                    model="llama3-8b-8192",  # Blistering fast Llama 3 cloud instance
                    messages=[
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": payload.demands}
                    ],
                    stream=True,
                )
                for chunk in groq_stream:
                    # Groq structures its stream response delta slightly differently
                    token = chunk.choices[0].delta.content
                    if token:
                        yield token
            
            else:
                yield "\n[System Error: Unsupported inference engine selected.]"
                
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