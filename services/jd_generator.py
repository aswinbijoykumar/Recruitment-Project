import re
import os
import json
import asyncio
import logging
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

PRIMARY_MODEL = os.getenv("OPENROUTER_MODEL", "openai/gpt-oss-20b")
GROQ_MODEL = "openai/gpt-oss-120b"


def _get_groq_fallback_client() -> AsyncOpenAI:
    """Helper to initialize AsyncOpenAI pointing directly to Groq API using GROQ_API_KEY."""
    groq_key = os.getenv("GROQ_API_KEY")
    if not groq_key:
        raise RuntimeError("GROQ_API_KEY not found in environment.")
    return AsyncOpenAI(
        base_url="https://api.groq.com/openai/v1",
        api_key=groq_key
    )


def _get_openrouter_client() -> AsyncOpenAI:
    """Helper to initialize AsyncOpenAI pointing to OpenRouter API using openrouter API Key."""
    key = os.getenv("openrouter") or os.getenv("OPENROUTER_API_KEY")
    if not key:
        raise RuntimeError("OpenRouter API key not found in environment.")
    return AsyncOpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=key
    )


async def call_resume_llm_with_fallback(
    messages: list[dict],
    response_format: dict = None,
    temperature: float = 0.2,
    max_tokens: int = 2500
) -> str:
    """
    Tries MoonshotAI: Kimi K2.6 on OpenRouter first.
    If that fails, falls back to openai/gpt-oss-20b on Groq.
    If that also fails, falls back to openai/gpt-oss-120b on Groq.
    """
    # 1. Primary: Dots3-note via OpenRouter
    try:
        or_client = _get_openrouter_client()
        kwargs = {
            "model": "dots-studio/dots-3-note-preview:free",
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "max_completion_tokens": max_tokens,
        }
        if response_format:
            kwargs["response_format"] = response_format

        completion = await or_client.chat.completions.create(**kwargs)
        content = completion.choices[0].message.content if completion.choices else None
        finish_reason = completion.choices[0].finish_reason if completion.choices else "unknown"
        if content and content.strip():
            print(f"[Resume LLM] Dots3-note succeeded, finish_reason={finish_reason}, content_length={len(content)}")
            return content
    except Exception as kimi_err:
        print(f"[Resume LLM Failover] Dots3-note failed: {kimi_err}. Falling back to GPT-OSS-20b...")

    # 2. Fallback: GPT-OSS-20b via Groq
    try:
        groq_api_key = os.getenv("GROQ_API_KEY")
        if not groq_api_key:
            raise RuntimeError("GROQ_API_KEY not found.")
        groq_client = AsyncOpenAI(
            base_url="https://api.groq.com/openai/v1",
            api_key=groq_api_key
        )
        kwargs = {
            "model": "openai/gpt-oss-20b",
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "max_completion_tokens": max_tokens,
        }
        if response_format:
            kwargs["response_format"] = response_format

        completion = await groq_client.chat.completions.create(**kwargs)
        content = completion.choices[0].message.content if completion.choices else None
        if content and content.strip():
            print(f"[Resume LLM Failover] GPT-OSS-20b succeeded, content_length={len(content)}")
            return content
    except Exception as gpt_err:
        print(f"[Resume LLM Failover] GPT-OSS-20b failed: {gpt_err}. Falling back to GPT-OSS-120b...")

    # 3. Last Resort Fallback: GPT-OSS-120b via Groq
    try:
        fallback_client = _get_groq_fallback_client()
        kwargs = {
            "model": "openai/gpt-oss-120b",
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "max_completion_tokens": max_tokens,
        }
        if response_format:
            kwargs["response_format"] = response_format

        completion = await fallback_client.chat.completions.create(**kwargs)
        content = completion.choices[0].message.content if completion.choices else None
        if content and content.strip():
            print(f"[Resume LLM Fallover] GPT-OSS-120b succeeded, content_length={len(content)}")
            return content
        raise ValueError("All fallback models returned empty content.")
    except Exception as final_err:
        print(f"[Resume LLM Failover] All models failed. Final error: {final_err}")
        raise final_err


