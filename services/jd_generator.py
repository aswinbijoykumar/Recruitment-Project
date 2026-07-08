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