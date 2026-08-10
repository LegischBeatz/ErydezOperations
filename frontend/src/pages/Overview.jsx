import React from "react";
import { useNavigate } from "react-router-dom";
import useSWR from "swr";
import { api } from "@/lib/api";
import { fmtRel, fmtTime, fmtDateTime } from "@/lib/format";
import { PageHeader, KpiCard, StatusChip, SectionCard, Severity, EmptyState, InlineAlert, SourceBadge } from "@/components/common";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Zap } from "lucide-react";

const BUCKET_FILTERS = { "0–7": "unfulfilled", "8–14": "over-8", "15–21": "over-14", "22–30": "over-14", "30+": "over-30" };

export default function Overview() {
  const navigate = useNavigate();
  const { data, isLoading } = useSWR("overview", api.overview, { revalidateOnFocus: false });

  if (isLoading || !data) {
    return (
      <div className="space-y-4 p-6" data-testid="overview-skeleton">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const anyDisconnected = data.integrations.some((i) => i.status === "Disconnected");
  const maxBucket = Math.max(...Object.values(data.backlog_by_age), 1);

  return (
    <div data-testid="overview-page">
      {anyDisconnected && (
        <div className="bg-danger px-6 py-2 text-sm font-medium text-white" role="alert" data-testid="critical-system-banner">
          A critical integration is disconnected. Affected counts may be incomplete.
        </div>
      )}
      <PageHeader title={`Good morning, ${data.greeting_name}`} freshness={`Last complete sync: ${fmtTime(data.last_sync)} · Shopify synced 2 min ago`} />
      <div className="space-y-4 p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Needs action" value={data.cards.needs_action} toneName="danger" testId="card-needs-action" sub="Open work items" onClick={() => navigate("/work?view=all-open")} />
          <KpiCard label="Overdue > 14 business days" value={data.cards.overdue_14} toneName="warn" testId="card-overdue" sub="Unfulfilled paid orders" onClick={() => navigate("/orders?filter=over-14")} />
          <KpiCard label="Awaiting reply" value={data.cards.awaiting_reply} toneName="info" testId="card-awaiting-reply" sub="Customers waiting" onClick={() => navigate("/inbox?filter=customer-waiting")} />
          <KpiCard label="Failed automations" value={data.cards.failed_automations} toneName={data.cards.failed_automations > 0 ? "danger" : "ok"} testId="card-failed-automations" sub="Require intervention" onClick={() => navigate("/work?view=failed-automation")} />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <SectionCard title="Priority work queue" className="lg:col-span-2" testId="priority-queue-section"
            action={<button onClick={() => navigate("/work")} className="flex items-center gap-1 text-xs font-medium text-brand hover:underline" data-testid="open-work-queue">Open work queue <ArrowRight size={12} /></button>}>
            {data.priority_queue.length === 0 ? (
              <EmptyState title="No open work" description="All exceptions are resolved. This is a genuine zero, not missing data." />
            ) : (
              <div className="-m-4 divide-y divide-line">
                {data.priority_queue.map((w) => (
                  <button key={w.id} data-testid="priority-queue-item"
                    onClick={() => navigate(w.order_id ? `/orders/${w.order_id}` : "/work")}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-subtle">
                    <div className="w-20 shrink-0"><Severity value={w.severity} /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{w.title}</p>
                      <p className="truncate text-xs text-inkmed">{w.reason}</p>
                    </div>
                    <span className="hidden shrink-0 rounded-md bg-subtle px-2 py-1 text-xs font-medium text-inkmed md:block">{w.recommended_action}</span>
                    <span className="tnum shrink-0 text-xs text-inkmed">{w.due ? fmtRel(w.due) : "—"}</span>
                  </button>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Today" testId="today-panel">
            {data.today.length === 0 ? (
              <EmptyState title="Nothing scheduled today" />
            ) : (
              <div className="space-y-2">
                {data.today.map((a) => (
                  <button key={a.id} onClick={() => navigate("/appointments")} data-testid="today-appointment"
                    className="flex w-full items-start gap-3 rounded-md border border-line p-2.5 text-left transition-colors hover:bg-subtle">
                    <span className="tnum mt-0.5 text-sm font-semibold text-brand">{fmtTime(a.time)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{a.type} — {a.customer}</p>
                      <p className="truncate text-xs text-inkmed">{a.product} · {a.order_id}</p>
                      {a.payment_due && <p className="text-xs font-medium text-warn">{a.payment_due}</p>}
                    </div>
                    <StatusChip value={a.readiness} />
                  </button>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Order backlog by business-day age" className="lg:col-span-2" testId="backlog-chart">
            <div className="flex items-end gap-4 px-2" style={{ height: 160 }}>
              {Object.entries(data.backlog_by_age).map(([bucket, count]) => (
                <button key={bucket} data-testid={`backlog-bucket-${bucket}`}
                  onClick={() => navigate(`/orders?filter=${BUCKET_FILTERS[bucket]}`)}
                  className="group flex flex-1 flex-col items-center justify-end gap-1 self-stretch" aria-label={`${count} orders aged ${bucket} business days`}>
                  <span className="tnum text-sm font-semibold">{count}</span>
                  <div className="w-full rounded-t-md bg-brand/80 transition-colors group-hover:bg-brand"
                    style={{ height: `${Math.max((count / maxBucket) * 100, 4)}%` }} />
                  <span className="text-xs text-inkmed">{bucket}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-inkmed">Business days since payment. Click a segment to open the filtered order list.</p>
          </SectionCard>

          <SectionCard title="Inventory risks" testId="inventory-risks">
            {data.inventory_risks.length === 0 ? (
              <EmptyState title="No shortages detected" />
            ) : (
              <div className="space-y-2">
                {data.inventory_risks.slice(0, 5).map((i) => (
                  <button key={i.sku} onClick={() => navigate(`/inventory?sku=${i.sku}`)} data-testid="inventory-risk-item"
                    className="flex w-full items-center justify-between gap-2 rounded-md border border-line p-2.5 text-left transition-colors hover:bg-subtle">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{i.product}</p>
                      <p className="tnum text-xs text-inkmed">ATP {i.atp} · Inbound {i.inbound_qty || 0}</p>
                    </div>
                    <StatusChip value={i.risk} />
                  </button>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Recent automation activity" className="lg:col-span-2" testId="automation-activity"
            action={<button onClick={() => navigate("/automations?tab=approvals")} className="text-xs font-medium text-brand hover:underline" data-testid="pending-approvals-link">{data.automation_activity.pending_approvals} pending approvals</button>}>
            <div className="-m-4 divide-y divide-line">
              {data.automation_activity.recent_runs.map((r) => (
                <button key={r.id} onClick={() => navigate(`/automations/runs/${r.id}`)} data-testid="automation-run-row"
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-subtle">
                  <Zap size={14} className="shrink-0 text-info" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.automation}</p>
                    <p className="truncate text-xs text-inkmed">{r.trigger_event}</p>
                  </div>
                  <StatusChip value={r.result} />
                  <span className="tnum shrink-0 text-xs text-inkmed">{fmtRel(r.ts)}</span>
                </button>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Integration health" testId="integration-health-section">
            <div className="space-y-2">
              {data.integrations.map((i) => (
                <div key={i.name} className="flex items-center justify-between gap-2" data-testid={`integration-${i.name.toLowerCase().replace(/\s+/g, "-")}`}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{i.name}</p>
                    <p className="truncate text-xs text-inkmed">Last event {fmtRel(i.last_event)}</p>
                  </div>
                  <StatusChip value={i.status} />
                </div>
              ))}
              {data.integrations.some((i) => i.status !== "Healthy") && (
                <InlineAlert toneName="warn" testId="integration-warning">
                  Counts on this page depending on delayed integrations may be incomplete — not a genuine zero.
                </InlineAlert>
              )}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