async def call_llm_with_fallback(
    client: AsyncOpenAI,
    messages: list[dict],
    response_format: dict = None,
    temperature: float = 0.3,
    max_tokens: int = 2500
) -> str:
    """
    Tries primary OpenRouter model first.
    If OpenRouter fails (404 model unavailable, 429 rate limit, network error),
    fails over directly to Groq using GROQ_API_KEY.
    """
    # 1. Primary Attempt: OpenRouter
    try:
        kwargs = {
            "model": PRIMARY_MODEL,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "max_completion_tokens": max_tokens,
        }
        if response_format:
            kwargs["response_format"] = response_format

        completion = await client.chat.completions.create(**kwargs)
        content = completion.choices[0].message.content if completion.choices else None
        finish_reason = completion.choices[0].finish_reason if completion.choices else "unknown"
        print(f"[LLM] OpenRouter finish_reason={finish_reason}, content_length={len(content) if content else 0}")
        
        if content and content.strip():
            return content

        print(f"[LLM Failover] OpenRouter returned empty content (finish_reason={finish_reason}). Falling back to Groq...")

    except Exception as primary_err:
        print(f"[LLM Failover] Primary OpenRouter model '{PRIMARY_MODEL}' failed ({primary_err}). Failsafe over to Groq {GROQ_MODEL}...")

    # 2. Backup Failover: Groq
    try:
        groq_client = _get_groq_fallback_client()
        kwargs = {
            "model": GROQ_MODEL,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "max_completion_tokens": max_tokens,
        }
        if response_format:
            kwargs["response_format"] = response_format

        completion = await groq_client.chat.completions.create(**kwargs)
        content = completion.choices[0].message.content if completion.choices else None
        finish_reason = completion.choices[0].finish_reason if completion.choices else "unknown"
        print(f"[LLM] Groq finish_reason={finish_reason}, content_length={len(content) if content else 0}")
        print(f"[LLM Debug] Groq content: {content}")
        
        if content and content.strip():
            return content

        raise ValueError(f"Groq returned empty content (finish_reason={finish_reason}). The model may be overloaded — please try again in a few seconds.")

    except Exception as groq_err:
        print(f"[LLM Failover] Groq backup model '{GROQ_MODEL}' failed: {groq_err}")
        raise groq_err


# 1. UPDATED SYSTEM PROMPT: Explicitly banned markdown and emojis
JD_SYSTEM_PROMPT = """You are an expert HR and Technical Recruiter.
Your sole task is to generate professional, well-structured Job Descriptions (JDs) based on client demands.

When the user gives you demands, immediately output a JD with these sections:
1. Job Title
2. Role Overview
3. Key Responsibilities (use simple hyphens '-' for bullet points)
4. Required Skills & Qualifications (must-haves vs nice-to-haves)
5. Preferred Experience

CRITICAL RULES:
- Write in standard, plain text English. 
- DO NOT use any markdown formatting like hashtags (#) for headers or asterisks (*) for bold text.
- DO NOT use emojis.
- DO NOT include any 'About Protiviti' or other company description at the end.
- Keep the tone professional, attractive to candidates, and highly organized."""

RESUME_ANALYSIS_PROMPT = """You are a senior HR analyst and talent acquisition expert .

Analyze the resume against the job description and produce a structured match report.

Use EXACTLY these section headers on their own line, with no extra symbols, hashtags, or emojis:

OVERALL MATCH SCORE
Write a score like "Match Score: 78 / 100" followed by a verdict on the next line: Strong Match, Moderate Match, or Weak Match. Then one sentence explaining the verdict.

STRENGTHS
List each strength as a bullet point starting with "- ". Be specific, referencing actual content from the resume and JD. Each point on its own line.

GAPS
List each gap as a bullet point starting with "- ". Be specific about what is missing from the resume compared to the JD. Each point on its own line.

SECTION ASSESSMENT
Write one line per category in this exact format:
Skills Match: [rating and brief comment]
Experience Level: [rating and brief comment]
Education: [rating and brief comment]
Industry Fit: [rating and brief comment]
Soft Skills: [rating and brief comment]

RECOMMENDATION
Write 2-3 sentences. State clearly whether the candidate should move forward, and if so, to which interview stage.

Rules:
- No hashtags (#), no emojis, no asterisks for bold, no markdown formatting of any kind.
- Use plain professional English throughout.
- Be honest, specific, and reference actual content from both documents."""

