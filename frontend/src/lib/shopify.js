export const statusLabel = (value) =>
  String(value || "Unknown")
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export const money = (value, currency = "CHF") => {
  const amount = typeof value === "object" && value !== null ? value.amount : value;
  const code = (typeof value === "object" && value !== null ? value.currency : null) || currency || "CHF";
  const numeric = Number(amount || 0);
  try {
    return new Intl.NumberFormat("de-CH", { style: "currency", currency: code, maximumFractionDigits: 2 }).format(numeric);
  } catch {
    return `${code} ${numeric.toFixed(2)}`;
  }
};

export const customerName = (order) =>
  order?.customer?.display_name ||
  [order?.customer?.first_name, order?.customer?.last_name].filter(Boolean).join(" ") ||
  order?.email ||
  "Guest";

export const customerDisplayName = (customer) =>
  customer?.display_name ||
  [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") ||
  customer?.email ||
  "Guest";

export const addressLine = (address) => {
  if (!address) return "—";
  return [address.city, address.province_code, address.country_code].filter(Boolean).join(", ") || "—";
};

export const itemSummary = (order) => {
  const items = order?.line_items || [];
  if (!items.length) return "No line items";
  const first = items[0];
  const title = first.product_title || first.title || first.name || "Unknown item";
  const extra = items.length > 1 ? ` +${items.length - 1}` : "";
  return `${title}${extra}`;
};

export const quantityTotal = (items) => (items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);

export const primaryTracking = (order) => (order?.tracking || []).find((entry) => entry?.number) || null;
