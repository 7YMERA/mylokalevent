"""SendGrid transactional email (Requirement 5).

In MOCK mode (or when no API key is set) emails are printed to the console
instead of being sent, so the app runs fully offline.
"""
from app.config import settings


def send_email(to_email: str, subject: str, html: str) -> bool:
    """Send an email. Returns True on success. Never raises (best-effort)."""
    if settings.mock_email or not settings.sendgrid_api_key:
        print(f"[email:mock] to={to_email} | {subject}")
        return True

    try:
        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import Content, Email, Mail, To

        message = Mail(
            from_email=Email(settings.sendgrid_from_email, settings.sendgrid_from_name),
            to_emails=To(to_email),
            subject=subject,
            html_content=Content("text/html", html),
        )
        client = SendGridAPIClient(settings.sendgrid_api_key)
        resp = client.send(message)
        return 200 <= resp.status_code < 300
    except Exception as exc:  # pragma: no cover
        print(f"[email] send failed: {exc}")
        return False


# --- Templated helpers -------------------------------------------------------
def _wrap(title: str, body: str) -> str:
    return f"""
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto">
      <div style="background:#1B6CA8;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0">
        <h2 style="margin:0">MyLokalEvent</h2>
      </div>
      <div style="border:1px solid #e3e9f0;border-top:none;padding:20px;border-radius:0 0 8px 8px">
        <h3 style="color:#1B6CA8">{title}</h3>
        {body}
        <p style="color:#888;font-size:12px;margin-top:24px">
          Regional Event &amp; Fishery Marketplace
        </p>
      </div>
    </div>"""


def send_welcome(to_email: str, name: str) -> bool:
    return send_email(to_email, "Welcome to MyLokalEvent",
                      _wrap("Welcome aboard!", f"<p>Hi {name}, your account is ready. Happy exploring!</p>"))


def send_event_approved(to_email: str, title: str) -> bool:
    return send_email(to_email, f"Your event '{title}' is approved",
                      _wrap("Event Approved ✅",
                            f"<p>Great news! Your event <b>{title}</b> is now live on MyLokalEvent.</p>"))


def send_event_rejected(to_email: str, title: str, reason: str) -> bool:
    return send_email(to_email, f"Your event '{title}' was not approved",
                      _wrap("Event Rejected",
                            f"<p>Your event <b>{title}</b> was not approved.</p>"
                            f"<p><b>Reason:</b> {reason}</p>"))


def send_payment_invoice(to_email: str, item: str, amount: float, ref: str) -> bool:
    return send_email(to_email, "Payment received — Invoice",
                      _wrap("Payment Received 🧾",
                            f"<p>We received your payment for <b>{item}</b>.</p>"
                            f"<p><b>Amount:</b> RM{amount:.2f}<br><b>Reference:</b> {ref}</p>"))


def send_ad_expiry(to_email: str, title: str) -> bool:
    return send_email(to_email, f"Your ad '{title}' has expired",
                      _wrap("Campaign Expired",
                            f"<p>Your campaign <b>{title}</b> has reached the end of its 7-day run. "
                            f"Renew anytime from your dashboard.</p>"))


def send_event_submitted(to_email: str, title: str) -> bool:
    return send_email(to_email, f"Event received: '{title}' — pending approval",
                      _wrap("Event Submitted ⏳",
                            f"<p>Thanks! Your event <b>{title}</b> has been received and the posting fee recorded.</p>"
                            f"<p>It's now <b>awaiting admin approval</b>. We'll email you as soon as it's reviewed.</p>"))


def send_post_comment(to_email: str, commenter: str, snippet: str) -> bool:
    return send_email(to_email, f"{commenter} commented on your post",
                      _wrap("New Comment 💬",
                            f"<p><b>{commenter}</b> commented on your community post:</p>"
                            f"<blockquote style='border-left:3px solid #1B6CA8;padding-left:12px;color:#555'>{snippet}</blockquote>"))


def send_post_like(to_email: str, liker: str) -> bool:
    return send_email(to_email, f"{liker} liked your post",
                      _wrap("New Like ❤️",
                            f"<p><b>{liker}</b> liked your community post. Keep sharing!</p>"))