def clean_token(token: str) -> str:
    """Removes asterisks, hashtags, and emojis from text tokens while preserving hyphens and punctuation."""
    # Remove asterisks and hashtags (markdown headers/bold)
    token = token.replace("*", "").replace("#", "")
    
    # Normalize unicode hyphens/dashes (en-dash, em-dash, figure dash, minus) to standard ASCII '-'
    token = re.sub(r'[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]', '-', token)
    
    # Normalize unicode quotation marks to standard ASCII quotes
    token = re.sub(r'[\u2018\u2019]', "'", token)
    token = re.sub(r'[\u201C\u201D]', '"', token)
    
    # Normalize unicode bullet symbols to standard ASCII '-'
    token = re.sub(r'[\u2022\u2023\u25E6\u2043\u2219]', '-', token)
    
    # Remove emojis and miscellaneous decorative symbols without stripping standard text/punctuation
    emoji_pattern = re.compile(
        r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50-\u2b55]',
        flags=re.UNICODE
    )
    token = emoji_pattern.sub('', token)
    
    return token

async def stream_jd_generation(client: AsyncOpenAI, demands: str):
    """Async generator to yield JD tokens with failover to Groq Llama 8B Instant."""
    messages = [
        {"role": "system", "content": JD_SYSTEM_PROMPT},
        {"role": "user",   "content": demands}
    ]
    try:
        stream = await client.chat.completions.create(
            model=PRIMARY_MODEL,
            messages=messages,
            stream=True,
        )
    except Exception as err:
        print(f"[LLM Stream Failover] Primary stream ({PRIMARY_MODEL}) failed: {err}. Failing over to Groq {GROQ_MODEL}...")
        groq_client = _get_groq_fallback_client()
        stream = await groq_client.chat.completions.create(
            model=GROQ_MODEL,
            messages=messages,
            stream=True,
        )

    async for chunk in stream:
        token = chunk.choices[0].delta.content
        if token:
            cleaned_token = clean_token(token)
            if cleaned_token:
                yield cleaned_token

async def stream_resume_analysis(client: AsyncOpenAI, jd_text: str, resume_text: str):
    """Async generator to yield Resume Analysis tokens using Dots3-note with fallback to GPT-OSS."""
    user_message = f"--- JOB DESCRIPTION ---\n{jd_text}\n\n--- CANDIDATE RESUME ---\n{resume_text}"
    messages = [
        {"role": "system", "content": RESUME_ANALYSIS_PROMPT},
        {"role": "user",   "content": user_message}
    ]
    try:
        or_client = _get_openrouter_client()
        stream = await or_client.chat.completions.create(
            model="dots-studio/dots-3-note-preview:free",
            messages=messages,
            stream=True,
        )
        print("[Resume Stream] Streaming using Dots3-note...")
    except Exception as err:
        print(f"[Resume Stream Failover] Dots3-note stream failed: {err}. Failing over to Groq GPT-OSS...")
        try:
            groq_api_key = os.getenv("GROQ_API_KEY")
            groq_client = AsyncOpenAI(
                base_url="https://api.groq.com/openai/v1",
                api_key=groq_api_key
            )
            stream = await groq_client.chat.completions.create(
                model="openai/gpt-oss-20b",
                messages=messages,
                stream=True,
            )
            print("[Resume Stream Failover] Streaming using GPT-OSS-20b...")
        except Exception as err2:
            print(f"[Resume Stream Failover] GPT-OSS-20b stream failed: {err2}. Failing over to GPT-OSS-120b...")
            groq_client = _get_groq_fallback_client()
            stream = await groq_client.chat.completions.create(
                model="openai/gpt-oss-120b",
                messages=messages,
                stream=True,
            )
            print("[Resume Stream Failover] Streaming using GPT-OSS-120b...")

    async for chunk in stream:
        token = chunk.choices[0].delta.content
        if token:
            cleaned_token = clean_token(token)
            if cleaned_token:
                yield cleaned_token


