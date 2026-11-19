
from datetime import date
from typing import Optional

from pydantic import BaseModel, Field, ConfigDict


class MarketSignal(BaseModel):
    """
    Standardized market observation.
    """

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    source_id: str = Field(min_length=1)
    source_url: str

    published_at: date
    period_start: date
    period_end: date

    region: str
    occupation: str

    skill_id: Optional[str] = None

    metric: str
    value: float
    unit: str

    comparison_period: Optional[str] = None

    evidence: str
    limitations: str

    reuse_status: str = "pending"


class DataSource(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    name: str
    source_url: str
    source_type: str
    description: str

    update_frequency: Optional[str] = None
    geographic_scope: str = "Switzerland"
    data_format: Optional[str] = None

    reuse_status: str = "pending"
    last_checked: Optional[date] = None
