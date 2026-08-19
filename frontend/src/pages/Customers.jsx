import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import useSWR from "swr";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { addressLine, customerDisplayName, money, statusLabel } from "@/lib/shopify";
import { EmptyState, PageHeader, StatusChip } from "@/components/common";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Search, Users } from "lucide-react";

export default function Customers() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const page = Math.max(Number(params.get("page") || 1), 1);
  const query = { q: q || undefined, page, page_size: 100 };
  const { data, isLoading, error } = useSWR(["customers", query], () => api.customers(query), { keepPreviousData: true });

  const update = (values) => {
    const next = new URLSearchParams(params);
    Object.entries(values).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    if (!("page" in values)) next.delete("page");
    setParams(next);
  };

  return (
    <div data-testid="customers-page">
      <PageHeader title="Customers" freshness={data ? `${data.total} Shopify customer records` : "Loading Shopify customers…"} status={<span className="inline-flex items-center gap-1 text-xs text-inkmed"><Users size={12} /> Linked to Shopify orders</span>}>
        <div className="relative mt-4 max-w-md"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-inkmed" /><Input value={q} onChange={(event) => update({ q: event.target.value })} placeholder="Name, email, phone or city…" className="h-9 pl-9" /></div>
      </PageHeader>
      <div className="p-6">
        {isLoading && !data ? <Skeleton className="h-[520px] w-full" /> : error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-danger">Unable to load Shopify customers.</div> : !data?.items?.length ? <EmptyState title="No matching Shopify customers" /> : (
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left"><thead className="border-b border-line bg-subtle/70 text-[11px] uppercase tracking-wide text-inkmed"><tr><th className="px-4 py-2.5">Customer</th><th className="px-3 py-2.5">Contact</th><th className="px-3 py-2.5">Location</th><th className="px-3 py-2.5 text-right">Orders</th><th className="px-3 py-2.5 text-right">Amount spent</th><th className="px-3 py-2.5">State</th><th className="px-3 py-2.5">Created</th></tr></thead><tbody className="divide-y divide-line">{data.items.map((customer) => <tr key={customer.shopify_id} onClick={() => navigate(`/customers/${customer.id}`)} className="cursor-pointer hover:bg-subtle/60" data-testid={`customer-row-${customer.id}`}><td className="px-4 py-3"><p className="text-sm font-semibold">{customerDisplayName(customer)}</p><p className="tnum text-xs text-inkmed">{customer.id}</p></td><td className="px-3 py-3"><p className="text-sm">{customer.email || "—"}</p><p className="tnum text-xs text-inkmed">{customer.phone || "No phone"}</p></td><td className="px-3 py-3 text-sm">{addressLine(customer.default_address)}</td><td className="tnum px-3 py-3 text-right text-sm font-semibold">{customer.number_of_orders}</td><td className="tnum px-3 py-3 text-right text-sm font-semibold">{money(customer.amount_spent)}</td><td className="px-3 py-3"><StatusChip value={statusLabel(customer.state)} /></td><td className="tnum px-3 py-3 text-sm">{fmtDate(customer.created_at)}</td></tr>)}</tbody></table></div>
            <div className="flex items-center justify-between border-t border-line px-4 py-3"><p className="text-xs text-inkmed">Showing {(data.page - 1) * data.page_size + 1}–{Math.min(data.page * data.page_size, data.total)} of {data.total}</p><div className="flex items-center gap-2"><button disabled={page <= 1} onClick={() => update({ page: String(page - 1) })} className="flex h-8 items-center gap-1 rounded-md border border-line px-2.5 text-xs disabled:opacity-40"><ChevronLeft size={14} /> Previous</button><span className="tnum text-xs text-inkmed">{data.page} / {data.pages}</span><button disabled={page >= data.pages} onClick={() => update({ page: String(page + 1) })} className="flex h-8 items-center gap-1 rounded-md border border-line px-2.5 text-xs disabled:opacity-40">Next <ChevronRight size={14} /></button></div></div>
          </div>
        )}
      </div>
    </div>
  );
}
