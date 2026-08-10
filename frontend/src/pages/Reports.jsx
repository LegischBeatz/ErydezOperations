import React from "react";
import { useNavigate } from "react-router-dom";
import useSWR from "swr";
import { api } from "@/lib/api";
import { fmtDate, fmtTime } from "@/lib/format";
import { PageHeader, SectionCard } from "@/components/common";
import { useT } from "@/lib/i18n";
import { Skeleton } from "@/components/ui/skeleton";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Info } from "lucide-react";

const Metric = ({ label, value, sub, definition, onClick, testId }) => (
  <button onClick={onClick} data-testid={testId} className="flex w-full flex-col items-start gap-1 rounded-lg border border-line bg-surface p-4 text-left transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-sm">
    <span className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-inkmed">
      {label}
      <HoverCard openDelay={150}>
        <HoverCardTrigger asChild><Info size={11} className="cursor-help" /></HoverCardTrigger>
        <HoverCardContent className="w-64 p-3 text-xs">{definition}</HoverCardContent>
      </HoverCard>
    </span>
    <span className="tnum text-2xl font-semibold text-ink">{value}</span>
    {sub && <span className="text-xs text-inkmed">{sub}</span>}
  </button>
);

export default function Reports() {
  const { t } = useT();
  const { data: r, isLoading } = useSWR("reports", api.reports);
  const navigate = useNavigate();

  if (isLoading || !r) return <div className="p-6"><Skeleton className="h-96" /></div>;

  const maxBucket = Math.max(...Object.values(r.backlog_by_age), 1);
  const maxCat = Math.max(...Object.values(r.inquiries_by_category), 1);
  const trackPct = Math.round((r.tracking_coverage.tracked / r.tracking_coverage.total) * 100);
  const autoTotal = r.automation.success + r.automation.failed + r.automation.manual_intervention;

  return (
    <div data-testid="reports-page">
      <PageHeader title={t("Reports")} freshness={`${t("Period")}: ${r.period} · ${t("Timezone")} ${r.timezone} · ${t("Last refresh")} ${fmtDate(r.refreshed_at)} ${fmtTime(r.refreshed_at)} · ${t("Comparison: exact prior 30 days")}`} />
      <div className="space-y-4 p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Metric label={t("Critical orders")} value={r.critical_orders} sub={t("Unfulfilled > 14 business days")} definition={t("Paid orders not fulfilled or cancelled with business-day age over 14. Click to view underlying records.")} onClick={() => navigate("/orders?filter=over-14")} testId="report-critical-orders" />
          <Metric label={t("First response time")} value={`${r.first_response_hours} h`} sub={`${t("Customer waiting avg")} ${r.customer_waiting_hours_avg} h`} definition={t("Median time from inbound customer message to first operator or approved automated reply.")} testId="report-first-response" />
          <Metric label={t("Paid → fulfilled")} value={`${r.paid_to_fulfilled_days_avg} d`} sub={`${t("Prior 30 days")}: ${r.paid_to_fulfilled_days_prev} d`} definition={t("Average calendar days between payment capture and fulfillment completion.")} testId="report-paid-to-fulfilled" />
          <Metric label={t("Tracking coverage")} value={`${trackPct}%`} sub={`${r.tracking_coverage.tracked} ${t("of")} ${r.tracking_coverage.total} ${t("fulfilled orders")}`} definition={t("Share of fulfilled shipping orders with a recorded tracking number.")} onClick={() => navigate("/orders?filter=missing-tracking")} testId="report-tracking-coverage" />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SectionCard title={t("Backlog age (business days)")} testId="report-backlog-chart">
            <div className="flex items-end gap-4 px-2" style={{ height: 150 }}>
              {Object.entries(r.backlog_by_age).map(([bucket, count]) => (
                <button key={bucket} onClick={() => navigate("/orders?filter=unfulfilled")} className="group flex flex-1 flex-col items-center justify-end gap-1 self-stretch" data-testid={`report-bucket-${bucket}`}>
                  <span className="tnum text-sm font-semibold">{count}</span>
                  <div className="w-full rounded-t-md bg-brand/80 transition-colors group-hover:bg-brand" style={{ height: `${Math.max((count / maxBucket) * 100, 4)}%` }} />
                  <span className="text-xs text-inkmed">{bucket}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-inkmed">{t("Text summary")}: {Object.entries(r.backlog_by_age).map(([b, c]) => `${c} ${t("orders at")} ${b} ${t("days")}`).join(", ")}.</p>
          </SectionCard>

          <SectionCard title={t("Status inquiries by category")} testId="report-inquiries">
            <div className="space-y-2">
              {Object.entries(r.inquiries_by_category).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
                <div key={cat} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 text-xs text-inkmed">{cat}</span>
                  <div className="h-5 flex-1 rounded bg-subtle">
                    <div className="h-full rounded bg-info/70" style={{ width: `${(count / maxCat) * 100}%` }} />
                  </div>
                  <span className="tnum w-6 text-right text-sm font-medium">{count}</span>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title={t("Proactive communication")} testId="report-proactive">
            <div className="grid grid-cols-2 gap-4">
              <div><p className="tnum text-2xl font-semibold">{r.proactive_messages_sent}</p><p className="text-xs text-inkmed">{t("Proactive messages sent")}</p></div>
              <div><p className="tnum text-2xl font-semibold text-ok">~{r.contact_avoided_estimate}</p><p className="text-xs text-inkmed">{t("Estimated inbound contacts avoided (proxy)")}</p></div>
            </div>
          </SectionCard>

          <SectionCard title={t("Automation outcomes")} testId="report-automation">
            <div className="flex h-5 w-full overflow-hidden rounded" role="img" aria-label={`${r.automation.success} success, ${r.automation.failed} failed, ${r.automation.manual_intervention} manual`}>
              <div className="bg-ok" style={{ width: `${(r.automation.success / autoTotal) * 100}%` }} />
              <div className="bg-danger" style={{ width: `${(r.automation.failed / autoTotal) * 100}%` }} />
              <div className="bg-warn" style={{ width: `${(r.automation.manual_intervention / autoTotal) * 100}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap gap-4 text-xs">
              <span className="tnum"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-ok" />{t("Success")} {r.automation.success}</span>
              <span className="tnum"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-danger" />{t("Failed")} {r.automation.failed}</span>
              <span className="tnum"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-warn" />{t("Manual intervention")} {r.automation.manual_intervention}</span>
            </div>
            <p className="mt-2 text-xs text-inkmed">{t("Zero and unavailable are different: failed integrations show \"Data unavailable\", never 0.")}</p>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
