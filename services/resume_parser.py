import os
import fitz  # PyMuPDF

def extract_resume_text(file_bytes: bytes, filename: str) -> str:
    """Extract plain text from an uploaded PDF or TXT resume."""
    ext = os.path.splitext(filename)[1].lower()
    
    if ext == ".pdf":
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        pages = [doc[i].get_text() for i in range(len(doc))]
        return "\n".join(pages).strip()
        
    elif ext in (".txt", ".doc"):
        return file_bytes.decode("utf-8", errors="replace").strip()
        
    else:
        raise ValueError(f"Unsupported file type: {ext}. Please upload a PDF or TXT file.")