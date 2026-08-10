import React, { useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import useSWR from "swr";
import { api } from "@/lib/api";
import { fmtDateTime, fmtRel, fmtCHF } from "@/lib/format";
import { PageHeader, StatusChip, SourceBadge, ConfidenceBadge, EmptyState, InlineAlert, FactList } from "@/components/common";
import { useT } from "@/lib/i18n";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Send, Clock, ShieldCheck, Save, Sparkles, ChevronDown, Paperclip, PanelRightClose, PanelRightOpen } from "lucide-react";

const FILTERS = [
  ["", "All"], ["unread", "Unread"], ["customer-waiting", "Customer waiting"], ["needs-approval", "Needs approval"],
  ["unlinked", "Unlinked"], ["duplicate", "Duplicate suspected"], ["warranty", "Warranty"], ["cancellation", "Cancellation"], ["b2b", "B2B"],
];

const TEMPLATES = {
  "Delay update (DE)": "Guten Tag {name} — Ihre Bestellung ist weiterhin in Bearbeitung. Wir erwarten den Versand innerhalb der nächsten Tage und melden uns mit der Sendungsnummer.",
  "Delay update (FR)": "Bonjour {name} — votre commande est toujours en cours de traitement. Nous vous enverrons le numéro de suivi dès l'expédition.",
  "Tracking sent (EN)": "Hello {name} — your order has shipped. You can follow the delivery with the tracking link below.",
  "Pickup ready (DE)": "Guten Tag {name} — Ihre Bestellung ist abholbereit. Bitte buchen Sie einen Termin über den Link unten.",
};

function suggestedDraft(conv) {
  if (!conv) return "";
  const name = conv.customer.name.split(" ")[0];
  if (conv.category === "Cancellation") return `Bonjour ${name}, nous avons bien reçu votre demande d'annulation. Elle est en cours de validation — nous confirmons le remboursement dans les plus brefs délais.`;
  if (conv.category === "Warranty") return `Guten Tag ${name}, vielen Dank für das Video. Unser Techniker prüft den Fall (RMA erstellt). Wir melden uns mit den nächsten Schritten.`;
  if (conv.order?.fulfillment_stage === "Awaiting stock") return `Hello ${name}, thank you for your patience. Your order is ${conv.order.business_day_age} business days old and the item is currently awaiting confirmed inbound stock. We will send tracking as soon as it ships.`;
  return `Hello ${name}, thanks for reaching out — here is the current status of your request.`;
}

