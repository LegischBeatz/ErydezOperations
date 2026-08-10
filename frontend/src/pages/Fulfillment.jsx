import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import useSWR from "swr";
import { api } from "@/lib/api";
import { PageHeader, StatusChip, FactList, InlineAlert } from "@/components/common";
import { useT } from "@/lib/i18n";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ScanLine, ArrowRight, LayoutList, Columns3 } from "lucide-react";

function ScanFlow({ record, onClose, onDone }) {
  const { t } = useT();
  const [step, setStep] = useState(1);
  const [code, setCode] = useState("");
  const [scanResult, setScanResult] = useState(null);
  const [tracking, setTracking] = useState(record.tracking || "");
  const [exceptionReason, setExceptionReason] = useState("");

  const doScan = async () => {
    const res = await api.scanFulfillment(record.id, code);
    setScanResult(res);
    if (res.match) setStep(3);
  };

  const complete = async () => {
    try {
      await api.advanceFulfillment(record.id, { tracking: tracking || undefined, exception_reason: exceptionReason || undefined });
      toast.success(t("Fulfillment step completed"));
      onDone();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Action failed. Nothing was changed. You can retry.");
    }
  };

  const steps = [t("Item"), t("Scan"), t("Confirm"), t("Ship / notify") || "Ship / notify"];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg" data-testid="scan-flow-dialog">
        <DialogHeader><DialogTitle>{t("Scan flow")} — {record.order_id}</DialogTitle></DialogHeader>
        <div className="flex items-center gap-1 text-[10px] text-inkmed">
          {steps.map((s, i) => (
            <React.Fragment key={s}>
              <span className={cn("rounded-full px-2 py-0.5 font-medium", step >= i + 1 ? "bg-brand text-white" : "bg-subtle")}>{i + 1}. {s}</span>
              {i < 3 && <ArrowRight size={10} />}
            </React.Fragment>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-3">
            <FactList facts={[[t("Expected SKU"), record.sku], [t("Product"), record.product], [t("Quantity"), record.qty], [t("Serial"), record.serial || t("Not assigned")], [t("Delivery"), record.delivery_method]]} />
            <button onClick={() => setStep(2)} className="h-9 w-full rounded-md bg-brand text-sm font-medium text-white hover:bg-brand/90" data-testid="scan-step1-next">{t("Start scan")}</button>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-inkmed">Scan or enter the serial number / product code. Expected: <span className="tnum font-medium text-ink">{record.sku}</span>{record.serial && <> or <span className="tnum font-medium text-ink">{record.serial}</span></>}</p>
            <div className="flex gap-2">
              <Input autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("Scan code…")} className="tnum" data-testid="scan-code-input" onKeyDown={(e) => e.key === "Enter" && doScan()} />
              <button onClick={doScan} className="flex h-10 items-center gap-1.5 rounded-md bg-brand px-3 text-sm font-medium text-white hover:bg-brand/90" data-testid="scan-submit-btn"><ScanLine size={14} /> {t("Scan")}</button>
            </div>
            {scanResult && !scanResult.match && (
              <InlineAlert toneName="danger" title={t("Scan mismatch — flow stopped")} testId="scan-mismatch-alert">
                Scanned "{scanResult.scanned}" but expected "{scanResult.expected}". An exception work item was created. This cannot be dismissed without a reason.
              </InlineAlert>
            )}
          </div>
        )}
        {step === 3 && (
          <div className="space-y-3">
            <InlineAlert toneName="ok" title={t("Item match confirmed")} testId="scan-match-alert">{t("Scanned code matches expected item.")}</InlineAlert>
            <FactList facts={[[t("Packaging"), "Standard box, 18.4 kg"], [t("Address"), record.address_valid ? t("Validated") : t("Validation failed")], [t("Delivery"), record.delivery_method]]} />
            <button onClick={() => setStep(4)} className="h-9 w-full rounded-md bg-brand text-sm font-medium text-white hover:bg-brand/90" data-testid="scan-step3-next">{t("Confirm packaging & address")}</button>
          </div>
        )}
        {step === 4 && (
          <div className="space-y-3">
            {record.delivery_method === "Shipping" ? (
              <>
                <p className="text-sm font-medium">{t("Attach Planzer tracking number")}</p>
                <Input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="99.00.XXXXXX.XXXXXXXX" className="tnum" data-testid="tracking-input" />
                {!tracking && (
                  <>
                    <p className="text-xs text-warn">{t("No tracking: an explicit permitted exception reason is required.")}</p>
                    <Input value={exceptionReason} onChange={(e) => setExceptionReason(e.target.value)} placeholder={t("Exception reason (required without tracking)")} data-testid="exception-reason-input" />
                  </>
                )}
              </>
            ) : (
              <p className="text-sm text-inkmed">{t("Pickup order — will be marked ready for pickup.")}</p>
            )}
            <div className="rounded-md border border-line bg-subtle p-3 text-xs">
              <p className="font-semibold text-ink">{t("Review before confirming")}</p>
              <p className="mt-1 text-inkmed">Shopify change: stage → next stage{tracking ? `, tracking ${tracking} attached` : ""}.</p>
            </div>
            <DialogFooter>
              <button onClick={onClose} className="h-9 rounded-md border border-line px-3 text-sm font-medium hover:bg-subtle">{t("Cancel")}</button>
              <button onClick={complete} className="h-9 rounded-md bg-brand px-3 text-sm font-medium text-white hover:bg-brand/90" data-testid="scan-complete-btn">{t("Confirm & complete step")}</button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const COLS = ["Order", "Customer", "Product", "Age", "Delivery", "Serial", "Tracking", "Notification", "Actions"];

export default function Fulfillment() {
  const { t } = useT();
  const { data, isLoading, mutate } = useSWR("fulfillment", api.fulfillment);
  const [view, setView] = useState("list");
  const [scanRecord, setScanRecord] = useState(null);
  const navigate = useNavigate();

  const advance = async (f) => {
    try {
      await api.advanceFulfillment(f.id, {});
      mutate();
      toast.success(`${f.order_id} ${t("advanced")}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not advance. Nothing was changed.");
    }
  };

  const Row = ({ f }) => (
    <tr className="h-[52px] border-b border-line last:border-0 transition-colors hover:bg-subtle" data-testid={`fulfillment-row-${f.order_id}`}>
      <td className="px-3"><button onClick={() => navigate(`/orders/${f.order_id}`)} className="tnum font-medium text-brand hover:underline">{f.order_id}</button></td>
      <td className="px-3 text-sm">{f.customer}</td>
      <td className="px-3"><p className="text-sm">{f.product}</p><p className="tnum text-xs text-inkmed">{f.sku} · {f.qty}×</p></td>
      <td className="tnum px-3 text-sm">{f.age} bd</td>
      <td className="px-3 text-xs">{f.delivery_method}{!f.address_valid && <span className="ml-1 font-medium text-danger">· {t("address issue")}</span>}</td>
      <td className="tnum px-3 text-xs">{f.serial || "—"}</td>
      <td className="tnum px-3 text-xs">{f.tracking ? f.tracking.slice(0, 12) + "…" : "—"}</td>
      <td className="px-3"><StatusChip value={f.notification_state} /></td>
      <td className="px-3">
        <div className="flex gap-1.5">
          {["Allocated", "Picking", "Packed"].includes(f.stage) && (
            <button onClick={() => setScanRecord(f)} className="flex h-8 items-center gap-1 rounded-md border border-line bg-surface px-2 text-xs font-medium hover:bg-subtle" data-testid="open-scan-flow">
              <ScanLine size={12} /> {t("Scan flow")}
            </button>
          )}
          {f.stage !== "Fulfilled" && (
            <button onClick={() => advance(f)} className="flex h-8 items-center gap-1 rounded-md border border-line bg-surface px-2 text-xs font-medium hover:bg-subtle" data-testid="advance-stage-btn">
              {t("Advance")} <ArrowRight size={12} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );

  return (
    <div data-testid="fulfillment-page">
      <PageHeader title={t("Fulfillment")} freshness={t("No order can be marked shipped without a recorded delivery method · duplicate events are deduplicated")}
        actions={
          <div className="flex rounded-md border border-line bg-surface p-0.5">
            <button onClick={() => setView("list")} className={cn("flex h-8 items-center gap-1 rounded px-2.5 text-xs font-medium", view === "list" ? "bg-brand text-white" : "text-inkmed hover:text-ink")} data-testid="view-list-btn"><LayoutList size={13} /> {t("List")}</button>
            <button onClick={() => setView("board")} className={cn("flex h-8 items-center gap-1 rounded px-2.5 text-xs font-medium", view === "board" ? "bg-brand text-white" : "text-inkmed hover:text-ink")} data-testid="view-board-btn"><Columns3 size={13} /> {t("Board")}</button>
          </div>
        } />
      <div className="p-6">
        {isLoading || !data ? (
          <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : view === "list" ? (
          <div className="space-y-5">
            {data.stages.map((stage) => {
              const items = data.grouped[stage];
              if (!items?.length) return null;
              return (
                <div key={stage} data-testid={`stage-group-${stage.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
                  <div className="mb-2 flex items-center gap-2">
                    <h2 className="text-sm font-semibold">{t(stage)}</h2>
                    <span className="tnum rounded-full bg-subtle px-2 py-0.5 text-xs font-medium text-inkmed">{items.length}</span>
                    {stage === "Delivery exception" && <StatusChip value="Exception" />}
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-line bg-surface">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-line text-left text-xs font-semibold text-inkmed">
                          {COLS.map((h) => <th key={h} className="whitespace-nowrap px-3 py-2">{t(h)}</th>)}
                        </tr>
                      </thead>
                      <tbody>{items.map((f) => <Row key={f.id} f={f} />)}</tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2" data-testid="fulfillment-board">
            {data.stages.map((stage) => (
              <div key={stage} className="w-64 shrink-0 rounded-lg border border-line bg-surface">
                <p className="border-b border-line px-3 py-2 text-xs font-semibold">{t(stage)} <span className="tnum text-inkmed">({data.grouped[stage].length})</span></p>
                <div className="space-y-2 p-2">
                  {data.grouped[stage].map((f) => (
                    <button key={f.id} onClick={() => navigate(`/orders/${f.order_id}`)} className="w-full rounded-md border border-line p-2 text-left text-xs transition-colors hover:bg-subtle" data-testid="board-card">
                      <p className="tnum font-semibold text-brand">{f.order_id}</p>
                      <p className="truncate">{f.product}</p>
                      <p className="tnum text-inkmed">{f.age} bd · {f.delivery_method}</p>
                    </button>
                  ))}
                  {!data.grouped[stage].length && <p className="p-2 text-[10px] text-inkmed">Empty</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {scanRecord && <ScanFlow record={scanRecord} onClose={() => setScanRecord(null)} onDone={mutate} />}
    </div>
  );
}
