"""Shopify Admin GraphQL client and canonical data mapping for E-RYDEZ Operations."""

from __future__ import annotations

import os
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Callable

import requests


class ShopifyConfigurationError(RuntimeError):
    """Raised when Shopify Admin API credentials are not configured."""


class ShopifyAPIError(RuntimeError):
    """Raised when Shopify rejects an authentication or GraphQL request."""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def money(value: Any) -> float:
    try:
        return float(Decimal(str(value or "0")))
    except (InvalidOperation, TypeError, ValueError):
        return 0.0


def money_bag(value: dict[str, Any] | None) -> dict[str, Any]:
    bag = value or {}
    shop = bag.get("shopMoney") or {}
    presentment = bag.get("presentmentMoney") or {}
    return {
        "amount": money(shop.get("amount")),
        "currency": shop.get("currencyCode"),
        "presentment_amount": money(presentment.get("amount")) if presentment else None,
        "presentment_currency": presentment.get("currencyCode") if presentment else None,
    }


def short_id(gid: str | None) -> str | None:
    return gid.rsplit("/", 1)[-1] if gid else None


def normalize_store_domain(value: str) -> str:
    domain = (value or "").strip().lower()
    domain = domain.removeprefix("https://").removeprefix("http://").rstrip("/")
    if not domain:
        raise ShopifyConfigurationError("SHOPIFY_STORE_DOMAIN is not configured")
    if not domain.endswith(".myshopify.com"):
        domain = f"{domain}.myshopify.com"
    return domain


def address_record(value: dict[str, Any] | None) -> dict[str, Any] | None:
    if not value:
        return None
    return {
        "name": value.get("name"),
        "first_name": value.get("firstName"),
        "last_name": value.get("lastName"),
        "company": value.get("company"),
        "address1": value.get("address1"),
        "address2": value.get("address2"),
        "city": value.get("city"),
        "province": value.get("province"),
        "province_code": value.get("provinceCode"),
        "postal_code": value.get("zip"),
        "country": value.get("country"),
        "country_code": value.get("countryCodeV2"),
        "phone": value.get("phone"),
        "formatted": value.get("formatted") or [],
    }


@dataclass(frozen=True)
class ShopifyConfig:
    store_domain: str
    api_version: str = "2025-10"
    admin_access_token: str | None = None
    client_id: str | None = None
    client_secret: str | None = None
    timeout_seconds: int = 45
    max_attempts: int = 5

    @classmethod
    def from_environment(cls) -> "ShopifyConfig":
        store_domain = normalize_store_domain(os.getenv("SHOPIFY_STORE_DOMAIN", ""))
        token = (os.getenv("SHOPIFY_ADMIN_ACCESS_TOKEN") or "").strip()
        client_id = (os.getenv("SHOPIFY_CLIENT_ID") or "").strip()
        client_secret = (os.getenv("SHOPIFY_CLIENT_SECRET") or "").strip()
        if token.startswith("shpss_") and not client_secret:
            client_secret = token
            token = ""
        if not token.startswith("shpat_") and not (client_id and client_secret):
            raise ShopifyConfigurationError(
                "Configure SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET, or a valid SHOPIFY_ADMIN_ACCESS_TOKEN"
            )
        return cls(
            store_domain=store_domain,
            api_version=(os.getenv("SHOPIFY_API_VERSION") or "2025-10").strip(),
            admin_access_token=token or None,
            client_id=client_id or None,
            client_secret=client_secret or None,
            timeout_seconds=max(int(os.getenv("SHOPIFY_TIMEOUT_SECONDS") or 45), 10),
        )

    @property
    def graphql_endpoint(self) -> str:
        return f"https://{self.store_domain}/admin/api/{self.api_version}/graphql.json"

    @property
    def token_endpoint(self) -> str:
        return f"https://{self.store_domain}/admin/oauth/access_token"

    @property
    def authentication_mode(self) -> str:
        return "static_token" if self.admin_access_token else "client_credentials"


