import { addressLine, customerDisplayName, customerName, itemSummary, money, statusLabel } from "./shopify";

describe("Shopify presentation helpers", () => {
  test("formats canonical status enums without exposing raw underscores", () => {
    expect(statusLabel("PARTIALLY_REFUNDED")).toBe("Partially Refunded");
    expect(statusLabel(null)).toBe("Unknown");
  });

  test("formats Shopify money bags and plain values", () => {
    expect(money({ amount: 99.9, currency: "CHF" })).toContain("99.90");
    expect(money(12, "CHF")).toContain("12.00");
  });

  test("handles guest orders and sparse customer identity safely", () => {
    expect(customerName({ email: "guest@example.com" })).toBe("guest@example.com");
    expect(customerName({})).toBe("Guest");
    expect(customerDisplayName({ first_name: "Ada", last_name: "Lovelace" })).toBe("Ada Lovelace");
  });

  test("handles absent addresses and line items without runtime errors", () => {
    expect(addressLine(null)).toBe("—");
    expect(itemSummary({ line_items: [] })).toBe("No line items");
    expect(itemSummary({ line_items: [{ product_title: "Scooter" }, { product_title: "Helmet" }] })).toBe("Scooter +1");
  });
});
