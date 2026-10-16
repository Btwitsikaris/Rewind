"""Text extraction and chunking. Kept free of heavy dependencies so it is easy to test."""
import re
import zipfile
from pathlib import Path

from . import config


def extract_pages(path: Path) -> list[tuple[int, str]]:
    ext = path.suffix.lower()
    if ext == ".pdf":
        from pypdf import PdfReader

        reader = PdfReader(str(path))
        if len(reader.pages) > config.MAX_PDF_PAGES:
            raise ValueError(f"PDF has too many pages (max {config.MAX_PDF_PAGES})")
        return [(i + 1, p.extract_text() or "") for i, p in enumerate(reader.pages)]
    if ext == ".docx":
        from docx import Document

        # A .docx is a zip file; refuse "zip bombs" that unpack to a huge size.
        with zipfile.ZipFile(path) as z:
            if sum(i.file_size for i in z.infolist()) > config.MAX_UNPACKED_MB * 1024 * 1024:
                raise ValueError("Document is too large once unpacked")
        return [(1, "\n\n".join(p.text for p in Document(str(path)).paragraphs))]
    return [(1, path.read_text(errors="ignore"))]


def chunk_text(text: str, size: int = 1000, overlap: int = 150) -> list[str]:
    text = text.replace("\x00", "")
    text = re.sub(r"[ \t]+", " ", text)
    pieces: list[str] = []
    for para in (p.strip() for p in re.split(r"\n\s*\n", text)):
        while len(para) > size:  # hard-split very long paragraphs at a space
            cut = para.rfind(" ", 0, size)
            cut = cut if cut > size // 2 else size
            pieces.append(para[:cut])
            para = para[cut:].strip()
        if para:
            pieces.append(para)

    chunks: list[str] = []
    cur = ""
    for piece in pieces:
        if cur and len(cur) + len(piece) + 1 > size:
            chunks.append(cur)
            cur = (cur[-overlap:] + " " + piece) if overlap else piece
        else:
            cur = f"{cur}\n{piece}" if cur else piece
    if cur:
        chunks.append(cur)
    return chunks