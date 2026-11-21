"""Additional dataset-specific checks. Keep existing data_quality.py unchanged.

Use validate_uzh_signals/validate_esco_payload for the respective connectors;
these checks intentionally do not apply FSO-specific rules to other sources.
"""
from __future__ import annotations
import math
from datetime import date
from typing import Iterable
from app.schemas import MarketSignal

ALLOWED_REUSE = {"open_by", "pending", "permission_required", "restricted", "unknown"}

def validate_uzh_signals(signals: Iterable[MarketSignal]) -> dict:
    errors, warnings, checked = [], [], 0
    for s in signals:
        checked += 1
        if s.source_id != "uzh_job_index":
            errors.append(f"{s.id}: expected source_id='uzh_job_index'")
        if s.metric != "job_market_index" or s.unit != "index":
            errors.append(f"{s.id}: UZH values must use metric=job_market_index and unit=index")
        if not math.isfinite(float(s.value)) or s.value <= 0:
            errors.append(f"{s.id}: index must be finite and positive")
        if s.region != "Switzerland":
            warnings.append(f"{s.id}: expected nationwide Switzerland scope")
        if s.published_at is None:
            warnings.append(f"{s.id}: publication date not available; period dates retained")
        if s.reuse_status not in ALLOWED_REUSE:
            errors.append(f"{s.id}: unrecognized reuse_status={s.reuse_status}")
        if not s.source_url.startswith("https://"):
            errors.append(f"{s.id}: source URL must use HTTPS")
        if s.period_start > s.period_end:
            errors.append(f"{s.id}: period_start is after period_end")
    return {"valid": not errors, "checked": checked, "errors": errors, "warnings": warnings}

def validate_esco_payload(payload: dict) -> dict:
    """Validate taxonomy payload shape before storing or exposing it."""
    errors, warnings = [], []
    if not isinstance(payload, dict):
        errors.append("ESCO payload must be a JSON object")
    else:
        concepts = payload.get("results")
        if concepts is None:
            embedded = payload.get("_embedded")
            concepts = embedded if isinstance(embedded, list) else None
        if concepts is not None and not isinstance(concepts, (list, dict)):
            errors.append("ESCO results must be a list or object")
        if not any(k in payload for k in ("results", "_embedded", "uri", "class", "title")):
            warnings.append("ESCO response has no recognized concept/result key")
    return {"valid": not errors, "errors": errors, "warnings": warnings}
