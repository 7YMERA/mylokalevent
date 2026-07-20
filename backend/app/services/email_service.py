"""SendGrid transactional email (Requirement 5).

In MOCK mode (or when no API key is set) emails are printed to the console
instead of being sent, so the app runs fully offline.
"""
from app.config import settings


# Fake seeded accounts that can't actually receive mail.
_UNDELIVERABLE = ("@demo.mylokalevent.my", "admin@mylokalevent.my")


def _resolve_recipient(to_email: str) -> tuple[str, str]:
    """Return (actual_recipient, prefix_note). Fake demo accounts are redirected
    to the demo inbox so emails are visible during a demo; real user emails go
    straight through unchanged."""
    is_demo = any(to_email.endswith(s) or to_email == s for s in _UNDELIVERABLE)
    if is_demo and settings.demo_email_redirect:
        note = (f'<div style="background:#fff3cd;padding:8px 12px;border-radius:6px;'
                f'font-size:12px;color:#664d03;margin-bottom:12px">Demo redirect — '
                f'in production this would go to <b>{to_email}</b>.</div>')
        return settings.demo_email_redirect, note
    return to_email, ""


def send_email(to_email: str, subject: str, html: str) -> bool:
    """Send an email via a fallback chain. Returns True on success. Never raises.

    Providers are tried in order; the next is used only if the previous FAILS:
      1. SMTP (e.g. Gmail App Password) — best inbox delivery (mail is genuinely
         sent by that provider and passes SPF/DKIM/DMARC).
      2. Brevo (HTTP API) — fallback for hosts that block outbound SMTP.
      3. Resend (HTTP API) — another HTTP fallback.
      4. SendGrid (HTTP API) — last (note: "from" a @gmail address fails DMARC and
         often gets junked; kept only for backwards compatibility).
      5. mock (print to console) if nothing is configured, so the app runs offline.
    """
    recipient, note = _resolve_recipient(to_email)
    html = note + html

    if settings.mock_email:
        print(f"[email:mock] to={recipient} (for {to_email}) | {subject}")
        return True

    chain = []
    if settings.smtp_host and settings.smtp_user and settings.smtp_password:
        chain.append(("smtp", _send_smtp))
    if settings.brevo_api_key:
        chain.append(("brevo", _send_brevo))
    if settings.resend_api_key:
        chain.append(("resend", _send_resend))
    if settings.sendgrid_api_key:
        chain.append(("sendgrid", _send_sendgrid))

    if not chain:
        print(f"[email:mock] no provider configured — to={recipient} | {subject}")
        return True

    for i, (name, fn) in enumerate(chain):
        if fn(recipient, subject, html):
            if i > 0:
                print(f"[email] delivered via fallback provider '{name}' (earlier ones failed)")
            return True
        print(f"[email] provider '{name}' failed — trying next…")
    print(f"[email] ALL providers failed for {recipient} | {subject}")
    return False


def _send_smtp(to_email: str, subject: str, html: str) -> bool:
    """Send via SMTP (STARTTLS). Works great with Gmail using an App Password
    (host smtp.gmail.com, port 587, user = your gmail, password = 16-char App
    Password from Google account → Security → App passwords)."""
    import smtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText
    from email.utils import formataddr

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        # From MUST be the authenticated SMTP user (Gmail rejects a mismatched From).
        msg["From"] = formataddr((settings.sendgrid_from_name, settings.smtp_user))
        msg["To"] = to_email
        msg.attach(MIMEText(html, "html"))
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as server:
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(settings.smtp_user, [to_email], msg.as_string())
        return True
    except Exception as exc:  # pragma: no cover
        print(f"[email:smtp] send failed: {exc}")
        return False


def _send_sendgrid(to_email: str, subject: str, html: str) -> bool:
    try:
        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import Content, Email, Mail, To

        message = Mail(
            from_email=Email(settings.sendgrid_from_email, settings.sendgrid_from_name),
            to_emails=To(to_email),
            subject=subject,
            html_content=Content("text/html", html),
        )
        resp = SendGridAPIClient(settings.sendgrid_api_key).send(message)
        return 200 <= resp.status_code < 300
    except Exception as exc:  # pragma: no cover
        print(f"[email:sendgrid] send failed: {exc}")
        return False


def _send_brevo(to_email: str, subject: str, html: str) -> bool:
    """Brevo (Sendinblue) transactional HTTP API — works where SMTP ports are blocked."""
    import httpx

    try:
        resp = httpx.post(
            "https://api.brevo.com/v3/smtp/email",
            headers={"api-key": settings.brevo_api_key, "accept": "application/json",
                     "content-type": "application/json"},
            json={
                "sender": {"email": settings.sendgrid_from_email, "name": settings.sendgrid_from_name},
                "to": [{"email": to_email}],
                "subject": subject,
                "htmlContent": html,
            },
            timeout=20,
        )
        return 200 <= resp.status_code < 300
    except Exception as exc:  # pragma: no cover
        print(f"[email:brevo] send failed: {exc}")
        return False


def _send_resend(to_email: str, subject: str, html: str) -> bool:
    """Resend HTTP API — another HTTP fallback."""
    import httpx

    sender = settings.resend_from or f"{settings.sendgrid_from_name} <{settings.sendgrid_from_email}>"
    try:
        resp = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {settings.resend_api_key}",
                     "content-type": "application/json"},
            json={"from": sender, "to": [to_email], "subject": subject, "html": html},
            timeout=20,
        )
        return 200 <= resp.status_code < 300
    except Exception as exc:  # pragma: no cover
        print(f"[email:resend] send failed: {exc}")
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


def send_ad_approved(to_email: str, title: str) -> bool:
    return send_email(to_email, f"Your ad '{title}' is approved",
                      _wrap("Ad Approved ✅",
                            f"<p>Great news! Your campaign <b>{title}</b> has been approved and is now "
                            f"running across MyLokalEvent.</p>"))


def send_ad_rejected(to_email: str, title: str, reason: str) -> bool:
    return send_email(to_email, f"Your ad '{title}' was not approved",
                      _wrap("Ad Rejected",
                            f"<p>Your campaign <b>{title}</b> was not approved.</p>"
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


def send_ad_expiring(to_email: str, title: str, days_left: int, auto_renew: bool, fee: float) -> bool:
    msg = (f"<p>Your ad <b>{title}</b> will expire in <b>{days_left} day(s)</b>.</p>"
           + (f"<p>Auto-renew is <b>ON</b> — we'll charge RM{fee:.0f} in credits to keep it running. "
              f"Make sure your balance covers it.</p>" if auto_renew else
              f"<p>Renew it from your dashboard for RM{fee:.0f} to keep it live.</p>"))
    return send_email(to_email, f"Your ad '{title}' is expiring soon",
                      _wrap("Ad Expiring Soon ⏰", msg))


def send_low_credits(to_email: str, balance: float) -> bool:
    return send_email(to_email, "Your credit balance is running low",
                      _wrap("Low Credit Balance 🪙",
                            f"<p>Your wallet is down to <b>RM{balance:.2f}</b>.</p>"
                            f"<p>Top up to keep posting events and running ads without interruption "
                            f"(auto-renewing ads will stop if credits run out).</p>"))
