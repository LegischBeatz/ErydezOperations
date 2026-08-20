import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import useSWR from "swr";
import { api } from "@/lib/api";
import { fmtDate, fmtRel } from "@/lib/format";
import { addressLine, customerName, itemSummary, money, primaryTracking, statusLabel } from "@/lib/shopify";
import { EmptyState, interactiveRowProps, PageHeader, StatusChip, TableOverflowHint } from "@/components/common";
import { useT } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Search, Store } from "lucide-react";
import { cn } from "@/lib/utils";

const FILTERS = [
  ["", "All"],
  ["unfulfilled", "Unfulfilled"],
  ["shipping", "Shipping"],
  ["pickup", "Pickup / other"],
  ["cancelled-refunded", "Cancelled / refunded"],
];

export default function Orders() {
  const navigate = useNavigate();
  const { t } = useT();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const filter = params.get("filter") || "";
  const financialStatus = params.get("financial_status") || "";
  const fulfillmentStatus = params.get("fulfillment_status") || "";
  const page = Math.max(Number(params.get("page") || 1), 1);
  const pageSize = 100;
  const query = { q: q || undefined, filter: filter || undefined, financial_status: financialStatus || undefined, fulfillment_status: fulfillmentStatus || undefined, page, page_size: pageSize };
  const { data, isLoading, error } = useSWR(["orders", query], () => api.orders(query), { keepPreviousData: true });

  const update = (values) => {
    const next = new URLSearchParams(params);
    Object.entries(values).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    if (!("page" in values)) next.delete("page");
    setParams(next);
  };

  return (
    <div data-testid="orders-page">
      <PageHeader
        title={t("Orders")}
        freshness={data ? `${data.total} ${t("Shopify orders")} · ${t("page")} ${data.page} ${t("of")} ${data.pages}` : t("Loading active Shopify snapshot…")}
        status={<span className="inline-flex items-center gap-1 text-xs text-inkmed"><Store size={12} /> {t("Shopify authoritative")}</span>}
      >
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center">
          <div className="relative min-w-0 sm:col-span-2 lg:min-w-[260px] lg:flex-1 lg:max-w-md">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-inkmed" />
            <Input value={q} onChange={(event) => update({ q: event.target.value })} placeholder={t("Order, customer, product, SKU, tracking…")} className="h-9 pl-9" data-testid="orders-search" />
          </div>
          <select value={financialStatus} onChange={(event) => update({ financial_status: event.target.value })} className="h-9 min-w-0 rounded-md border border-line bg-surface px-3 text-sm text-ink">
            <option value="">{t("All payment states")}</option>
            {["PAID", "PARTIALLY_REFUNDED", "REFUNDED", "PENDING", "AUTHORIZED", "PARTIALLY_PAID", "VOIDED"].map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
          </select>
          <select value={fulfillmentStatus} onChange={(event) => update({ fulfillment_status: event.target.value })} className="h-9 min-w-0 rounded-md border border-line bg-surface px-3 text-sm text-ink">
            <option value="">{t("All fulfillment states")}</option>
            {["FULFILLED", "UNFULFILLED", "PARTIALLY_FULFILLED", "SCHEDULED", "ON_HOLD", "IN_PROGRESS"].map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
          </select>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map(([value, label]) => (
            <button key={label} onClick={() => update({ filter: value })} className={cn("shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2", filter === value ? "border-brand bg-brand text-white" : "border-line bg-surface text-inkmed hover:border-brand/40 hover:text-ink")}>
              {t(label)}
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="p-4 sm:p-6">
        {isLoading && !data ? (
          <Skeleton className="h-[520px] w-full" />
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-danger">{t("Unable to load Shopify orders.")}</div>
        ) : data?.items?.length === 0 ? (
          <EmptyState title={t("No matching Shopify orders")} description={t("Adjust the search or status filters.")} />
        ) : (
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <TableOverflowHint id="orders-table-scroll-hint" />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] text-left" aria-describedby="orders-table-scroll-hint">
                <thead className="border-b border-line bg-subtle/70 text-[11px] uppercase tracking-wide text-inkmed">
                  <tr>
                    <th className="px-4 py-2.5">{t("Order")}</th><th className="px-3 py-2.5">{t("Date")}</th><th className="px-3 py-2.5">{t("Customer")}</th><th className="px-3 py-2.5">{t("Items")}</th><th className="px-3 py-2.5 text-right">{t("Current total")}</th><th className="px-3 py-2.5">{t("Payment")}</th><th className="px-3 py-2.5">{t("Fulfillment")}</th><th className="px-3 py-2.5">{t("Delivery")}</th><th className="px-3 py-2.5">{t("Tracking")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.items.map((order) => {
                    const tracking = primaryTracking(order);
                    return (
                      <tr key={order.shopify_id} onClick={() => navigate(`/orders/${order.id}`)} {...interactiveRowProps(() => navigate(`/orders/${order.id}`), `${t("Open details for")} ${order.order_number}`)} className="cursor-pointer align-top transition-colors duration-150 hover:bg-subtle/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand" data-testid={`order-row-${order.id}`}>
                        <td className="px-4 py-3"><p className="tnum text-sm font-semibold text-brand">{order.order_number}</p><p className="tnum text-[11px] text-inkmed">{order.confirmation_number || order.id}</p></td>
                        <td className="tnum whitespace-nowrap px-3 py-3 text-sm">{fmtDate(order.processed_at)}</td>
                        <td className="max-w-[220px] px-3 py-3"><p className="truncate text-sm font-medium">{customerName(order)}</p><p className="truncate text-xs text-inkmed">{addressLine(order.shipping_address || order.billing_address)}</p></td>
                        <td className="max-w-[280px] px-3 py-3"><p className="truncate text-sm">{itemSummary(order)}</p><p className="text-xs text-inkmed">{order.line_item_count} {t("units")} · {order.line_items?.length || 0} {t("lines")}</p></td>
                        <td className="tnum whitespace-nowrap px-3 py-3 text-right text-sm font-semibold">{money(order.money?.current_total, order.currency)}</td>
                        <td className="px-3 py-3"><StatusChip value={statusLabel(order.financial_status)} /></td>
                        <td className="px-3 py-3"><StatusChip value={statusLabel(order.fulfillment_status)} /></td>
                        <td className="px-3 py-3"><p className="text-sm">{order.shipping_line?.title || statusLabel(order.delivery_method)}</p><p className="text-xs text-inkmed">{order.requires_shipping ? t("Shipping required") : t("No shipping")}</p></td>
                        <td className="px-3 py-3"><p className="tnum max-w-[160px] truncate text-sm">{tracking?.number || "—"}</p><p className="text-xs text-inkmed">{tracking?.company || (order.updated_at ? `${t("Updated")} ${fmtRel(order.updated_at)}` : t("No tracking"))}</p></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-3 border-t border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-inkmed">{t("Showing")} {(data.page - 1) * data.page_size + 1}–{Math.min(data.page * data.page_size, data.total)} {t("of")} {data.total}</p>
              <div className="flex items-center justify-between gap-2 sm:justify-start">
                <button disabled={page <= 1} onClick={() => update({ page: String(page - 1) })} className="flex h-8 items-center gap-1 rounded-md border border-line px-2.5 text-xs font-medium transition-colors duration-150 hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40"><ChevronLeft size={14} /> {t("Previous")}</button>
                <span className="tnum text-xs text-inkmed">{data.page} / {data.pages}</span>
                <button disabled={page >= data.pages} onClick={() => update({ page: String(page + 1) })} className="flex h-8 items-center gap-1 rounded-md border border-line px-2.5 text-xs font-medium transition-colors duration-150 hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40">{t("Next")} <ChevronRight size={14} /></button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
