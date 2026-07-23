import re
from groq import AsyncGroq

# 1. UPDATED SYSTEM PROMPT: Explicitly banned markdown and emojis
JD_SYSTEM_PROMPT = """You are an expert HR and Technical Recruiter working at Protiviti, a global professional services firm.
Your sole task is to generate professional, well-structured Job Descriptions (JDs) based on client demands.

When the user gives you demands, immediately output a JD with these sections:
1. Job Title
2. Role Overview
3. Key Responsibilities (use simple hyphens '-' for bullet points)
4. Required Skills & Qualifications (must-haves vs nice-to-haves)
5. Preferred Experience
6. About Protiviti (brief standard closing paragraph)

CRITICAL RULES:
- Write in standard, plain text English. 
- DO NOT use any markdown formatting like hashtags (#) for headers or asterisks (*) for bold text.
- DO NOT use emojis.
- Keep the tone professional, attractive to candidates, and highly organized."""

RESUME_ANALYSIS_PROMPT = """You are a senior HR analyst and talent acquisition expert at Protiviti.

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
    """Removes asterisks, hashtags, and emojis from text tokens."""
    # Remove asterisks and hashtags
    token = token.replace("*", "").replace("#", "")
    
    # Regex pattern to remove emojis / extended unicode symbols
    emoji_pattern = re.compile(r'[^\x00-\x7F]|\u2022') # Removes non-ASCII characters and standard bullet points if they creep in
    token = emoji_pattern.sub('', token)
    
    return token

async def stream_jd_generation(client: AsyncGroq, demands: str):
    """Async generator to yield JD tokens from Groq without special characters."""
    stream = await client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[
            {"role": "system", "content": JD_SYSTEM_PROMPT},
            {"role": "user",   "content": demands}
        ],
        stream=True,
    )
    async for chunk in stream:
        token = chunk.choices[0].delta.content
        if token:
            # Clean the token before yielding it
            cleaned_token = clean_token(token)
            if cleaned_token:  # Only yield if it's not empty after cleaning
                yield cleaned_token

async def stream_resume_analysis(client: AsyncGroq, jd_text: str, resume_text: str):
    """Async generator to yield Resume Analysis tokens from Groq without special characters."""
    user_message = f"--- JOB DESCRIPTION ---\n{jd_text}\n\n--- CANDIDATE RESUME ---\n{resume_text}"
    
    stream = await client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[
            {"role": "system", "content": RESUME_ANALYSIS_PROMPT},
            {"role": "user",   "content": user_message}
        ],
        stream=True,
    )
    async for chunk in stream:
        token = chunk.choices[0].delta.content
        if token:
            # Clean the token before yielding it
            cleaned_token = clean_token(token)
            if cleaned_token:
                yield cleaned_token


RESUME_ANALYSIS_JSON_PROMPT = """You are a senior HR analyst and talent acquisition expert at Protiviti.
Analyze the candidate's resume against the provided Job Description (JD).
You must return a JSON object with the following fields:
{
  "score": <integer score between 0 and 100>,
  "verdict": "<Strong Match / Moderate Match / Weak Match>",
  "verdict_reason": "<a one-sentence summary of the verdict>",
  "contact_info": {
    "phone": "<extracted phone number, or 'Not specified'>",
    "email": "<extracted email address, or 'Not specified'>",
    "linkedin": "<extracted LinkedIn URL/link, or 'Not specified'>"
  },
  "skills_domain": "A comma-separated string of the candidate's key technical skills, tools, certifications, and domain expertise extracted from the resume. Example: 'Python, SQL, AWS, Risk Management, SOX Compliance, Financial Auditing'",
  "key_skills": ["A list of exactly 8 key technical skills, tools, or certifications extracted from the CV that are most relevant to the JD requirements."],
  "profile_pitch": "A precise 2-line client-facing email pitch describing the candidate's alignment against the Job Description. Must highlight their years of experience and core fit in a professional tone. Written in third person without bullet points.",
  "profile_summary": "A professional summary of the candidate of approximately 700 characters. Cover their experience, core skills, domain expertise, and general suitability. Must be highly factful and based strictly on direct facts present in the CV.",
  "companies": ["A list of company/organization names the candidate has worked at, including current and previous employers. Extract these from the work experience section of the resume. Example: ['Deloitte', 'TCS', 'Infosys']. Return an empty list if none found."],
  "strengths": ["list of strengths matching the JD requirements, specific to the candidate"],
  "gaps": ["list of gaps or missing requirements compared to the JD"],
  "assessment": {
    "Skills Match": "rating and brief comment",
    "Experience Level": "rating and brief comment",
    "Education": "rating and brief comment",
    "Industry Fit": "rating and brief comment",
    "Soft Skills": "rating and brief comment"
  },
  "recommendation": "2-3 sentences hiring recommendation"
}
Do not use markdown headers, asterisks, emojis or symbols. The keys must match exactly. Return ONLY valid JSON."""

RESUME_RERANK_JSON_PROMPT = """You are a senior recruitment leader at Protiviti.
You are given a Job Description (JD) and a summary of evaluations for multiple candidate resumes.
Your task is to rank the candidates from best to worst based on their fit for the JD.
You must return a JSON object with a single key "ranking" containing a list of objects:
{
  "ranking": [
    {
      "rank": 1,
      "candidate_name": "candidate's name or filename",
      "score": <match score>,
      "verdict": "<Strong/Moderate/Weak Match>",
      "justification": "One-line explanation of why this candidate was ranked in this position.",
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

async def analyze_single_resume(client: AsyncGroq, jd_text: str, resume_name: str, resume_text: str) -> dict:
    """Analyze a single resume and return structured JSON."""
    user_msg = f"--- JOB DESCRIPTION ---\n{jd_text}\n\n--- CANDIDATE RESUME ({resume_name}) ---\n{resume_text}"
    try:
        completion = await client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {"role": "system", "content": RESUME_ANALYSIS_JSON_PROMPT},
                {"role": "user",   "content": user_msg}
            ],
            response_format={"type": "json_object"},
            temperature=0.2
        )
        result_text = completion.choices[0].message.content
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

async def rank_candidates(client: AsyncGroq, jd_text: str, candidates_summary: str) -> list:
    """Generate final ranking leaderboard for all candidates."""
    user_msg = f"--- JOB DESCRIPTION ---\n{jd_text}\n\n--- CANDIDATE EVALUATION SUMMARIES ---\n{candidates_summary}"
    try:
        completion = await client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {"role": "system", "content": RESUME_RERANK_JSON_PROMPT},
                {"role": "user",   "content": user_msg}
            ],
            response_format={"type": "json_object"},
            temperature=0.2
        )
        result_text = completion.choices[0].message.content
        data = json.loads(result_text)
        return data.get("ranking", [])
    except Exception as e:
        return []

