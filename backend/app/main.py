
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, status

from app import database
from app.schemas import MarketSignal


@asynccontextmanager
async def lifespan(app: FastAPI):
    database.init_db()
    yield


app = FastAPI(
    title="Market Radar API",
    description="Swiss Labour Market Intelligence Platform",
    version="0.1.0",
    lifespan=lifespan
)


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "Market Radar API"
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
            detail="Market signal not found"
        )

    return signal


@app.post(
    "/api/signals",
    status_code=status.HTTP_201_CREATED
)
def create_signal(signal: MarketSignal):
    try:
        database.save_signal(signal)
    except Exception as error:
        if "UNIQUE constraint failed" in str(error):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Market signal already exists"
            )

        raise

    return {
        "message": "Market signal created",
        "id": signal.id
    }
