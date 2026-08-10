import React from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import useSWR from "swr";
import { api } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { PageHeader, StatusChip, SectionCard, FactList, InlineAlert } from "@/components/common";
import { useT } from "@/lib/i18n";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { ChevronDown, Paperclip } from "lucide-react";

const STATES = ["New", "Awaiting customer evidence", "Under review", "Awaiting physical item", "Inspection scheduled", "Supplier claim open", "Repair in progress", "Replacement approved", "Refund approval", "Resolved", "Rejected with reason"];

export default function ReturnDetail() {
  const { t } = useT();
  const { rmaId } = useParams();
  const navigate = useNavigate();
  const { data: r, isLoading, mutate } = useSWR(["rma", rmaId], () => api.rma(rmaId));

  if (isLoading || !r) return <div className="p-6"><Skeleton className="h-96" /></div>;

  const setState = async (state) => {
    await api.updateReturn(r.id, { state });
    mutate();
    toast.success(`RMA → ${t(state)}`);
  };

  return (
    <div data-testid="rma-detail-page">
      <PageHeader breadcrumb={<Link to="/returns" className="hover:text-brand">{t("Returns")}</Link>}
        title={r.id} status={<StatusChip value={r.state} />}
        freshness={`${r.type} ${t("case")} · ${r.age_days} ${t("days old")} · ${t("Policy")} ${r.policy_version}`}
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex h-9 items-center gap-1.5 rounded-md bg-brand px-3 text-sm font-medium text-white hover:bg-brand/90" data-testid="rma-state-select">
                {t("Change state")} <ChevronDown size={13} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {STATES.map((s) => <DropdownMenuItem key={s} onClick={() => setState(s)}>{t(s)}</DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
        } />
      <div className="grid grid-cols-1 gap-4 p-6 lg:grid-cols-2">
        <SectionCard title={t("Case")}>
          <FactList facts={[
            [t("Related order"), <Link key="o" to={`/orders/${r.order_id}`} className="text-brand hover:underline" data-testid="rma-order-link">{r.order_id}</Link>],
            [t("Customer"), r.customer.name], [t("Product"), r.product], [t("Serial number"), r.serial || t("Missing — requested from customer")],
            [t("Case type"), r.type], [t("Reported problem"), r.problem],
          ]} />
        </SectionCard>
        <SectionCard title={t("Evidence")}>
          {r.evidence.map((e) => (
            <div key={e} className="flex items-center gap-2 border-b border-line py-2 text-sm last:border-0" data-testid="evidence-item">
              <Paperclip size={13} className="text-inkmed" /> {e}
            </div>
          ))}
          {!r.serial && <InlineAlert toneName="warn" testId="missing-serial-alert">{t("Serial number missing — evidence request sent in customer language.")}</InlineAlert>}
        </SectionCard>
        <SectionCard title={t("Eligibility & decision")}>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-inkmed">{t("Warranty eligibility facts")}</p>
              <p className="mt-1 text-sm">{r.warranty_eligible_facts}</p>
              <p className="tnum text-xs text-inkmed">{t("Policy version")} {r.policy_version}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-inkmed">{t("Final liability decision (human)")}</p>
              <p className="mt-1 text-sm" data-testid="liability-decision">{r.liability_decision || t("Not yet decided — requires human decision")}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-inkmed">{t("Inspection findings")}</p>
              <p className="mt-1 text-sm">{r.inspection || t("Pending")}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-inkmed">{t("Supplier / manufacturer claim")}</p>
              <p className="mt-1 text-sm">{r.supplier_claim || t("None")}</p>
            </div>
          </div>
        </SectionCard>
        <SectionCard title={t("Resolution & financials")}>
          <FactList facts={[
            [t("Proposed resolution"), r.proposed_resolution],
            [t("Approved resolution"), r.approved_resolution || t("Awaiting approval")],
            [t("Financial impact"), r.financial_impact],
          ]} />
          {r.state === "Refund approval" && (
            <div className="mt-3">
              <InlineAlert toneName="warn" testId="rma-approval-alert">{t("Refund pending owner approval — see the")} <button className="font-semibold underline" onClick={() => navigate("/automations?tab=approvals")}>{t("Approval center")}</button>.</InlineAlert>
            </div>
          )}
        </SectionCard>
        <SectionCard title={t("Timeline")} className="lg:col-span-2">
          {r.timeline.map((e) => (
            <div key={e.id} className="border-b border-line py-2 text-sm last:border-0" data-testid="rma-timeline-event">
              <p className="font-medium">{e.summary}</p>
              <p className="tnum text-xs text-inkmed">{fmtDateTime(e.ts)} · {e.actor}</p>
            </div>
          ))}
        </SectionCard>
      </div>
    </div>
  );
}
