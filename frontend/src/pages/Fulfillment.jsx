import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import useSWR from "swr";
import { api } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { statusLabel } from "@/lib/shopify";
import { EmptyState, PageHeader, StatusChip } from "@/components/common";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, Search, Truck } from "lucide-react";

export default function Fulfillment() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const { data: records, isLoading, error } = useSWR("fulfillments", api.fulfillments);
  const statuses = useMemo(() => [...new Set((records || []).map((record) => record.status).filter(Boolean))].sort(), [records]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (records || []).filter((record) => {
      if (status && record.status !== status) return false;
      if (!needle) return true;
      return [record.order_number, record.id, ...((record.tracking || []).flatMap((entry) => [entry.number, entry.company]))]
        .some((value) => String(value || "").toLowerCase().includes(needle));
    });
  }, [records, q, status]);

  return (
    <div data-testid="fulfillment-page">
      <PageHeader title="Fulfillment" freshness={records ? `${records.length} Shopify fulfillment records · read-only mirror` : "Loading Shopify fulfillments…"} status={<span className="inline-flex items-center gap-1 text-xs text-inkmed"><Truck size={12} /> Shopify-managed</span>}>
        <div className="mt-4 flex flex-wrap gap-2"><div className="relative min-w-[280px] flex-1 md:max-w-md"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-inkmed" /><Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Order, fulfillment, tracking or carrier…" className="h-9 pl-9" /></div><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded-md border border-line bg-surface px-3 text-sm"><option value="">All fulfillment states</option>{statuses.map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></div>
      </PageHeader>
      <div className="p-6">
        {isLoading ? <Skeleton className="h-[520px] w-full" /> : error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-danger">Unable to load Shopify fulfillments.</div> : !filtered.length ? <EmptyState title="No matching Shopify fulfillments" description="Fulfillment records appear after Shopify creates them." /> : (
          <div className="overflow-hidden rounded-lg border border-line bg-surface"><div className="overflow-x-auto"><table className="w-full min-w-[1080px] text-left"><thead className="border-b border-line bg-subtle/70 text-[11px] uppercase tracking-wide text-inkmed"><tr><th className="px-4 py-2.5">Order</th><th className="px-3 py-2.5">Fulfillment</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5">Created</th><th className="px-3 py-2.5">Delivered / estimated</th><th className="px-3 py-2.5">Tracking</th><th className="px-3 py-2.5 text-right">Line quantity</th></tr></thead><tbody className="divide-y divide-line">{filtered.map((record) => {
            const totalQuantity = (record.line_items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
            return <tr key={record.shopify_id} className="align-top hover:bg-subtle/60" data-testid={`fulfillment-row-${record.id}`}><td className="px-4 py-3"><button onClick={() => navigate(`/orders/${record.order_id}`)} className="tnum text-sm font-semibold text-brand hover:underline">{record.order_number}</button></td><td className="tnum px-3 py-3 text-sm">{record.id}</td><td className="px-3 py-3"><StatusChip value={statusLabel(record.status)} /></td><td className="tnum whitespace-nowrap px-3 py-3 text-sm">{fmtDateTime(record.created_at)}</td><td className="px-3 py-3"><p className="tnum text-sm">{record.delivered_at ? fmtDateTime(record.delivered_at) : "Not delivered"}</p><p className="tnum text-xs text-inkmed">{record.estimated_delivery_at ? `Estimated ${fmtDateTime(record.estimated_delivery_at)}` : "No estimate"}</p></td><td className="px-3 py-3">{record.tracking?.length ? record.tracking.map((entry, index) => <div key={`${entry.number}-${index}`} className="mb-1 last:mb-0"><p className="tnum text-sm font-medium">{entry.number || "No number"}</p><p className="text-xs text-inkmed">{entry.company || "Carrier not supplied"}{entry.url && <> · <a href={entry.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-brand hover:underline">Track <ExternalLink size={10} /></a></>}</p></div>) : <span className="text-sm text-inkmed">No tracking</span>}</td><td className="tnum px-3 py-3 text-right text-sm font-semibold">{totalQuantity}</td></tr>;
          })}</tbody></table></div><div className="border-t border-line px-4 py-3 text-xs text-inkmed">Showing {filtered.length} of {records.length} Shopify fulfillment records.</div></div>
        )}
      </div>
    </div>
  );
}
