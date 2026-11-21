"""Small client for the European Commission ESCO Web Service API.

ESCO is a taxonomy (occupation/skills vocabulary), not a live labour-demand
dataset. This module returns taxonomy records; it does not create MarketSignal
rows or infer vacancy counts.
"""
from __future__ import annotations
from typing import Any
from urllib.parse import urlencode
import requests

ESCO_BASE_URL = "https://ec.europa.eu/esco/api"
ESCO_SOURCE_URL = "https://esco.ec.europa.eu/en/use-esco/use-esco-services-api/esco-web-service-api"
DEFAULT_VERSION = "v1.2.1"

class EscoApiError(RuntimeError):
    pass

def _request_json(path: str, params: dict[str, Any], timeout: int = 25) -> dict:
    url = f"{ESCO_BASE_URL.rstrip('/')}/{path.lstrip('/')}"
    try:
        response = requests.get(url, params=params, timeout=timeout,
                               headers={"Accept": "application/json"})
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError) as exc:
        raise EscoApiError(f"ESCO request failed: {exc}") from exc
    if not isinstance(payload, dict):
        raise EscoApiError("ESCO API returned an unexpected response format")
    return payload

def search_occupations(query: str, language: str = "en",
                       limit: int = 20, version: str = DEFAULT_VERSION) -> dict:
    """Search ESCO occupation concepts by label/keyword."""
    if not query.strip():
        raise ValueError("query must not be empty")
    if not 1 <= limit <= 100:
        raise ValueError("limit must be between 1 and 100")
    return _request_json("search", {
        "language": language,
        "type": "occupation",
        "text": query.strip(),
        "selectedVersion": version,
        "limit": limit,
    })

def search_skills(query: str, language: str = "en",
                  limit: int = 20, version: str = DEFAULT_VERSION) -> dict:
    """Search ESCO skill/competence concepts."""
    if not query.strip():
        raise ValueError("query must not be empty")
    if not 1 <= limit <= 100:
        raise ValueError("limit must be between 1 and 100")
    return _request_json("search", {
        "language": language,
        "type": "skill",
        "text": query.strip(),
        "selectedVersion": version,
        "limit": limit,
    })

def get_concept(uri: str, language: str = "en",
                version: str = DEFAULT_VERSION) -> dict:
    """Retrieve one ESCO concept by its canonical URI."""
    if not uri.startswith("http://data.europa.eu/esco/"):
        raise ValueError("uri must be a canonical ESCO concept URI")
    return _request_json("resource/uri", {
        "uri": uri,
        "language": language,
        "selectedVersion": version,
    })

def extract_concepts(response: dict) -> list[dict]:
    """Return the result list from API response shapes without losing fields."""
    for key in ("_embedded", "results", "concepts"):
        value = response.get(key)
        if isinstance(value, list):
            return value
        if isinstance(value, dict):
            for nested in ("results", "items", "concepts"):
                if isinstance(value.get(nested), list):
                    return value[nested]
    # Some API responses use embedded collection names.
    embedded = response.get("_embedded")
    if isinstance(embedded, dict):
        for value in embedded.values():
            if isinstance(value, list):
                return value
    return []