async def analyze_and_rank_batch(client: AsyncGroq, jd_text: str, resumes: list[dict]) -> dict:
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

REJECTION_TRENDS_PROMPT = """You are a senior HR analytics expert at Protiviti.

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


async def synthesize_rejection_trends(client: AsyncGroq, role: str, feedback_entries: list[dict]) -> dict:
    """
    Analyze negative feedback entries for a role and produce averaged rejection insights.
    
    Args:
        client: AsyncGroq client instance
        role: The job role being queried
        feedback_entries: List of payload dicts from Qdrant (each has feedback_text, candidate_name, etc.)
    
    Returns:
        Structured JSON with common_gaps, sourcing_refinement, candidate_count, confidence.
    """
    # Build the feedback summary for the LLM
    feedback_lines = []
    for i, entry in enumerate(feedback_entries, 1):
        candidate = entry.get("candidate_name", "Unknown")
        feedback = entry.get("feedback_text", "")
        skills = entry.get("skills_domain", "")
        experience = entry.get("experience", "")
        
        feedback_lines.append(
            f"Candidate {i}: {candidate}\n"
            f"Experience: {experience}\n"
            f"Skills: {skills}\n"
            f"Rejection Feedback: {feedback}\n"
        )
    
    all_feedback = "\n---\n".join(feedback_lines)
    user_msg = f"--- ROLE: {role} ---\n\n--- NEGATIVE FEEDBACK FROM {len(feedback_entries)} REJECTED CANDIDATES ---\n\n{all_feedback}"
    
    try:
        completion = await client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {"role": "system", "content": REJECTION_TRENDS_PROMPT},
                {"role": "user",   "content": user_msg},
            ],
            response_format={"type": "json_object"},
            temperature=0.3,
        )
        result_text = completion.choices[0].message.content
        return json.loads(result_text)
    except Exception as e:
        return {
            "common_gaps": [f"Error analyzing trends: {str(e)}"],
            "sourcing_refinement": "Unable to generate sourcing refinement due to an error.",
            "candidate_count": len(feedback_entries),
            "confidence": "Low",
        }
