import os
import io
import zipfile
import xml.etree.ElementTree as ET
import fitz  # PyMuPDF

def extract_resume_text(file_bytes: bytes, filename: str) -> str:
    """Extract plain text from an uploaded PDF, DOCX, DOC, or TXT file."""
    if not filename:
        return ""
        
    ext = os.path.splitext(filename)[1].lower()
    
    if ext == ".pdf":
        try:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            pages = [doc[i].get_text() for i in range(len(doc))]
            return "\n".join(pages).strip()
        except Exception as err:
            raise ValueError(f"Could not parse PDF file '{filename}': {err}")
        
    elif ext == ".docx":
        # First try python-docx if installed
        try:
            import docx
            doc = docx.Document(io.BytesIO(file_bytes))
            paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
            return "\n".join(paragraphs).strip()
        except Exception:
            # Fallback to standard library Zip/XML parsing for DOCX
            try:
                with zipfile.ZipFile(io.BytesIO(file_bytes)) as zf:
                    xml_content = zf.read("word/document.xml")
                    tree = ET.fromstring(xml_content)
                    texts = [elem.text for elem in tree.iter() if elem.tag.endswith("t") and elem.text]
                    return " ".join(texts).strip()
            except Exception as err:
                raise ValueError(f"Could not parse DOCX file '{filename}': {err}")

    elif ext in (".txt", ".doc"):
        try:
            return file_bytes.decode("utf-8", errors="replace").strip()
        except Exception as err:
            raise ValueError(f"Could not parse text file '{filename}': {err}")
        
    else:
        raise ValueError(f"Unsupported file type '{ext}'. Please upload a PDF, DOCX, or TXT file.")