import React from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { PageHeader, StatusChip, SectionCard } from "@/components/common";
import { useT } from "@/lib/i18n";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export default function Purchasing() {
  const { t } = useT();
  const { data, isLoading } = useSWR("purchasing", api.purchasing);

  return (
    <div data-testid="purchasing-page">
      <PageHeader title={t("Purchasing")} freshness={t("Suppliers, quotes, purchase orders and inbound milestones")}
        actions={<button onClick={() => toast(t("New purchase orders require configured supplier terms — critical-risk approval applies to deposits"))} className="flex h-9 items-center gap-1.5 rounded-md bg-brand px-3 text-sm font-medium text-white hover:bg-brand/90" data-testid="new-po-btn"><Plus size={14} /> {t("New purchase order")}</button>} />
      <div className="grid grid-cols-1 gap-4 p-6 lg:grid-cols-3">
        {isLoading || !data ? <Skeleton className="h-96 lg:col-span-3" /> : (
          <>
            <SectionCard title={t("Suppliers")} testId="suppliers-section">
              <div className="space-y-3">
                {data.suppliers.map((s) => (
                  <div key={s.id} className="rounded-md border border-line p-3" data-testid={`supplier-${s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
                    <p className="text-sm font-semibold">{s.name}</p>
                    <p className="text-xs text-inkmed">{s.location} · {t("Lead time")} {s.lead_time}</p>
                    <p className="tnum mt-1 text-xs">{t("Open POs")}: {s.open_pos} · {t("Reliability")}: {s.reliability}</p>
                  </div>
                ))}
              </div>
            </SectionCard>
            <SectionCard title={t("Purchase orders")} className="lg:col-span-2" testId="purchase-orders-section">
              <div className="space-y-3">
                {data.purchase_orders.map((po) => (
                  <div key={po.id} className="rounded-md border border-line p-3" data-testid={`po-${po.id}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="tnum text-sm font-semibold">{po.id} · {po.supplier}</p>
                      <div className="flex items-center gap-2">
                        <StatusChip value={po.state} />
                        {po.eta && <span className="tnum text-xs text-inkmed">{t("ETA")} {fmtDate(po.eta)} <span className={po.eta_confidence === "Confirmed" ? "text-ok" : "text-warn"}>({t(po.eta_confidence)})</span></span>}
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-inkmed">{po.items} · {po.value} · {t("Deposit")}: {po.deposit}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {po.milestones.map((m) => (
                        <span key={m} className="rounded-full bg-subtle px-2 py-0.5 text-[10px] font-medium text-inkmed">{m}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </>
        )}
      </div>
    </div>
  );
}
