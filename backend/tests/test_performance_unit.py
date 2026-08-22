"""Unit tests for safe, compatibility-preserving performance and local-request helpers."""

from __future__ import annotations

import asyncio
import os
from pathlib import Path
import sys

from starlette.requests import Request

sys.path.insert(0, str(Path(__file__).parent.parent))
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "erydez_performance_unit")

import server


def request_with_headers(method: str, headers: dict[str, str]) -> Request:
    return Request(
        {
            "type": "http",
            "method": method,
            "scheme": "http",
            "path": "/api/shopify/sync",
            "headers": [(name.lower().encode("latin-1"), value.encode("latin-1")) for name, value in headers.items()],
        }
    )


def test_performance_route_label_redacts_dynamic_identifiers():
    assert server._performance_route_label("/api/orders/customer-specific-id") == "/api/orders/{order_id}"
    assert server._performance_route_label("/api/gmail/threads/provider-thread-id") == "/api/gmail/threads/{thread_id}"
    assert server._performance_route_label("/api/gmail/threads/provider-thread-id/ai-reply") == "/api/gmail/threads/{thread_id}/ai-reply"
    assert server._performance_route_label("/api/orders") == "/api/orders"


def test_mongo_contains_escapes_user_text_and_preserves_requested_fields():
    predicate = server.mongo_contains("[unsafe.*", ("title", "sku"))
    assert predicate == {
        "$or": [
            {"title": {"$regex": r"\[unsafe\.\*", "$options": "i"}},
            {"sku": {"$regex": r"\[unsafe\.\*", "$options": "i"}},
        ]
    }
    assert server.mongo_contains("   ", ("title",)) is None


def test_combine_mongo_filters_keeps_multiple_operator_roots_valid():
    query = server.combine_mongo_filters(
        {"sync_id": "snapshot-1"},
        {"$or": [{"title": {"$regex": "scooter"}}]},
        {"$or": [{"status": "ACTIVE"}, {"status": "DRAFT"}]},
    )
    assert query["$and"][0] == {"sync_id": "snapshot-1"}
    assert len(query["$and"]) == 3


def test_local_browser_mutation_guard_accepts_same_origin_client_header_and_local_cli():
    browser_request = request_with_headers(
        "POST",
        {
            "host": "localhost:8082",
            "origin": "http://localhost:8082",
            "sec-fetch-site": "same-origin",
            "x-erydez-request": "local-console",
        },
    )
    cli_request = request_with_headers("POST", {"host": "localhost:8082"})

    assert server.local_browser_mutation_is_trusted(browser_request) is True
    assert server.local_browser_mutation_is_trusted(cli_request) is True


def test_local_browser_mutation_guard_rejects_cross_site_even_with_spoofed_header():
    request = request_with_headers(
        "POST",
        {
            "host": "localhost:8082",
            "origin": "https://malicious.example",
            "sec-fetch-site": "cross-site",
            "x-erydez-request": "local-console",
        },
    )

    assert server.local_browser_mutation_is_trusted(request) is False


def test_safe_provider_error_summary_redacts_common_sensitive_material():
    summary = server.safe_provider_error_summary(
        "authorization=Bearer secret-token access_token=abc mongodb://operator:password@mongodb:27017/api_key=private"
    )

    assert summary is not None
    assert "secret-token" not in summary
    assert "password@" not in summary
    assert "private" not in summary
    assert "[redacted]" in summary


def test_business_day_candidate_cutoff_is_conservative_for_exact_filtering():
    cutoff = server.parse_datetime(server.business_day_candidate_cutoff(30))

    assert cutoff is not None
    assert server.business_day_age(cutoff.isoformat()) >= 30


def test_global_search_keeps_response_shape_with_bounded_product_query(monkeypatch):
    async def fake_orders(**kwargs):
        assert kwargs == {"q": "order", "page": 1, "page_size": 8}
        return {"items": [{"id": "order-1"}]}

    async def fake_products(**kwargs):
        assert kwargs == {"q": "order", "limit": 8}
        return [{"id": "product-1"}] * 8

    async def fake_customers(**kwargs):
        assert kwargs == {"q": "order", "page": 1, "page_size": 8}
        return {"items": [{"id": "customer-1"}]}

    async def fake_inventory(**kwargs):
        assert kwargs == {"q": "order", "page": 1, "page_size": 8}
        return {"items": [{"id": "inventory-1"}]}

    monkeypatch.setattr(server, "list_orders", fake_orders)
    monkeypatch.setattr(server, "list_products", fake_products)
    monkeypatch.setattr(server, "list_customers", fake_customers)
    monkeypatch.setattr(server, "list_inventory", fake_inventory)

    result = asyncio.run(server.global_search("order"))

    assert result["orders"] == [{"id": "order-1"}]
    assert len(result["products"]) == 8
    assert result["customers"] == [{"id": "customer-1"}]
    assert result["inventory"] == [{"id": "inventory-1"}]
