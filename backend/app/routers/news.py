"""News articles CRUD (Requirement 3). Admin authors; public reads published."""
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.audit import write_audit_log
from app.database import get_db
from app.dependencies import CurrentUser, require_roles
from app.schemas.models import NewsCreate, NewsUpdate
from app.utils import client_ip, user_agent

router = APIRouter()


@router.get("")
async def list_news(
    q: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
):
    db = get_db()
    query = db.table("news").select("*", count="exact").eq("published", True)
    if q:
        query = query.ilike("title", f"%{q}%")
    query = query.order("created_at", desc=True)
    start = (page - 1) * page_size
    res = query.range(start, start + page_size - 1).execute()
    total = res.count or 0
    return {"items": res.data, "total": total, "page": page, "page_size": page_size,
            "pages": ceil(total / page_size) if page_size else 0}


@router.get("/{news_id}")
async def get_news(news_id: int):
    res = get_db().table("news").select("*").eq("id", news_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Article not found")
    return res.data[0]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_news(payload: NewsCreate, request: Request,
                      user: CurrentUser = Depends(require_roles("admin"))):
    db = get_db()
    data = payload.model_dump()
    data["author_id"] = int(user.id)
    created = db.table("news").insert(data).execute().data[0]
    write_audit_log(user_id=user.id, action="CREATE", table_name="news", record_id=created["id"],
                    new_value={"title": created["title"]}, ip_address=client_ip(request), user_agent=user_agent(request))
    return created


@router.put("/{news_id}")
async def update_news(news_id: int, payload: NewsUpdate, request: Request,
                      user: CurrentUser = Depends(require_roles("admin"))):
    db = get_db()
    res = db.table("news").select("*").eq("id", news_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Article not found")
    changes = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if not changes:
        return res.data[0]
    updated = db.table("news").update(changes).eq("id", news_id).execute().data[0]
    write_audit_log(user_id=user.id, action="UPDATE", table_name="news", record_id=news_id,
                    new_value=changes, ip_address=client_ip(request), user_agent=user_agent(request))
    return updated


@router.delete("/{news_id}")
async def delete_news(news_id: int, request: Request,
                      user: CurrentUser = Depends(require_roles("admin"))):
    db = get_db()
    res = db.table("news").select("title").eq("id", news_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Article not found")
    db.table("news").delete().eq("id", news_id).execute()
    write_audit_log(user_id=user.id, action="DELETE", table_name="news", record_id=news_id,
                    old_value={"title": res.data[0]["title"]}, ip_address=client_ip(request), user_agent=user_agent(request))
    return {"message": "Article deleted"}
