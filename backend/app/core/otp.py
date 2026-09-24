import secrets
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import logging
from app.config import settings

logger = logging.getLogger(__name__)


def generate_otp_code(length: int = 6) -> str:
    """Generate a cryptographically secure numeric OTP string."""
    return "".join(secrets.choice("0123456789") for _ in range(length))


def send_otp_email(email: str, otp_code: str, username: str = "User") -> bool:
    """
    Send secure 6-digit OTP verification email via SMTP.
    """
    target_email = email.strip().lower()

    # If the user's email is a mock domain e.g. @microservice.io, route to the configured recipient email
    if target_email.endswith("@microservice.io") and settings.EMAILS_TO_EMAIL:
        logger.info(f"Target {target_email} is mock domain. Dispatching to EMAILS_TO_EMAIL: {settings.EMAILS_TO_EMAIL}")
        destination = settings.EMAILS_TO_EMAIL.strip()
    else:
        destination = target_email

    subject = f"Your MicroService ERP Verification Code: {otp_code}"

    # Plain text version
    body_text = f"""Hello {username},

Your verification code for MicroService ERP login is:

    {otp_code}

This code will expire in {settings.OTP_EXPIRE_MINUTES} minutes.
If you did not request this code, please secure your account immediately.

TechnoLOGI Smart Automation - MicroService ERP
"""

    # Rich HTML version
    body_html = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f8fafc; padding: 40px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" max-width="540" cellspacing="0" cellpadding="0" border="0" style="max-width: 540px; background-color: #ffffff; border-radius: 20px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 16px rgba(15, 23, 42, 0.04);">
          <!-- Header -->
          <tr>
            <td style="background-color: #0c1033; padding: 32px 36px; text-align: left;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="background-color: #1e255e; width: 36px; height: 36px; border-radius: 10px; text-align: center; vertical-align: middle;">
                    <span style="color: #ffffff; font-weight: bold; font-size: 18px;">M</span>
                  </td>
                  <td style="padding-left: 14px;">
                    <span style="color: #ffffff; font-size: 18px; font-weight: 800; letter-spacing: -0.3px;">MicroService ERP</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 36px 36px 28px 36px;">
              <h2 style="margin: 0 0 12px 0; font-size: 20px; font-weight: 700; color: #0f172a;">Sign-in Verification Code</h2>
              <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #64748b;">
                Hello <strong>{username}</strong>,<br>
                We received a sign-in request for your account (<code>{email}</code>). Please use the 6-digit code below to complete authentication:
              </p>
              
              <!-- OTP Box -->
              <div style="background-color: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 14px; padding: 22px; text-align: center; margin: 24px 0;">
                <span style="font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 800; letter-spacing: 10px; color: #0c1033; display: inline-block;">{otp_code}</span>
              </div>

              <p style="margin: 20px 0 0 0; font-size: 13px; line-height: 1.5; color: #64748b;">
                ⏱ This verification code is valid for <strong>{settings.OTP_EXPIRE_MINUTES} minutes</strong>. Do not share this code with anyone.
              </p>
              <p style="margin: 12px 0 0 0; font-size: 12px; line-height: 1.5; color: #94a3b8;">
                If you did not initiate this request, someone may be attempting to access your account. Please notify your administrator immediately.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #f1f5f9; padding: 20px 36px; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                TechnoLOGI Smart Automation &bull; MicroService Enterprise Resource Planning
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    # If SMTP is not enabled, log to console
    if not settings.SMTP_ENABLED or not settings.SMTP_USER:
        print("\n" + "=" * 60)
        print(f"[LOCAL DISPATCH] To: {destination} (User: {username} | Email: {email})")
        print(f"[OTP CODE]: {otp_code}")
        print(f"[EXPIRES IN]: {settings.OTP_EXPIRE_MINUTES} minutes")
        print("=" * 60 + "\n")
        logger.info(f"[DEV OTP] Generated code {otp_code} for {destination}")
        return True

    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = f"{settings.EMAILS_FROM_NAME} <{settings.EMAILS_FROM_EMAIL}>"
        msg["To"] = destination
        msg["Subject"] = subject

        msg.attach(MIMEText(body_text, "plain", "utf-8"))
        msg.attach(MIMEText(body_html, "html", "utf-8"))

        if settings.SMTP_SSL:
            with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.sendmail(settings.EMAILS_FROM_EMAIL, [destination], msg.as_string())
        else:
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                if settings.SMTP_TLS:
                    server.starttls()
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.sendmail(settings.EMAILS_FROM_EMAIL, [destination], msg.as_string())

        logger.info(f"Successfully sent live OTP email to {destination}")
        print(f"[SMTP DISPATCH SUCCESS] Real OTP email sent to: {destination}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {destination}: {e}")
        print(f"[SMTP ERROR]: Failed to send to {destination}: {e}")
        return False