RESUME_ANALYSIS_JSON_PROMPT = """You are an elite talent acquisition expert and Subject Matter Expert (SME) in Banking, Finance, and Business Transformation. 
Your task is to critically analyze the candidate's resume against the provided Job Description (JD). 

Evaluate the resume with absolute rigor across these specific vectors:
1. Core Role Fit (e.g., Transformation Project Management, Change Management lifecycle).
2. Domain Expertise (depth of experience in specific banking sectors: Commercial, Institutional, Retail, Wealth, or Private banking).
3. Change Lifecycle Capabilities (identifying, documenting, and managing change requirements).
4. Seniority & Track Record (years of relevant leadership experience).

Scoring Guidelines (Be extremely strict; do not inflate scores):
- 90-100 (Exceptional): Candidate has direct, expert-level experience in all must-have areas of the JD and the exact target banking domains.
- 80-89 (Strong): Candidate meets all main requirements but lacks deep exposure in one minor/secondary area.
- 70-79 (Moderate): Candidate has relevant PM/Change experience but lacks specific banking/financial services domain fit, or vice versa.
- 50-69 (Weak): Major gaps in core lifecycle skills or domain experience.
- Under 50 (Unsuitable): Poor alignment.

You must return a JSON object with the following fields:
{
  "score": <integer score between 0 and 100. Avoid round numbers like 80/85/90; use granular scoring to represent exact match quality>,
  "verdict": "<Strong Match / Moderate Match / Weak Match>",
  "verdict_reason": "<a precise, one-sentence explanation of why the candidate received this specific score, highlighting domain or skill matches/gaps>",
  "contact_info": {
    "phone": "<extracted phone number, or 'Not specified'>",
    "email": "<extracted email address, or 'Not specified'>",
    "linkedin": "<extracted LinkedIn URL/link, or 'Not specified'>"
  },
  "skills_domain": "A comma-separated string of the candidate's key technical skills, tools, certifications, and domain expertise extracted from the resume.",
  "key_skills": ["A list of exactly 8 key technical skills, tools, or certifications extracted from the CV that are most relevant to the JD requirements."],
  "profile_pitch": "A precise 2-line client-facing email pitch describing the candidate's alignment against the Job Description. Highlight exact banking sector exposure and PM/change experience in a professional tone. Written in third person without bullet points.",
  "profile_summary": "A professional summary of the candidate of approximately 700 characters. Cover their experience, core skills, domain expertise, and general suitability based strictly on direct facts present in the CV.",
  "companies": ["A list of company/organization names the candidate has worked at. Example: ['Deloitte', 'TCS']."],
  "strengths": ["Critical, specific strengths matching the JD requirements"],
  "gaps": ["Crucial gaps, missing qualifications, or domain misalignments compared to the JD"],
  "assessment": {
    "Skills Match": "rating and critical comment",
    "Experience Level": "rating and critical comment",
    "Education": "rating and critical comment",
    "Industry Fit": "rating and critical comment",
    "Soft Skills": "rating and critical comment"
  },
  "recommendation": "2-3 sentences hiring recommendation"
}
Do not use markdown headers, asterisks, emojis or symbols. The keys must match exactly. Return ONLY valid JSON."""