export default function Inbox() {
  const { t } = useT();
  const { caseId } = useParams();
  const [params, setParams] = useSearchParams();
  const filter = params.get("filter") || "";
  const navigate = useNavigate();
  const { data: convs, isLoading, mutate: mutateList } = useSWR(["conversations", filter], () => api.conversations(filter || undefined));
  const activeId = caseId || convs?.[0]?.id;
  const { data: conv, mutate: mutateConv } = useSWR(activeId ? ["conversation", activeId] : null, () => api.conversation(activeId));
  const [draft, setDraft] = useState("");
  const [draftLabel, setDraftLabel] = useState(null);
  const [contextOpen, setContextOpen] = useState(true);

  useEffect(() => { setDraft(""); setDraftLabel(null); }, [activeId]);

  const lowConfidence = conv && conv.match_confidence < 90;
  const blockedTopic = conv && ["Cancellation", "Warranty"].includes(conv.category);
  const sendBlocked = lowConfidence;

  const doSend = async (mode) => {
    if (!draft.trim()) return;
    await api.sendMessage(conv.id, { body: draft, mode });
    setDraft("");
    setDraftLabel(null);
    mutateConv();
    mutateList();
    toast.success({ send: t("Message sent"), schedule: t("Message scheduled"), approval: t("Approval requested"), draft: t("Draft saved") }[mode]);
  };

  const generateDraft = () => {
    setDraft(suggestedDraft(conv));
    setDraftLabel(t("Suggested"));
  };

  return (
    <div className="flex h-[calc(100vh-56px)]" data-testid="inbox-page">
      <div className="flex w-[320px] shrink-0 flex-col border-r border-line bg-surface">
        <div className="border-b border-line p-3">
          <h1 className="text-lg font-semibold">{t("Inbox")}</h1>
          <div className="mt-2 flex flex-wrap gap-1">
            {FILTERS.map(([key, label]) => (
              <button key={key} data-testid={`inbox-filter-${key || "all"}`}
                onClick={() => setParams(key ? { filter: key } : {})}
                className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors", filter === key ? "border-brand bg-brand text-white" : "border-line text-inkmed hover:text-ink")}>
                {t(label)}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-inkmed">{t("Newsletters, spam and system messages are excluded by default.")}</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-2 p-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : !convs?.length ? (
            <div className="p-3"><EmptyState title={t("No conversations")} description={t("No conversations match this filter.")} /></div>
          ) : convs.map((c) => (
            <button key={c.id} data-testid={`conversation-item-${c.id}`}
              onClick={() => navigate(`/cases/${c.id}${filter ? `?filter=${filter}` : ""}`)}
              className={cn("flex w-full flex-col gap-0.5 border-b border-line px-3 py-2.5 text-left transition-colors hover:bg-subtle", activeId === c.id && "bg-blue-50/70")}>
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
                  {c.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-brand" data-testid="unread-dot" />}
                  <span className="truncate">{c.customer.name}</span>
                </span>
                <span className="tnum shrink-0 text-[10px] text-inkmed">{fmtRel(c.updated_at)}</span>
              </div>
              <p className="truncate text-xs font-medium text-ink">{c.subject}</p>
              <p className="truncate text-xs text-inkmed">{c.preview}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <SourceBadge channel={c.channel} />
                {c.order_id ? <span className="tnum text-[10px] text-inkmed">{c.order_id}</span> : <StatusChip value="Unlinked" toneOverride="warn" className="text-[10px]" />}
                <span className="rounded bg-subtle px-1.5 text-[10px] text-inkmed">{c.category}</span>
                {c.waiting && <span className={cn("tnum text-[10px] font-medium", c.sla === "Breached" ? "text-danger" : c.sla === "At risk" ? "text-warn" : "text-inkmed")}>waiting {c.waiting}</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-w-[520px] flex-1 flex-col bg-canvas">
        {!conv ? (
          <div className="flex flex-1 items-center justify-center"><EmptyState title={t("Select a conversation")} /></div>
        ) : (
          <>
            <div className="border-b border-line bg-surface px-4 py-3" data-testid="conversation-header">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{conv.customer.name} <span className="font-normal text-inkmed">· {conv.subject}</span></p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <SourceBadge channel={conv.channel} label={`Reply via ${conv.channel}`} />
                    <span className="rounded bg-subtle px-1.5 py-0.5 text-[10px] font-medium text-inkmed">{t("Language")}: {conv.language}</span>
                    <span className="rounded bg-subtle px-1.5 py-0.5 text-[10px] font-medium text-inkmed">{conv.category}</span>
                    <StatusChip value={conv.state} />
                    {conv.order_id ? <ConfidenceBadge value={conv.match_confidence} /> : <ConfidenceBadge value={conv.match_confidence} label={t("Best match")} />}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex h-8 items-center gap-1 rounded-md border border-line bg-surface px-2.5 text-xs font-medium hover:bg-subtle" data-testid="case-state-select">
                        {t("Set state")} <ChevronDown size={12} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {["Open", "In progress", "Waiting", "Approval required", "Resolved"].map((s) => (
                        <DropdownMenuItem key={s} onClick={async () => { await api.updateConversation(conv.id, { state: s }); mutateConv(); mutateList(); toast.success(`${t("State")}: ${t(s)}`); }}>{t(s)}</DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <button onClick={() => setContextOpen(!contextOpen)} aria-label={t("Toggle context pane")} className="rounded-md border border-line p-1.5 text-inkmed hover:bg-subtle" data-testid="toggle-context-pane">
                    {contextOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
                  </button>
                </div>
              </div>
              {conv.duplicate_warning && (
                <div className="mt-2"><InlineAlert toneName="warn" testId="conversation-duplicate-warning">{conv.duplicate_warning}</InlineAlert></div>
              )}
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4" data-testid="message-thread">
              {conv.messages.map((m) => (
                <div key={m.id} className={cn("max-w-xl rounded-lg border p-3 text-sm", m.direction === "in" ? "border-line bg-surface" : "ml-auto border-blue-200 bg-blue-50")} data-testid={`message-${m.direction}`}>
                  <p className="mb-1 flex items-center gap-1.5 text-xs text-inkmed">
                    <span className="font-medium">{m.from}</span>
                    {m.automated && <StatusChip value="Automation" toneOverride="info" className="py-0 text-[10px]" />}
                    · <span className="tnum">{fmtDateTime(m.ts)}</span>
                    {m.delivery_state && <StatusChip value={m.delivery_state} className="py-0 text-[10px]" />}
                  </p>
                  {m.body}
                </div>
              ))}
            </div>

            <div className="border-t border-line bg-surface p-3" data-testid="composer">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-inkmed">
                <span>To: <span className="font-medium text-ink">{conv.customer.email}</span> · reply in thread via {conv.channel}</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-1 rounded-md border border-line px-2 py-1 font-medium hover:bg-subtle" data-testid="template-select">{t("Template")} <ChevronDown size={11} /></button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {Object.entries(TEMPLATES).map(([name, body]) => (
                      <DropdownMenuItem key={name} onClick={() => { setDraft(body.replace("{name}", conv.customer.name.split(" ")[0])); setDraftLabel(null); }}>{name}</DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <button onClick={generateDraft} className="flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 font-medium text-info transition-colors hover:bg-blue-100" data-testid="ai-draft-btn">
                  <Sparkles size={11} /> {t("AI draft")}
                </button>
                <button className="ml-auto rounded-md border border-line p-1.5 hover:bg-subtle" aria-label={t("Attach file")} data-testid="attach-btn"><Paperclip size={13} /></button>
              </div>
              {draftLabel && (
                <div className="mb-2 rounded-md border border-blue-200 bg-blue-50 p-2 text-xs" data-testid="ai-draft-facts">
                  <p className="font-semibold text-info">{t("Suggested — AI-assisted draft. Editable. Facts used:")}</p>
                  <ul className="mt-1 list-disc pl-4 text-inkmed">
                    {conv.order && <li>{t("Order")} {conv.order.id}: {conv.order.fulfillment_stage}, {conv.order.business_day_age} {t("business days")}</li>}
                    <li>{conv.category} · {t("Language")}: {conv.language}</li>
                    <li>{t("Match confidence")}: {conv.match_confidence}%</li>
                  </ul>
                  <p className="mt-1 text-inkmed">{t("Drafts never fabricate stock dates, tracking states, refunds or delivery promises.")}</p>
                </div>
              )}
              <Textarea value={draft} onChange={(e) => { setDraft(e.target.value); if (draftLabel) setDraftLabel(t("Suggested · edited")); }}
                placeholder={t("Write a reply… (no default telephone number in signature)")} className="min-h-24 text-sm" data-testid="composer-input" />
              {sendBlocked && (
                <div className="mt-2"><InlineAlert toneName="danger" testId="send-blocked-alert">Automatic send blocked: customer/order match confidence is {conv.match_confidence}% (below 90%). Link the correct order or request approval.</InlineAlert></div>
              )}
              {!sendBlocked && blockedTopic && (
                <div className="mt-2"><InlineAlert toneName="warn" testId="approval-topic-alert">{conv.category} — sending requires approval per policy.</InlineAlert></div>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <button onClick={() => doSend("send")} disabled={sendBlocked || blockedTopic || !draft.trim()} data-testid="composer-send-btn"
                  className="flex h-9 items-center gap-1.5 rounded-md bg-brand px-3 text-sm font-medium text-white transition-colors hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-40">
                  <Send size={13} /> {t("Send now")}
                </button>
                <button onClick={() => doSend("schedule")} disabled={sendBlocked || blockedTopic || !draft.trim()} data-testid="composer-schedule-btn"
                  className="flex h-9 items-center gap-1.5 rounded-md border border-line bg-surface px-3 text-sm font-medium transition-colors hover:bg-subtle disabled:opacity-40">
                  <Clock size={13} /> {t("Schedule")}
                </button>
                <button onClick={() => doSend("approval")} disabled={!draft.trim()} data-testid="composer-approval-btn"
                  className="flex h-9 items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 text-sm font-medium text-warn transition-colors hover:bg-amber-100 disabled:opacity-40">
                  <ShieldCheck size={13} /> {t("Request approval")}
                </button>
                <button onClick={() => doSend("draft")} disabled={!draft.trim()} data-testid="composer-save-draft-btn"
                  className="flex h-9 items-center gap-1.5 rounded-md border border-line bg-surface px-3 text-sm font-medium transition-colors hover:bg-subtle disabled:opacity-40">
                  <Save size={13} /> {t("Save draft")}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {conv && contextOpen && (
        <div className="w-[360px] shrink-0 overflow-y-auto border-l border-line bg-surface p-4" data-testid="context-pane">
          <h2 className="text-sm font-semibold">{t("Customer & order context")}</h2>
          <div className="mt-3 rounded-md border border-line bg-subtle p-3">
            <FactList facts={[[t("Customer"), conv.customer.name], [t("Email"), conv.customer.email], [t("Phone"), conv.customer.phone], [t("City"), conv.customer.city], [t("Language"), conv.customer.lang]]} />
          </div>
          {conv.order ? (
            <div className="mt-3 rounded-md border border-line p-3" data-testid="context-order">
              <div className="flex items-center justify-between">
                <p className="tnum text-sm font-semibold">{conv.order.id}</p>
                <Link to={`/orders/${conv.order.id}`} className="text-xs font-medium text-brand hover:underline" data-testid="context-open-order">{t("Open order")}</Link>
              </div>
              <p className="text-xs text-inkmed">{t("Opening the order keeps your draft.")}</p>
              <div className="mt-2"><FactList facts={[
                [t("State"), `${conv.order.payment_status} · ${conv.order.fulfillment_stage}`],
                [t("Age"), `${conv.order.business_day_age} ${t("business days")}`],
                [t("Item"), conv.order.items[0].name],
                [t("Total"), fmtCHF(conv.order.total)],
                [t("Tracking"), conv.order.tracking || t("Not recorded")],
              ]} /></div>
            </div>
          ) : (
            <div className="mt-3"><InlineAlert toneName="warn" testId="unlinked-alert">{t("No order linked. Identity is ambiguous — no draft is shown as ready to send until this is resolved.")}</InlineAlert></div>
          )}
          <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-info">{t("System recommendation")}</p>
            <p className="mt-1 text-sm text-ink">
              {conv.category === "Cancellation" ? "Refund intent detected — approval APR pending. Do not promise refund before approval." :
               conv.category === "Warranty" ? "Warranty topic — evidence received. Await inspection findings before liability statement." :
               conv.order?.fulfillment_stage === "Awaiting stock" ? "Send factual delay update with confirmed inbound information only." :
               "Reply with current verified status."}
            </p>
            <p className="mt-1 text-[10px] text-inkmed">{t("Classification confidence shown per topic, not generic AI confidence.")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
