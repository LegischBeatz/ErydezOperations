"""Pure helpers for safe Shopify grounding of Gmail AI drafts.

The helpers deliberately do not access MongoDB, Gmail, Shopify credentials, or
network services. The FastAPI layer resolves one active-snapshot order and then
passes the minimized card to the optional draft provider for one request.
"""

from __future__ import annotations

import re
from typing import Any

_ORDER_REFERENCE_PATTERNS = (
    re.compile(r"\b(?:bestellung|order|commande)\s*(?:nr\.?|nummer|number)?\s*#?\s*(\d{4,16})\b", re.IGNORECASE),
    re.compile(r"(?<!\w)#\s*(\d{4,16})\b"),
)
_QUOTED_REPLY_MARKERS = (
    r"(?im)^\s*(?:am\s+.+?(?:schrieb|wrote).{0,160}:)\s*$",
    r"(?im)^\s*(?:on\s+.+?wrote:)\s*$",
    r"(?im)^\s*(?:von|from|gesendet|sent|to|an|subject|betreff)\s*:",
    r"(?im)^\s*-{3,}\s*(?:original message|ursprüngliche nachricht)",
)


def _strip_quoted_reply_content(value: str) -> str:
    """Keep the authored portion of an email before common quoted replies."""
    text = (value or "").replace("\r\n", "\n").replace("\r", "\n")
    positions = [match.start() for pattern in _QUOTED_REPLY_MARKERS for match in re.finditer(pattern, text)]
    if positions:
        text = text[:min(positions)]
    return "\n".join(line for line in text.split("\n") if not line.lstrip().startswith(">"))


def normalize_order_reference(value: str | None) -> str | None:
    """Return a digits-only Shopify order reference when the value is unambiguous."""
    candidate = re.sub(r"\s+", "", str(value or ""))
    match = re.fullmatch(r"#?(\d{4,16})", candidate)
    return match.group(1) if match else None


def extract_thread_order_references(messages: list[dict[str, Any]]) -> list[str]:
    """Extract unique explicit order-number candidates from the bounded thread."""
    references: set[str] = set()
    for message in messages[-20:]:
        subject = str(message.get("subject") or "")
        body = _strip_quoted_reply_content(str(message.get("body") or message.get("snippet") or ""))
        text = f"{subject}\n{body}"
        for pattern in _ORDER_REFERENCE_PATTERNS:
            references.update(match.group(1) for match in pattern.finditer(text))
    return sorted(references)


def _safe_tracking_numbers(order: dict[str, Any]) -> list[str]:
    values: list[str] = []
    for entry in order.get("tracking") or []:
        number = str((entry or {}).get("number") or "").strip()
        if number and number not in values:
            values.append(number[:120])
    return values[:5]


def build_shopify_fact_card(order: dict[str, Any]) -> dict[str, Any]:
    """Return the minimal read-only active-snapshot facts allowed into an AI draft."""
    reference = normalize_order_reference(order.get("order_number"))
    if not reference:
        raise ValueError("Active Shopify order has no usable order reference")

    line_items = []
    for item in order.get("line_items") or []:
        title = str((item or {}).get("product_title") or (item or {}).get("title") or "").strip()
        if not title:
            continue
        try:
            quantity = int((item or {}).get("quantity") or 0)
        except (TypeError, ValueError):
            quantity = 0
        line_items.append({"title": title[:160], "quantity": max(quantity, 0)})

    return {
        "source": "shopify_active_snapshot",
        "order_reference": f"#{reference}",
        "snapshot_synced_at": str(order.get("synced_at") or "") or None,
        "financial_status": str(order.get("financial_status") or "") or None,
        "fulfillment_status": str(order.get("fulfillment_status") or "") or None,
        "return_status": str(order.get("return_status") or "") or None,
        "delivery_method": str(order.get("delivery_method") or "") or None,
        "cancelled": bool(order.get("cancelled_at")),
        "tracking_numbers": _safe_tracking_numbers(order),
        "line_items": line_items[:10],
    }
