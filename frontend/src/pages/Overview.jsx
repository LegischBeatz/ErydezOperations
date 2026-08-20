import React from "react";
import { useNavigate } from "react-router-dom";
import useSWR from "swr";
import { api } from "@/lib/api";
import { fmtDateTime, fmtRel } from "@/lib/format";
import { money, statusLabel, customerName, itemSummary } from "@/lib/shopify";
import { EmptyState, interactiveRowProps, KpiCard, PageHeader, SectionCard, StatusChip, TableOverflowHint } from "@/components/common";
import { useT } from "@/lib/i18n";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Store } from "lucide-react";

function StatusBreakdown({ values = {}, onClick }) {
  const total = Object.values(values).reduce((sum, value) => sum + value, 0) || 1;
  return (
    <div className="space-y-3">
      {Object.entries(values)
        .sort((a, b) => b[1] - a[1])
        .map(([status, count]) => (
          <button key={status} onClick={() => onClick?.(status)} className="group block w-full rounded-md text-left transition-colors duration-150 hover:bg-subtle/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2">
            <div className="mb-1 flex items-center justify-between gap-3">
              <StatusChip value={statusLabel(status)} />
              <span className="tnum text-sm font-semibold">{count}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-subtle">
              <div className="h-full rounded-full bg-brand/75 transition-colors group-hover:bg-brand" style={{ width: `${Math.max((count / total) * 100, 2)}%` }} />
            </div>
          </button>
        ))}
    </div>
  );
}

