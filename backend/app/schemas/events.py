"""Pydantic models for events."""
from datetime import datetime

from pydantic import BaseModel, Field


class EventCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str | None = None
    category_id: int | None = None
    state: str = Field(min_length=2, max_length=50)
    district: str = Field(min_length=2, max_length=50)
    location_url: str | None = None
    start_date: datetime
    end_date: datetime
    entry_fee: float = Field(default=0.0, ge=0)
    banner_url: str | None = None


class EventUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=200)
    description: str | None = None
    category_id: int | None = None
    state: str | None = None
    district: str | None = None
    location_url: str | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    entry_fee: float | None = Field(default=None, ge=0)
    banner_url: str | None = None


class RejectRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)
