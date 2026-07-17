"""Stripe payment integration (Requirement 5).

create_posting_payment() creates a `payments` row and either:
  - MOCK mode: marks it 'success' immediately (no network) for offline testing, or
  - REAL mode: creates a Stripe Checkout Session and returns the hosted payment URL.

The user pays on Stripe's hosted page (test card 4242 4242 4242 4242 in test mode),
then Stripe redirects back to /api/payment/return which verifies and finalises it.
A Stripe webhook (/api/payment/stripe-webhook) is the authoritative confirmation.
"""
import stripe

from app.config import settings
from app.database import get_db

stripe.api_key = settings.stripe_secret_key


def _create_payment_row(user_id: int, payable_type: str, payable_id: int, amount: float,
                        status_: str = "pending", session_id: str | None = None) -> dict:
    return (
        get_db()
        .table("payments")
        .insert(
            {
                "user_id": user_id,
                "payable_type": payable_type,
                "payable_id": payable_id,
                "amount": amount,
                "method": "card",
                "status": status_,
                "transaction_id": session_id,
            }
        )
        .execute()
        .data[0]
    )


def create_posting_payment(*, user_id: int, payable_type: str, payable_id: int,
                          amount: float, description: str, pay_with: str = "card") -> dict:
    """Create a payment for an event/ad posting fee. Returns the payment row plus
    a `payment_url` the client should redirect to (Stripe Checkout, real mode only).

    pay_with='credits' spends the user's wallet instantly (no Stripe); the caller
    should have already verified the balance covers `amount`.
    """
    if pay_with == "credits":
        from app.services.credits_service import spend_credits
        ok = spend_credits(user_id, amount, payable_type, description)
        row = _create_payment_row(
            user_id, payable_type, payable_id, amount,
            status_="success" if ok else "failed",
            session_id=f"CREDITS-{payable_type}-{payable_id}",
        )
        row["payment_url"] = None
        row["mock"] = False
        row["paid_with"] = "credits"
        row["ok"] = ok
        return row

    if settings.mock_payments or not settings.stripe_secret_key:
        # Offline/demo: succeed immediately so the workflow can proceed.
        row = _create_payment_row(
            user_id, payable_type, payable_id, amount,
            status_="success", session_id=f"MOCK-{payable_type}-{payable_id}",
        )
        row["payment_url"] = None
        row["mock"] = True
        return row

    # Create the pending payment row first so we can reference it in metadata.
    row = _create_payment_row(user_id, payable_type, payable_id, amount, status_="pending")

    session = stripe.checkout.Session.create(
        mode="payment",
        line_items=[{
            "price_data": {
                "currency": settings.payment_currency,
                "product_data": {"name": description[:120]},
                "unit_amount": int(round(amount * 100)),  # smallest currency unit (sen)
            },
            "quantity": 1,
        }],
        success_url=f"{settings.base_url}/api/payment/return?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{settings.public_frontend}/{'organizer' if payable_type == 'event' else 'advertiser'}",
        client_reference_id=str(row["id"]),
        metadata={"payment_id": str(row["id"]), "payable_type": payable_type,
                  "payable_id": str(payable_id)},
    )

    get_db().table("payments").update({"transaction_id": session.id}).eq("id", row["id"]).execute()
    row["transaction_id"] = session.id
    row["payment_url"] = session.url
    row["mock"] = False
    return row


def create_topup_session(*, user_id: int, amount: float) -> dict:
    """Buy credits: RM `amount` -> `amount` credits (1 credit = RM1). Stripe Checkout."""
    if settings.mock_payments or not settings.stripe_secret_key:
        # Offline/demo: credit immediately.
        from app.services.credits_service import adjust_credits
        row = _create_payment_row(user_id, "topup", user_id, amount, status_="success",
                                  session_id=f"MOCK-topup-{user_id}")
        adjust_credits(user_id, amount, "topup", f"Top-up RM{amount:.2f} (demo)")
        row["payment_url"] = None
        row["mock"] = True
        return row

    row = _create_payment_row(user_id, "topup", user_id, amount, status_="pending")
    session = stripe.checkout.Session.create(
        mode="payment",
        line_items=[{
            "price_data": {
                "currency": settings.payment_currency,
                "product_data": {"name": f"MyLokalEvent Credits — RM{amount:.0f}"},
                "unit_amount": int(round(amount * 100)),
            },
            "quantity": 1,
        }],
        success_url=f"{settings.base_url}/api/payment/return?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{settings.public_frontend}/wallet",
        client_reference_id=str(row["id"]),
        metadata={"payment_id": str(row["id"]), "payable_type": "topup", "payable_id": str(user_id)},
    )
    get_db().table("payments").update({"transaction_id": session.id}).eq("id", row["id"]).execute()
    row["transaction_id"] = session.id
    row["payment_url"] = session.url
    row["mock"] = False
    return row


def finalise_payment_by_session(session_id: str) -> dict | None:
    """Mark the payment for a Stripe session as success (idempotent). Returns the row.
    For top-ups, credits the user's wallet exactly once (on the success transition)."""
    db = get_db()
    res = db.table("payments").select("*").eq("transaction_id", session_id).execute()
    if not res.data:
        return None
    payment = res.data[0]
    if payment["status"] != "success":
        db.table("payments").update({"status": "success"}).eq("id", payment["id"]).execute()
        payment["status"] = "success"
        if payment["payable_type"] == "topup":
            from app.services.credits_service import adjust_credits
            adjust_credits(payment["user_id"], float(payment["amount"]),
                           "topup", f"Top-up RM{float(payment['amount']):.2f}")
    return payment


def verify_session_paid(session_id: str) -> bool:
    """Ask Stripe whether a checkout session was actually paid (authoritative)."""
    if settings.mock_payments or not settings.stripe_secret_key:
        return True
    try:
        session = stripe.checkout.Session.retrieve(session_id)
        return session.payment_status == "paid"
    except Exception as exc:
        print(f"[payment] verify session failed: {exc}")
        return False
