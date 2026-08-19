"""Unit tests for the canonical Shopify mapping and snapshot-integrity layer."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "erydez_shopify_unit")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from shopify import ShopifyClient, ShopifyConfig, normalize_order  # noqa: E402
import server  # noqa: E402


class PaginatedClient(ShopifyClient):
    def __init__(self):
        super().__init__(ShopifyConfig(store_domain="example.myshopify.com", admin_access_token="shpat_test"))
        self.after_values = []

    def query(self, query, variables=None):
        del query
        after = (variables or {}).get("after")
        self.after_values.append(after)
        if after is None:
            return {"orders": {"nodes": [{"id": "gid://shopify/Order/1"}], "pageInfo": {"hasNextPage": True, "endCursor": "cursor-1"}}}
        return {"orders": {"nodes": [{"id": "gid://shopify/Order/2"}], "pageInfo": {"hasNextPage": False, "endCursor": "cursor-2"}}}


def test_cursor_pagination_reads_every_page_once():
    client = PaginatedClient()
    records = client.paginate("query", "orders", page_size=100)
    assert [record["id"] for record in records] == ["gid://shopify/Order/1", "gid://shopify/Order/2"]
    assert client.after_values == [None, "cursor-1"]


def test_normalize_order_preserves_shopify_money_items_and_links():
    node = {
        "id": "gid://shopify/Order/10",
        "legacyResourceId": "10",
        "name": "#1010",
        "confirmationNumber": "ABC123",
        "processedAt": "2026-01-01T10:00:00Z",
        "displayFinancialStatus": "PAID",
        "displayFulfillmentStatus": "FULFILLED",
        "currencyCode": "CHF",
        "customer": {"id": "gid://shopify/Customer/3", "displayName": "Test Customer", "email": "customer@example.com"},
        "currentTotalPriceSet": {"shopMoney": {"amount": "99.90", "currencyCode": "CHF"}},
        "totalPriceSet": {"shopMoney": {"amount": "99.90", "currencyCode": "CHF"}},
        "lineItems": {"nodes": [{
            "id": "gid://shopify/LineItem/20",
            "title": "Scooter",
            "name": "Scooter - Black",
            "sku": "SCOOTER-BLK",
            "quantity": 1,
            "currentQuantity": 1,
            "refundableQuantity": 1,
            "variant": {"id": "gid://shopify/ProductVariant/30", "title": "Black", "product": {"id": "gid://shopify/Product/40", "title": "Scooter", "handle": "scooter"}},
            "discountedTotalSet": {"shopMoney": {"amount": "99.90", "currencyCode": "CHF"}},
        }]},
        "fulfillments": [{"id": "gid://shopify/Fulfillment/50", "status": "SUCCESS", "fulfillmentLineItems": {"nodes": [{"quantity": 1, "lineItem": {"id": "gid://shopify/LineItem/20"}}]}}],
        "refunds": [],
        "returns": {"nodes": []},
    }
    order, fulfillments, refunds, returns = normalize_order(node, "2026-01-02T00:00:00+00:00")
    assert order["id"] == "10"
    assert order["source"] == "shopify"
    assert order["money"]["current_total"] == {"amount": 99.9, "currency": "CHF", "presentment_amount": None, "presentment_currency": None}
    assert order["line_items"][0]["shopify_product_id"] == "gid://shopify/Product/40"
    assert order["line_items"][0]["shopify_variant_id"] == "gid://shopify/ProductVariant/30"
    assert fulfillments[0]["shopify_order_id"] == node["id"]
    assert refunds == []
    assert returns == []


def valid_snapshot():
    sync_id = "sync-1"
    product = {"shopify_id": "gid://shopify/Product/1", "sync_id": sync_id}
    variant = {"shopify_id": "gid://shopify/ProductVariant/1", "shopify_product_id": product["shopify_id"], "sync_id": sync_id}
    customer = {"shopify_id": "gid://shopify/Customer/1", "sync_id": sync_id}
    order = {"shopify_id": "gid://shopify/Order/1", "customer": {"shopify_id": customer["shopify_id"]}, "sync_id": sync_id}
    inventory = {"shopify_id": "gid://shopify/InventoryItem/1", "shopify_variant_id": variant["shopify_id"], "sync_id": sync_id}
    fulfillment = {"shopify_id": "gid://shopify/Fulfillment/1", "shopify_order_id": order["shopify_id"], "sync_id": sync_id}
    collections = {
        "shop": [{"shopify_id": "example.myshopify.com", "sync_id": sync_id}],
        "orders": [order],
        "products": [product],
        "variants": [variant],
        "inventory_items": [inventory],
        "customers": [customer],
        "fulfillments": [fulfillment],
        "refunds": [],
        "returns": [],
    }
    return {
        "sync_id": sync_id,
        "collections": collections,
        "counts": {name: len(records) for name, records in collections.items()},
        "shopify_counts": {"orders": 1, "products": 1, "customers": 1},
    }


def test_snapshot_validation_accepts_complete_linked_snapshot():
    report = server.validate_snapshot(valid_snapshot())
    assert report["valid"] is True
    assert all(value == 0 for value in report["links"].values())


def test_snapshot_validation_rejects_count_mismatch():
    snapshot = valid_snapshot()
    snapshot["shopify_counts"]["orders"] = 2
    with pytest.raises(ValueError, match="orders count"):
        server.validate_snapshot(snapshot)


def test_snapshot_validation_rejects_missing_cross_record_link():
    snapshot = valid_snapshot()
    snapshot["collections"]["inventory_items"][0]["shopify_variant_id"] = "gid://shopify/ProductVariant/missing"
    with pytest.raises(ValueError, match="inventory items reference missing variants"):
        server.validate_snapshot(snapshot)
