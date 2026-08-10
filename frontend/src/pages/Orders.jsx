import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import useSWR from "swr";
import { api } from "@/lib/api";
import { fmtDate, fmtCHF } from "@/lib/format";
import { PageHeader, StatusChip, EmptyState } from "@/components/common";
import { useT } from "@/lib/i18n";
import { Skeleton } from "@/components/ui/skeleton";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";

const FILTERS = [
  ["", "All"], ["unfulfilled", "Unfulfilled"], ["over-8", "> 8 business days"], ["over-14", "> 14 business days"],
  ["over-30", "> 30 business days"], ["shipping", "Shipping"], ["pickup", "Pickup"], ["awaiting-stock", "Awaiting stock"],
  ["unread-message", "Unread customer message"], ["missing-tracking", "Missing tracking"], ["cancelled-refunded", "Cancelled / refunded"],
];

const COLS = ["Order", "Customer", "Product / qty", "Paid", "Age", "Payment", "Fulfillment", "Stock", "Delivery", "Tracking", "Contact", "Next action", "Exceptions"];

export default function Orders() {
  const { t } = useT();
  const [params, setParams] = useSearchParams();
  const filter = params.get("filter") || "";
  const [q, setQ] = useState(params.get("q") || "");
  const navigate = useNavigate();
  const { data: orders, isLoading } = useSWR(["orders", filter, q], () => api.orders({ filter: filter || undefined, q: q || undefined }));

  return (
    <div data-testid="orders-page">
      <PageHeader title={t("Orders")} freshness={t("Shopify synced 2 min ago · Shopify remains the source of record for financial state")}
        actions={
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-inkmed" />
            <Input value={q} onChange={(e) => { setQ(e.target.value); setParams((p) => { const n = new URLSearchParams(p); e.target.value ? n.set("q", e.target.value) : n.delete("q"); return n; }, { replace: true }); }}
              placeholder={t("Filter by order, customer, SKU…")} className="h-9 w-64 pl-8" data-testid="orders-search-input" />
          </div>
        }>
        <div className="mt-3 flex flex-wrap gap-1.5" data-testid="orders-filters">
          {FILTERS.map(([key, label]) => (
            <button key={key} data-testid={`orders-filter-${key || "all"}`}
              onClick={() => setParams(key ? { filter: key } : {})}
              className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filter === key ? "border-brand bg-brand text-white" : "border-line bg-surface text-inkmed hover:border-brand/40 hover:text-ink")}>
              {t(label)}
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="p-6">
        {isLoading ? (
          <div className="space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : !orders?.length ? (
          <EmptyState title={t("No orders match")} description={t("No orders match the current filters — data is available and synced.")}
            action={<button onClick={() => { setParams({}); setQ(""); }} className="text-xs font-medium text-brand hover:underline" data-testid="orders-clear-filters">{t("Clear filters")}</button>} />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-semibold text-inkmed">
                  {COLS.map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2.5">{t(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const cancelled = ["Cancelled", "Refunded"].includes(o.payment_status);
                  return (
                    <tr key={o.id} data-testid={`order-row-${o.id}`}
                      onClick={() => navigate(`/orders/${o.id}`)}
                      className={cn("h-[52px] cursor-pointer border-b border-line last:border-0 transition-colors hover:bg-subtle", cancelled && "opacity-50")}>
                      <td className="tnum whitespace-nowrap px-3 font-medium text-brand">{o.id}</td>
                      <td className="whitespace-nowrap px-3">
                        <p className="font-medium">{o.customer.name}</p>
                        <p className="text-xs text-inkmed">{o.customer.city}</p>
                      </td>
                      <td className="max-w-48 px-3">
                        <p className="truncate">{o.items[0].name}</p>
                        <p className="tnum text-xs text-inkmed">{o.items[0].qty}× · {fmtCHF(o.total)}</p>
                      </td>
                      <td className="tnum whitespace-nowrap px-3 text-xs">{fmtDate(o.paid_at)}</td>
                      <td className="tnum whitespace-nowrap px-3 font-medium">
                        <span className={cn(o.business_day_age > 14 && !cancelled && o.fulfillment_stage !== "Fulfilled" ? "text-danger" : "")}>{o.business_day_age} {t("business days")}</span>
                      </td>
                      <td className="px-3"><StatusChip value={o.payment_status} /></td>
                      <td className="px-3"><StatusChip value={o.fulfillment_stage} /></td>
                      <td className="whitespace-nowrap px-3 text-xs text-inkmed">{o.stock_state}</td>
                      <td className="whitespace-nowrap px-3 text-xs">{o.delivery_method}</td>
                      <td className="tnum whitespace-nowrap px-3 text-xs">{o.tracking ? o.tracking.slice(0, 14) + "…" : "—"}</td>
                      <td className="max-w-40 truncate px-3 text-xs text-inkmed">{o.contact_state}</td>
                      <td className="max-w-40 truncate px-3 text-xs font-medium text-brand">{o.next_action || "—"}</td>
                      <td className="px-3">
                        {o.exceptions.length > 0 && (
                          <HoverCard openDelay={150}>
                            <HoverCardTrigger asChild>
                              <span className="tnum inline-flex h-6 min-w-6 cursor-default items-center justify-center rounded-full bg-red-50 px-1.5 text-xs font-semibold text-danger" data-testid="exception-badge">{o.exceptions.length}</span>
                            </HoverCardTrigger>
                            <HoverCardContent className="w-64 p-3">
                              <ul className="list-disc space-y-1 pl-4 text-xs text-ink">
                                {o.exceptions.slice(0, 3).map((e) => <li key={e}>{e}</li>)}
                              </ul>
                            </HoverCardContent>
                          </HoverCard>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
