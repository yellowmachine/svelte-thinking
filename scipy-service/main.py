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
    # CSS injected to suppress properties WeasyPrint doesn't handle well
    COMPAT_CSS = """
        *, *::before, *::after {
            transform: none !important;
            animation: none !important;
            transition: none !important;
        }
    """

    def render_pdf(html_source: str) -> bytes:
        buf = io.BytesIO()
        HTML(string=html_source, base_url=url).write_pdf(buf)
        buf.seek(0)
        return buf.read()

    try:
        log.info("Rendering HTML → PDF with WeasyPrint: %s", url)
        res = requests.get(url, timeout=30, headers={"User-Agent": "Mozilla/5.0"})
        res.raise_for_status()
        # Use apparent_encoding (chardet) — HTTP headers often declare iso-8859-1
        # even when the actual content is UTF-8, causing mojibake with res.text
        encoding = res.apparent_encoding or "utf-8"
        html = res.content.decode(encoding, errors="replace")
        log.info("Decoded HTML as %s (%d chars)", encoding, len(html))

        try:
            pdf_bytes = render_pdf(html)
        except Exception as first_err:
            log.warning("First render attempt failed (%s), retrying with compat CSS", first_err)
            # Inject compat CSS before </head> (or at start if no <head>)
            inject = f"<style>{COMPAT_CSS}</style>"
            if "</head>" in html:
                html = html.replace("</head>", f"{inject}</head>", 1)
            else:
                html = inject + html
            pdf_bytes = render_pdf(html)

        size_kb = len(pdf_bytes) // 1024
        log.info("WeasyPrint render OK: %d KB", size_kb)
        return {
            "ok": True,
            "pdf": base64.b64encode(pdf_bytes).decode(),
        }
    except Exception as e:
        log.error("render_error for %s: %s", url, e, exc_info=True)
        return {"ok": False, "code": "render_error", "message": str(e)}
