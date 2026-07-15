"""Image upload endpoint — stores files in the Supabase Storage 'uploads' bucket
and returns a public URL. Used by event banners, ad banners, catch photos,
community posts, and profile pictures.
"""
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.config import settings
from app.database import get_db
from app.dependencies import CurrentUser, get_current_user

router = APIRouter()

ALLOWED = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}
MAX_BYTES = 5 * 1024 * 1024  # 5 MB


@router.post("")
async def upload_image(
    file: UploadFile = File(...),
    folder: str = "misc",
    user: CurrentUser = Depends(get_current_user),
):
    if file.content_type not in ALLOWED:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "Only JPG, PNG, WEBP, or GIF images are allowed")
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Image must be under 5 MB")

    ext = ALLOWED[file.content_type]
    safe_folder = "".join(c for c in folder if c.isalnum() or c in "-_") or "misc"
    path = f"{safe_folder}/{user.id}_{uuid.uuid4().hex}.{ext}"

    db = get_db()
    try:
        db.storage.from_(settings.supabase_storage_bucket).upload(
            path, data, {"content-type": file.content_type, "upsert": "true"}
        )
    except Exception as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Upload failed: {exc}")

    url = db.storage.from_(settings.supabase_storage_bucket).get_public_url(path)
    return {"url": url, "path": path}