class ShopifyClient:
    """Admin GraphQL client with token renewal, retry, and cursor pagination."""

    def __init__(self, config: ShopifyConfig | None = None, session: requests.Session | None = None):
        self.config = config or ShopifyConfig.from_environment()
        self.session = session or requests.Session()
        self._access_token = self.config.admin_access_token
        self._access_token_expires_at = float("inf") if self._access_token else 0.0
        self.last_extensions: dict[str, Any] = {}

    def _request_access_token(self) -> str:
        if not self.config.client_id or not self.config.client_secret:
            raise ShopifyConfigurationError("Shopify client credentials are not configured")
        response = self.session.post(
            self.config.token_endpoint,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={
                "grant_type": "client_credentials",
                "client_id": self.config.client_id,
                "client_secret": self.config.client_secret,
            },
            timeout=self.config.timeout_seconds,
        )
        if not response.ok:
            raise ShopifyAPIError(
                f"Shopify token request failed with HTTP {response.status_code}; rotate or verify the client credentials"
            )
        try:
            payload = response.json()
        except ValueError as exc:
            raise ShopifyAPIError("Shopify token endpoint returned an invalid response") from exc
        token = str(payload.get("access_token") or "").strip()
        if not token.startswith("shpat_"):
            raise ShopifyAPIError("Shopify token endpoint did not return a valid Admin API access token")
        expires_in = max(int(payload.get("expires_in") or 86400), 60)
        self._access_token = token
        self._access_token_expires_at = time.monotonic() + expires_in - min(300, expires_in // 10)
        return token

    def _get_access_token(self) -> str:
        if self._access_token and time.monotonic() < self._access_token_expires_at:
            return self._access_token
        return self._request_access_token()

    def _throttle_pause(self, payload: dict[str, Any]) -> None:
        extensions = payload.get("extensions") or {}
        self.last_extensions = extensions
        throttle = ((extensions.get("cost") or {}).get("throttleStatus") or {})
        available = float(throttle.get("currentlyAvailable") or 0)
        restore_rate = float(throttle.get("restoreRate") or 0)
        if restore_rate > 0 and available < 100:
            time.sleep(min(max((100 - available) / restore_rate, 0), 5))

    def query(self, query: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
        last_error: Exception | None = None
        for attempt in range(self.config.max_attempts):
            token = self._get_access_token()
            try:
                response = self.session.post(
                    self.config.graphql_endpoint,
                    headers={"Content-Type": "application/json", "X-Shopify-Access-Token": token},
                    json={"query": query, "variables": variables or {}},
                    timeout=self.config.timeout_seconds,
                )
            except requests.RequestException as exc:
                last_error = exc
                if attempt + 1 < self.config.max_attempts:
                    time.sleep(min(2**attempt, 8))
                    continue
                raise ShopifyAPIError("Shopify Admin API request failed") from exc

            if response.status_code == 401 and self.config.authentication_mode == "client_credentials" and attempt == 0:
                self._access_token = None
                self._access_token_expires_at = 0.0
                continue
            if response.status_code == 429 or response.status_code >= 500:
                last_error = ShopifyAPIError(f"Shopify Admin API returned HTTP {response.status_code}")
                if attempt + 1 < self.config.max_attempts:
                    retry_after = float(response.headers.get("Retry-After") or 0)
                    time.sleep(max(retry_after, min(2**attempt, 8)))
                    continue
            try:
                response.raise_for_status()
            except requests.RequestException as exc:
                raise ShopifyAPIError(f"Shopify Admin API request failed with HTTP {response.status_code}") from exc
            try:
                payload = response.json()
            except ValueError as exc:
                raise ShopifyAPIError("Shopify Admin API returned an invalid response") from exc

            errors = payload.get("errors") or []
            if errors:
                codes = {((error.get("extensions") or {}).get("code") or "") for error in errors}
                if "THROTTLED" in codes and attempt + 1 < self.config.max_attempts:
                    self._throttle_pause(payload)
                    time.sleep(min(2**attempt, 8))
                    continue
                messages = [str(error.get("message") or "Unknown GraphQL error") for error in errors]
                raise ShopifyAPIError(f"Shopify Admin API returned errors: {'; '.join(messages)}")
            if payload.get("data") is None:
                raise ShopifyAPIError("Shopify Admin API returned no data")
            self._throttle_pause(payload)
            return payload["data"]
        raise ShopifyAPIError(f"Shopify Admin API failed after retries: {last_error}")

    def paginate(
        self,
        query: str,
        connection_name: str,
        *,
        page_size: int = 250,
        variables: dict[str, Any] | None = None,
        progress: Callable[[str, int], None] | None = None,
    ) -> list[dict[str, Any]]:
        nodes: list[dict[str, Any]] = []
        after: str | None = None
        base_variables = dict(variables or {})
        while True:
            page_variables = {**base_variables, "first": min(max(page_size, 1), 250), "after": after}
            data = self.query(query, page_variables)
            connection = data.get(connection_name)
            if not isinstance(connection, dict):
                raise ShopifyAPIError(f"Shopify response omitted {connection_name} connection")
            page_nodes = connection.get("nodes") or []
            nodes.extend(page_nodes)
            if progress:
                progress(connection_name, len(nodes))
            page_info = connection.get("pageInfo") or {}
            if not page_info.get("hasNextPage"):
                return nodes
            after = page_info.get("endCursor")
            if not after:
                raise ShopifyAPIError(f"Shopify {connection_name} pagination omitted endCursor")

    def get_shop_profile(self) -> dict[str, Any]:
        return self.query(
            """
            query ShopProfile {
              shop {
                name myshopifyDomain currencyCode timezoneAbbreviation
                primaryDomain { url host }
              }
              productsCount { count precision }
              ordersCount { count precision }
              customersCount { count precision }
            }
            """
        )

    def get_all_products(self, progress: Callable[[str, int], None] | None = None) -> list[dict[str, Any]]:
        return self.paginate(
            """
            query Products($first: Int!, $after: String) {
              products(first: $first, after: $after, sortKey: UPDATED_AT) {
                pageInfo { hasNextPage endCursor }
                nodes {
                  id legacyResourceId title handle description descriptionHtml status vendor productType
                  createdAt updatedAt publishedAt totalInventory tracksInventory tags
                  onlineStoreUrl hasOnlyDefaultVariant hasOutOfStockVariants
                  category { id name fullName }
                  priceRangeV2 {
                    minVariantPrice { amount currencyCode }
                    maxVariantPrice { amount currencyCode }
                  }
                  compareAtPriceRange {
                    minVariantCompareAtPrice { amount currencyCode }
                    maxVariantCompareAtPrice { amount currencyCode }
                  }
                  featuredMedia { id preview { image { url altText width height } } }
                  media(first: 20) { nodes { id alt mediaContentType preview { image { url altText width height } } } }
                  options { id name position optionValues { id name } }
                  variants(first: 250) {
                    nodes {
                      id legacyResourceId title displayName sku barcode price compareAtPrice
                      createdAt updatedAt availableForSale inventoryQuantity inventoryPolicy
                      taxable taxCode selectedOptions { name value }
                      image { id url altText width height }
                      inventoryItem { id tracked requiresShipping measurement { weight { value unit } } }
                    }
                  }
                }
              }
            }
            """,
            "products",
            page_size=100,
            progress=progress,
        )

    def get_all_orders(self, progress: Callable[[str, int], None] | None = None) -> list[dict[str, Any]]:
        return self.paginate(
            """
            query Orders($first: Int!, $after: String) {
              orders(first: $first, after: $after, sortKey: PROCESSED_AT) {
                pageInfo { hasNextPage endCursor }
                nodes {
                  id legacyResourceId name confirmationNumber createdAt processedAt updatedAt closedAt
                  cancelledAt cancelReason test displayFinancialStatus displayFulfillmentStatus
                  currencyCode presentmentCurrencyCode tags note email phone sourceName
                  fullyPaid unpaid requiresShipping refundable returnStatus statusPageUrl
                  subtotalPriceSet { shopMoney { amount currencyCode } presentmentMoney { amount currencyCode } }
                  currentSubtotalPriceSet { shopMoney { amount currencyCode } presentmentMoney { amount currencyCode } }
                  totalPriceSet { shopMoney { amount currencyCode } presentmentMoney { amount currencyCode } }
                  currentTotalPriceSet { shopMoney { amount currencyCode } presentmentMoney { amount currencyCode } }
                  totalDiscountsSet { shopMoney { amount currencyCode } presentmentMoney { amount currencyCode } }
                  currentTotalDiscountsSet { shopMoney { amount currencyCode } presentmentMoney { amount currencyCode } }
                  totalShippingPriceSet { shopMoney { amount currencyCode } presentmentMoney { amount currencyCode } }
                  currentShippingPriceSet { shopMoney { amount currencyCode } presentmentMoney { amount currencyCode } }
                  totalTaxSet { shopMoney { amount currencyCode } presentmentMoney { amount currencyCode } }
                  currentTotalTaxSet { shopMoney { amount currencyCode } presentmentMoney { amount currencyCode } }
                  totalRefundedSet { shopMoney { amount currencyCode } presentmentMoney { amount currencyCode } }
                  totalOutstandingSet { shopMoney { amount currencyCode } presentmentMoney { amount currencyCode } }
                  customer { id displayName firstName lastName email phone }
                  shippingAddress {
                    name firstName lastName company address1 address2 city province provinceCode zip country countryCodeV2 phone formatted
                  }
                  billingAddress {
                    name firstName lastName company address1 address2 city province provinceCode zip country countryCodeV2 phone formatted
                  }
                  shippingLine {
                    id title code source
                    originalPriceSet { shopMoney { amount currencyCode } presentmentMoney { amount currencyCode } }
                    discountedPriceSet { shopMoney { amount currencyCode } presentmentMoney { amount currencyCode } }
                  }
                  lineItems(first: 250) {
                    nodes {
                      id title name sku vendor quantity currentQuantity refundableQuantity
                      requiresShipping isGiftCard variantTitle
                      variant { id title sku product { id title handle } }
                      originalUnitPriceSet { shopMoney { amount currencyCode } presentmentMoney { amount currencyCode } }
                      discountedUnitPriceSet { shopMoney { amount currencyCode } presentmentMoney { amount currencyCode } }
                      originalTotalSet { shopMoney { amount currencyCode } presentmentMoney { amount currencyCode } }
                      discountedTotalSet { shopMoney { amount currencyCode } presentmentMoney { amount currencyCode } }
                    }
                  }
                  fulfillments {
                    id status createdAt updatedAt deliveredAt estimatedDeliveryAt
                    trackingInfo(first: 20) { number url company }
                    fulfillmentLineItems(first: 250) { nodes { quantity lineItem { id } } }
                  }
                  refunds {
                    id createdAt note totalRefundedSet { shopMoney { amount currencyCode } presentmentMoney { amount currencyCode } }
                    refundLineItems(first: 250) {
                      nodes { quantity restockType subtotalSet { shopMoney { amount currencyCode } } lineItem { id } }
                    }
                  }
                  returns(first: 50) { nodes { id name status createdAt totalQuantity } }
                }
              }
            }
            """,
            "orders",
            page_size=100,
            progress=progress,
        )

    def get_all_customers(self, progress: Callable[[str, int], None] | None = None) -> list[dict[str, Any]]:
        return self.paginate(
            """
            query Customers($first: Int!, $after: String) {
              customers(first: $first, after: $after, sortKey: UPDATED_AT) {
                pageInfo { hasNextPage endCursor }
                nodes {
                  id legacyResourceId displayName firstName lastName email phone state verifiedEmail
                  taxExempt tags note createdAt updatedAt numberOfOrders
                  amountSpent { amount currencyCode }
                  defaultAddress {
                    name firstName lastName company address1 address2 city province provinceCode zip country countryCodeV2 phone formatted
                  }
                }
              }
            }
            """,
            "customers",
            page_size=250,
            progress=progress,
        )

    def get_all_inventory_items(self, progress: Callable[[str, int], None] | None = None) -> list[dict[str, Any]]:
        return self.paginate(
            """
            query InventoryItems($first: Int!, $after: String) {
              inventoryItems(first: $first, after: $after) {
                pageInfo { hasNextPage endCursor }
                nodes {
                  id legacyResourceId sku tracked requiresShipping createdAt updatedAt duplicateSkuCount
                  countryCodeOfOrigin provinceCodeOfOrigin harmonizedSystemCode
                  measurement { weight { value unit } }
                  unitCost { amount currencyCode }
                  variant { id title displayName sku product { id title handle status } }
                  inventoryLevels(first: 50) {
                    nodes {
                      id updatedAt
                      location { id name isActive }
                      quantities(names: ["available", "committed", "incoming", "on_hand", "reserved"]) { name quantity }
                    }
                  }
                }
              }
            }
            """,
            "inventoryItems",
            page_size=250,
            progress=progress,
        )


def normalize_product(node: dict[str, Any], synced_at: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    media = []
    for item in (node.get("media") or {}).get("nodes", []):
        image = ((item.get("preview") or {}).get("image") or {})
        media.append(
            {
                "shopify_id": item.get("id"),
                "type": item.get("mediaContentType"),
                "alt": item.get("alt") or image.get("altText"),
                "url": image.get("url"),
                "width": image.get("width"),
                "height": image.get("height"),
            }
        )
    featured_image = ((((node.get("featuredMedia") or {}).get("preview") or {}).get("image")) or {})
    price_range = node.get("priceRangeV2") or {}
    compare_range = node.get("compareAtPriceRange") or {}
    product_id = node["id"]
    variants: list[dict[str, Any]] = []
    for variant in (node.get("variants") or {}).get("nodes", []):
        inventory_item = variant.get("inventoryItem") or {}
        weight = (inventory_item.get("measurement") or {}).get("weight") or {}
        image = variant.get("image") or {}
        variants.append(
            {
                "id": short_id(variant["id"]),
                "shopify_id": variant["id"],
                "legacy_id": str(variant.get("legacyResourceId") or "") or None,
                "source": "shopify",
                "product_id": short_id(product_id),
                "shopify_product_id": product_id,
                "product_title": node.get("title"),
                "product_handle": node.get("handle"),
                "title": variant.get("title"),
                "display_name": variant.get("displayName"),
                "sku": variant.get("sku"),
                "barcode": variant.get("barcode"),
                "price": money(variant.get("price")),
                "compare_at_price": money(variant.get("compareAtPrice")) if variant.get("compareAtPrice") is not None else None,
                "currency": (price_range.get("minVariantPrice") or {}).get("currencyCode"),
                "available_for_sale": bool(variant.get("availableForSale")),
                "inventory_quantity": int(variant.get("inventoryQuantity") or 0),
                "inventory_policy": variant.get("inventoryPolicy"),
                "taxable": bool(variant.get("taxable")),
                "tax_code": variant.get("taxCode"),
                "selected_options": variant.get("selectedOptions") or [],
                "image": {
                    "shopify_id": image.get("id"),
                    "url": image.get("url"),
                    "alt": image.get("altText"),
                    "width": image.get("width"),
                    "height": image.get("height"),
                }
                if image
                else None,
                "shopify_inventory_item_id": inventory_item.get("id"),
                "inventory_tracked": bool(inventory_item.get("tracked")),
                "requires_shipping": bool(inventory_item.get("requiresShipping")),
                "weight": {"value": money(weight.get("value")), "unit": weight.get("unit")} if weight else None,
                "created_at": variant.get("createdAt"),
                "updated_at": variant.get("updatedAt"),
                "synced_at": synced_at,
            }
        )
    category = node.get("category") or {}
    product = {
        "id": short_id(product_id),
        "shopify_id": product_id,
        "legacy_id": str(node.get("legacyResourceId") or "") or None,
        "source": "shopify",
        "title": node.get("title"),
        "handle": node.get("handle"),
        "description": node.get("description"),
        "description_html": node.get("descriptionHtml"),
        "status": node.get("status"),
        "vendor": node.get("vendor"),
        "product_type": node.get("productType"),
        "tags": node.get("tags") or [],
        "category": {"shopify_id": category.get("id"), "name": category.get("name"), "full_name": category.get("fullName")} if category else None,
        "online_store_url": node.get("onlineStoreUrl"),
        "published_at": node.get("publishedAt"),
        "created_at": node.get("createdAt"),
        "updated_at": node.get("updatedAt"),
        "tracks_inventory": bool(node.get("tracksInventory")),
        "total_inventory": int(node.get("totalInventory") or 0),
        "has_only_default_variant": bool(node.get("hasOnlyDefaultVariant")),
        "has_out_of_stock_variants": bool(node.get("hasOutOfStockVariants")),
        "variant_count": len(variants),
        "variant_ids": [variant["shopify_id"] for variant in variants],
        "options": [
            {
                "shopify_id": option.get("id"),
                "name": option.get("name"),
                "position": option.get("position"),
                "values": [value.get("name") for value in option.get("optionValues") or []],
            }
            for option in node.get("options") or []
        ],
        "price_range": {
            "min": money((price_range.get("minVariantPrice") or {}).get("amount")),
            "max": money((price_range.get("maxVariantPrice") or {}).get("amount")),
            "currency": (price_range.get("minVariantPrice") or {}).get("currencyCode"),
        },
        "compare_at_price_range": {
            "min": money((compare_range.get("minVariantCompareAtPrice") or {}).get("amount")),
            "max": money((compare_range.get("maxVariantCompareAtPrice") or {}).get("amount")),
            "currency": (compare_range.get("minVariantCompareAtPrice") or {}).get("currencyCode"),
        }
        if compare_range.get("minVariantCompareAtPrice")
        else None,
        "featured_image": {
            "url": featured_image.get("url"),
            "alt": featured_image.get("altText"),
            "width": featured_image.get("width"),
            "height": featured_image.get("height"),
        }
        if featured_image
        else None,
        "media": media,
        "synced_at": synced_at,
    }
    return product, variants


def normalize_fulfillment(node: dict[str, Any], order: dict[str, Any], synced_at: str) -> dict[str, Any]:
    return {
        "id": short_id(node["id"]),
        "shopify_id": node["id"],
        "source": "shopify",
        "order_id": short_id(order["id"]),
        "shopify_order_id": order["id"],
        "order_number": order.get("name"),
        "status": node.get("status"),
        "created_at": node.get("createdAt"),
        "updated_at": node.get("updatedAt"),
        "delivered_at": node.get("deliveredAt"),
        "estimated_delivery_at": node.get("estimatedDeliveryAt"),
        "tracking": node.get("trackingInfo") or [],
        "line_items": [
            {
                "shopify_line_item_id": (item.get("lineItem") or {}).get("id"),
                "quantity": int(item.get("quantity") or 0),
            }
            for item in (node.get("fulfillmentLineItems") or {}).get("nodes", [])
        ],
        "synced_at": synced_at,
    }


def normalize_refund(node: dict[str, Any], order: dict[str, Any], synced_at: str) -> dict[str, Any]:
    return {
        "id": short_id(node["id"]),
        "shopify_id": node["id"],
        "source": "shopify",
        "order_id": short_id(order["id"]),
        "shopify_order_id": order["id"],
        "order_number": order.get("name"),
        "created_at": node.get("createdAt"),
        "note": node.get("note"),
        "total_refunded": money_bag(node.get("totalRefundedSet")),
        "line_items": [
            {
                "shopify_line_item_id": (item.get("lineItem") or {}).get("id"),
                "quantity": int(item.get("quantity") or 0),
                "restock_type": item.get("restockType"),
                "subtotal": money_bag(item.get("subtotalSet")),
            }
            for item in (node.get("refundLineItems") or {}).get("nodes", [])
        ],
        "synced_at": synced_at,
    }


def normalize_return(node: dict[str, Any], order: dict[str, Any], synced_at: str) -> dict[str, Any]:
    return {
        "id": short_id(node["id"]),
        "shopify_id": node["id"],
        "source": "shopify",
        "order_id": short_id(order["id"]),
        "shopify_order_id": order["id"],
        "order_number": order.get("name"),
        "name": node.get("name"),
        "status": node.get("status"),
        "total_quantity": int(node.get("totalQuantity") or 0),
        "created_at": node.get("createdAt"),
        "synced_at": synced_at,
    }


def normalize_order(node: dict[str, Any], synced_at: str | None = None) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    synced_at = synced_at or now_iso()
    line_items = []
    for item in (node.get("lineItems") or {}).get("nodes", []):
        variant = item.get("variant") or {}
        product = variant.get("product") or {}
        line_items.append(
            {
                "id": short_id(item["id"]),
                "shopify_id": item["id"],
                "title": item.get("title"),
                "name": item.get("name"),
                "sku": item.get("sku"),
                "vendor": item.get("vendor"),
                "quantity": int(item.get("quantity") or 0),
                "current_quantity": int(item.get("currentQuantity") or 0),
                "refundable_quantity": int(item.get("refundableQuantity") or 0),
                "requires_shipping": bool(item.get("requiresShipping")),
                "is_gift_card": bool(item.get("isGiftCard")),
                "variant_title": item.get("variantTitle"),
                "variant_id": short_id(variant.get("id")),
                "shopify_variant_id": variant.get("id"),
                "product_id": short_id(product.get("id")),
                "shopify_product_id": product.get("id"),
                "product_title": product.get("title"),
                "product_handle": product.get("handle"),
                "original_unit_price": money_bag(item.get("originalUnitPriceSet")),
                "discounted_unit_price": money_bag(item.get("discountedUnitPriceSet")),
                "original_total": money_bag(item.get("originalTotalSet")),
                "discounted_total": money_bag(item.get("discountedTotalSet")),
            }
        )
    fulfillments = [normalize_fulfillment(value, node, synced_at) for value in node.get("fulfillments") or []]
    refunds = [normalize_refund(value, node, synced_at) for value in node.get("refunds") or []]
    returns = [normalize_return(value, node, synced_at) for value in (node.get("returns") or {}).get("nodes", [])]
    customer = node.get("customer") or {}
    shipping_line = node.get("shippingLine") or {}
    record = {
        "id": short_id(node["id"]),
        "shopify_id": node["id"],
        "legacy_id": str(node.get("legacyResourceId") or "") or None,
        "source": "shopify",
        "order_number": node.get("name"),
        "confirmation_number": node.get("confirmationNumber"),
        "created_at": node.get("createdAt"),
        "processed_at": node.get("processedAt"),
        "updated_at": node.get("updatedAt"),
        "closed_at": node.get("closedAt"),
        "cancelled_at": node.get("cancelledAt"),
        "cancel_reason": node.get("cancelReason"),
        "test": bool(node.get("test")),
        "financial_status": node.get("displayFinancialStatus"),
        "fulfillment_status": node.get("displayFulfillmentStatus"),
        "return_status": node.get("returnStatus"),
        "currency": node.get("currencyCode"),
        "presentment_currency": node.get("presentmentCurrencyCode"),
        "fully_paid": bool(node.get("fullyPaid")),
        "unpaid": bool(node.get("unpaid")),
        "requires_shipping": bool(node.get("requiresShipping")),
        "refundable": bool(node.get("refundable")),
        "source_name": node.get("sourceName"),
        "status_page_url": node.get("statusPageUrl"),
        "tags": node.get("tags") or [],
        "note": node.get("note"),
        "email": node.get("email"),
        "phone": node.get("phone"),
        "customer": {
            "id": short_id(customer.get("id")),
            "shopify_id": customer.get("id"),
            "display_name": customer.get("displayName"),
            "first_name": customer.get("firstName"),
            "last_name": customer.get("lastName"),
            "email": customer.get("email"),
            "phone": customer.get("phone"),
        }
        if customer
        else None,
        "shipping_address": address_record(node.get("shippingAddress")),
        "billing_address": address_record(node.get("billingAddress")),
        "delivery_method": "SHIPPING" if node.get("shippingAddress") else "PICKUP_OR_OTHER",
        "shipping_line": {
            "shopify_id": shipping_line.get("id"),
            "title": shipping_line.get("title"),
            "code": shipping_line.get("code"),
            "source": shipping_line.get("source"),
            "original_price": money_bag(shipping_line.get("originalPriceSet")),
            "discounted_price": money_bag(shipping_line.get("discountedPriceSet")),
        }
        if shipping_line
        else None,
        "money": {
            "subtotal": money_bag(node.get("subtotalPriceSet")),
            "current_subtotal": money_bag(node.get("currentSubtotalPriceSet")),
            "total": money_bag(node.get("totalPriceSet")),
            "current_total": money_bag(node.get("currentTotalPriceSet")),
            "discounts": money_bag(node.get("totalDiscountsSet")),
            "current_discounts": money_bag(node.get("currentTotalDiscountsSet")),
            "shipping": money_bag(node.get("totalShippingPriceSet")),
            "current_shipping": money_bag(node.get("currentShippingPriceSet")),
            "tax": money_bag(node.get("totalTaxSet")),
            "current_tax": money_bag(node.get("currentTotalTaxSet")),
            "refunded": money_bag(node.get("totalRefundedSet")),
            "outstanding": money_bag(node.get("totalOutstandingSet")),
        },
        "line_items": line_items,
        "line_item_count": sum(item["quantity"] for item in line_items),
        "fulfillments": fulfillments,
        "refunds": refunds,
        "returns": returns,
        "tracking": [entry for fulfillment in fulfillments for entry in fulfillment.get("tracking") or []],
        "synced_at": synced_at,
    }
    return record, fulfillments, refunds, returns


def normalize_customer(node: dict[str, Any], synced_at: str) -> dict[str, Any]:
    amount_spent = node.get("amountSpent") or {}
    return {
        "id": short_id(node["id"]),
        "shopify_id": node["id"],
        "legacy_id": str(node.get("legacyResourceId") or "") or None,
        "source": "shopify",
        "display_name": node.get("displayName"),
        "first_name": node.get("firstName"),
        "last_name": node.get("lastName"),
        "email": node.get("email"),
        "phone": node.get("phone"),
        "state": node.get("state"),
        "verified_email": bool(node.get("verifiedEmail")),
        "tax_exempt": bool(node.get("taxExempt")),
        "tags": node.get("tags") or [],
        "note": node.get("note"),
        "number_of_orders": int(node.get("numberOfOrders") or 0),
        "amount_spent": {"amount": money(amount_spent.get("amount")), "currency": amount_spent.get("currencyCode")},
        "default_address": address_record(node.get("defaultAddress")),
        "created_at": node.get("createdAt"),
        "updated_at": node.get("updatedAt"),
        "synced_at": synced_at,
    }


def normalize_inventory_item(node: dict[str, Any], synced_at: str | None = None) -> dict[str, Any]:
    synced_at = synced_at or now_iso()
    variant = node.get("variant") or {}
    product = variant.get("product") or {}
    locations = []
    totals = {name: 0 for name in ("available", "committed", "incoming", "on_hand", "reserved")}
    for level in (node.get("inventoryLevels") or {}).get("nodes", []):
        quantities = {quantity.get("name"): int(quantity.get("quantity") or 0) for quantity in level.get("quantities") or []}
        for name in totals:
            totals[name] += quantities.get(name, 0)
        location = level.get("location") or {}
        locations.append(
            {
                "inventory_level_id": level.get("id"),
                "shopify_location_id": location.get("id"),
                "name": location.get("name"),
                "active": bool(location.get("isActive")),
                "quantities": quantities,
                "updated_at": level.get("updatedAt"),
            }
        )
    weight = (node.get("measurement") or {}).get("weight") or {}
    unit_cost = node.get("unitCost") or {}
    return {
        "id": short_id(node["id"]),
        "shopify_id": node["id"],
        "legacy_id": str(node.get("legacyResourceId") or "") or None,
        "source": "shopify",
        "sku": node.get("sku"),
        "tracked": bool(node.get("tracked")),
        "requires_shipping": bool(node.get("requiresShipping")),
        "duplicate_sku_count": int(node.get("duplicateSkuCount") or 0),
        "country_code_of_origin": node.get("countryCodeOfOrigin"),
        "province_code_of_origin": node.get("provinceCodeOfOrigin"),
        "harmonized_system_code": node.get("harmonizedSystemCode"),
        "weight": {"value": money(weight.get("value")), "unit": weight.get("unit")} if weight else None,
        "unit_cost": {"amount": money(unit_cost.get("amount")), "currency": unit_cost.get("currencyCode")} if unit_cost else None,
        "variant_id": short_id(variant.get("id")),
        "shopify_variant_id": variant.get("id"),
        "variant_title": variant.get("title"),
        "variant_display_name": variant.get("displayName"),
        "product_id": short_id(product.get("id")),
        "shopify_product_id": product.get("id"),
        "product_title": product.get("title"),
        "product_handle": product.get("handle"),
        "product_status": product.get("status"),
        "quantities": totals,
        "locations": locations,
        "created_at": node.get("createdAt"),
        "updated_at": node.get("updatedAt"),
        "synced_at": synced_at,
    }


def connection_details() -> dict[str, Any]:
    try:
        config = ShopifyConfig.from_environment()
    except ShopifyConfigurationError as exc:
        return {"configured": False, "status": "Disconnected", "detail": str(exc)}
    return {
        "configured": True,
        "status": "Configured",
        "store_domain": config.store_domain,
        "api_version": config.api_version,
        "authentication_mode": config.authentication_mode,
    }


def verify_connection() -> dict[str, Any]:
    client = ShopifyClient()
    profile = client.get_shop_profile()
    shop = profile["shop"]
    return {
        "configured": True,
        "status": "Healthy",
        "shop": shop.get("name"),
        "store_domain": shop.get("myshopifyDomain") or client.config.store_domain,
        "primary_domain": (shop.get("primaryDomain") or {}).get("url"),
        "currency": shop.get("currencyCode"),
        "timezone": shop.get("timezoneAbbreviation"),
        "api_version": client.config.api_version,
        "authentication_mode": client.config.authentication_mode,
        "shopify_counts": {
            "orders": (profile.get("ordersCount") or {}).get("count"),
            "products": (profile.get("productsCount") or {}).get("count"),
            "customers": (profile.get("customersCount") or {}).get("count"),
        },
    }


def fetch_shopify_snapshot(
    client: ShopifyClient | None = None,
    progress: Callable[[str, int], None] | None = None,
) -> dict[str, Any]:
    client = client or ShopifyClient()
    sync_id = str(uuid.uuid4())
    synced_at = now_iso()
    profile = client.get_shop_profile()
    raw_products = client.get_all_products(progress)
    raw_orders = client.get_all_orders(progress)
    raw_customers = client.get_all_customers(progress)
    raw_inventory = client.get_all_inventory_items(progress)

    products: list[dict[str, Any]] = []
    variants: list[dict[str, Any]] = []
    for node in raw_products:
        product, product_variants = normalize_product(node, synced_at)
        products.append(product)
        variants.extend(product_variants)

    orders: list[dict[str, Any]] = []
    fulfillments: list[dict[str, Any]] = []
    refunds: list[dict[str, Any]] = []
    returns: list[dict[str, Any]] = []
    for node in raw_orders:
        order, order_fulfillments, order_refunds, order_returns = normalize_order(node, synced_at)
        orders.append(order)
        fulfillments.extend(order_fulfillments)
        refunds.extend(order_refunds)
        returns.extend(order_returns)

    customers = [normalize_customer(node, synced_at) for node in raw_customers]
    inventory_items = [normalize_inventory_item(node, synced_at) for node in raw_inventory]
    shop = profile["shop"]
    shop_record = {
        "id": shop.get("myshopifyDomain") or client.config.store_domain,
        "shopify_id": shop.get("myshopifyDomain") or client.config.store_domain,
        "source": "shopify",
        "name": shop.get("name"),
        "domain": shop.get("myshopifyDomain"),
        "primary_domain": (shop.get("primaryDomain") or {}).get("url"),
        "currency": shop.get("currencyCode"),
        "timezone": shop.get("timezoneAbbreviation"),
        "shopify_counts": {
            "orders": (profile.get("ordersCount") or {}).get("count"),
            "products": (profile.get("productsCount") or {}).get("count"),
            "customers": (profile.get("customersCount") or {}).get("count"),
        },
        "synced_at": synced_at,
    }
    collections = {
        "shop": [shop_record],
        "orders": orders,
        "products": products,
        "variants": variants,
        "inventory_items": inventory_items,
        "customers": customers,
        "fulfillments": fulfillments,
        "refunds": refunds,
        "returns": returns,
    }
    for records in collections.values():
        for record in records:
            record["sync_id"] = sync_id
    return {
        "sync_id": sync_id,
        "synced_at": synced_at,
        "collections": collections,
        "counts": {name: len(records) for name, records in collections.items()},
        "shopify_counts": shop_record["shopify_counts"],
    }


__all__ = [
    "ShopifyAPIError",
    "ShopifyClient",
    "ShopifyConfig",
    "ShopifyConfigurationError",
    "address_record",
    "connection_details",
    "fetch_shopify_snapshot",
    "money",
    "money_bag",
    "normalize_customer",
    "normalize_inventory_item",
    "normalize_order",
    "normalize_product",
    "normalize_store_domain",
    "now_iso",
    "short_id",
    "verify_connection",
]
