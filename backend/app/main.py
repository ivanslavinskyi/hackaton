
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query, status

from app import database
from app.schemas import MarketSignal
from app.services.fso_connector import (
    fetch_fso_history,
    fetch_fso_signals,
    generate_quarters,
)
from app.services.data_quality import validate_signals


@asynccontextmanager
async def lifespan(app: FastAPI):
    database.init_db()
    yield


app = FastAPI(
    title="Market Radar API",
    description="Swiss Labour Market Intelligence Platform",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "Market Radar API",
    }


@app.get("/api/signals")
def get_signals():
    return database.get_all_signals()


@app.get("/api/signals/{signal_id}")
def get_signal(signal_id: str):
    signal = database.get_signal(signal_id)

    if signal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Market signal not found",
        )

    return signal


@app.post(
    "/api/signals",
    status_code=status.HTTP_201_CREATED,
)
def create_signal(signal: MarketSignal):
    quality = validate_signals([signal])

    if not quality["valid"]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=quality,
        )

    try:
        database.save_signal(signal)
    except Exception as error:
        if "UNIQUE constraint failed" in str(error):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Market signal already exists",
            )

        raise

    return {
        "message": "Market signal created",
        "id": signal.id,
        "quality": quality,
    }


@app.post("/api/sources/fso/import")
def import_fso_signals(period: str = "2026Q2"):
    try:
        signals = fetch_fso_signals(period)

        if not signals:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"FSO returned no data for {period}",
            )

        quality = validate_signals(signals)

        if not quality["valid"]:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=quality,
            )

        database.save_or_update_signals(signals)

        return {
            "source": "fso",
            "period": period,
            "imported": len(signals),
            "signal_ids": [signal.id for signal in signals],
            "quality": quality,
        }

    except HTTPException:
        raise

    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        )

    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"FSO import failed: {error}",
        )


@app.post("/api/sources/fso/import-history")
def import_fso_history(
    start_period: str = Query(..., description="First quarter, e.g. 2003Q2"),
    end_period: str = Query(..., description="Last quarter, e.g. 2026Q2"),
):
    try:
        quarters = generate_quarters(start_period, end_period)

        signals = fetch_fso_history(start_period, end_period)

        if not signals:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="FSO returned no historical data",
            )

        quality = validate_signals(signals)

        if not quality["valid"]:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=quality,
            )

        # Save the complete batch only after all signals pass validation.
        database.save_or_update_signals(signals)

        return {
            "source": "fso",
            "start_period": start_period,
            "end_period": end_period,
            "quarters_requested": len(quarters),
            "imported": len(signals),
            "signal_ids": [signal.id for signal in signals],
            "quality": quality,
        }

    except HTTPException:
        raise

    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        )

    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"FSO historical import failed: {error}",
        )
