
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app import database
from app.main import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(
        database,
        "DB_PATH",
        tmp_path / "test.db"
    )

    with TestClient(app) as test_client:
        yield test_client


def sample_signal():
    return {
        "id": "signal_api_001",
        "source_id": "hslu",
        "source_url": "https://www.hslu.ch/de-ch/hochschule-luzern/ueber-uns/medien/medienmitteilungen/2026/10/08/ai-job-report-2026/",
        "published_at": "2026-10-08",
        "period_start": "2025-07-01",
        "period_end": "2026-06-30",
        "region": "Switzerland",
        "occupation": "AI Specialist",
        "metric": "job_growth",
        "value": 32,
        "unit": "percent",
        "evidence": "Source statement",
        "limitations": "Requires verification",
        "reuse_status": "pending"
    }


def test_health(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_create_signal(client):
    response = client.post(
        "/api/signals",
        json=sample_signal()
    )

    assert response.status_code == 201
    assert response.json()["id"] == "signal_api_001"


def test_get_signals(client):
    client.post("/api/signals", json=sample_signal())

    response = client.get("/api/signals")

    assert response.status_code == 200
    assert len(response.json()) == 1


def test_get_signal_by_id(client):
    client.post("/api/signals", json=sample_signal())

    response = client.get("/api/signals/signal_api_001")

    assert response.status_code == 200
    assert response.json()["occupation"] == "AI Specialist"


def test_signal_not_found(client):
    response = client.get("/api/signals/unknown")

    assert response.status_code == 404


def test_duplicate_signal(client):
    client.post("/api/signals", json=sample_signal())

    response = client.post(
        "/api/signals",
        json=sample_signal()
    )

    assert response.status_code == 409
