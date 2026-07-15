"""Community feed — user posts sharing catches & activities (with location/event tags).

Public can read the feed; authenticated users can post, like, and delete their own.
Posts are enriched with the author's name and (if tagged) the linked event title.
"""
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.audit import write_audit_log
from app.database import get_db
from app.dependencies import CurrentUser, get_current_user
from app.schemas.posts import PostCreate
from app.utils import client_ip, user_agent

router = APIRouter()


def _enrich(posts: list[dict]) -> list[dict]:
    if not posts:
        return posts
    db = get_db()
    user_ids = list({p["user_id"] for p in posts if p.get("user_id")})
    event_ids = list({p["event_id"] for p in posts if p.get("event_id")})

    users = {}
    if user_ids:
        for u in db.table("users").select("id,name,role,profile_image").in_("id", user_ids).execute().data or []:
            users[u["id"]] = u
    events = {}
    if event_ids:
        for e in db.table("events").select("id,title").in_("id", event_ids).execute().data or []:
            events[e["id"]] = e["title"]

    for p in posts:
        author = users.get(p["user_id"], {})
        p["author_name"] = author.get("name", "Member")
        p["author_role"] = author.get("role", "user")
        p["author_image"] = author.get("profile_image")
        p["event_title"] = events.get(p.get("event_id"))
    return posts


@router.get("")
async def list_feed(
    state: str | None = None,
    event_id: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=50),
):
    db = get_db()
    query = db.table("posts").select("*", count="exact")
    if state:
        query = query.eq("state", state)
    if event_id:
        query = query.eq("event_id", event_id)
    query = query.order("created_at", desc=True)
    start = (page - 1) * page_size
    res = query.range(start, start + page_size - 1).execute()
    total = res.count or 0
    return {"items": _enrich(res.data), "total": total, "page": page,
            "page_size": page_size, "pages": ceil(total / page_size) if page_size else 0}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_post(payload: PostCreate, request: Request,
                      user: CurrentUser = Depends(get_current_user)):
    db = get_db()
    data = payload.model_dump()
    data["user_id"] = int(user.id)
    created = db.table("posts").insert(data).execute().data[0]
    write_audit_log(user_id=user.id, action="CREATE", table_name="posts", record_id=created["id"],
                    ip_address=client_ip(request), user_agent=user_agent(request))
    return _enrich([created])[0]


@router.post("/{post_id}/like")
async def like_post(post_id: int, _: CurrentUser = Depends(get_current_user)):
    db = get_db()
    res = db.table("posts").select("likes").eq("id", post_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Post not found")
    likes = (res.data[0].get("likes") or 0) + 1
    db.table("posts").update({"likes": likes}).eq("id", post_id).execute()
    return {"likes": likes}


@router.delete("/{post_id}")
async def delete_post(post_id: int, request: Request,
                      user: CurrentUser = Depends(get_current_user)):
    db = get_db()
    res = db.table("posts").select("user_id").eq("id", post_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Post not found")
    if user.role != "admin" and res.data[0]["user_id"] != int(user.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your post")
    db.table("posts").delete().eq("id", post_id).execute()
    write_audit_log(user_id=user.id, action="DELETE", table_name="posts", record_id=post_id,
                    ip_address=client_ip(request), user_agent=user_agent(request))
    return {"message": "Post deleted"}
