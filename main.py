import os
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from groq import Groq
from dotenv import load_dotenv

# 1. Load environment variables (.env locally, or Environment Variables tab on Render)
load_dotenv()

# 2. Instantiate global authenticated Groq Cloud client
groq_client = Groq()

app = FastAPI(title="HR Automation Platform API")

# 3. Streamlined Pydantic data contract (Removed the 'engine' attribute)
class DemandPayload(BaseModel):
    demands: str

SYSTEM_PROMPT = """You are an expert HR and Technical Recruiter. Your sole task is to generate professional, well-structured Job Descriptions (JDs) based on client demands. 

When the user gives you demands, immediately output a JD with these sections:
1. Job Title (extrapolated from demands)
2. Role Overview
3. Key Responsibilities (bullet points)
4. Required Skills & Qualifications (must-haves vs nice-to-haves)
5. Preferred Experience

Keep the tone professional, attractive to candidates, and highly organized. Do not add conversational filler before or after the JD."""

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
    """API endpoint that directly streams text tokens from Groq Cloud using Llama 3."""
    if not payload.demands.strip():
        raise HTTPException(status_code=400, detail="Demand input text cannot be empty.")
        
    def stream_generator():
        try:
            # Directly call Groq Cloud API instance with streaming enabled
            groq_stream = groq_client.chat.completions.create(
                model="llama-3.1-8b-instant",  
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": payload.demands}
                ],
                stream=True,
            )
            for chunk in groq_stream:
                token = chunk.choices[0].delta.content
                if token:
                    yield token
            
        except Exception as api_error:
            yield f"\n[System Error: Unable to compute model stream. {str(api_error)}]"

    return StreamingResponse(stream_generator(), media_type="text/plain")

# Serve static assets (CSS, JS) if you use separate files inside the templates directory
app.mount("/static", StaticFiles(directory="templates"), name="static")

if __name__ == "__main__":
    import uvicorn
    # Start the server locally on Port 8000
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)