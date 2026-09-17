"""Restrict WeasyPrint network/file fetching to local font files only."""

from __future__ import annotations

from pathlib import Path
from urllib.parse import unquote, urlparse

from delivery.services.render import resolve_font_path


class LocalFontUrlFetcher:
    """Deny http/https and arbitrary file URLs; allow only local font files.

    Uses WeasyPrint 68+ URLFetcher with redirects disabled so SSRF via redirect
    cannot bypass the allowlist (CVE-2025-68616).
    """

    def __init__(self) -> None:
        self._allowed: set[Path] = {resolve_font_path().resolve()}
        for parent in {p.parent for p in self._allowed}:
            if not parent.exists():
                continue
            for path in list(parent.glob("*.ttf")) + list(parent.glob("*.otf")):
                self._allowed.add(path.resolve())

    def fetch(self, url: str, timeout=10, ssl_context=None):
        from weasyprint.urls import URLFetcher

        parsed = urlparse(url)
        scheme = (parsed.scheme or "").lower()
        if scheme in {"http", "https", "ftp", "data"}:
            raise ValueError(f"External URL fetching is disabled for PDF rendering: {scheme}")
        if scheme == "file":
            path = Path(unquote(parsed.path)).resolve()
        elif not scheme and url.startswith("/"):
            path = Path(url).resolve()
        else:
            raise ValueError("Unsupported URL scheme for PDF rendering.")
        if path not in self._allowed:
            raise ValueError("Local file access denied for PDF rendering.")
        fetcher = URLFetcher(
            timeout=timeout,
            ssl_context=ssl_context,
            allow_redirects=False,
            allowed_protocols={"file"},
        )
        return fetcher.fetch(path.as_uri())


def render_html_to_pdf_safe(html_document: str) -> bytes:
    from weasyprint import HTML

    fetcher = LocalFontUrlFetcher()
    return HTML(
        string=html_document,
        base_url="about:blank",
        url_fetcher=fetcher.fetch,
    ).write_pdf()
