import React, { useState } from "react";
import { useParams, Link } from "react-router-dom";
import useSWR from "swr";
import { api } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { PageHeader, StatusChip, SectionCard, AutomationExplain, InlineAlert, FactList } from "@/components/common";
import { useT } from "@/lib/i18n";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight } from "lucide-react";

export default function RunDetail() {
  const { t } = useT();
  const { runId } = useParams();
  const { data: r, isLoading } = useSWR(["run", runId], () => api.run(runId));
  const [rawOpen, setRawOpen] = useState(false);

  if (isLoading || !r) return <div className="p-6"><Skeleton className="h-96" /></div>;

  return (
    <div data-testid="run-detail-page">
      <PageHeader breadcrumb={<Link to="/automations?tab=runs" className="hover:text-brand">{t("Automations · Runs")}</Link>}
        title={r.automation} status={<StatusChip value={r.result} />}
        freshness={`${t("Run at")} ${fmtDateTime(r.ts)} · ${t("Retries")}: ${r.retries}`} />
      <div className="grid grid-cols-1 gap-4 p-6 lg:grid-cols-2">
        <SectionCard title={t("Explanation")} className="lg:col-span-2">
          <AutomationExplain
            trigger={r.trigger_event}
            facts={
              <ul className="list-disc space-y-0.5 pl-4 text-sm">
                {Object.entries(r.inputs).map(([k, v]) => <li key={k}><span className="text-inkmed">{k}:</span> <span className="tnum">{v}</span></li>)}
              </ul>
            }
            decision={r.decision_path}
            actions={<ul className="list-disc space-y-0.5 pl-4 text-sm">{r.actions.map((a) => <li key={a}>{a}</li>)}</ul>}
          />
        </SectionCard>
        <SectionCard title={t("Conditions evaluated")}>
          <ul className="space-y-1 text-sm">
            {r.conditions.map((c) => <li key={c} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-ok" />{c}</li>)}
          </ul>
        </SectionCard>
        <SectionCard title={t("Result")}>
          {r.errors ? (
            <InlineAlert toneName="danger" title={t("Run failed")} testId="run-error-alert">{r.errors}</InlineAlert>
          ) : (
            <InlineAlert toneName="ok" title={t("Run succeeded")} testId="run-success-alert">{t("All actions completed.")}</InlineAlert>
          )}
          <div className="mt-3">
            <FactList facts={[
              [t("External response IDs"), r.external_ids.length ? r.external_ids.join(", ") : t("None")],
              [t("Retries"), r.retries],
              [t("Resulting records"), r.records.join("; ")],
            ]} />
          </div>
        </SectionCard>
        <SectionCard title={t("Raw payload (admin only)")} className="lg:col-span-2">
          <button onClick={() => setRawOpen(!rawOpen)} className="flex items-center gap-1 text-sm font-medium text-brand hover:underline" data-testid="raw-payload-toggle">
            {rawOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {rawOpen ? t("Hide raw payload") : t("Show raw payload")}
          </button>
          {rawOpen && (
            <pre className="tnum mt-2 overflow-x-auto rounded-md bg-ink p-3 text-xs text-white" data-testid="raw-payload">{JSON.stringify(r, null, 2)}</pre>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