RESUME_RERANK_JSON_PROMPT = """You are a senior recruitment leader and SME in Banking & Finance.
You are given a Job Description (JD) and a summary of evaluations for multiple candidate resumes.
Your task is to critically rank the candidates from best to worst based on their fit for the JD.

Reranking & Score Differentiation Guidelines (CRITICAL):
- Carefully compare candidates side-by-side. 
- DO NOT assign the same match score to different candidates. If candidates have similar profiles, look deeper into their specific domain expertise (e.g., depth of experience in Commercial vs Retail banking, scale of transformation projects, change lifecycle maturity) to break ties.
- Adjust the final scores to reflect a clear, staggered ranking hierarchy (e.g., if three candidates are close to 85, rank them distinctly with scores like 87, 84, and 81).
- Provide a justification highlighting the specific competitive advantage or gap that led to their relative position.

You must return a JSON object with a single key "ranking" containing a list of objects:
{
  "ranking": [
    {
      "rank": 1,
      "candidate_name": "candidate's name or filename",
      "score": <differentiated match score representing their relative rank>,
      "verdict": "<Strong/Moderate/Weak Match>",
      "justification": "One-line detailed explanation of why this candidate was ranked in this position relative to the others.",
      "contact_info": {
        "phone": "<extracted phone number>",
        "email": "<extracted email address>",
        "linkedin": "<extracted LinkedIn link>"
      }
    },
    ...
  ]
}
Return ONLY valid JSON."""

import json
import asyncio

async def analyze_single_resume(client: AsyncOpenAI, jd_text: str, resume_name: str, resume_text: str) -> dict:
    """Analyze a single resume and return structured JSON."""
    user_msg = f"--- JOB DESCRIPTION ---\n{jd_text}\n\n--- CANDIDATE RESUME ({resume_name}) ---\n{resume_text}"
    try:
        result_text = await call_resume_llm_with_fallback(
            messages=[
                {"role": "system", "content": RESUME_ANALYSIS_JSON_PROMPT},
                {"role": "user",   "content": user_msg}
            ],
            response_format={"type": "json_object"},
            temperature=0.2
        )
        return json.loads(result_text)
    except Exception as e:
        return {
            "score": 0,
            "verdict": "Error",
            "verdict_reason": f"Failed to analyze: {str(e)}",
            "contact_info": {
                "phone": "Not specified",
                "email": "Not specified",
                "linkedin": "Not specified"
            },
            "skills_domain": "Not available",
            "key_skills": [],
            "profile_pitch": "Not available",
            "profile_summary": "Not available",
            "companies": [],
            "strengths": [],
            "gaps": ["Error parsing resume analysis"],
            "assessment": {},
            "recommendation": "Error analyzing candidate."
        }

async def rank_candidates(client: AsyncOpenAI, jd_text: str, candidates_summary: str) -> list:
    """Generate final ranking leaderboard for all candidates."""
    user_msg = f"--- JOB DESCRIPTION ---\n{jd_text}\n\n--- CANDIDATE EVALUATION SUMMARIES ---\n{candidates_summary}"
    try:
        result_text = await call_resume_llm_with_fallback(
            messages=[
                {"role": "system", "content": RESUME_RERANK_JSON_PROMPT},
                {"role": "user",   "content": user_msg}
            ],
            response_format={"type": "json_object"},
            temperature=0.2
        )
        data = json.loads(result_text)
        raw_ranking = data.get("ranking", [])
        
        normalized_ranking = []
        for item in raw_ranking:
            # Fallback mappings for keys that vary between different models
            name = item.get("candidate_name") or item.get("name") or item.get("candidate") or "Unknown Candidate"
            score = item.get("score") or item.get("match_score") or 0
            verdict = item.get("verdict") or "Unknown"
            justification = item.get("justification") or ""
            rank_num = item.get("rank") or (len(normalized_ranking) + 1)
            
            normalized_ranking.append({
                "rank": rank_num,
                "candidate_name": name,
                "score": score,
                "verdict": verdict,
                "justification": justification,
                "contact_info": item.get("contact_info", {})
            })
        return normalized_ranking
    except Exception as e:
        return []

