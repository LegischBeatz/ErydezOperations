from __future__ import annotations

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from draft_facts import build_shopify_fact_card, extract_thread_order_references, normalize_order_reference


def test_extract_thread_order_references_ignores_quoted_history_and_deduplicates():
    references = extract_thread_order_references([
        {
            "subject": "Re: Bestellung #3691512",
            "body": "Guten Tag, wann wird Bestellung #3691512 geliefert?\n\nAm 19.08. schrieb E-RYDEZ:\nBestellung #1234567 wurde bearbeitet.",
        },
        {
            "subject": "",
            "body": "Bitte prüfen Sie nochmals die Bestellung 3691512.",
        },
    ])

    assert references == ["3691512"]


def test_extract_thread_order_references_keeps_multiple_explicit_references_for_safe_fallback():
    references = extract_thread_order_references([
        {
            "subject": "Bestellungen #3691512 und #3691513",
            "body": "Bitte helfen Sie mir mit beiden Bestellungen.",
        },
    ])

    assert references == ["3691512", "3691513"]


def test_normalize_order_reference_accepts_only_complete_numeric_references():
    assert normalize_order_reference(" #3691512 ") == "3691512"
    assert normalize_order_reference("3691512") == "3691512"
    assert normalize_order_reference("369") is None
    assert normalize_order_reference("order-3691512") is None


def test_build_shopify_fact_card_minimizes_snapshot_data_and_preserves_verified_statuses():
    card = build_shopify_fact_card(
        {
            "order_number": "#3691512",
            "synced_at": "2026-08-20T12:00:00Z",
            "financial_status": "PAID",
            "fulfillment_status": "UNFULFILLED",
            "return_status": "NONE",
            "delivery_method": "SHIPPING",
            "cancelled_at": None,
            "tracking": [{"number": "TRACK-1"}, {"number": "TRACK-1"}, {"number": "TRACK-2"}],
            "line_items": [{"product_title": "KuKirin G2", "quantity": 1}],
            "email": "customer@example.com",
            "customer": {"display_name": "Customer Name", "email": "customer@example.com"},
            "shipping_address": {"address1": "Example Street 1", "city": "Zurich"},
            "money": {"total": {"amount": "999.00", "currency": "CHF"}},
        }
    )

    assert card == {
        "source": "shopify_active_snapshot",
        "order_reference": "#3691512",
        "snapshot_synced_at": "2026-08-20T12:00:00Z",
        "financial_status": "PAID",
        "fulfillment_status": "UNFULFILLED",
        "return_status": "NONE",
        "delivery_method": "SHIPPING",
        "cancelled": False,
        "tracking_numbers": ["TRACK-1", "TRACK-2"],
        "line_items": [{"title": "KuKirin G2", "quantity": 1}],
    }
    assert "email" not in str(card).lower()
    assert "Customer Name" not in str(card)
    assert "Example Street" not in str(card)
    assert "999.00" not in str(card)
