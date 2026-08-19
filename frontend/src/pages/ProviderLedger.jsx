import React, { useMemo, useState } from "react";
import useSWR from "swr";
import { Activity, AlertTriangle, ArrowRight, Database, Search, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { EmptyState, InlineAlert, PageHeader, SectionCard, StatusChip } from "@/components/common";
import { Input } from "@/components/ui/input";

const EMPTY_ITEMS = [];
const labelize = (value) => String(value || "—").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const searchText = (item) => [item.provider, item.kind, item.operation, item.status, item.actor, item.reason, item.error_summary, item.correlation_id, item.prior_state, item.next_state].join(" ").toLocaleLowerCase();
const durationLabel = (seconds) => seconds === null || seconds === undefined ? "—" : seconds < 1 ? "< 1 s" : `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;
const countSummary = (counts) => Object.entries(counts || {}).filter(([, value]) => Number.isFinite(Number(value))).slice(0, 4).map(([name, value]) => `${labelize(name)} ${value}`).join(" · ");

export default function ProviderLedger() {
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("all");
  const [kind, setKind] = useState("all");
  const { data, error, isLoading } = useSWR("provider-ledger", api.providerLedger, { refreshInterval: 15000 });
  const items = data?.items ?? EMPTY_ITEMS;
  const providers = useMemo(() => [...new Set(items.map((item) => item.provider).filter(Boolean))].sort(), [items]);
  const kinds = useMemo(() => [...new Set(items.map((item) => item.kind).filter(Boolean))].sort(), [items]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleItems = useMemo(() => items.filter((item) => (
    (provider === "all" || item.provider === provider)
    && (kind === "all" || item.kind === kind)
    && (!normalizedQuery || searchText(item).includes(normalizedQuery))
  )), [items, kind, normalizedQuery, provider]);

  return (
    <div data-testid="provider-ledger-page">
      <PageHeader title="Provider Ledger" freshness="Local run and control history only. This page does not receive provider events or store provider payloads." />
      <div className="space-y-4 p-6">
        <InlineAlert toneName="info" title="Local-only provider history">
          This ledger combines existing Shopify snapshot runs and existing integration-control actions. It has no webhook receiver, polling job, provider write, or message-data capability.
        </InlineAlert>

        <SectionCard title="Runs and controls" action={<span className="text-xs text-inkmed">{visibleItems.length} of {items.length} records</span>} testId="provider-ledger-list">
          <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_11rem_11rem]">
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-inkmed" size={15} /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search provider, operation, reason, or run ID" className="pl-9" data-testid="provider-ledger-search" /></div>
            <select value={provider} onChange={(event) => setProvider(event.target.value)} className="h-10 rounded-md border border-line bg-surface px-3 text-sm text-ink" data-testid="provider-ledger-provider-filter"><option value="all">All providers</option>{providers.map((value) => <option key={value} value={value}>{labelize(value)}</option>)}</select>
            <select value={kind} onChange={(event) => setKind(event.target.value)} className="h-10 rounded-md border border-line bg-surface px-3 text-sm text-ink" data-testid="provider-ledger-kind-filter"><option value="all">All record types</option>{kinds.map((value) => <option key={value} value={value}>{labelize(value)}</option>)}</select>
          </div>

          {isLoading && <p className="py-8 text-sm text-inkmed">Loading local provider history…</p>}
          {error && <InlineAlert toneName="danger" title="Could not load the provider ledger">{error?.response?.data?.detail || error.message}</InlineAlert>}
          {!isLoading && !error && items.length === 0 && <EmptyState title="No provider history recorded yet" description="Shopify snapshot runs and safe integration-control actions will appear here when recorded." testId="provider-ledger-empty" />}
          {!isLoading && !error && items.length > 0 && visibleItems.length === 0 && <EmptyState title="No matching provider records" description="Adjust the search or filters to review the available local history." testId="provider-ledger-no-matches" />}
          {!isLoading && !error && visibleItems.length > 0 && (
            <div className="divide-y divide-line rounded-md border border-line" data-testid="provider-ledger-events">
              {visibleItems.map((item) => (
                <article key={item.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto]" data-testid="provider-ledger-event">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-info">{item.kind === "run" ? <Database size={14} /> : <Activity size={14} />}</span><p className="font-medium text-ink">{labelize(item.provider)} · {labelize(item.operation)}</p><StatusChip value={item.status} /></div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-inkmed"><span>{labelize(item.kind)}</span><span>·</span><span>Reference: {item.correlation_id}</span>{item.duration_seconds !== null && item.duration_seconds !== undefined && <><span>·</span><span>Duration: {durationLabel(item.duration_seconds)}</span></>}</div>
                    {item.kind === "run" && countSummary(item.counts) && <p className="mt-2 text-sm text-ink">{countSummary(item.counts)}</p>}
                    {item.reason && <p className="mt-2 text-sm text-ink">{item.reason}</p>}
                    {(item.prior_state || item.next_state) && <p className="mt-2 inline-flex items-center gap-1 text-xs text-inkmed">{labelize(item.prior_state)} <ArrowRight size={12} /> {labelize(item.next_state)} <span>·</span><ShieldCheck size={12} /> {item.actor || "Local operator"}</p>}
                    {item.error_summary && <p className="mt-2 inline-flex items-start gap-1 rounded-md bg-red-50 px-2 py-1 text-xs text-danger"><AlertTriangle className="mt-0.5 shrink-0" size={13} />{item.error_summary}</p>}
                  </div>
                  <time className="tnum text-xs text-inkmed lg:text-right">{fmtDateTime(item.occurred_at)}</time>
                </article>
              ))}
            </div>
          )}
        </SectionCard>
        {data?.scope_note && <p className="text-xs text-inkmed">{data.scope_note}</p>}
      </div>
    </div>
  );
}
