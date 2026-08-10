import React, { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import useSWR from "swr";
import { api } from "@/lib/api";
import { fmtDate, fmtDateTime, fmtRel, fmtCHF } from "@/lib/format";
import { PageHeader, StatusChip, TimelineEvent, FactList, InlineAlert, EmptyState, SectionCard } from "@/components/common";
import { useT } from "@/lib/i18n";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ExternalLink, Send, PauseCircle, PlayCircle, Phone, PackageCheck, Undo2, CalendarPlus, ShieldAlert, StickyNote } from "lucide-react";

const CHANNEL_FILTERS = ["All", "shopify", "email", "whatsapp", "note", "system", "planzer"];

export default function OrderDetail() {
  const { t } = useT();
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { data: o, isLoading, mutate } = useSWR(["order", orderId], () => api.order(orderId));
  const [note, setNote] = useState("");
  const [noteState, setNoteState] = useState("idle");
  const [expandedEv, setExpandedEv] = useState(null);
  const [chFilter, setChFilter] = useState("All");
  const [pauseOpen, setPauseOpen] = useState(false);
  const [pauseReason, setPauseReason] = useState("");

  if (isLoading || !o) {
    return <div className="space-y-4 p-6"><Skeleton className="h-10 w-96" /><Skeleton className="h-96" /></div>;
  }

  const unfulfilled = o.payment_status === "Paid" && !["Fulfilled", "Cancelled"].includes(o.fulfillment_stage);
  const lastMsg = [...o.timeline].reverse().find((e) => e.type === "message");
  const duplicateRisk = o.conversations?.some((c) => c.duplicate_warning);

  const act = async (summary, detail = "") => {
    await api.addTimelineEvent(o.id, { summary, detail, type: "action", actor: "Pablo" });
    mutate();
    toast.success(summary);
  };

  const saveNote = async () => {
    if (!note.trim()) return;
    setNoteState("saving");
    try {
      await api.addNote(o.id, note);
      setNote("");
      setNoteState("saved");
      mutate();
      setTimeout(() => setNoteState("idle"), 2000);
    } catch {
      setNoteState("failed");
    }
  };

  const togglePause = async () => {
    if (o.updates_suppressed) {
      await api.pauseUpdates(o.id, { paused: false });
      mutate();
      toast.success(t("Resume automatic updates"));
    } else {
      setPauseOpen(true);
    }
  };

  const confirmPause = async () => {
    await api.pauseUpdates(o.id, { paused: true, reason: pauseReason || "Paused by operator", until: null });
    setPauseOpen(false);
    setPauseReason("");
    mutate();
    toast.success(t("Automatic updates paused"));
  };

  const filteredTimeline = [...o.timeline]
    .sort((a, b) => b.ts.localeCompare(a.ts))
    .filter((e) => chFilter === "All" || e.channel === chFilter);

  const rail = [
    { label: t("Send or schedule status update"), icon: Send, show: unfulfilled, fn: () => act("Status update scheduled", "Template delay_update_v3 queued for next send window.") },
    { label: t("Assign stock / mark awaiting"), icon: PackageCheck, show: o.fulfillment_stage === "Awaiting stock" || o.fulfillment_stage === "Ready to allocate", fn: () => act("Stock allocation requested") },
    { label: t("Start fulfillment"), icon: PackageCheck, show: ["Allocated", "Ready to allocate"].includes(o.fulfillment_stage), fn: () => navigate("/fulfillment") },
    { label: t("Add tracking / mark fulfilled"), icon: PackageCheck, show: ["Picking", "Packed"].includes(o.fulfillment_stage), fn: () => navigate("/fulfillment") },
    { label: t("Book pickup"), icon: CalendarPlus, show: o.delivery_method === "Pickup", fn: () => navigate("/appointments") },
    { label: t("Create RMA"), icon: Undo2, show: true, fn: () => navigate("/returns") },
    { label: t("Add phone note"), icon: Phone, show: true, fn: () => document.getElementById("internal-note-input")?.focus() },
    { label: t("Request cancellation / refund approval"), icon: ShieldAlert, show: o.payment_status === "Paid", danger: true, fn: () => act("Cancellation/refund approval requested", "High-risk action — owner approval required before any refund is executed.") },
  ];

  const excLabel = o.exceptions.length === 1 ? t("open exception") : t("open exceptions");

  return (
    <div data-testid="order-detail-page">
      <PageHeader
        breadcrumb={<Link to="/orders" className="hover:text-brand">{t("Orders")}</Link>}
        title={o.customer.name} identifier={o.id}
        status={
          <div className="flex items-center gap-2">
            <StatusChip value={o.payment_status} />
            <StatusChip value={o.fulfillment_stage} />
            {unfulfilled && <span className="tnum text-sm font-semibold text-danger">{o.business_day_age} {t("business days")}</span>}
          </div>
        }
        freshness={`${t("Shopify synced 2 min ago")} · ${t("Delivery")}: ${o.delivery_method} · ${o.exceptions.length} ${excLabel}`}
        actions={
          <>
            {o.next_action && (
              <button onClick={() => act(`Action started: ${o.next_action}`)} className="h-9 rounded-md bg-brand px-3 text-sm font-medium text-white transition-colors hover:bg-brand/90" data-testid="primary-recommended-action">
                {o.next_action}
              </button>
            )}
            <a href={`https://admin.shopify.com/orders/${o.order_number.replace("#", "")}`} target="_blank" rel="noreferrer" title="Opens Shopify admin (external)"
              className="flex h-9 items-center gap-1.5 rounded-md border border-line bg-surface px-3 text-sm font-medium transition-colors hover:bg-subtle" data-testid="open-in-shopify">
              <ExternalLink size={14} /> {t("Open in Shopify")}
            </a>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 p-6 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-4">
          {o.exceptions.length > 0 && (
            <InlineAlert toneName="danger" title={`${o.exceptions.length} ${excLabel}`} testId="order-exceptions-alert">
              {o.exceptions.join(" · ")}
            </InlineAlert>
          )}
          {duplicateRisk && (
            <InlineAlert toneName="warn" testId="duplicate-contact-warning">
              {t("A WhatsApp reply was sent 2 hours ago. Review before sending another response.")}
            </InlineAlert>
          )}

          <div className="grid grid-cols-1 gap-3 rounded-lg border border-line bg-surface p-4 sm:grid-cols-2" data-testid="communication-summary">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-inkmed">{t("Last customer communication")}</p>
              <p className="mt-1 text-sm font-medium">{lastMsg ? lastMsg.summary : t("No communication yet")}</p>
              {lastMsg && <p className="tnum text-xs text-inkmed">{fmtDateTime(lastMsg.ts)} · {lastMsg.actor}</p>}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-inkmed">{t("Next scheduled communication")}</p>
              {o.updates_suppressed ? (
                <p className="mt-1 text-sm font-medium text-warn">{t("Automatic updates paused")} — {o.suppression_reason}{o.suppression_until ? ` (${t("until")} ${fmtDate(o.suppression_until)})` : ""}</p>
              ) : o.next_scheduled_update ? (
                <p className="tnum mt-1 text-sm font-medium">{fmtDateTime(o.next_scheduled_update)} · Automation: proactive delay update</p>
              ) : (
                <p className="mt-1 text-sm text-inkmed">{t("None scheduled")}</p>
              )}
            </div>
          </div>

          <Tabs defaultValue="overview" data-testid="order-tabs">
            <TabsList className="h-10 bg-subtle">
              {["overview", "timeline", "messages", "fulfillment", "inventory", "financials", "audit"].map((tv) => (
                <TabsTrigger key={tv} value={tv} className="capitalize data-[state=active]:bg-surface" data-testid={`tab-${tv}`}>{t(tv)}</TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="overview" className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <SectionCard title={t("Customer")}>
                <FactList facts={[[t("Name"), o.customer.name], [t("Email"), o.customer.email], [t("Phone"), o.customer.phone], [t("Language"), o.customer.lang], [t("Address"), o.address]]} />
              </SectionCard>
              <SectionCard title={t("Items")}>
                {o.items.map((i) => (
                  <div key={i.sku} className="flex items-center justify-between text-sm">
                    <div><p className="font-medium">{i.name}</p><p className="tnum text-xs text-inkmed">{i.sku} · {i.variant}</p></div>
                    <p className="tnum font-medium">{i.qty}× {fmtCHF(i.price)}</p>
                  </div>
                ))}
              </SectionCard>
              <SectionCard title={t("Fulfillment & stock")}>
                <FactList facts={[
                  [t("Promised lead time"), o.promised_lead_time],
                  [t("Business-day age"), `${o.business_day_age} ${t("business days")}`],
                  [t("Allocation"), o.stock_state],
                  [t("Tracking"), o.tracking || t("Not recorded")],
                  [t("Carrier"), o.carrier || "—"],
                  [t("Delivery method"), o.delivery_method],
                ]} />
              </SectionCard>
              <SectionCard title={t("Linked records")}>
                <div className="space-y-2 text-sm">
                  {o.conversations?.map((c) => <Link key={c.id} to={`/cases/${c.id}`} className="block text-brand hover:underline" data-testid="linked-conversation">{t("Case")}: {c.subject} ({c.state})</Link>)}
                  {o.returns?.map((r) => <Link key={r.id} to={`/returns/${r.id}`} className="block text-brand hover:underline" data-testid="linked-rma">{r.id}: {r.problem.slice(0, 40)}… ({r.state})</Link>)}
                  {o.appointments?.map((a) => <Link key={a.id} to="/appointments" className="block text-brand hover:underline">{t("Appointment")}: {a.type} {fmtDateTime(a.time)}</Link>)}
                  {o.approvals?.map((a) => <Link key={a.id} to="/automations?tab=approvals" className="block text-brand hover:underline" data-testid="linked-approval">{a.id}: {a.proposed_action.slice(0, 50)}… ({a.state})</Link>)}
                  {!o.conversations?.length && !o.returns?.length && !o.appointments?.length && !o.approvals?.length && <p className="text-inkmed">{t("No open cases, RMAs or appointments.")}</p>}
                </div>
              </SectionCard>
            </TabsContent>

            <TabsContent value="timeline" className="mt-4">
              <SectionCard testId="timeline-section">
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {CHANNEL_FILTERS.map((c) => (
                    <button key={c} onClick={() => setChFilter(c)} data-testid={`timeline-filter-${c}`}
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize transition-colors ${chFilter === c ? "border-brand bg-brand text-white" : "border-line text-inkmed hover:text-ink"}`}>
                      {c === "All" ? t("All") : c}
                    </button>
                  ))}
                </div>
                {filteredTimeline.length === 0 ? <EmptyState title={t("No events for this channel")} /> : filteredTimeline.map((e) => (
                  <TimelineEvent key={e.id} event={{ ...e, tsLabel: fmtDateTime(e.ts) }} expanded={expandedEv === e.id} onToggle={() => setExpandedEv(expandedEv === e.id ? null : e.id)} />
                ))}
              </SectionCard>
            </TabsContent>

            <TabsContent value="messages" className="mt-4">
              <SectionCard testId="messages-section">
                {o.conversations?.length ? o.conversations.map((c) => (
                  <div key={c.id} className="mb-4 last:mb-0">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold">{c.subject} <span className="font-normal text-inkmed">via {c.channel}</span></p>
                      <Link to={`/cases/${c.id}`} className="text-xs font-medium text-brand hover:underline" data-testid="open-case-link">{t("Open")} {t("Case").toLowerCase()}</Link>
                    </div>
                    {c.messages.map((m) => (
                      <div key={m.id} className={`mb-2 max-w-xl rounded-lg border p-3 text-sm ${m.direction === "in" ? "border-line bg-subtle" : "ml-8 border-blue-200 bg-blue-50"}`}>
                        <p className="mb-1 text-xs text-inkmed">{m.from}{m.automated && ` · ${t("Automation")}`} · <span className="tnum">{fmtDateTime(m.ts)}</span></p>
                        {m.body}
                      </div>
                    ))}
                  </div>
                )) : <EmptyState title={t("No conversations linked")} description={t("Inbound messages matched to this order will appear here.")} />}
              </SectionCard>
            </TabsContent>

            <TabsContent value="fulfillment" className="mt-4">
              <SectionCard testId="order-fulfillment-section">
                <FactList facts={[
                  [t("Stage"), o.fulfillment_stage],
                  [t("Delivery method"), o.delivery_method],
                  [t("Tracking"), o.tracking || t("Not recorded")],
                  [t("Notification state"), o.tracking ? t("Tracking sent to customer") : t("Not sent")],
                ]} />
                <button onClick={() => navigate("/fulfillment")} className="mt-4 h-9 rounded-md border border-line bg-surface px-3 text-sm font-medium transition-colors hover:bg-subtle" data-testid="go-to-fulfillment">
                  {t("Open fulfillment workspace")}
                </button>
              </SectionCard>
            </TabsContent>

            <TabsContent value="inventory" className="mt-4">
              <SectionCard testId="order-inventory-section">
                <FactList facts={[[t("SKU"), o.items[0].sku], [t("Allocation state"), o.stock_state], [t("Inbound"), o.fulfillment_stage === "Awaiting stock" ? t("See inventory for confirmed inbound and ETA") : "—"]]} />
                <button onClick={() => navigate(`/inventory?sku=${o.items[0].sku}`)} className="mt-4 h-9 rounded-md border border-line bg-surface px-3 text-sm font-medium transition-colors hover:bg-subtle" data-testid="go-to-inventory">
                  {t("View SKU availability")}
                </button>
              </SectionCard>
            </TabsContent>

            <TabsContent value="financials" className="mt-4">
              <SectionCard testId="order-financials-section">
                <InlineAlert toneName="info" testId="shopify-source-indicator">{t("Financial state is owned by Shopify and is never silently overwritten here.")}</InlineAlert>
                <div className="mt-3">
                  <FactList facts={[
                    [t("Subtotal"), fmtCHF(o.financials.subtotal)],
                    [t("Shipping"), fmtCHF(o.financials.shipping)],
                    [t("Refunded"), o.financials.refunded ? `− ${fmtCHF(o.financials.refunded)}` : "CHF 0.00"],
                    [t("Total"), fmtCHF(o.financials.subtotal + o.financials.shipping - o.financials.refunded)],
                    [t("Payment status"), o.payment_status],
                  ]} />
                </div>
              </SectionCard>
            </TabsContent>

            <TabsContent value="audit" className="mt-4">
              <SectionCard testId="order-audit-section">
                <p className="mb-3 text-xs text-inkmed">{t("Audit records cannot be edited through the UI.")}</p>
                {o.audit.map((a) => (
                  <div key={a.id} className="border-b border-line py-2 text-sm last:border-0" data-testid="audit-record">
                    <p className="font-medium">{a.action}</p>
                    <p className="tnum text-xs text-inkmed">{fmtDateTime(a.ts)} · {a.actor} · {a.prev || "—"} → {a.new || "—"}{a.reason ? ` · ${a.reason}` : ""}</p>
                  </div>
                ))}
              </SectionCard>
            </TabsContent>
          </Tabs>
        </div>

        <aside className="space-y-4" data-testid="order-action-panel">
          <SectionCard title={t("Recommended next step")}>
            <p className="text-sm font-medium text-ink">{o.next_action || t("No action required")}</p>
            <p className="mt-1 text-xs text-inkmed">Based on {o.business_day_age} {t("business days")}, "{o.fulfillment_stage}".</p>
          </SectionCard>

          <SectionCard title={t("Customer contact")}>
            <button onClick={togglePause} data-testid="pause-updates-btn"
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-line bg-surface text-sm font-medium transition-colors hover:bg-subtle">
              {o.updates_suppressed ? <><PlayCircle size={14} /> {t("Resume automatic updates")}</> : <><PauseCircle size={14} /> {t("Pause updates")}</>}
            </button>
            {o.updates_suppressed && <p className="mt-2 text-xs text-warn" data-testid="suppression-note">{t("Automatic updates paused")}{o.suppression_until ? ` (${fmtDate(o.suppression_until)})` : ""} — {o.suppression_reason}</p>}
          </SectionCard>

          <SectionCard title={t("Actions")}>
            <div className="space-y-1.5">
              {rail.filter((a) => a.show).map(({ label, icon: Icon, fn, danger }) => (
                <button key={label} onClick={fn} data-testid={`action-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                  className={`flex h-9 w-full items-center gap-2 rounded-md border px-3 text-left text-sm font-medium transition-colors ${danger ? "border-red-200 text-danger hover:bg-red-50" : "border-line bg-surface hover:bg-subtle"}`}>
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>
          </SectionCard>

          <SectionCard title={t("Internal notes")}>
            <Textarea id="internal-note-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Add a phone note or internal remark…")} className="min-h-20 text-sm" data-testid="internal-note-input" />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-inkmed" data-testid="note-save-state">
                {noteState === "saving" ? t("Saving…") : noteState === "saved" ? t("Saved") : noteState === "failed" ? t("Failed — retry") : ""}
              </span>
              <button onClick={saveNote} className="flex h-8 items-center gap-1.5 rounded-md bg-brand px-3 text-xs font-medium text-white transition-colors hover:bg-brand/90" data-testid="save-note-btn">
                <StickyNote size={12} /> {t("Save note")}
              </button>
            </div>
            {o.notes?.slice().reverse().map((n) => (
              <div key={n.id} className="mt-2 rounded-md bg-subtle p-2 text-xs" data-testid="saved-note">
                <p className="text-ink">{n.text}</p>
                <p className="tnum mt-0.5 text-inkmed">{n.author} · {fmtDateTime(n.ts)}</p>
              </div>
            ))}
          </SectionCard>
        </aside>
      </div>

      <Dialog open={pauseOpen} onOpenChange={setPauseOpen}>
        <DialogContent data-testid="pause-updates-dialog">
          <DialogHeader><DialogTitle>{t("Pause automatic updates")}</DialogTitle></DialogHeader>
          <p className="text-sm text-inkmed">{t("A reason is required. Scheduled customer messages for this order will not send while paused.")}</p>
          <Textarea value={pauseReason} onChange={(e) => setPauseReason(e.target.value)} placeholder={t("e.g. Customer requested telephone contact")} data-testid="pause-reason-input" />
          <DialogFooter>
            <button onClick={() => setPauseOpen(false)} className="h-9 rounded-md border border-line px-3 text-sm font-medium hover:bg-subtle">{t("Cancel")}</button>
            <button onClick={confirmPause} disabled={!pauseReason.trim()} className="h-9 rounded-md bg-brand px-3 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-50" data-testid="confirm-pause-btn">{t("Pause updates")}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
