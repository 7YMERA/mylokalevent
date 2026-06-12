"""ToyyibPay payment integration (Requirement 5).

create_posting_payment() creates a `payments` row and either:
  - MOCK mode: marks it 'success' immediately (no network) for offline testing, or
  - REAL mode: creates a ToyyibPay bill and returns the hosted payment URL.

The callback handler lives in routers/payments.py.
"""
import httpx

from app.config import settings
from app.database import get_db


def _create_payment_row(user_id: int, payable_type: str, payable_id: int, amount: float,
                        status_: str = "pending", bill_code: str | None = None,
                        transaction_id: str | None = None) -> dict:
    return (
        get_db()
        .table("payments")
        .insert(
            {
                "user_id": user_id,
                "payable_type": payable_type,
                "payable_id": payable_id,
                "amount": amount,
                "method": "fpx",
                "status": status_,
                "bill_code": bill_code,
                "transaction_id": transaction_id,
            }
        )
        .execute()
        .data[0]
    )


def create_posting_payment(*, user_id: int, payable_type: str, payable_id: int,
                          amount: float, description: str) -> dict:
    """Create a payment for an event/ad posting fee. Returns the payment row plus
    an optional `payment_url` the client should redirect to (real mode only)."""

    if settings.mock_payments or not settings.toyyibpay_secret_key:
        # Offline/sandbox: succeed immediately so the workflow can proceed.
        row = _create_payment_row(
            user_id, payable_type, payable_id, amount,
            status_="success", transaction_id=f"MOCK-{payable_type}-{payable_id}",
        )
        row["payment_url"] = None
        row["mock"] = True
        return row

    # Real ToyyibPay bill creation.
    row = _create_payment_row(user_id, payable_type, payable_id, amount, status_="pending")

    return_url = f"{settings.base_url}/api/payment/return"
    callback_url = f"{settings.base_url}/api/payment/callback"
    form = {
        "userSecretKey": settings.toyyibpay_secret_key,
        "categoryCode": settings.toyyibpay_category_code,
        "billName": description[:30],
        "billDescription": description[:100],
        "billPriceSetting": 1,
        "billPayorInfo": 1,
        "billAmount": int(round(amount * 100)),  # ToyyibPay expects cents
        "billReturnUrl": return_url,
        "billCallbackUrl": callback_url,
        "billExternalReferenceNo": f"{payable_type}-{payable_id}-{row['id']}",
        "billTo": "",
        "billEmail": "",
        "billPhone": "",
        "billPaymentChannel": 2,  # 0=FPX, 1=Card, 2=Both
    }
    resp = httpx.post(f"{settings.toyyibpay_base_url}/index.php/api/createBill", data=form, timeout=30)
    resp.raise_for_status()
    bill_code = resp.json()[0]["BillCode"]

    get_db().table("payments").update({"bill_code": bill_code}).eq("id", row["id"]).execute()
    row["bill_code"] = bill_code
    row["payment_url"] = f"{settings.toyyibpay_base_url}/{bill_code}"
    row["mock"] = False
    return row
