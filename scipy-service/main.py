import base64
import logging
import os
import io

import requests
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, HttpUrl
from weasyprint import HTML

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger("scipy-service")

API_KEY = os.environ.get("SCIPY_API_KEY", "")

app = FastAPI()

log.info("scipy-service starting (API_KEY configured: %s)", bool(API_KEY))


def check_key(x_api_key: str = Header(default="")):
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/health")
def health():
    return {"ok": True}


class PdfFromUrlRequest(BaseModel):
    url: HttpUrl


@app.post("/pdf/from-url")
def pdf_from_url(body: PdfFromUrlRequest, x_api_key: str = Header(default="")):
    check_key(x_api_key)

    url = str(body.url)
    log.info("pdf/from-url requested: %s", url)

    # Fetch the page to verify it's reachable and is HTML
    try:
        head = requests.head(url, timeout=10, allow_redirects=True)
        content_type = head.headers.get("content-type", "")
        log.info("HEAD %s → %s  content-type: %s", url, head.status_code, content_type)

        # If the URL is already a PDF, download and return it directly
        if "application/pdf" in content_type:
            log.info("URL is a PDF — downloading directly")
            r = requests.get(url, timeout=30)
            r.raise_for_status()
            size_kb = len(r.content) // 1024
            log.info("PDF downloaded: %d KB", size_kb)
            return {
                "ok": True,
                "pdf": base64.b64encode(r.content).decode(),
            }
    except requests.RequestException as e:
        log.warning("fetch_error for %s: %s", url, e)
        return {"ok": False, "code": "fetch_error", "message": str(e)}

    # Render HTML → PDF with WeasyPrint
    try:
        log.info("Rendering HTML → PDF with WeasyPrint: %s", url)
        buf = io.BytesIO()
        HTML(url=url).write_pdf(buf)
        buf.seek(0)
        size_kb = buf.getbuffer().nbytes // 1024
        log.info("WeasyPrint render OK: %d KB", size_kb)
        return {
            "ok": True,
            "pdf": base64.b64encode(buf.read()).decode(),
        }
    except Exception as e:
        log.error("render_error for %s: %s", url, e, exc_info=True)
        return {"ok": False, "code": "render_error", "message": str(e)}
