"""
Resend email service — graceful no-op when RESEND_API_KEY is missing.
All sends run in a thread to keep the FastAPI event loop unblocked.
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Optional

import resend  # type: ignore

logger = logging.getLogger("signlanguage.email")


def _key() -> str:
    return (os.environ.get("RESEND_API_KEY") or "").strip()


def _sender() -> str:
    return (os.environ.get("SENDER_EMAIL") or "onboarding@resend.dev").strip()


def is_configured() -> bool:
    return bool(_key())


async def send_email(
    *,
    to: str,
    subject: str,
    html: str,
    reply_to: Optional[str] = None,
) -> dict:
    """Send an email through Resend.

    Returns:
      {"sent": True, "id": "<resend_id>"} on success
      {"sent": False, "reason": "..."}     on missing key / failure
    """
    api_key = _key()
    if not api_key:
        logger.info("Resend not configured — skipping email to %s", to)
        return {"sent": False, "reason": "resend_not_configured"}

    resend.api_key = api_key
    params: dict = {
        "from": _sender(),
        "to": [to],
        "subject": subject,
        "html": html,
    }
    if reply_to:
        params["reply_to"] = reply_to

    try:
        result = await asyncio.to_thread(resend.Emails.send, params)
    except Exception as exc:
        logger.warning("Resend send failed: %s", exc)
        return {"sent": False, "reason": str(exc)}
    return {"sent": True, "id": (result or {}).get("id")}


# ---------------------------------------------------------------------------
# Templates (inline CSS, table-based — email-client safe)
# ---------------------------------------------------------------------------
def _wrap(title: str, body_html: str, cta_url: Optional[str] = None, cta_label: Optional[str] = None) -> str:
    cta = ""
    if cta_url and cta_label:
        cta = f"""
        <tr><td style="padding:20px 0">
          <a href="{cta_url}" style="display:inline-block;background:#002FA7;color:#fff;
             padding:12px 28px;border-radius:9999px;text-decoration:none;
             font-family:Arial,sans-serif;font-weight:600;font-size:14px">
            {cta_label}
          </a>
        </td></tr>"""

    return f"""<!doctype html>
<html><body style="margin:0;background:#f5f6f8;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
    <tr><td style="background:#002FA7;padding:20px 28px;color:#fff">
      <div style="font-weight:700;font-size:18px;letter-spacing:0.3px">SignLanguage Pro</div>
      <div style="opacity:.8;font-size:12px;margin-top:2px">Comunicación inclusiva con IA</div>
    </td></tr>
    <tr><td style="padding:28px">
      <h1 style="font-size:22px;margin:0 0 12px;color:#0f172a">{title}</h1>
      <div style="font-size:15px;line-height:1.6;color:#334155">{body_html}</div>
      {cta}
      <hr style="border:0;border-top:1px solid #e2e8f0;margin:24px 0"/>
      <div style="font-size:12px;color:#64748b">
        Te enviamos este email porque alguien ha usado SignLanguage Pro.
        Si no fuiste tú, puedes ignorarlo.
      </div>
    </td></tr>
  </table>
</body></html>"""


def template_share(translation_text: str, language: str, share_url: str, sender_name: str = "Alguien") -> tuple[str, str]:
    subject = f"{sender_name} te ha compartido una traducción · SignLanguage Pro"
    body = (
        f"<p><strong>{sender_name}</strong> ha compartido contigo una traducción "
        f"de lengua de signos ({language}):</p>"
        f"<blockquote style='border-left:3px solid #002FA7;padding:8px 14px;margin:14px 0;"
        f"background:#f8fafc;border-radius:6px;font-style:italic'>"
        f"{translation_text}</blockquote>"
        f"<p>Pulsa el botón para verla en SignLanguage Pro.</p>"
    )
    html = _wrap("Te han compartido una traducción", body, share_url, "Ver traducción")
    return subject, html


def template_welcome(plan_label: str, app_url: str) -> tuple[str, str]:
    subject = "Bienvenido a SignLanguage Pro"
    body = (
        f"<p>¡Gracias por suscribirte al plan <strong>{plan_label}</strong>!</p>"
        "<p>Ya tienes acceso a traducciones ilimitadas, llamadas WebRTC con "
        "subtítulos en directo, modo offline parcial y exportación PDF sin marca de agua.</p>"
        "<p>Si necesitas integrar la traducción en tu propio sitio, en el panel "
        "<strong>Admin → API Keys</strong> puedes generar tu primera clave.</p>"
    )
    html = _wrap("¡Bienvenido!", body, app_url, "Empezar a traducir")
    return subject, html


def template_billing_receipt(amount: float, currency: str, package_label: str, session_id: str) -> tuple[str, str]:
    subject = f"Recibo · {package_label} · SignLanguage Pro"
    body = (
        f"<p>Hemos recibido tu pago correctamente. Aquí tienes los detalles:</p>"
        f"<table style='width:100%;border-collapse:collapse;font-size:14px;margin-top:8px'>"
        f"<tr><td style='padding:8px;color:#64748b'>Plan</td><td style='padding:8px;text-align:right'>{package_label}</td></tr>"
        f"<tr><td style='padding:8px;color:#64748b'>Importe</td><td style='padding:8px;text-align:right'><strong>{amount:.2f} {currency.upper()}</strong></td></tr>"
        f"<tr><td style='padding:8px;color:#64748b'>Referencia</td><td style='padding:8px;text-align:right;font-family:monospace;font-size:12px'>{session_id}</td></tr>"
        f"</table>"
        f"<p style='margin-top:16px'>Conserva este email como justificante.</p>"
    )
    html = _wrap("Pago confirmado", body)
    return subject, html