async def analyze_and_rank_batch(client: AsyncOpenAI, jd_text: str, resumes: list[dict]) -> dict:
    """Execute parallel analysis calls and run comparison ranking."""
    tasks = [
        analyze_single_resume(client, jd_text, res["name"], res["text"])
        for res in resumes
    ]
    
    analyses = await asyncio.gather(*tasks)
    
    reports = {}
    resume_texts = {}
    summary_parts = []
    
    for res, analysis in zip(resumes, analyses):
        reports[res["name"]] = analysis
        resume_texts[res["name"]] = res["text"]
        contact = analysis.get("contact_info", {})
        summary_parts.append(
            f"Candidate: {res['name']}\n"
            f"Score: {analysis.get('score', 0)}\n"
            f"Verdict: {analysis.get('verdict', 'Unknown')}\n"
            f"Verdict Reason: {analysis.get('verdict_reason', '')}\n"
            f"Phone: {contact.get('phone', 'Not specified')}\n"
            f"Email: {contact.get('email', 'Not specified')}\n"
            f"LinkedIn: {contact.get('linkedin', 'Not specified')}\n"
            f"Strengths: {', '.join(analysis.get('strengths', []))[:300]}\n"
            f"Gaps: {', '.join(analysis.get('gaps', []))[:300]}\n"
        )
    
    candidates_summary = "\n---\n".join(summary_parts)
    ranking = await rank_candidates(client, jd_text, candidates_summary)
    
    return {
        "ranking": ranking,
        "reports": reports,
        "resume_texts": resume_texts
    }


# ── Rejection Trends Synthesis ────────────────────────────────────────────────

REJECTION_TRENDS_PROMPT = """You are a senior HR analytics expert .

You are given multiple pieces of negative client feedback for candidates who were rejected for a specific role.
Your task is to analyze ALL the feedback entries together and identify the COMMON patterns — what were the recurring gaps and weaknesses across these rejected candidates?

Then produce a "sourcing refinement" paragraph that a recruiter can directly copy and add to their sourcing demand to avoid these same gaps in the next hiring cycle.

Return a JSON object with these exact keys:
{
  "common_gaps": ["list of the most frequently recurring gaps/weaknesses across all rejected candidates — be specific and actionable"],
  "sourcing_refinement": "A 4-6 line paragraph written as a demand addition. It should specify what the ideal candidate MUST have based on the patterns of past rejections. Written in professional tone, suitable for a recruiter to paste alongside client demands before sourcing on job portals. Do NOT use bullet points in this paragraph.",
  "candidate_count": <number of feedback entries analyzed>,
  "confidence": "High if 5+ feedback entries, Medium if 3-4, Low if 1-2"
}

Rules:
- Focus on PATTERNS that appear across MULTIPLE candidates, not one-off issues.
- The sourcing_refinement should be practical and directly usable by a recruiter.
- No markdown, no emojis, no asterisks. Plain professional English.
- Return ONLY valid JSON."""


async def synthesize_rejection_trends(client: AsyncOpenAI, role: str, feedback_entries: list[dict]) -> dict:
    """
    Analyze negative feedback entries for a role and produce averaged rejection insights.
    
    Args:
        client: AsyncOpenAI client instance
        role: The job role being queried
        feedback_entries: List of payload dicts from Qdrant (each has feedback_text, candidate_name, etc.)
    
    Returns:
        Structured JSON with common_gaps, sourcing_refinement, candidate_count, confidence.
    """
    # Build the feedback summary for the LLM — strictly Role, Job Family, and Client Feedback
    feedback_lines = []
    for i, entry in enumerate(feedback_entries, 1):
        c_role = entry.get("role") or role
        j_family = entry.get("job_family") or "General"
        feedback = entry.get("feedback_text", "")
        
        feedback_lines.append(
            f"Entry {i}:\n"
            f"- Candidate Role: {c_role}\n"
            f"- Job Family: {j_family}\n"
            f"- Client Feedback: {feedback}\n"
        )
    
    all_feedback = "\n---\n".join(feedback_lines)
    user_msg = f"--- ROLE: {role} ---\n\n--- FEEDBACK RECORDS ({len(feedback_entries)} entries) ---\n\n{all_feedback}"
    
    try:
        result_text = await call_llm_with_fallback(
            client=client,
            messages=[
                {"role": "system", "content": REJECTION_TRENDS_PROMPT},
                {"role": "user",   "content": user_msg},
            ],
            response_format={"type": "json_object"},
            temperature=0.3,
        )
        return json.loads(result_text)
    except Exception as e:
        return {
            "common_gaps": [f"Error analyzing trends: {str(e)}"],
            "sourcing_refinement": "Unable to generate sourcing refinement due to an error.",
            "candidate_count": len(feedback_entries),
            "confidence": "Low",
        }


