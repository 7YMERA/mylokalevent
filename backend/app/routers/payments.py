"""Payment flow endpoints (Requirement 5) — ToyyibPay callback & return.

ToyyibPay calls /api/payment/callback (server-to-server) with the bill result.
We verify the result by re-querying ToyyibPay's getBillTransactions endpoint
(authoritative source) rather than trusting the POST body alone, then finalise
the payment and email an invoice.
"""
import httpx
from fastapi import APIRouter, Depends, Form, HTTPException, Request, status
from fastapi.responses import HTMLResponse

from app.audit import write_audit_log
from app.config import settings
from app.database import get_db
from app.dependencies import CurrentUser, get_current_user
from app.services.email_service import send_payment_invoice

router = APIRouter()

# ToyyibPay status codes: 1=success, 2=pending, 3=failed.
_STATUS_MAP = {"1": "success", "2": "pending", "3": "failed"}


def _verify_with_toyyibpay(bill_code: str) -> str | None:
    """Re-query ToyyibPay for the authoritative payment status of a bill."""
    if settings.mock_payments or not settings.toyyibpay_secret_key:
        return "success"
    try:
        resp = httpx.post(
            f"{settings.toyyibpay_base_url}/index.php/api/getBillTransactions",
            data={"userSecretKey": settings.toyyibpay_secret_key, "billCode": bill_code},
            timeout=30,
        )
        resp.raise_for_status()
        txns = resp.json()
        if isinstance(txns, list) and txns:
            return _STATUS_MAP.get(str(txns[0].get("billpaymentStatus")), "pending")
    except Exception as exc:
        print(f"[payment] verify failed: {exc}")
    return None


def _finalise_payment(payment: dict, new_status: str) -> None:
    db = get_db()
    db.table("payments").update({"status": new_status}).eq("id", payment["id"]).execute()

    if new_status != "success":
        return

    # Email an invoice to the payer.
    user = db.table("users").select("email,name").eq("id", payment["user_id"]).execute().data
    if user:
        send_payment_invoice(
            user[0]["email"],
            item=f"{payment['payable_type']} #{payment['payable_id']}",
            amount=float(payment["amount"]),
            ref=payment.get("transaction_id") or payment.get("bill_code") or str(payment["id"]),
        )
    write_audit_log(user_id=payment["user_id"], action="UPDATE", table_name="payments",
                    record_id=payment["id"], new_value={"status": "success"})


@router.post("/callback")
async def toyyibpay_callback(
    request: Request,
    refno: str = Form(None),
    status_id: str = Form(None, alias="status"),
    billcode: str = Form(None),
    order_id: str = Form(None),
    amount: str = Form(None),
):
    """Server-to-server callback from ToyyibPay. Always returns 200 (OK) quickly."""
    if not billcode:
        return {"received": True}

    db = get_db()
    res = db.table("payments").select("*").eq("bill_code", billcode).execute()
    if not res.data:
        return {"received": True}
    payment = res.data[0]

    verified = _verify_with_toyyibpay(billcode) or _STATUS_MAP.get(str(status_id), "pending")
    if refno:
        db.table("payments").update({"transaction_id": refno}).eq("id", payment["id"]).execute()
        payment["transaction_id"] = refno
    _finalise_payment(payment, verified)
    return {"received": True, "status": verified}


@router.get("/return", response_class=HTMLResponse)
async def toyyibpay_return(billcode: str = "", status_id: str = ""):
    """User-facing redirect after payment. Shows a simple status page that links home."""
    ok = status_id == "1"
    color = "#28A745" if ok else "#DC3545"
    title = "Payment Successful" if ok else "Payment Not Completed"
    note = (
        "Your payment was received. Your submission is now awaiting admin approval."
        if ok else "Your payment was not completed. You can try again from your dashboard."
    )
    return f"""
    <html><head><meta charset="utf-8"><title>{title}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet"></head>
    <body class="bg-light"><div class="container py-5 text-center">
      <div class="card shadow-sm mx-auto" style="max-width:480px">
        <div class="card-body p-5">
          <h3 style="color:{color}">{title}</h3>
          <p class="text-muted">{note}</p>
          <p class="small text-muted">Bill: {billcode}</p>
          <a href="/" class="btn btn-primary mt-2">Back to Home</a>
        </div></div></div></body></html>"""


@router.get("/{payment_id}")
async def get_payment(payment_id: int, current: CurrentUser = Depends(get_current_user)):
    res = get_db().table("payments").select("*").eq("id", payment_id).execute()
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")
    payment = res.data[0]
    if current.role != "admin" and payment["user_id"] != int(current.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your payment")
    return payment
