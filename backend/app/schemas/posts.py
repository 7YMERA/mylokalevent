"""Pydantic models for community feed posts."""
from pydantic import BaseModel, Field


class PostCreate(BaseModel):
    caption: str = Field(min_length=1, max_length=500)
    image_url: str | None = None
    state: str | None = Field(default=None, max_length=50)
    district: str | None = Field(default=None, max_length=50)
    event_id: int | None = None
