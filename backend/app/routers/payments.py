"""Payment flow endpoints (Requirement 5) — Stripe Checkout.

Flow:
  1. Posting an event/ad creates a Stripe Checkout Session; the client is
     redirected to Stripe's hosted page (test card 4242 4242 4242 4242).
  2. On success Stripe redirects to /api/payment/return?session_id=... — we
     verify the session was paid, finalise the payment, email an invoice, then
     redirect the user back to the frontend app.
  3. Stripe also POSTs /api/payment/stripe-webhook (checkout.session.completed)
     as the authoritative confirmation (works even if the user closes the tab).
"""
import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import HTMLResponse, RedirectResponse

from app.audit import write_audit_log
from app.config import settings
from app.database import get_db
from app.dependencies import CurrentUser, get_current_user
from app.services.email_service import send_payment_invoice
from app.services.payment_service import finalise_payment_by_session, verify_session_paid

router = APIRouter()


def _email_invoice(payment: dict) -> None:
    if not payment or payment.get("status") != "success":
        return
    user = get_db().table("users").select("email,name").eq("id", payment["user_id"]).execute().data
    if user:
        send_payment_invoice(
            user[0]["email"],
            item=f"{payment['payable_type']} #{payment['payable_id']}",
            amount=float(payment["amount"]),
            ref=payment.get("transaction_id") or str(payment["id"]),
        )
    write_audit_log(user_id=payment["user_id"], action="UPDATE", table_name="payments",
                    record_id=payment["id"], new_value={"status": "success"})


@router.get("/return", response_class=HTMLResponse)
async def payment_return(session_id: str = ""):
    """User lands here after Stripe checkout. Verify, finalise, then bounce to the app."""
    paid = bool(session_id) and verify_session_paid(session_id)
    payment = None
    if paid:
        payment = finalise_payment_by_session(session_id)
        if payment and payment.get("status") == "success" and payment.get("payable_type") != "topup":
            _email_invoice(payment)

    # Top-ups go back to the wallet; posting fees to the dashboard.
    is_topup = payment and payment.get("payable_type") == "topup"
    dest = f"{settings.frontend_url}/#/{'wallet' if is_topup else 'organizer'}"
    ok = paid
    color = "#28A745" if ok else "#DC3545"
    title = "Payment Successful" if ok else "Payment Not Completed"
    note = ("Your payment was received. Your submission is now awaiting admin approval."
            if ok else "Your payment was not completed. You can try again from your dashboard.")
    # Small confirmation page that auto-redirects back to the frontend app.
    return f"""
    <html><head><meta charset="utf-8"><title>{title}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="refresh" content="3;url={dest}">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet"></head>
    <body class="bg-light"><div class="container py-5 text-center">
      <div class="card shadow-sm mx-auto" style="max-width:480px">
        <div class="card-body p-5">
          <h3 style="color:{color}">{title}</h3>
          <p class="text-muted">{note}</p>
          <p class="small text-muted">Redirecting you back…</p>
          <a href="{dest}" class="btn btn-primary mt-2">Back to Dashboard</a>
        </div></div></div></body></html>"""


@router.post("/stripe-webhook")
async def stripe_webhook(request: Request):
    """Authoritative confirmation from Stripe (checkout.session.completed)."""
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    event = None

    if settings.stripe_webhook_secret:
        try:
            event = stripe.Webhook.construct_event(payload, sig, settings.stripe_webhook_secret)
        except Exception as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Invalid webhook: {exc}")
    else:
        # No signing secret configured — parse best-effort (dev only).
        import json
        try:
            event = json.loads(payload)
        except Exception:
            return {"received": True}

    etype = event["type"] if isinstance(event, dict) else event.type
    if etype == "checkout.session.completed":
        obj = event["data"]["object"] if isinstance(event, dict) else event.data.object
        session_id = obj["id"] if isinstance(obj, dict) else obj.id
        payment = finalise_payment_by_session(session_id)
        if payment:
            _email_invoice(payment)
    return {"received": True}


@router.get("/{payment_id}")
async def get_payment(payment_id: int, current: CurrentUser = Depends(get_current_user)):
    res = get_db().table("payments").select("*").eq("id", payment_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")
    payment = res.data[0]
    if current.role != "admin" and payment["user_id"] != int(current.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your payment")
    return payment
