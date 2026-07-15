"""Pydantic models for advertisements, news, fish catches, and fishing spots."""
from datetime import date

from pydantic import BaseModel, Field


# ---- Advertisements ----
class AdCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=500)
    image_url: str | None = None
    target_url: str | None = None
    start_date: date | None = None
    contact_email: str | None = Field(default=None, max_length=150)
    contact_phone: str | None = Field(default=None, max_length=30)


class AdUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=200)
    description: str | None = None
    image_url: str | None = None
    target_url: str | None = None


# ---- News ----
class NewsCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    body: str = Field(min_length=3)
    category_id: int | None = None
    image_url: str | None = None
    published: bool = True


class NewsUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=200)
    body: str | None = None
    category_id: int | None = None
    image_url: str | None = None
    published: bool | None = None


# ---- Fish catches ----
class FishCreate(BaseModel):
    species: str = Field(min_length=2, max_length=100)
    weight_kg: float = Field(gt=0)
    price_per_kg: float = Field(ge=0)
    location: str | None = None
    catch_date: date | None = None
    image_url: str | None = None


class FishUpdate(BaseModel):
    species: str | None = None
    weight_kg: float | None = Field(default=None, gt=0)
    price_per_kg: float | None = Field(default=None, ge=0)
    location: str | None = None
    catch_date: date | None = None
    image_url: str | None = None
    is_available: bool | None = None


# ---- Fishing spots ----
class SpotCreate(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    description: str | None = None
    state: str | None = None
    district: str | None = None
    maps_url: str = Field(min_length=5)


class SpotUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    state: str | None = None
    district: str | None = None
    maps_url: str | None = None
    is_active: bool | None = None
