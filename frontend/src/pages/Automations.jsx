import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import useSWR from "swr";
import { api } from "@/lib/api";
import { fmtRel, fmtDateTime } from "@/lib/format";
import { PageHeader, StatusChip, EmptyState } from "@/components/common";
import { useT } from "@/lib/i18n";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Pause, Play, Check, X, Pencil, MessageCircleQuestion, Zap } from "lucide-react";

const RISK_TONE = { Low: "ok", Medium: "info", High: "warn", Critical: "danger" };

function ApprovalCard({ a, onDecided }) {
  const { t } = useT();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [draft, setDraft] = useState(a.draft || "");
  const navigate = useNavigate();
  const pending = a.state === "Pending";

  const decide = async (decision, extra = {}) => {
    try {
      await api.decideApproval(a.id, { decision, ...extra });
      onDecided();
      toast.success(decision === "approve" ? t("Approved") : decision === "reject" ? t("Rejected") : t("More information requested"));
    } catch (e) {
      toast.error(e.response?.data?.detail || "Decision failed");
    }
  };

  return (
    <div className={cn("rounded-lg border bg-surface p-4", pending ? "border-line" : "border-line opacity-70")} data-testid={`approval-card-${a.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="tnum text-xs font-semibold text-inkmed">{a.id}</span>
          <StatusChip value={`${t(a.risk)} ${t("risk")}`} toneOverride={RISK_TONE[a.risk]} />
          <StatusChip value={a.state} />
        </div>
        <span className="tnum text-xs text-inkmed">{t("Requested")} {fmtRel(a.requested_at)} {t("by")} {a.requested_by}</span>
      </div>
      <p className="mt-2 text-sm font-semibold text-ink" data-testid="approval-proposed-action">{a.proposed_action}</p>
      <p className="text-xs text-inkmed">{a.affected}</p>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-md border border-line bg-subtle p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-inkmed">{t("Reason & supporting facts")}</p>
          <p className="mt-1 text-sm">{a.reason}</p>
          <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-inkmed">
            {a.facts.map((f) => <li key={f}>{f}</li>)}
          </ul>
        </div>
        <div className="space-y-2">
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-warn">{t("Financial / customer impact")}</p>
            <p className="mt-1 text-sm">{a.impact}</p>
          </div>
          {a.draft && (
            <div className="rounded-md border border-line p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-inkmed">{t("Draft message")}</p>
              <p className="mt-1 text-sm italic text-ink">"{a.draft}"</p>
            </div>
          )}
        </div>
      </div>
      {a.decision && <p className="mt-2 text-xs font-medium text-inkmed" data-testid="approval-decision">{a.decision}{a.decision_reason ? ` — ${a.decision_reason}` : ""}</p>}
      {pending && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => decide("approve")} className="flex h-9 items-center gap-1.5 rounded-md bg-ok px-3 text-sm font-medium text-white transition-colors hover:opacity-90" data-testid="approval-approve-btn"><Check size={14} /> {t("Approve")}</button>
          {a.draft && <button onClick={() => setEditOpen(true)} className="flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm font-medium hover:bg-subtle" data-testid="approval-edit-approve-btn"><Pencil size={14} /> {t("Edit & approve")}</button>}
          <button onClick={() => setRejectOpen(true)} className="flex h-9 items-center gap-1.5 rounded-md border border-red-200 px-3 text-sm font-medium text-danger hover:bg-red-50" data-testid="approval-reject-btn"><X size={14} /> {t("Reject")}</button>
          <button onClick={() => decide("more-info")} className="flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm font-medium hover:bg-subtle" data-testid="approval-more-info-btn"><MessageCircleQuestion size={14} /> {t("Request more information")}</button>
          {a.order_id && <button onClick={() => navigate(`/orders/${a.order_id}`)} className="ml-auto h-9 rounded-md px-3 text-sm font-medium text-brand hover:underline" data-testid="approval-open-order">{t("Open")} {a.order_id}</button>}
        </div>
      )}

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent data-testid="reject-dialog">
          <DialogHeader><DialogTitle>{t("Reject")} {a.id}</DialogTitle></DialogHeader>
          <p className="text-sm text-inkmed">{t("A rejection reason is required and will be recorded in the audit log.")}</p>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("Rejection reason (required)")} data-testid="reject-reason-input" />
          <DialogFooter>
            <button onClick={() => setRejectOpen(false)} className="h-9 rounded-md border border-line px-3 text-sm font-medium hover:bg-subtle">{t("Cancel")}</button>
            <button onClick={() => { decide("reject", { reason }); setRejectOpen(false); }} disabled={!reason.trim()} className="h-9 rounded-md bg-danger px-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50" data-testid="confirm-reject-btn">{t("Reject")}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent data-testid="edit-approve-dialog">
          <DialogHeader><DialogTitle>{t("Edit draft & approve")} {a.id}</DialogTitle></DialogHeader>
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-28" data-testid="edit-draft-input" />
          <DialogFooter>
            <button onClick={() => setEditOpen(false)} className="h-9 rounded-md border border-line px-3 text-sm font-medium hover:bg-subtle">{t("Cancel")}</button>
            <button onClick={() => { decide("approve", { draft }); setEditOpen(false); }} className="h-9 rounded-md bg-ok px-3 text-sm font-medium text-white hover:opacity-90" data-testid="confirm-edit-approve-btn">{t("Approve with edits")}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const RULE_COLS = ["Rule", "Status", "Trigger", "Next run", "Last result", "Success / failure", "Approval policy", "Owner"];

export default function Automations() {
  const { t } = useT();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "rules";
  const navigate = useNavigate();
  const { data: autos, mutate: mutAutos } = useSWR("automations", api.automations);
  const { data: runs } = useSWR("runs", api.runs);
  const { data: approvals, mutate: mutApprovals } = useSWR("approvals", api.approvals);

  const toggle = async (a) => {
    const next = a.status === "Paused" ? "Active" : "Paused";
    await api.updateAutomation(a.id, { status: next });
    mutAutos();
    toast.success(`${a.name}: ${t(next)}`);
  };

  const pendingCount = approvals?.filter((a) => a.state === "Pending").length || 0;

  return (
    <div data-testid="automations-page">
      <PageHeader title={t("Automations & approvals")} freshness={t("Every automated decision is explainable from stored inputs, rule version and result")}>
        <div className="mt-3 flex gap-1.5">
          {[["rules", t("Rules")], ["runs", t("Run history")], ["approvals", `${t("Approval center")}${pendingCount ? ` (${pendingCount})` : ""}`]].map(([key, label]) => (
            <button key={key} onClick={() => setParams({ tab: key })} data-testid={`automations-tab-${key}`}
              className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", tab === key ? "border-brand bg-brand text-white" : "border-line bg-surface text-inkmed hover:text-ink")}>
              {label}
            </button>
          ))}
        </div>
      </PageHeader>
      <div className="p-6">
        {tab === "rules" && (
          !autos ? <Skeleton className="h-64" /> : (
            <div className="overflow-x-auto rounded-lg border border-line bg-surface">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-line text-left text-xs font-semibold text-inkmed">
                  {RULE_COLS.map((h) => <th key={h} className="whitespace-nowrap px-3 py-2.5">{t(h)}</th>)}
                  <th></th>
                </tr></thead>
                <tbody>
                  {autos.map((a) => (
                    <tr key={a.id} className="h-[52px] border-b border-line last:border-0 hover:bg-subtle" data-testid={`automation-row-${a.name.toLowerCase().replace(/\s+/g, "-")}`}>
                      <td className="max-w-64 px-3"><p className="font-medium">{a.name}</p><p className="truncate text-xs text-inkmed">{a.purpose}</p></td>
                      <td className="px-3"><StatusChip value={a.status} /></td>
                      <td className="px-3 text-xs">{a.trigger}</td>
                      <td className="tnum px-3 text-xs">{a.next_run ? fmtDateTime(a.next_run) : "—"}</td>
                      <td className="max-w-48 truncate px-3 text-xs text-inkmed">{a.last_result}</td>
                      <td className="tnum px-3 text-xs"><span className="text-ok">{a.success_count}</span> / <span className="text-danger">{a.failure_count}</span></td>
                      <td className="max-w-48 truncate px-3 text-xs">{a.approval_policy}</td>
                      <td className="px-3 text-xs">{a.owner}</td>
                      <td className="px-3">
                        <button onClick={() => toggle(a)} className="flex h-8 items-center gap-1 rounded-md border border-line px-2 text-xs font-medium hover:bg-subtle" data-testid="automation-toggle-btn">
                          {a.status === "Paused" ? <><Play size={12} /> {t("Resume")}</> : <><Pause size={12} /> {t("Pause")}</>}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {tab === "runs" && (
          !runs ? <Skeleton className="h-64" /> : (
            <div className="space-y-2">
              {runs.map((r) => (
                <button key={r.id} onClick={() => navigate(`/automations/runs/${r.id}`)} data-testid={`run-row-${r.id}`}
                  className="flex w-full items-center gap-3 rounded-lg border border-line bg-surface p-3 text-left transition-colors hover:bg-subtle">
                  <Zap size={15} className={r.result === "Failed" ? "text-danger" : "text-info"} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{r.automation}</p>
                    <p className="truncate text-xs text-inkmed">{r.trigger_event}</p>
                  </div>
                  <StatusChip value={r.result} />
                  <span className="tnum text-xs text-inkmed">{fmtRel(r.ts)}</span>
                </button>
              ))}
            </div>
          )
        )}

        {tab === "approvals" && (
          !approvals ? <Skeleton className="h-64" /> : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-2 rounded-lg border border-line bg-surface p-4 text-xs text-inkmed md:grid-cols-4" data-testid="risk-level-legend">
                <div><StatusChip value={t("Low risk")} toneOverride="ok" /><p className="mt-1">{t("Routine status update with verified facts — automatic after policy enabled")}</p></div>
                <div><StatusChip value={t("Medium risk")} toneOverride="info" /><p className="mt-1">{t("Non-standard message, inventory override — single approval")}</p></div>
                <div><StatusChip value={t("High risk")} toneOverride="warn" /><p className="mt-1">{t("Refund, cancellation fee, warranty decision — owner approval")}</p></div>
                <div><StatusChip value={t("Critical risk")} toneOverride="danger" /><p className="mt-1">{t("Supplier deposit, destructive bulk correction — explicit confirmation + second approval")}</p></div>
              </div>
              {approvals.length === 0 ? <EmptyState title={t("No approvals")} /> : approvals.map((a) => (
                <ApprovalCard key={a.id} a={a} onDecided={mutApprovals} />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
