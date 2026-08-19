import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import useSWR from "swr";
import { ArrowRight, History, Mail, Search, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { EmptyState, InlineAlert, PageHeader, SectionCard, StatusChip } from "@/components/common";
import { Input } from "@/components/ui/input";

const EMPTY_ITEMS = [];
const labelize = (value) => String(value || "—").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const searchableText = (event) => [event.provider, event.display_identity, event.actor, event.action, event.reason, event.prior_state, event.next_state, event.outcome].join(" ").toLocaleLowerCase();

export default function AuditTimeline() {
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("all");
  const [action, setAction] = useState("all");
  const { data, error, isLoading } = useSWR("audit-timeline", api.auditTimeline, { refreshInterval: 15000 });
  const items = data?.items ?? EMPTY_ITEMS;
  const providers = useMemo(() => [...new Set(items.map((event) => event.provider).filter(Boolean))].sort(), [items]);
  const actions = useMemo(() => [...new Set(items.map((event) => event.action).filter(Boolean))].sort(), [items]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleItems = useMemo(() => items.filter((event) => (
    (provider === "all" || event.provider === provider)
    && (action === "all" || event.action === action)
    && (!normalizedQuery || searchableText(event).includes(normalizedQuery))
  )), [items, provider, action, normalizedQuery]);

  return (
    <div data-testid="audit-timeline-page">
      <PageHeader title="Audit Timeline" freshness="Read-only local-console evidence. Provider payloads, credentials, messages, and external event history are excluded." />
      <div className="space-y-4 p-6">
        <InlineAlert toneName="info" title="Local operator audit evidence">
          This timeline records safe console actions only. It does not create actions, read messages, change Shopify data, or introduce user accounts.
        </InlineAlert>

        <SectionCard title="Activity" action={<span className="text-xs text-inkmed">{visibleItems.length} of {items.length} events</span>} testId="audit-timeline-list">
          <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_11rem_13rem]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-inkmed" size={15} />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reason, action, provider, or operator" className="pl-9" data-testid="audit-timeline-search" />
            </div>
            <select value={provider} onChange={(event) => setProvider(event.target.value)} className="h-10 rounded-md border border-line bg-surface px-3 text-sm text-ink" data-testid="audit-timeline-provider-filter">
              <option value="all">All providers</option>
              {providers.map((value) => <option key={value} value={value}>{labelize(value)}</option>)}
            </select>
            <select value={action} onChange={(event) => setAction(event.target.value)} className="h-10 rounded-md border border-line bg-surface px-3 text-sm text-ink" data-testid="audit-timeline-action-filter">
              <option value="all">All actions</option>
              {actions.map((value) => <option key={value} value={value}>{labelize(value)}</option>)}
            </select>
          </div>

          {isLoading && <p className="py-8 text-sm text-inkmed">Loading local audit evidence…</p>}
          {error && <InlineAlert toneName="danger" title="Could not load the audit timeline">{error?.response?.data?.detail || error.message}</InlineAlert>}
          {!isLoading && !error && items.length === 0 && (
            <EmptyState title="No audit events recorded yet" description="Events will appear after safe console lifecycle actions are recorded." testId="audit-timeline-empty" />
          )}
          {!isLoading && !error && items.length > 0 && visibleItems.length === 0 && (
            <EmptyState title="No matching audit events" description="Adjust the search or filters to view the available local-console evidence." testId="audit-timeline-no-matches" />
          )}
          {!isLoading && !error && visibleItems.length > 0 && (
            <div className="divide-y divide-line rounded-md border border-line" data-testid="audit-timeline-events">
              {visibleItems.map((event) => (
                <article key={event.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto]" data-testid="audit-timeline-event">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-info"><History size={14} /></span>
                      <p className="font-medium text-ink">{labelize(event.action)}</p>
                      <StatusChip value={event.outcome || "recorded"} />
                    </div>
                    <p className="mt-2 text-sm text-ink">{event.reason || "No reason recorded."}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-inkmed">
                      <span className="inline-flex items-center gap-1"><Mail size={12} />{labelize(event.provider)}{event.display_identity ? ` · ${event.display_identity}` : ""}</span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1"><ShieldCheck size={12} />{event.actor || "Local operator"}</span>
                      {(event.prior_state || event.next_state) && <><span>·</span><span>{labelize(event.prior_state)} <ArrowRight className="inline" size={12} /> {labelize(event.next_state)}</span></>}
                    </div>
                  </div>
                  <div className="flex flex-row items-start justify-between gap-3 lg:flex-col lg:items-end">
                    <time className="tnum text-xs text-inkmed">{fmtDateTime(event.created_at)}</time>
                    <Link to="/settings/integrations" className="text-xs font-medium text-brand hover:underline">Integration context</Link>
                  </div>
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
