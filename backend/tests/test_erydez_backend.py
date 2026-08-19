"""End-to-end contracts for the Shopify-authoritative operations backend."""

from __future__ import annotations

import os

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def session() -> requests.Session:
    return requests.Session()


def test_health_and_source_contract(session):
    assert session.get(f"{API}/health/live", timeout=10).json() == {"status": "live"}
    ready = session.get(f"{API}/health/ready", timeout=10)
    assert ready.status_code == 200
    assert ready.json()["status"] == "ready"
    assert ready.json()["shopify_snapshot_active"] is True
    root = session.get(f"{API}/", timeout=10).json()
    assert root["source"] == "shopify"
    assert root["schema_version"] >= 2


def test_shopify_status_has_valid_active_snapshot(session):
    response = session.get(f"{API}/shopify/status", params={"live": "false"}, timeout=10)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["configured"] is True
    assert data["active_snapshot"]["validation"]["valid"] is True
    assert data["active_snapshot"]["active_sync_id"]
    assert data["active_snapshot"]["counts"]["orders"] > 0
    assert data["active_snapshot"]["counts"]["products"] > 0


def test_overview_is_derived_from_shopify_snapshot(session):
    response = session.get(f"{API}/overview", timeout=20)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["source"] == "shopify"
    assert data["currency"]
    assert data["cards"]["orders"] > 0
    assert data["cards"]["active_products"] > 0
    assert isinstance(data["recent_orders"], list)
    assert isinstance(data["top_products"], list)
    assert set(data["financial_statuses"])
    assert set(data["fulfillment_statuses"])


def test_orders_pagination_filters_search_and_detail(session):
    response = session.get(f"{API}/orders", params={"page": 1, "page_size": 25}, timeout=20)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["page"] == 1
    assert data["page_size"] == 25
    assert data["total"] >= len(data["items"]) > 0
    assert len(data["items"]) <= 25
    order = data["items"][0]
    for key in ("shopify_id", "order_number", "financial_status", "fulfillment_status", "money", "line_items"):
        assert key in order
    detail = session.get(f"{API}/orders/{order['id']}", timeout=20)
    assert detail.status_code == 200
    assert detail.json()["shopify_id"] == order["shopify_id"]
    searched = session.get(f"{API}/orders", params={"q": order["order_number"], "page_size": 10}, timeout=20).json()
    assert any(item["shopify_id"] == order["shopify_id"] for item in searched["items"])
    filtered = session.get(f"{API}/orders", params={"financial_status": order["financial_status"], "page_size": 10}, timeout=20).json()
    assert all(item["financial_status"] == order["financial_status"] for item in filtered["items"])


def test_order_mutations_and_mock_reset_are_disabled(session):
    order = session.get(f"{API}/orders", params={"page_size": 1}, timeout=20).json()["items"][0]
    assert session.post(f"{API}/orders/{order['id']}/notes", json={"text": "must not persist"}, timeout=10).status_code == 409
    assert session.post(f"{API}/orders/{order['id']}/pause-updates", json={"paused": True}, timeout=10).status_code == 409
    assert session.post(f"{API}/reset", timeout=10).status_code == 410


def test_products_variants_and_inventory_are_linked(session):
    products = session.get(f"{API}/products", timeout=20)
    assert products.status_code == 200
    records = products.json()
    assert records
    product = next((item for item in records if item["variant_count"] > 0), records[0])
    detail = session.get(f"{API}/products/{product['id']}", timeout=20)
    assert detail.status_code == 200
    body = detail.json()
    assert body["shopify_id"] == product["shopify_id"]
    assert len(body["variants"]) == product["variant_count"]
    assert all(item["shopify_product_id"] == product["shopify_id"] for item in body["variants"])
    assert all(item["shopify_product_id"] == product["shopify_id"] for item in body["inventory"])


def test_inventory_pagination_quantity_states_and_detail(session):
    response = session.get(f"{API}/inventory", params={"page": 1, "page_size": 25}, timeout=20)
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= len(data["items"]) > 0
    item = data["items"][0]
    assert set((item["quantities"] or {}).keys()) == {"available", "committed", "incoming", "on_hand", "reserved"}
    detail = session.get(f"{API}/inventory/{item['id']}", timeout=20)
    assert detail.status_code == 200
    assert detail.json()["shopify_id"] == item["shopify_id"]
    assert "open_orders" in detail.json()


def test_customers_pagination_and_linked_orders(session):
    response = session.get(f"{API}/customers", params={"page": 1, "page_size": 25}, timeout=20)
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= len(data["items"]) > 0
    customer = next((item for item in data["items"] if item["number_of_orders"] > 0), data["items"][0])
    detail = session.get(f"{API}/customers/{customer['id']}", timeout=20)
    assert detail.status_code == 200
    body = detail.json()
    assert body["shopify_id"] == customer["shopify_id"]
    assert all((order.get("customer") or {}).get("shopify_id") == customer["shopify_id"] for order in body["orders"])


def test_fulfillment_refund_return_and_search_contracts(session):
    fulfillments = session.get(f"{API}/fulfillments", timeout=20)
    refunds = session.get(f"{API}/refunds", timeout=20)
    returns = session.get(f"{API}/returns", timeout=20)
    assert fulfillments.status_code == refunds.status_code == returns.status_code == 200
    assert isinstance(fulfillments.json(), list)
    assert isinstance(refunds.json(), list)
    assert isinstance(returns.json(), list)
    if fulfillments.json():
        assert fulfillments.json()[0]["shopify_order_id"]
    if refunds.json():
        assert refunds.json()[0]["shopify_order_id"]
    first_order = session.get(f"{API}/orders", params={"page_size": 1}, timeout=20).json()["items"][0]
    result = session.get(f"{API}/search", params={"q": first_order["order_number"]}, timeout=20)
    assert result.status_code == 200
    assert any(item["shopify_id"] == first_order["shopify_id"] for item in result.json()["orders"])