export default function Overview() {
  const navigate = useNavigate();
  const { t } = useT();
  const { data, isLoading, error } = useSWR("overview", api.overview, { revalidateOnFocus: false });

  if (isLoading || !data) {
    return (
      <div className="space-y-4 p-6" data-testid="overview-skeleton">
        <Skeleton className="h-8 w-72" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">{[...Array(8)].map((_, index) => <Skeleton key={index} className="h-24" />)}</div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (error) {
    return <div className="p-4 text-sm text-danger sm:p-6">{t("Unable to load the active Shopify snapshot.")}</div>;
  }

  return (
    <div data-testid="overview-page">
      <PageHeader
        title={t("Shopify overview")}
        freshness={data.last_sync ? `${t("Last complete synchronization")} ${fmtRel(data.last_sync)} · ${fmtDateTime(data.last_sync)}` : t("No active Shopify snapshot")}
        status={<span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-ok"><Store size={12} /> {t("Shopify source of truth")}</span>}
      />
      <div className="space-y-4 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label={t("Orders")} value={data.cards.orders} sub={t("All orders accessible to the app")} onClick={() => navigate("/orders")} testId="card-orders" />
          <KpiCard label={t("Current sales")} value={money(data.cards.gross_sales, data.currency)} sub={t("Sum of current Shopify order totals")} toneName="ok" onClick={() => navigate("/orders")} testId="card-sales" />
          <KpiCard label={t("Unfulfilled")} value={data.cards.unfulfilled} sub={t("Not fulfilled and not cancelled")} toneName="warn" onClick={() => navigate("/orders?filter=unfulfilled")} testId="card-unfulfilled" />
          <KpiCard label={t("Refunded")} value={money(data.cards.refunded_total, data.currency)} sub={`${data.cards.refunded_orders} ${t("orders with refunds")}`} toneName="danger" onClick={() => navigate("/returns")} testId="card-refunds" />
          <KpiCard label={t("Active products")} value={data.cards.active_products} sub={t("Shopify product status: Active")} onClick={() => navigate("/products?status=ACTIVE")} testId="card-products" />
          <KpiCard label={t("Available inventory")} value={data.cards.available_inventory} sub={t("Across all Shopify inventory items")} toneName="info" onClick={() => navigate("/inventory")} testId="card-inventory" />
          <KpiCard label={t("Low-stock variants")} value={data.cards.low_stock_variants} sub={t("Tracked and ≤ 3 available")} toneName={data.cards.low_stock_variants ? "warn" : "ok"} onClick={() => navigate("/inventory?low_stock=true")} testId="card-low-stock" />
          <KpiCard label={t("Last sync")} value={data.last_sync ? fmtRel(data.last_sync) : "—"} sub={t("Complete canonical snapshot")} onClick={() => navigate("/settings/integrations")} testId="card-last-sync" />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <SectionCard
            title={t("Recent Shopify orders")}
            className="xl:col-span-2"
            action={<button onClick={() => navigate("/orders")} className="flex items-center gap-1 rounded-md text-xs font-medium text-brand transition-colors duration-150 hover:text-brand/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2">{t("View all")} <ArrowRight size={12} /></button>}
            testId="recent-orders"
          >
            {data.recent_orders.length === 0 ? (
              <EmptyState title={t("No Shopify orders")} description={t("The active snapshot contains no orders.")} />
            ) : (
              <>
                <TableOverflowHint id="recent-orders-scroll-hint" className="-mx-4 -mt-4" />
                <div className="-m-4 overflow-x-auto">
                  <table className="w-full min-w-[780px] text-left" aria-describedby="recent-orders-scroll-hint">
                    <thead className="border-b border-line bg-subtle/60 text-[11px] uppercase tracking-wide text-inkmed">
                      <tr><th className="px-4 py-2">{t("Order")}</th><th className="px-3 py-2">{t("Customer")}</th><th className="px-3 py-2">{t("Items")}</th><th className="px-3 py-2 text-right">{t("Total")}</th><th className="px-3 py-2">{t("Payment")}</th><th className="px-3 py-2">{t("Fulfillment")}</th></tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {data.recent_orders.map((order) => (
                        <tr key={order.shopify_id} onClick={() => navigate(`/orders/${order.id}`)} {...interactiveRowProps(() => navigate(`/orders/${order.id}`), `${t("Open details for")} ${order.order_number}`)} className="cursor-pointer transition-colors duration-150 hover:bg-subtle/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand" data-testid="recent-order-row">
                          <td className="tnum px-4 py-2.5 text-sm font-semibold text-brand">{order.order_number}</td>
                          <td className="px-3 py-2.5"><p className="text-sm font-medium">{customerName(order)}</p><p className="text-xs text-inkmed">{order.city || t("Pickup / other")}</p></td>
                          <td className="max-w-xs px-3 py-2.5"><p className="truncate text-sm">{itemSummary(order)}</p><p className="text-xs text-inkmed">{order.line_item_count} {t("units")}</p></td>
                          <td className="tnum px-3 py-2.5 text-right text-sm font-medium">{money(order.money?.current_total, order.currency)}</td>
                          <td className="px-3 py-2.5"><StatusChip value={statusLabel(order.financial_status)} /></td>
                          <td className="px-3 py-2.5"><StatusChip value={statusLabel(order.fulfillment_status)} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </SectionCard>

          <SectionCard title={t("Financial status")} testId="financial-breakdown">
            <StatusBreakdown values={data.financial_statuses} onClick={(status) => navigate(`/orders?financial_status=${status}`)} />
          </SectionCard>

          <SectionCard title={t("Fulfillment status")} testId="fulfillment-breakdown">
            <StatusBreakdown values={data.fulfillment_statuses} onClick={(status) => navigate(`/orders?fulfillment_status=${status}`)} />
          </SectionCard>

          <SectionCard title={t("Top products by order value")} className="xl:col-span-2" testId="top-products">
            {data.top_products.length === 0 ? <EmptyState title={t("No product sales")} /> : (
              <div className="divide-y divide-line">
                {data.top_products.map((product, index) => (
                  <div key={product.title} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                    <span className="tnum flex h-6 w-6 items-center justify-center rounded-full bg-subtle text-xs font-semibold text-inkmed">{index + 1}</span>
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">{product.title}</p>
                    <span className="tnum text-xs text-inkmed">{product.quantity} {t("units")}</span>
                    <span className="tnum w-28 text-right text-sm font-semibold">{money(product.sales, data.currency)}</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title={t("Low-stock Shopify variants")} testId="low-stock-list">
            {data.low_stock.length === 0 ? <EmptyState title={t("No low-stock tracked variants")} /> : (
              <div className="space-y-2">
                {data.low_stock.slice(0, 8).map((item) => (
                  <button key={item.shopify_id} onClick={() => navigate(`/inventory?item=${encodeURIComponent(item.id)}`)} className="flex w-full items-center justify-between gap-3 rounded-md border border-line p-2.5 text-left transition-colors duration-150 hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2">
                    <div className="min-w-0"><p className="truncate text-sm font-medium">{item.product_title}</p><p className="truncate text-xs text-inkmed">{item.sku || t("No SKU")} · {item.variant_title}</p></div>
                    <span className="tnum rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-warn">{item.quantities?.available ?? 0} {t("available")}</span>
                  </button>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
