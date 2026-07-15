"""Community feed — user posts sharing catches & activities (with location/event tags).

Public can read the feed; authenticated users can post, like, and delete their own.
Posts are enriched with the author's name and (if tagged) the linked event title.
"""
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field

from app.audit import write_audit_log
from app.database import get_db
from app.dependencies import CurrentUser, get_current_user
from app.schemas.posts import PostCreate
from app.services.email_service import send_post_comment, send_post_like
from app.utils import client_ip, user_agent

router = APIRouter()


class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=500)


def _author_email(user_id: int) -> tuple[str | None, str | None]:
    """Return (email, name) for a user id, or (None, None)."""
    res = get_db().table("users").select("email,name").eq("id", user_id).execute().data
    return (res[0]["email"], res[0]["name"]) if res else (None, None)


def _comment_counts(post_ids: list[int]) -> dict[int, int]:
    if not post_ids:
        return {}
    try:
        rows = get_db().table("post_comments").select("post_id").in_("post_id", post_ids).execute().data or []
    except Exception:
        # Table may not exist yet (migration_comments.sql not run) — degrade gracefully.
        return {}
    counts: dict[int, int] = {}
    for r in rows:
        counts[r["post_id"]] = counts.get(r["post_id"], 0) + 1
    return counts


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
    items = _enrich(res.data)
    counts = _comment_counts([p["id"] for p in items])
    for p in items:
        p["comment_count"] = counts.get(p["id"], 0)
    return {"items": items, "total": total, "page": page,
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
async def like_post(post_id: int, user: CurrentUser = Depends(get_current_user)):
    db = get_db()
    res = db.table("posts").select("likes,user_id").eq("id", post_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Post not found")
    post = res.data[0]
    likes = (post.get("likes") or 0) + 1
    db.table("posts").update({"likes": likes}).eq("id", post_id).execute()

    # Notify the author (not when you like your own post).
    if post["user_id"] != int(user.id):
        email, _name = _author_email(post["user_id"])
        _, liker_name = _author_email(int(user.id))
        if email:
            send_post_like(email, liker_name or "Someone")
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


# ---------------- Comments ----------------
@router.get("/{post_id}/comments")
async def list_comments(post_id: int):
    db = get_db()
    rows = (
        db.table("post_comments").select("*")
        .eq("post_id", post_id).order("created_at", desc=False).execute().data or []
    )
    # enrich with commenter name + avatar
    uids = list({c["user_id"] for c in rows})
    users = {}
    if uids:
        for u in db.table("users").select("id,name,profile_image").in_("id", uids).execute().data or []:
            users[u["id"]] = u
    for c in rows:
        u = users.get(c["user_id"], {})
        c["author_name"] = u.get("name", "Member")
        c["author_image"] = u.get("profile_image")
    return rows


@router.post("/{post_id}/comments", status_code=status.HTTP_201_CREATED)
async def create_comment(post_id: int, payload: CommentCreate, request: Request,
                         user: CurrentUser = Depends(get_current_user)):
    db = get_db()
    post = db.table("posts").select("user_id").eq("id", post_id).execute().data
    if not post:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Post not found")
    created = db.table("post_comments").insert(
        {"post_id": post_id, "user_id": int(user.id), "body": payload.body}
    ).execute().data[0]
    write_audit_log(user_id=user.id, action="CREATE", table_name="post_comments", record_id=created["id"],
                    ip_address=client_ip(request), user_agent=user_agent(request))

    # Notify the post author (not when commenting on your own post).
    if post[0]["user_id"] != int(user.id):
        email, _n = _author_email(post[0]["user_id"])
        _, commenter = _author_email(int(user.id))
        if email:
            send_post_comment(email, commenter or "Someone", payload.body[:120])

    _, name = _author_email(int(user.id))
    created["author_name"] = name or "You"
    return created


@router.delete("/comments/{comment_id}")
async def delete_comment(comment_id: int, request: Request,
                         user: CurrentUser = Depends(get_current_user)):
    db = get_db()
    res = db.table("post_comments").select("user_id").eq("id", comment_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Comment not found")
    if user.role != "admin" and res.data[0]["user_id"] != int(user.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your comment")
    db.table("post_comments").delete().eq("id", comment_id).execute()
    return {"message": "Comment deleted"}
