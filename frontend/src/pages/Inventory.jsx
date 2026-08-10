import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import useSWR from "swr";
import { api } from "@/lib/api";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { PageHeader, StatusChip, EmptyState, FactList, InlineAlert } from "@/components/common";
import { useT } from "@/lib/i18n";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const COLS = ["Product", "SKU", "On hand", "Committed", "ATP", "Awaiting allocation", "Inbound (ETA)", "Oldest waiting order", "Reorder point", "Risk", "Recommendation"];

export default function Inventory() {
  const { t } = useT();
  const [params, setParams] = useSearchParams();
  const sku = params.get("sku");
  const navigate = useNavigate();
  const { data: items, isLoading } = useSWR("inventory", api.inventory);
  const { data: detail } = useSWR(sku ? ["inventory", sku] : null, () => api.inventoryItem(sku));

  return (
    <div data-testid="inventory-page">
      <PageHeader title={t("Inventory")} freshness={t("Available to promise = On hand − Committed − Quality hold · Projected = ATP + Confirmed inbound")} />
      <div className="p-6">
        {isLoading ? (
          <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
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
                {items?.map((i) => (
                  <tr key={i.sku} onClick={() => setParams({ sku: i.sku })} data-testid={`inventory-row-${i.sku}`}
                    className="h-[52px] cursor-pointer border-b border-line last:border-0 transition-colors hover:bg-subtle">
                    <td className="px-3"><p className="font-medium">{i.product}</p><p className="text-xs text-inkmed">{i.variant}</p></td>
                    <td className="tnum px-3 text-xs">{i.sku}</td>
                    <td className="tnum px-3">{i.on_hand}</td>
                    <td className="tnum px-3">{i.committed}</td>
                    <td className={cn("tnum px-3 font-semibold", i.atp < 0 ? "text-danger" : i.atp === 0 ? "text-warn" : "text-ok")}>{i.atp}</td>
                    <td className="tnum px-3">{i.awaiting_allocation}</td>
                    <td className="tnum px-3 text-xs">
                      {i.inbound_qty ? <>{i.inbound_qty} · {fmtDate(i.inbound_eta)} <span className={i.inbound_confidence === "Confirmed" ? "text-ok" : "text-warn"}>({t(i.inbound_confidence)})</span></> : "—"}
                    </td>
                    <td className="tnum px-3 text-xs">{i.oldest_waiting_order || "—"}</td>
                    <td className="tnum px-3">{i.reorder_point}</td>
                    <td className="px-3"><StatusChip value={i.risk} /></td>
                    <td className="max-w-56 truncate px-3 text-xs text-inkmed">{i.recommendation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Sheet open={!!sku} onOpenChange={(o) => !o && setParams({})}>
        <SheetContent className="w-[480px] overflow-y-auto sm:max-w-[480px]" data-testid="inventory-detail-drawer">
          {detail && (
            <>
              <SheetHeader>
                <SheetTitle className="text-left">{detail.product} <span className="tnum text-sm font-normal text-inkmed">{detail.sku}</span></SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <div className="rounded-md border border-line bg-subtle p-3">
                  <FactList facts={[
                    [t("On hand"), detail.on_hand], [t("Committed to paid orders"), detail.committed],
                    [t("Quality hold"), detail.quality_hold], [t("Available to promise"), detail.atp],
                    [t("Confirmed inbound"), detail.inbound_qty || 0], [t("Projected available"), detail.projected_available],
                    [t("Sales velocity"), `${detail.velocity_per_week} ${t("/ week")}`],
                  ]} />
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-inkmed">{t("Waiting-order queue (allocation rule: oldest paid first)")}</p>
                  {detail.waiting_orders?.length ? detail.waiting_orders.map((o) => (
                    <button key={o.id} onClick={() => navigate(`/orders/${o.id}`)} data-testid="waiting-order-row"
                      className="flex w-full items-center justify-between border-b border-line py-2 text-left text-sm last:border-0 hover:text-brand">
                      <span className="tnum font-medium">{o.id} · {o.customer.name}</span>
                      <span className="tnum text-xs text-inkmed">{o.business_day_age} {t("business days")}</span>
                    </button>
                  )) : <EmptyState title={t("No waiting orders")} />}
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-inkmed">{t("Inbound purchase orders")}</p>
                  {detail.inbound_pos?.length ? detail.inbound_pos.map((po) => (
                    <div key={po.id} className="rounded-md border border-line p-2.5 text-sm" data-testid="inbound-po">
                      <p className="tnum font-medium">{po.id} · {po.supplier}</p>
                      <p className="text-xs text-inkmed">{po.items} · {po.state}{po.eta ? ` · ${t("ETA")} ${fmtDate(po.eta)} (${t(po.eta_confidence)})` : ""}</p>
                    </div>
                  )) : <p className="text-xs text-inkmed">{t("No inbound purchase orders.")}</p>}
                </div>
                <InlineAlert toneName="info" testId="reorder-recommendation">
                  <span className="font-semibold">{t("Reorder recommendation:")}</span> {detail.recommendation}.
                </InlineAlert>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-inkmed">{t("Inventory events")}</p>
                  {detail.events.map((e) => (
                    <p key={e.id} className="border-b border-line py-1.5 text-xs last:border-0"><span className="tnum text-inkmed">{fmtDateTime(e.ts)}</span> · {e.summary} · {e.actor}</p>
                  ))}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