# ── Question Bank Refiner Prompt & Logic ─────────────────────────────────────

REFINE_INTERVIEW_QUESTIONS_PROMPT = """You are a senior HR technical interviewer.
You are given:
1. Raw, fragmented notes of questions reported by a candidate post-interview.
2. A list of existing active client questions for this role.

Your task:
1. Expand and complete each fragmented raw note/topic into a clear, professional interview question (technical, behavioral, or cultural). Ensure it is written professionally in full sentence structure.
2. MANDATORY CLIENT & COMPANY ANONYMIZATION:
   If any raw note or question explicitly names a specific company, client, firm, or institution (e.g., 'HSBC', 'Barclays', 'Google', 'Deloitte', 'Amazon', 'McKinsey', 'Protiviti', etc.), you MUST anonymize it by replacing the specific company name with the generic placeholder '[Company]'.
   - Example 1: "asked how I fit into HSBC's culture and ways of working" -> clean_text: "How do you see yourself fitting into [Company]’s culture and ways of working?"
   - Example 2: "experience with Barclays cloud migration" -> clean_text: "Can you detail your experience with large-scale cloud migration projects at [Company]?"
   - NEVER leak specific company or client names in the clean_text field so questions can be safely shared across different clients.
3. Match each refined question against the existing active questions list. If a question is semantically the same as an existing question, specify its existing ID in the "matched_id" field. Otherwise, set "matched_id" to null.
4. Keep the output highly factual and based strictly on the raw candidate notes. Do not invent unrelated questions.

You must return a JSON object with a single key "refined" containing a list of objects:
{
  "refined": [
    {
      "raw_text": "Original fragmented note text (e.g. 'fitting into HSBC culture')",
      "clean_text": "Refined, complete question with company anonymized (e.g. 'How do you see yourself fitting into [Company]’s culture and ways of working?')",
      "matched_id": <integer ID of matching existing question, or null if it's new>
    },
    ...
  ]
}
Return ONLY valid JSON."""



async def refine_candidate_feedback_notes(
    client: AsyncOpenAI,
    role_id: str,
    raw_notes: str,
    existing_questions: list[dict]
) -> dict:
    """Refine fragmented interview notes into professional questions and match duplicates."""
    # Format existing questions for context
    existing_list = []
    for q in existing_questions:
        existing_list.append(f"ID {q['id']}: {q['clean_text']}")
    existing_ctx = "\n".join(existing_list) if existing_list else "No existing questions."
    
    user_msg = (
        f"--- ROLE ID ---\n{role_id}\n\n"
        f"--- EXISTING ACTIVE QUESTIONS ---\n{existing_ctx}\n\n"
        f"--- RAW CANDIDATE NOTES ---\n{raw_notes}"
    )
    
    try:
        result_text = await call_llm_with_fallback(
            client=client,
            messages=[
                {"role": "system", "content": REFINE_INTERVIEW_QUESTIONS_PROMPT},
                {"role": "user",   "content": user_msg},
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        return json.loads(result_text)
    except Exception as e:
        return {"refined": []}


