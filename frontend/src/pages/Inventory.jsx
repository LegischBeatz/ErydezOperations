import React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import useSWR from "swr";
import { api } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { customerName, money } from "@/lib/shopify";
import { EmptyState, FactList, interactiveRowProps, PageHeader, StatusChip, TableOverflowHint } from "@/components/common";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

const QUANTITIES = ["available", "on_hand", "committed", "reserved", "incoming"];

export default function Inventory() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const selected = params.get("item");
  const q = params.get("q") || "";
  const lowStock = params.get("low_stock") === "true";
  const page = Math.max(Number(params.get("page") || 1), 1);
  const query = { q: q || undefined, low_stock: lowStock || undefined, page, page_size: 100 };
  const { data, isLoading, error } = useSWR(["inventory", query], () => api.inventory(query), { keepPreviousData: true });
  const { data: detail } = useSWR(selected ? ["inventory-item", selected] : null, () => api.inventoryItem(selected));

  const update = (values) => {
    const next = new URLSearchParams(params);
    Object.entries(values).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    if (!("page" in values)) next.delete("page");
    setParams(next);
  };

  return (
    <div data-testid="inventory-page">
      <PageHeader title="Inventory" freshness={data ? `${data.total} Shopify inventory items · quantities are location-aware` : "Loading Shopify inventory…"}>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center">
          <div className="relative min-w-0 sm:col-span-2 lg:min-w-[280px] lg:flex-1 lg:max-w-md"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-inkmed" /><Input value={q} onChange={(event) => update({ q: event.target.value })} placeholder="Product, variant or SKU…" className="h-9 pl-9" /></div>
          <label className="flex min-h-9 items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm transition-colors duration-150 hover:bg-subtle"><input type="checkbox" checked={lowStock} onChange={(event) => update({ low_stock: event.target.checked ? "true" : "" })} className="h-4 w-4 rounded border-line text-brand focus:ring-brand" /> Tracked with ≤ 3 available</label>
        </div>
      </PageHeader>

      <div className="p-4 sm:p-6">
        {isLoading && !data ? <Skeleton className="h-[520px] w-full" /> : error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-danger">Unable to load Shopify inventory.</div> : !data?.items?.length ? <EmptyState title="No matching Shopify inventory items" /> : (
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <TableOverflowHint id="inventory-table-scroll-hint" />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-left" aria-describedby="inventory-table-scroll-hint">
                <thead className="border-b border-line bg-subtle/70 text-[11px] uppercase tracking-wide text-inkmed"><tr><th className="px-4 py-2.5">Product / variant</th><th className="px-3 py-2.5">SKU</th><th className="px-3 py-2.5">Tracking</th>{QUANTITIES.map((name) => <th key={name} className="px-3 py-2.5 text-right">{name.replace("_", " ")}</th>)}<th className="px-3 py-2.5">Locations</th></tr></thead>
                <tbody className="divide-y divide-line">{data.items.map((item) => {
                  const available = Number(item.quantities?.available || 0);
                  const tone = !item.tracked ? "neut" : available <= 0 ? "danger" : available <= 3 ? "warn" : "ok";
                  return <tr key={item.shopify_id} onClick={() => update({ item: item.id })} {...interactiveRowProps(() => update({ item: item.id }), `Open details for ${item.product_title || item.sku || item.id}`)} className="cursor-pointer transition-colors duration-150 hover:bg-subtle/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand" data-testid={`inventory-row-${item.id}`}><td className="px-4 py-3"><p className="max-w-sm truncate text-sm font-semibold">{item.product_title || "Unknown product"}</p><p className="truncate text-xs text-inkmed">{item.variant_title || "Default variant"}</p></td><td className="tnum px-3 py-3 text-sm">{item.sku || "—"}</td><td className="px-3 py-3"><StatusChip value={item.tracked ? "Tracked" : "Not tracked"} toneOverride={tone} /></td>{QUANTITIES.map((name) => <td key={name} className={`tnum px-3 py-3 text-right text-sm font-semibold ${name === "available" && tone === "danger" ? "text-danger" : name === "available" && tone === "warn" ? "text-warn" : ""}`}>{item.quantities?.[name] ?? 0}</td>)}<td className="px-3 py-3 text-sm">{item.locations?.map((location) => location.name).filter(Boolean).join(", ") || "—"}</td></tr>;
                })}</tbody>
              </table>
            </div>
            <div className="flex flex-col gap-3 border-t border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-inkmed">Showing {(data.page - 1) * data.page_size + 1}–{Math.min(data.page * data.page_size, data.total)} of {data.total}</p><div className="flex items-center justify-between gap-2 sm:justify-start"><button disabled={page <= 1} onClick={() => update({ page: String(page - 1) })} className="flex h-8 items-center gap-1 rounded-md border border-line px-2.5 text-xs transition-colors duration-150 hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40"><ChevronLeft size={14} /> Previous</button><span className="tnum text-xs text-inkmed">{data.page} / {data.pages}</span><button disabled={page >= data.pages} onClick={() => update({ page: String(page + 1) })} className="flex h-8 items-center gap-1 rounded-md border border-line px-2.5 text-xs transition-colors duration-150 hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40">Next <ChevronRight size={14} /></button></div></div>
          </div>
        )}
      </div>

      <Sheet open={!!selected} onOpenChange={(open) => !open && update({ item: "" })}>
        <SheetContent className="w-[540px] overflow-y-auto sm:max-w-[540px]" data-testid="inventory-detail-drawer">
          {detail && <><SheetHeader><SheetTitle className="text-left">{detail.product_title} <span className="tnum ml-1 text-sm font-normal text-inkmed">{detail.sku || "No SKU"}</span></SheetTitle></SheetHeader><div className="mt-4 space-y-4">
            <div className="rounded-md border border-line bg-subtle p-3"><FactList facts={[["Variant", detail.variant_title || "Default"], ["Tracked", detail.tracked ? "Yes" : "No"], ["Requires shipping", detail.requires_shipping ? "Yes" : "No"], ["Duplicate SKU count", detail.duplicate_sku_count], ["Unit cost", detail.unit_cost ? money(detail.unit_cost) : "Unavailable"], ["Updated in Shopify", fmtDateTime(detail.updated_at)]]} /></div>
            <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-inkmed">Shopify quantity states</p><div className="grid grid-cols-5 gap-2">{QUANTITIES.map((name) => <div key={name} className="rounded-md border border-line p-2 text-center"><p className="tnum text-lg font-semibold">{detail.quantities?.[name] ?? 0}</p><p className="text-[10px] uppercase tracking-wide text-inkmed">{name.replace("_", " ")}</p></div>)}</div></div>
            <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-inkmed">Locations</p>{detail.locations?.length ? detail.locations.map((location) => <div key={location.inventory_level_id} className="mb-2 rounded-md border border-line p-3 last:mb-0"><div className="flex items-center justify-between"><p className="text-sm font-semibold">{location.name}</p><StatusChip value={location.active ? "Active" : "Inactive"} /></div><div className="mt-2 grid grid-cols-5 gap-2">{QUANTITIES.map((name) => <div key={name}><p className="tnum text-sm font-semibold">{location.quantities?.[name] ?? 0}</p><p className="text-[10px] text-inkmed">{name}</p></div>)}</div></div>) : <p className="text-sm text-inkmed">No Shopify inventory levels.</p>}</div>
            <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-inkmed">Open orders using this variant</p>{detail.open_orders?.length ? detail.open_orders.map((order) => <button key={order.shopify_id} onClick={() => navigate(`/orders/${order.id}`)} className="flex w-full items-center justify-between border-b border-line py-2 text-left last:border-0 hover:text-brand"><span className="tnum text-sm font-medium">{order.order_number} · {customerName(order)}</span><StatusChip value={order.fulfillment_status || "Unfulfilled"} /></button>) : <EmptyState title="No open orders linked" />}</div>
            {detail.product_id && <Link to={`/products/${detail.product_id}`} className="block h-9 rounded-md border border-line pt-2 text-center text-sm font-medium hover:bg-subtle">Open product and variants</Link>}
          </div></>}
        </SheetContent>
      </Sheet>
    </div>
  );
}
