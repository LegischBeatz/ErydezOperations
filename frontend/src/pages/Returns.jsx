import React from "react";
import { useNavigate } from "react-router-dom";
import useSWR from "swr";
import { api } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { money, statusLabel } from "@/lib/shopify";
import { EmptyState, PageHeader, SectionCard, StatusChip } from "@/components/common";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

export default function Returns() {
  const navigate = useNavigate();
  const { data: returns, isLoading: loadingReturns, error: returnsError } = useSWR("returns", api.returns);
  const { data: refunds, isLoading: loadingRefunds, error: refundsError } = useSWR("refunds", api.refunds);
  const loading = loadingReturns || loadingRefunds;
  const error = returnsError || refundsError;

  return (
    <div data-testid="returns-page">
      <PageHeader title="Returns & refunds" freshness={`${returns?.length ?? "—"} Shopify Return objects · ${refunds?.length ?? "—"} Shopify refunds`} />
      <div className="p-6">
        {loading ? <Skeleton className="h-[480px] w-full" /> : error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-danger">Unable to load Shopify returns and refunds.</div> : (
          <Tabs defaultValue="refunds">
            <TabsList className="mb-4 h-10 bg-subtle"><TabsTrigger value="refunds">Refunds ({refunds?.length || 0})</TabsTrigger><TabsTrigger value="returns">Returns ({returns?.length || 0})</TabsTrigger></TabsList>
            <TabsContent value="refunds">
              <SectionCard title="Shopify refunds">
                {!refunds?.length ? <EmptyState title="No Shopify refunds" /> : <div className="-m-4 overflow-x-auto"><table className="w-full min-w-[920px] text-left"><thead className="border-b border-line bg-subtle/60 text-[11px] uppercase tracking-wide text-inkmed"><tr><th className="px-4 py-2.5">Refund</th><th className="px-3 py-2.5">Order</th><th className="px-3 py-2.5">Created</th><th className="px-3 py-2.5 text-right">Refunded</th><th className="px-3 py-2.5 text-right">Line adjustments</th><th className="px-3 py-2.5">Restock behavior</th><th className="px-3 py-2.5">Note</th></tr></thead><tbody className="divide-y divide-line">{refunds.map((refund) => {
                  const restocks = [...new Set((refund.line_items || []).map((item) => statusLabel(item.restock_type)).filter(Boolean))];
                  return <tr key={refund.shopify_id} className="align-top hover:bg-subtle/60" data-testid={`refund-row-${refund.id}`}><td className="tnum px-4 py-3 text-sm font-medium">{refund.id}</td><td className="px-3 py-3"><button onClick={() => navigate(`/orders/${refund.order_id}`)} className="tnum text-sm font-semibold text-brand hover:underline">{refund.order_number}</button></td><td className="tnum whitespace-nowrap px-3 py-3 text-sm">{fmtDateTime(refund.created_at)}</td><td className="tnum px-3 py-3 text-right text-sm font-semibold text-danger">{money(refund.total_refunded)}</td><td className="tnum px-3 py-3 text-right text-sm">{refund.line_items?.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || 0}</td><td className="px-3 py-3 text-sm">{restocks.join(", ") || "—"}</td><td className="max-w-xs px-3 py-3 text-sm text-inkmed">{refund.note || "—"}</td></tr>;
                })}</tbody></table></div>}
              </SectionCard>
            </TabsContent>
            <TabsContent value="returns">
              <SectionCard title="Shopify Return objects">
                {!returns?.length ? <EmptyState title="No Shopify Return objects" description="Refunds can exist without a Shopify Return object; those remain visible in the Refunds tab." /> : <div className="-m-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead className="border-b border-line bg-subtle/60 text-[11px] uppercase tracking-wide text-inkmed"><tr><th className="px-4 py-2.5">Return</th><th className="px-3 py-2.5">Order</th><th className="px-3 py-2.5">Created</th><th className="px-3 py-2.5 text-right">Quantity</th><th className="px-3 py-2.5">Status</th></tr></thead><tbody className="divide-y divide-line">{returns.map((record) => <tr key={record.shopify_id} className="hover:bg-subtle/60"><td className="px-4 py-3"><p className="text-sm font-semibold">{record.name}</p><p className="tnum text-xs text-inkmed">{record.id}</p></td><td className="px-3 py-3"><button onClick={() => navigate(`/orders/${record.order_id}`)} className="tnum text-sm font-semibold text-brand hover:underline">{record.order_number}</button></td><td className="tnum px-3 py-3 text-sm">{fmtDateTime(record.created_at)}</td><td className="tnum px-3 py-3 text-right text-sm font-semibold">{record.total_quantity}</td><td className="px-3 py-3"><StatusChip value={statusLabel(record.status)} /></td></tr>)}</tbody></table></div>}
              </SectionCard>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
