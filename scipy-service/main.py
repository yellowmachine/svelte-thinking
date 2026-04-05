import base64
import os
import io

import requests
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, HttpUrl
from weasyprint import HTML

API_KEY = os.environ.get("SCIPY_API_KEY", "")

app = FastAPI()


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

    # Fetch the page to verify it's reachable and is HTML
    try:
        head = requests.head(url, timeout=10, allow_redirects=True)
        content_type = head.headers.get("content-type", "")
        # If the URL is already a PDF, download and return it directly
        if "application/pdf" in content_type:
            r = requests.get(url, timeout=30)
            r.raise_for_status()
            return {
                "ok": True,
                "pdf": base64.b64encode(r.content).decode(),
            }
    except requests.RequestException as e:
        return {"ok": False, "code": "fetch_error", "message": str(e)}

    # Render HTML → PDF with WeasyPrint
    try:
        buf = io.BytesIO()
        HTML(url=url).write_pdf(buf)
        buf.seek(0)
        return {
            "ok": True,
            "pdf": base64.b64encode(buf.read()).decode(),
        }
    except Exception as e:
        return {"ok": False, "code": "render_error", "message": str(e)}
