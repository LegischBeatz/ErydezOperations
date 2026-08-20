"""Unit tests for safe, compatibility-preserving performance helpers."""

from __future__ import annotations

import asyncio
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "erydez_performance_unit")

import server


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


def test_global_search_keeps_response_shape_with_concurrent_family_results(monkeypatch):
    async def fake_orders(**kwargs):
        assert kwargs == {"q": "order", "page": 1, "page_size": 8}
        return {"items": [{"id": "order-1"}]}

    async def fake_products(**kwargs):
        assert kwargs == {"q": "order"}
        return [{"id": "product-1"}] * 10

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
