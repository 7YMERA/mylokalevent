"""Prepaid credit wallet (1 credit = RM1).

Users top up credits (via Stripe) and spend them on posting fees / ad renewals.
Every movement is recorded in credit_transactions for the wallet history.
"""
from app.database import get_db


def get_balance(user_id: int) -> float:
    res = get_db().table("users").select("credits").eq("id", user_id).execute().data
    return float(res[0]["credits"]) if res else 0.0


def adjust_credits(user_id: int, delta: float, txn_type: str, description: str) -> float:
    """Apply a credit change (+topup / -spend), log it, return the new balance.

    Reads the current balance and writes balance + ledger row. Not a DB
    transaction, but adequate for this app's concurrency.
    """
    db = get_db()
    current = get_balance(user_id)
    new_balance = round(current + delta, 2)
    db.table("users").update({"credits": new_balance}).eq("id", user_id).execute()
    db.table("credit_transactions").insert({
        "user_id": user_id,
        "amount": round(delta, 2),
        "type": txn_type,
        "description": description,
        "balance_after": new_balance,
    }).execute()
    return new_balance


def spend_credits(user_id: int, amount: float, txn_type: str, description: str) -> bool:
    """Deduct `amount` credits if the balance covers it. Returns True on success."""
    if amount <= 0:
        return True
    if get_balance(user_id) + 1e-9 < amount:
        return False
    adjust_credits(user_id, -amount, txn_type, description)
    return True


def recent_transactions(user_id: int, limit: int = 50) -> list[dict]:
    return (
        get_db().table("credit_transactions").select("*")
        .eq("user_id", user_id).order("created_at", desc=True).limit(limit).execute().data or []
    )
