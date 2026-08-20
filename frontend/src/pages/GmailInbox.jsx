import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import useSWR from "swr";
import { api } from "@/lib/api";
import { EmptyState, InlineAlert } from "@/components/common";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  Inbox,
  Link2,
  Loader2,
  Mail,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Unplug,
} from "lucide-react";

/* -------------------------------------------------------------------------- */
/* Presentation helpers                                                        */
/* -------------------------------------------------------------------------- */

function formatDate(isoDate) {
  if (!isoDate) return "";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "";

  const differenceInMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (differenceInMinutes < 1) return "Jetzt";
  if (differenceInMinutes < 60) return `vor ${differenceInMinutes} Min.`;
  if (differenceInMinutes < 24 * 60) {
    return date.toLocaleTimeString("de-CH", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Zurich",
    });
  }
  if (differenceInMinutes < 48 * 60) return "Gestern";
  return date.toLocaleDateString("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Zurich",
  });
}

function formatFullDate(isoDate) {
  if (!isoDate) return "Datum nicht verfügbar";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "Datum nicht verfügbar";
  return date.toLocaleDateString("de-CH", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Zurich",
  });
}

function extractName(headerValue) {
  if (!headerValue) return "Unbekannt";
  const match = headerValue.match(/^\s*"?([^"<]+)"?\s*</);
  if (match) return match[1].trim();
  if (!headerValue.includes("<") && headerValue.includes("@")) return headerValue.split("@")[0];
  return headerValue.trim();
}

function extractEmail(headerValue) {
  if (!headerValue) return "";
  const match = headerValue.match(/<([^>]+)>/);
  if (match) return match[1].trim();
  return headerValue.includes("@") ? headerValue.trim() : "";
}

function getInitials(name) {
  const words = (name || "?").trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "?";
}

function avatarTone(name) {
  const tones = [
    "bg-blue-100 text-info",
    "bg-emerald-100 text-ok",
    "bg-violet-100 text-violet-700",
    "bg-amber-100 text-warn",
    "bg-rose-100 text-rose-700",
  ];
  const score = [...(name || "")].reduce((total, char) => total + char.charCodeAt(0), 0);
  return tones[score % tones.length];
}

function formatFileMeta(attachment) {
  const mimeType = attachment?.mimeType || "";
  const conciseTypes = {
    "application/pdf": "PDF",
    "application/zip": "ZIP",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPTX",
    "image/jpeg": "JPG",
    "image/png": "PNG",
    "image/gif": "GIF",
    "image/webp": "WEBP",
    "text/csv": "CSV",
    "text/plain": "TXT",
  };
  if (conciseTypes[mimeType]) return conciseTypes[mimeType];
  const [, subtype] = mimeType.split("/");
  return subtype ? subtype.split("+").pop().slice(0, 12).toUpperCase() : "DATEI";
}

function deduplicateThreads(threads) {
  const byId = new Map();
  threads.forEach((thread) => {
    if (thread?.id && !byId.has(thread.id)) byId.set(thread.id, thread);
  });
  return [...byId.values()];
}

/* -------------------------------------------------------------------------- */
/* Inbox list                                                                  */
/* -------------------------------------------------------------------------- */

function ThreadListItem({ thread, isActive, onClick }) {
  const senderName = extractName(thread.from);
  const hasMultiple = thread.messageCount > 1;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={isActive ? "page" : undefined}
      data-testid={`gmail-thread-${thread.id}`}
      className={cn(
        "group relative flex w-full flex-col gap-1 border-b border-line px-4 py-3 text-left outline-none transition-colors hover:bg-subtle focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand",
        isActive && "bg-blue-50/80 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-brand"
      )}
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <span className={cn("min-w-0 truncate text-sm", isActive || !thread.read ? "font-semibold text-ink" : "font-medium text-ink")} title={senderName}>
          {senderName}
        </span>
        <span className="tnum shrink-0 text-[11px] font-medium text-inkmed">{formatDate(thread.date)}</span>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-xs font-semibold text-ink" title={thread.subject || "(Kein Betreff)"}>
          {thread.subject || "(Kein Betreff)"}
        </p>
        {hasMultiple && (
          <span className="shrink-0 rounded-full bg-subtle px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-inkmed" aria-label={`${thread.messageCount} Nachrichten`}>
            {thread.messageCount}
          </span>
        )}
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-xs leading-4 text-inkmed">{thread.snippet || "Keine Vorschau verfügbar"}</p>
        {thread.hasAttachments && <Paperclip size={13} className="shrink-0 text-inkmed" aria-label="Thread enthält Anhänge" />}
      </div>
    </button>
  );
}

function InboxSkeleton() {
  return (
    <div className="space-y-px p-0" data-testid="gmail-thread-list-loading" aria-label="Posteingang wird geladen">
      {[...Array(8)].map((_, index) => (
        <div key={index} className="border-b border-line px-4 py-3">
          <div className="flex justify-between gap-4"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-12" /></div>
          <Skeleton className="mt-2 h-3.5 w-4/5" />
          <Skeleton className="mt-2 h-3 w-full" />
        </div>
      ))}
    </div>
  );
}

function ThreadListError({ error, onRetry }) {
  return (
    <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-4" data-testid="gmail-thread-list-error">
      <div className="flex items-start gap-3">
        <AlertTriangle size={17} className="mt-0.5 shrink-0 text-danger" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">Posteingang konnte nicht geladen werden</p>
          <p className="mt-1 break-words text-xs leading-5 text-inkmed">{error?.response?.data?.detail || error?.message || "Bitte versuchen Sie es erneut."}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-xs font-semibold text-ink transition-colors hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            data-testid="gmail-retry-threads-btn"
          >
            <RefreshCw size={12} /> Erneut versuchen
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Message display                                                             */
/* -------------------------------------------------------------------------- */

function EmailContent({ message }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const plainBody = message.body || message.snippet || "Der Inhalt dieser Nachricht ist nicht verfügbar.";
  const hasHtmlBody = Boolean(message.htmlBody);
  const isLong = plainBody.length > 2400 || message.htmlBody?.length > 4200;

  return (
    <div className="mt-4">
      <div className={cn("relative", isLong && !isExpanded && "max-h-[460px] overflow-hidden")}>
        {hasHtmlBody ? (
          <div className="gmail-rich-content" dangerouslySetInnerHTML={{ __html: message.htmlBody }} />
        ) : (
          <div className="whitespace-pre-wrap break-words text-sm leading-6 text-ink">{plainBody}</div>
        )}
        {isLong && !isExpanded && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-surface via-surface/90 to-transparent" />}
      </div>
      {isLong && (
        <button
          type="button"
          onClick={() => setIsExpanded((value) => !value)}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-info underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          aria-expanded={isExpanded}
          data-testid={`gmail-message-expand-${message.id}`}
        >
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {isExpanded ? "Nachricht einklappen" : "Vollständige Nachricht anzeigen"}
        </button>
      )}
    </div>
  );
}

function AttachmentList({ attachments }) {
  if (!attachments?.length) return null;
  return (
    <div className="mt-4 border-t border-line pt-3" data-testid="gmail-message-attachments">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-inkmed">Anhänge ({attachments.length})</p>
      <div className="flex flex-wrap gap-2">
        {attachments.map((attachment, index) => (
          <div key={`${attachment.filename}-${index}`} className="inline-flex max-w-full items-center gap-2 rounded-md border border-line bg-subtle px-2.5 py-1.5 text-xs text-ink">
            <FileText size={13} className="shrink-0 text-info" />
            <span className="truncate font-medium">{attachment.filename || "Unbenannter Anhang"}</span>
            <span className="shrink-0 text-[10px] text-inkmed">{formatFileMeta(attachment)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MessageCard({ message }) {
  const [showDetails, setShowDetails] = useState(false);
  const isOutbound = message.direction === "out";
  const senderName = extractName(message.from);
  const senderEmail = extractEmail(message.from);
  const recipient = message.to || "Empfänger nicht verfügbar";

  return (
    <article
      data-testid={`gmail-message-${message.id}`}
      className={cn(
        "rounded-lg border bg-surface p-4 shadow-sm sm:p-5",
        isOutbound ? "border-blue-200" : "border-line"
      )}
    >
      <header className="flex items-start gap-3">
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold", avatarTone(senderName))} aria-hidden="true">
          {getInitials(senderName)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="truncate text-sm font-semibold text-ink" title={senderName}>{senderName}</h3>
            {isOutbound && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-info">Gesendet</span>}
          </div>
          <p className="mt-0.5 truncate text-xs text-inkmed" title={senderEmail || message.from}>{senderEmail || message.from || "Absender nicht verfügbar"}</p>
          <p className="mt-1 text-xs text-inkmed">an <span className="font-medium text-ink">{extractName(recipient) || recipient}</span></p>
        </div>
        <div className="flex shrink-0 items-start gap-1">
          <time className="hidden pt-1 text-right text-[11px] leading-4 text-inkmed sm:block" dateTime={message.date} title={formatFullDate(message.date)}>
            {formatFullDate(message.date)}
          </time>
          <button
            type="button"
            onClick={() => setShowDetails((value) => !value)}
            aria-expanded={showDetails}
            aria-label="Nachrichtendetails anzeigen"
            className="rounded-md p-1 text-inkmed transition-colors hover:bg-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            data-testid={`gmail-message-details-${message.id}`}
          >
            {showDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </header>

      <p className="mt-3 text-[11px] text-inkmed sm:hidden">{formatFullDate(message.date)}</p>

      {showDetails && (
        <dl className="mt-4 grid gap-x-4 gap-y-2 rounded-md border border-line bg-subtle/60 p-3 text-xs sm:grid-cols-[72px_minmax(0,1fr)]" data-testid={`gmail-message-details-content-${message.id}`}>
          <dt className="font-semibold text-inkmed">Von</dt><dd className="break-words text-ink">{message.from || "—"}</dd>
          <dt className="font-semibold text-inkmed">An</dt><dd className="break-words text-ink">{message.to || "—"}</dd>
          <dt className="font-semibold text-inkmed">Datum</dt><dd className="text-ink">{formatFullDate(message.date)}</dd>
          {message.subject && <><dt className="font-semibold text-inkmed">Betreff</dt><dd className="break-words text-ink">{message.subject}</dd></>}
        </dl>
      )}

      <EmailContent message={message} />
      <AttachmentList attachments={message.attachments} />
    </article>
  );
}

function ThreadSkeleton() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-canvas" data-testid="gmail-thread-loading" aria-label="Konversation wird geladen">
      <div className="border-b border-line bg-surface px-5 py-4"><Skeleton className="h-5 w-2/3" /><Skeleton className="mt-2 h-3 w-48" /></div>
      <div className="space-y-3 overflow-y-auto p-4 sm:p-5">
        {[...Array(3)].map((_, index) => <Skeleton key={index} className={cn("h-44 w-full", index === 1 && "h-60")} />)}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* AI composer                                                                 */
/* -------------------------------------------------------------------------- */

const AI_REPLY_PROFILE_OPTIONS = [
  { id: "", label: "Automatisch aus Anliegen erkennen" },
  { id: "delivery_status", label: "Lieferstatus & Verzögerung" },
  { id: "pickup_appointment", label: "Abholung & Termin" },
  { id: "order_change_or_payment", label: "Bestellung, Änderung & Zahlung" },
  { id: "cancellation_or_refund", label: "Stornierung & Erstattung" },
  { id: "technical_or_parts", label: "Produkt, Technik & Ersatzteile" },
  { id: "clarification", label: "Klärungsfrage" },
];

function AiDraftPanel({ draft, factsUsed, disclaimer, onDismiss }) {
  if (!draft) return null;
  return (
    <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50/70 p-3" data-testid="ai-draft-info">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-info"><Sparkles size={14} /> KI-Entwurf bereit zur Prüfung</p>
          <p className="mt-1 text-[11px] leading-4 text-inkmed">Der Entwurf wurde nicht versendet. Prüfen und bearbeiten Sie ihn vor dem Versand.</p>
        </div>
        <button type="button" onClick={onDismiss} className="shrink-0 text-[11px] font-medium text-inkmed hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">Hinweis ausblenden</button>
      </div>
      {factsUsed?.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Für den Entwurf berücksichtigter Kontext">
          {factsUsed.map((fact, index) => <li key={index} className="rounded-full border border-blue-200 bg-surface px-2 py-0.5 text-[10px] text-inkmed">{fact}</li>)}
        </ul>
      )}
      {disclaimer && <p className="mt-2 text-[11px] italic leading-4 text-inkmed">{disclaimer}</p>}
    </div>
  );
}

function DraftPlanPanel({ plan }) {
  if (!plan) return null;
  const hasWarnings = plan.risk_flags?.some((flag) => flag !== "operator_review_required");
  return (
    <div className="mb-3 rounded-lg border border-line bg-subtle/70 p-3" data-testid="gmail-ai-draft-plan">
      <div className="flex items-start gap-2">
        {hasWarnings ? <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" /> : <ShieldCheck size={15} className="mt-0.5 shrink-0 text-ok" />}
        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink">Kontext für diesen Entwurf</p>
          <p className="mt-0.5 text-[11px] leading-4 text-inkmed">
            {plan.reply_profile?.label || "Automatisch erkannt"} · {plan.language || "Sprache wird geprüft"} · {plan.formality || "neutrale Anrede"}
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Erkannte Kontextsignale">
        {plan.order_reference_detected
          ? <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] text-ok">Auftragsreferenz erkannt</span>
          : <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-warn">Auftragsreferenz nicht eindeutig</span>}
        {plan.risk_flags?.filter((flag) => flag !== "operator_review_required").map((flag) => (
          <span key={flag} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-warn">Prüfung erforderlich</span>
        ))}
      </div>
      {plan.missing_information?.length > 0 && (
        <p className="mt-2 text-[11px] leading-4 text-inkmed"><span className="font-semibold text-ink">Fehlende Angaben:</span> {plan.missing_information.join(" · ")}</p>
      )}
    </div>
  );
}

const SHOPIFY_FACT_FALLBACKS = {
  reference_missing: "Keine eindeutige Bestellreferenz im Thread erkannt.",
  reference_ambiguous: "Mehrere Bestellreferenzen erkannt; es wurden keine Shopify-Daten verwendet.",
  active_snapshot_missing: "Kein aktiver Shopify-Snapshot verfügbar; es wurden keine Shopify-Daten verwendet.",
  order_not_found: "Die Bestellreferenz wurde im aktiven Shopify-Snapshot nicht gefunden.",
  order_ambiguous: "Die Bestellreferenz ist im aktiven Shopify-Snapshot nicht eindeutig.",
  invalid_snapshot_record: "Für die Bestellreferenz stehen keine sicher verwendbaren Shopify-Fakten bereit.",
};

function ShopifyFactCard({ facts, status }) {
  if (!facts) {
    const fallback = SHOPIFY_FACT_FALLBACKS[status];
    return fallback ? <p className="mb-3 text-[11px] leading-4 text-inkmed" data-testid="gmail-shopify-facts-fallback">{fallback}</p> : null;
  }
  const statusRows = [
    ["Zahlung", facts.financial_status],
    ["Fulfillment", facts.fulfillment_status],
    ["Rückgabe", facts.return_status],
    ["Versandart", facts.delivery_method],
  ].filter(([, value]) => value);
  return (
    <section className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50/65 p-3" data-testid="gmail-shopify-facts">
      <div className="flex items-start gap-2">
        <ShieldCheck size={15} className="mt-0.5 shrink-0 text-ok" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink">Verifizierte Shopify-Fakten</p>
          <p className="mt-0.5 text-[11px] leading-4 text-inkmed">Aktiver, schreibgeschützter Snapshot · Stand {facts.snapshot_synced_at ? formatFullDate(facts.snapshot_synced_at) : "nicht verfügbar"}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="rounded-full border border-emerald-200 bg-surface px-2 py-0.5 text-[10px] text-ok">{facts.order_reference}</span>
        {facts.cancelled && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-warn">Storno im Snapshot markiert</span>}
      </div>
      {statusRows.length > 0 && (
        <dl className="mt-2 grid gap-x-3 gap-y-1 text-[11px] sm:grid-cols-2">
          {statusRows.map(([label, value]) => <div key={label} className="flex min-w-0 justify-between gap-2"><dt className="text-inkmed">{label}</dt><dd className="truncate font-medium text-ink">{value}</dd></div>)}
        </dl>
      )}
      {facts.tracking_numbers?.length > 0 && <p className="mt-2 text-[11px] leading-4 text-inkmed"><span className="font-semibold text-ink">Tracking:</span> {facts.tracking_numbers.join(" · ")}</p>}
      {facts.line_items?.length > 0 && <p className="mt-1 text-[11px] leading-4 text-inkmed"><span className="font-semibold text-ink">Artikel:</span> {facts.line_items.map((item) => `${item.quantity}× ${item.title}`).join(" · ")}</p>}
    </section>
  );
}

function Composer({ thread, aiAvailable, onSent }) {
  const [draft, setDraft] = useState("");
  const [aiMeta, setAiMeta] = useState(null);
  const [aiInstructions, setAiInstructions] = useState("");
  const [selectedProfile, setSelectedProfile] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showGuidance, setShowGuidance] = useState(false);

  useEffect(() => {
    setDraft("");
    setAiMeta(null);
    setAiInstructions("");
    setSelectedProfile("");
    setShowConfirm(false);
    setShowGuidance(false);
  }, [thread?.id]);

  const lastInbound = [...(thread?.messages || [])].reverse().find((message) => message.direction === "in");
  const replyTo = lastInbound ? extractEmail(lastInbound.from) : "";
  const replySubject = thread?.subject
    ? (/^(?:re|aw):/i.test(thread.subject) ? thread.subject : `Re: ${thread.subject}`)
    : "Antwort im bestehenden Thread";

  const handleGenerateAiDraft = async () => {
    if (!thread?.id || !aiAvailable) return;
    setIsGenerating(true);
    setAiMeta(null);
    setShowConfirm(false);
    try {
      const result = await api.gmailAiReply(thread.id, {
        instructions: aiInstructions.trim() || undefined,
        profile_id: selectedProfile || undefined,
      });
      setDraft(result.draft || "");
      setAiMeta(result);
      toast.success("KI-Entwurf generiert", { description: "Der Entwurf kann vor dem Versand vollständig bearbeitet werden." });
    } catch (error) {
      toast.error("KI-Entwurf fehlgeschlagen", { description: error?.response?.data?.detail || error.message });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSend = async () => {
    if (!draft.trim() || !replyTo || !thread?.id) return;
    setIsSending(true);
    try {
      await api.gmailSend({ content: draft.trim(), thread_id: thread.id });
      toast.success("E-Mail gesendet", { description: `Die Antwort wurde an ${replyTo} im bestehenden Thread gesendet.` });
      setDraft("");
      setAiMeta(null);
      setAiInstructions("");
      setShowConfirm(false);
      onSent?.();
    } catch (error) {
      toast.error("Senden fehlgeschlagen", { description: error?.response?.data?.detail || error.message });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section className="border-t border-line bg-surface px-4 py-4 shadow-[0_-6px_18px_rgba(23,32,42,0.04)] sm:px-5" data-testid="gmail-composer" aria-label="Antwort verfassen">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">Antwort verfassen</h2>
          <p className="mt-0.5 truncate text-xs text-inkmed" title={replyTo ? `An: ${replyTo}` : "Antwort nicht verfügbar"}>
            {replyTo ? <>An <span className="font-medium text-ink">{replyTo}</span> · {replySubject}</> : "Für diesen Thread ist keine eingehende Nachricht für eine Antwort verfügbar."}
          </p>
        </div>
        <span className="rounded-full bg-subtle px-2 py-1 text-[10px] font-medium text-inkmed">Wird im bestehenden Thread gesendet</span>
      </div>

      {aiMeta && <AiDraftPanel draft={aiMeta.draft} factsUsed={aiMeta.facts_used} disclaimer={aiMeta.disclaimer} onDismiss={() => setAiMeta(null)} />}
      {aiMeta?.draft_plan && <DraftPlanPanel plan={aiMeta.draft_plan} />}
      {aiMeta && <ShopifyFactCard facts={aiMeta.shopify_facts} status={aiMeta.draft_plan?.shopify_fact_status} />}

      {aiAvailable ? (
        <div className="mb-3 rounded-md border border-line bg-subtle/55">
          <div className="border-b border-line px-3 py-2.5">
            <label htmlFor={`gmail-ai-profile-${thread?.id}`} className="text-xs font-semibold text-ink">Antwortprofil</label>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <select
                id={`gmail-ai-profile-${thread?.id}`}
                value={selectedProfile}
                onChange={(event) => setSelectedProfile(event.target.value)}
                className="h-9 max-w-full rounded-md border border-line bg-surface px-2 text-xs text-ink outline-none transition-colors focus:ring-2 focus:ring-brand"
                data-testid="gmail-ai-profile-select"
              >
                {AI_REPLY_PROFILE_OPTIONS.map((profile) => <option key={profile.id || "auto"} value={profile.id}>{profile.label}</option>)}
              </select>
              <p className="text-[11px] leading-4 text-inkmed">Steuert nur den nächsten Entwurf und wird nicht gespeichert.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowGuidance((value) => !value)}
            aria-expanded={showGuidance}
            className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-xs font-semibold text-ink transition-colors hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
            data-testid="gmail-ai-guidance-toggle"
          >
            <span className="flex items-center gap-2"><Sparkles size={14} className="text-info" /> Hinweise für den KI-Entwurf <span className="font-normal text-inkmed">(optional)</span></span>
            {showGuidance ? <ChevronUp size={15} className="text-inkmed" /> : <ChevronDown size={15} className="text-inkmed" />}
          </button>
          {showGuidance && (
            <div className="border-t border-line px-3 pb-3 pt-2.5">
              <div className="flex items-start justify-between gap-3">
                <p className="max-w-2xl text-[11px] leading-4 text-inkmed">Ergänzen Sie konkrete Informationen, Tonalität oder offene Fragen. Diese Hinweise steuern ausschließlich den nächsten Entwurf und werden weder gespeichert noch versendet.</p>
                <span className="tnum shrink-0 text-[10px] text-inkmed">{aiInstructions.length}/500</span>
              </div>
              <Textarea
                id={`gmail-ai-instructions-${thread?.id}`}
                value={aiInstructions}
                onChange={(event) => setAiInstructions(event.target.value.slice(0, 500))}
                placeholder="Beispiel: Bitte nach der Bestellnummer fragen und noch keinen Liefertermin zusagen."
                className="mt-2 min-h-20 resize-y bg-surface text-xs leading-5"
                maxLength={500}
                data-testid="gmail-ai-instructions-input"
              />
            </div>
          )}
        </div>
      ) : (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-inkmed" data-testid="gmail-ai-unavailable">
          <span className="font-semibold text-warn">KI-Entwürfe sind derzeit nicht verfügbar.</span> Eine Antwort kann weiterhin manuell erstellt und nach Bestätigung gesendet werden.
        </div>
      )}

      <Textarea
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          if (aiMeta) setAiMeta({ ...aiMeta, disclaimer: "KI-Entwurf wurde manuell bearbeitet. Bitte prüfen Sie die finale Antwort vor dem Versand." });
        }}
        placeholder={replyTo ? "Antwort schreiben…" : "Für diesen Thread kann keine Antwort vorbereitet werden."}
        disabled={!replyTo}
        className="min-h-32 resize-y bg-surface text-sm leading-6"
        data-testid="gmail-composer-input"
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {aiAvailable && (
            <button
              type="button"
              onClick={handleGenerateAiDraft}
              disabled={isGenerating || !thread?.id || !replyTo}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-info transition-colors hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="gmail-ai-draft-btn"
            >
              {isGenerating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {isGenerating ? "Entwurf wird erstellt…" : draft ? "KI-Entwurf aktualisieren" : "KI-Entwurf erstellen"}
            </button>
          )}
          <span className="text-[11px] text-inkmed">{draft.trim().length ? `${draft.trim().length} Zeichen` : "Noch kein Entwurf"}</span>
        </div>

        {!showConfirm ? (
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            disabled={!draft.trim() || !replyTo}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
            data-testid="gmail-prepare-send-btn"
          >
            <Send size={14} /> Senden vorbereiten
          </button>
        ) : (
          <div className="flex flex-wrap items-center justify-end gap-2 rounded-md border border-amber-200 bg-amber-50 p-2" data-testid="gmail-send-confirmation">
            <AlertTriangle size={15} className="shrink-0 text-warn" />
            <span className="text-xs text-ink">An <strong>{replyTo}</strong> senden?</span>
            <button
              type="button"
              onClick={handleSend}
              disabled={isSending}
              className="inline-flex h-8 items-center gap-1 rounded-md bg-brand px-3 text-xs font-semibold text-white transition-colors hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
              data-testid="gmail-confirm-send-btn"
            >
              {isSending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
              Jetzt senden
            </button>
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              className="h-8 rounded-md border border-line bg-surface px-2.5 text-xs font-semibold text-inkmed transition-colors hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              data-testid="gmail-cancel-send-btn"
            >
              Abbrechen
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Gmail connection states                                                     */
/* -------------------------------------------------------------------------- */

function GmailConnectionPanel({ status, statusError, onConnect, onDisconnect, disconnecting }) {
  if (statusError) {
    return (
      <div className="m-auto max-w-lg p-4">
        <InlineAlert toneName="danger" title="Gmail-Status nicht verfügbar">Der Verbindungsstatus konnte nicht geladen werden. Bitte aktualisieren Sie die Seite oder prüfen Sie die Backend-Protokolle.</InlineAlert>
      </div>
    );
  }

  if (status?.lifecycle_state === "paused") {
    return (
      <div className="m-auto max-w-lg p-4" data-testid="gmail-paused-panel">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 shrink-0 text-warn" size={19} />
            <div>
              <h1 className="text-base font-semibold text-ink">Gmail-Verbindung ist pausiert</h1>
              <p className="mt-1 text-sm leading-6 text-inkmed">Der Lese- und Antwortzugriff ist durch die lokale Betriebssteuerung pausiert. Prüfen Sie den Integrationsstatus, bevor Sie den Posteingang wieder verwenden.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!status?.oauth_configured) {
    const missing = (status?.missing_configuration || []).join(", ");
    return (
      <div className="m-auto max-w-2xl p-4" data-testid="gmail-oauth-config-required">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 shrink-0 text-warn" size={19} />
            <div>
              <h1 className="text-base font-semibold text-ink">Google OAuth muss konfiguriert werden</h1>
              <p className="mt-1 text-sm leading-6 text-inkmed">Hinterlegen Sie die Google-Client-ID, das Client-Secret und den Token-Verschlüsselungsschlüssel in der lokalen Docker-Umgebung. Die registrierte Redirect-URI muss exakt mit der in der Konsole angegebenen URI übereinstimmen.</p>
              {missing && <p className="mt-3 text-xs text-inkmed">Fehlende Konfiguration: {missing}</p>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!status?.connected) {
    return (
      <div className="m-auto max-w-2xl p-4" data-testid="gmail-oauth-connect-panel">
        <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-blue-200 bg-surface text-info"><Mail size={20} /></div>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-ink">Gmail-Konto verbinden</h1>
              <p className="mt-1.5 max-w-xl text-sm leading-6 text-inkmed">Verbinden Sie ein Gmail-Konto über Google OAuth. Danach können Sie Konversationen lesen und Antworten nach einer bewussten Bestätigung im bestehenden Thread senden.</p>
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-inkmed">
                <span className="inline-flex items-center gap-1"><ShieldCheck size={13} /> Verschlüsselte Refresh-Tokens</span>
                <span>Kein Passwort wird gespeichert</span>
              </div>
              <button type="button" onClick={onConnect} className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-md bg-brand px-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2" data-testid="gmail-connect-btn">
                <Link2 size={15} /> Mit Google verbinden
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="m-auto max-w-lg p-4">
      <InlineAlert toneName="warning" title="Gmail wird vorbereitet">Die Verbindung ist vorhanden, aber noch nicht für den Posteingang freigegeben. Prüfen Sie den Integrationsstatus oder aktualisieren Sie die Seite.</InlineAlert>
      <button type="button" onClick={onDisconnect} disabled={disconnecting} className="mt-3 inline-flex h-8 items-center gap-1 rounded-md border border-red-200 bg-surface px-2.5 text-xs font-semibold text-danger transition-colors hover:bg-red-50 disabled:opacity-50" data-testid="gmail-disconnect-btn">
        {disconnecting ? <Loader2 size={12} className="animate-spin" /> : <Unplug size={12} />} Verbindung trennen
      </button>
    </div>
  );
}

function ConnectedStatus({ status, onDisconnect, disconnecting }) {
  if (!status?.connected || status.lifecycle_state !== "active") return null;
  return (
    <div className="mx-4 mt-3 flex items-start justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5" data-testid="gmail-connected-status">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-ok"><CheckCircle2 size={14} /> Verbunden</p>
        <p className="mt-0.5 truncate text-[11px] text-inkmed" title={status.email_address}>{status.email_address}</p>
      </div>
      <button type="button" onClick={onDisconnect} disabled={disconnecting} className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold text-danger transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50" data-testid="gmail-disconnect-btn">
        {disconnecting ? <Loader2 size={11} className="animate-spin" /> : <Unplug size={11} />} Trennen
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Main workspace                                                              */
/* -------------------------------------------------------------------------- */

export default function GmailInbox() {
  const [params, setParams] = useSearchParams();
  const initialQuery = params.get("q") || "";
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [activeSearch, setActiveSearch] = useState(initialQuery);
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [extraThreads, setExtraThreads] = useState([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const { data: gmailStatus, error: gmailStatusError, isLoading: gmailStatusLoading, mutate: mutateGmailStatus } = useSWR(
    "gmail-status",
    api.gmailStatus,
    { revalidateOnFocus: false }
  );
  const gmailReady = Boolean(gmailStatus?.connected && gmailStatus?.lifecycle_state === "active");

  useEffect(() => {
    const oauthResult = params.get("oauth");
    if (!oauthResult) return;
    const messages = {
      connected: ["success", "Gmail-Konto erfolgreich verbunden"],
      cancelled: ["info", "Google-Verbindung wurde abgebrochen"],
      failed: ["error", "Google-Verbindung konnte nicht abgeschlossen werden"],
    };
    const message = messages[oauthResult];
    if (message) toast[message[0]](message[1]);
    const next = new URLSearchParams(params);
    next.delete("oauth");
    setParams(next, { replace: true });
    mutateGmailStatus();
  }, [mutateGmailStatus, params, setParams]);

  const { data: threadsData, error: threadsError, isLoading: threadsLoading, mutate: mutateThreads } = useSWR(
    gmailReady ? ["gmail-threads", activeSearch] : null,
    () => api.gmailThreads({ q: activeSearch || undefined, max_results: 30 }),
    { revalidateOnFocus: false }
  );

  const { data: threadDetail, error: threadError, isLoading: threadLoading, mutate: mutateThread } = useSWR(
    gmailReady && selectedThreadId ? ["gmail-thread", selectedThreadId] : null,
    () => api.gmailThread(selectedThreadId),
    { revalidateOnFocus: false }
  );

  const baseThreads = threadsData?.threads || [];
  const threads = deduplicateThreads([...baseThreads, ...extraThreads]);
  const userEmail = threadsData?.userEmail || gmailStatus?.email_address || "";

  useEffect(() => {
    setExtraThreads([]);
  }, [activeSearch, threadsData?.syncedAt]);

  const updateSearch = (nextSearch) => {
    setSearchQuery(nextSearch);
    setActiveSearch(nextSearch);
    setParams(nextSearch ? { q: nextSearch } : {});
    setSelectedThreadId(null);
    setExtraThreads([]);
  };

  const handleSearch = (event) => {
    event.preventDefault();
    if (gmailReady) updateSearch(searchQuery.trim());
  };

  const handleRefresh = async () => {
    try {
      setExtraThreads([]);
      await mutateGmailStatus();
      if (gmailReady) {
        await mutateThreads();
        if (selectedThreadId) await mutateThread();
      }
      toast.success("Posteingang aktualisiert");
    } catch (error) {
      toast.error("Posteingang konnte nicht aktualisiert werden", { description: error?.response?.data?.detail || error.message });
    }
  };

  const handleLoadMore = async () => {
    const pageToken = threadsData?.nextPageToken;
    if (!pageToken || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const result = await api.gmailThreads({ q: activeSearch || undefined, max_results: 30, page_token: pageToken });
      setExtraThreads((previous) => deduplicateThreads([...previous, ...(result?.threads || [])]));
      if (result?.nextPageToken) {
        mutateThreads({ ...threadsData, nextPageToken: result.nextPageToken }, false);
      } else {
        mutateThreads({ ...threadsData, nextPageToken: null }, false);
      }
    } catch (error) {
      toast.error("Weitere E-Mails konnten nicht geladen werden", { description: error?.response?.data?.detail || error.message });
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleConnect = () => window.location.assign(api.gmailOAuthStartUrl());

  const handleDisconnect = async () => {
    if (!window.confirm("Gmail-Verbindung wirklich trennen? Der Google-Zugriff wird widerrufen und der lokale verschlüsselte Refresh-Token gelöscht.")) return;
    setDisconnecting(true);
    try {
      await api.gmailDisconnect();
      setSelectedThreadId(null);
      setExtraThreads([]);
      await mutateGmailStatus();
      toast.success("Gmail-Verbindung wurde getrennt");
    } catch (error) {
      toast.error("Gmail-Verbindung konnte nicht getrennt werden", { description: error?.response?.data?.detail || error.message });
    } finally {
      setDisconnecting(false);
    }
  };

  const shouldShowList = !selectedThreadId;
  const shouldShowThread = Boolean(selectedThreadId);

  return (
    <div className="h-[calc(100dvh-56px)] overflow-hidden bg-canvas" data-testid="gmail-inbox-page">
      <div className="flex h-full overflow-hidden">
        <aside className={cn("h-full w-full shrink-0 flex-col border-r border-line bg-surface xl:flex xl:w-[360px] 2xl:w-[380px]", shouldShowList ? "flex" : "hidden")} aria-label="Gmail-Posteingang">
          <div className="shrink-0 border-b border-line bg-surface px-4 pb-3 pt-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2"><Mail size={19} className="text-info" /><h1 className="text-lg font-semibold text-ink">Gmail</h1></div>
                <p className="mt-1 text-xs text-inkmed">Posteingang und Kundenkorrespondenz</p>
              </div>
              <button type="button" onClick={handleRefresh} disabled={gmailStatusLoading} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line text-inkmed transition-colors hover:bg-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50" title="Posteingang aktualisieren" aria-label="Posteingang aktualisieren" data-testid="gmail-refresh-btn">
                <RefreshCw size={14} className={gmailStatusLoading ? "animate-spin" : ""} />
              </button>
            </div>
            {userEmail ? <p className="mt-2 truncate text-[11px] text-inkmed" title={userEmail}>{userEmail}</p> : <p className="mt-2 text-[11px] text-inkmed">{gmailStatusLoading ? "Verbindungsstatus wird geprüft…" : "Kein Gmail-Konto verbunden"}</p>}

            <form onSubmit={handleSearch} className="mt-3">
              <label className="sr-only" htmlFor="gmail-search">E-Mails durchsuchen</label>
              <div className="relative">
                <Search size={15} className="pointer-events-none absolute left-3 top-2.5 text-inkmed" />
                <Input id="gmail-search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="E-Mails durchsuchen…" disabled={!gmailReady} className="h-9 pr-20 pl-9 text-xs" data-testid="gmail-search-input" />
                <button type="submit" disabled={!gmailReady} className="absolute right-1 top-1 h-7 rounded-md px-2 text-[11px] font-semibold text-info transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-inkmed" data-testid="gmail-search-submit-btn">Suchen</button>
              </div>
            </form>

            <div className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Schnellfilter">
              {[
                ["", "Alle"],
                ["is:unread", "Ungelesen"],
                ["is:starred", "Markiert"],
                ["from:customer", "Kunden"],
              ].map(([query, label]) => (
                <button
                  type="button"
                  key={query}
                  disabled={!gmailReady}
                  onClick={() => updateSearch(query)}
                  className={cn("rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50", activeSearch === query ? "border-brand bg-brand text-white" : "border-line bg-surface text-inkmed hover:border-brand/40 hover:text-ink")}
                  data-testid={`gmail-filter-${label.toLowerCase()}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <ConnectedStatus status={gmailStatus} onDisconnect={handleDisconnect} disconnecting={disconnecting} />

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-testid="gmail-thread-list">
            {!gmailReady ? (
              <div className="m-auto max-w-xs px-6 py-10 text-center">
                <Inbox size={28} className="mx-auto text-inkmed" />
                <p className="mt-3 text-sm font-semibold text-ink">Posteingang noch nicht verfügbar</p>
                <p className="mt-1.5 text-xs leading-5 text-inkmed">{gmailStatusLoading ? "Der Gmail-Verbindungsstatus wird geladen." : "Verbinden Sie zunächst ein Gmail-Konto oder prüfen Sie den Integrationsstatus."}</p>
              </div>
            ) : threadsLoading ? <InboxSkeleton /> : threadsError ? <ThreadListError error={threadsError} onRetry={() => mutateThreads()} /> : threads.length === 0 ? (
              <div className="m-auto px-6 py-10"><EmptyState title={activeSearch ? "Keine passenden E-Mails" : "Keine E-Mails im Posteingang"} description={activeSearch ? "Passen Sie Ihre Suche an oder wählen Sie einen Schnellfilter." : "Sobald neue E-Mails vorhanden sind, erscheinen sie hier."} /></div>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-line bg-subtle/50 px-4 py-2 text-[11px] text-inkmed"><span>{activeSearch ? `Suchergebnisse für „${activeSearch}“` : "Konversationen"}</span><span className="tnum">{threads.length} geladen</span></div>
                {threads.map((thread) => <ThreadListItem key={thread.id} thread={thread} isActive={selectedThreadId === thread.id} onClick={() => setSelectedThreadId(thread.id)} />)}
                {threadsData?.nextPageToken && (
                  <div className="p-3"><button type="button" onClick={handleLoadMore} disabled={isLoadingMore} className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-line bg-surface text-xs font-semibold text-ink transition-colors hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50" data-testid="gmail-load-more-btn">{isLoadingMore ? <Loader2 size={13} className="animate-spin" /> : <ChevronDown size={14} />} {isLoadingMore ? "Weitere E-Mails werden geladen…" : "Weitere E-Mails laden"}</button></div>
                )}
              </>
            )}
          </div>
        </aside>

        <main className={cn("min-h-0 min-w-0 flex-1 flex-col bg-canvas xl:flex", shouldShowThread ? "flex" : "hidden")} aria-label="E-Mail-Konversation">
          {!gmailReady ? (
            <GmailConnectionPanel status={gmailStatus} statusError={gmailStatusError} onConnect={handleConnect} onDisconnect={handleDisconnect} disconnecting={disconnecting} />
          ) : !selectedThreadId ? (
            <div className="m-auto max-w-sm px-6 text-center" data-testid="gmail-thread-empty-state">
              <Mail size={32} className="mx-auto text-inkmed" />
              <h2 className="mt-4 text-base font-semibold text-ink">Konversation auswählen</h2>
              <p className="mt-1.5 text-sm leading-6 text-inkmed">Wählen Sie eine E-Mail aus der Liste, um den vollständigen Verlauf zu lesen und zu beantworten.</p>
            </div>
          ) : threadLoading ? <ThreadSkeleton /> : threadDetail ? (
            <>
              <header className="shrink-0 border-b border-line bg-surface px-4 py-3 sm:px-5" data-testid="gmail-thread-header">
                <div className="mx-auto flex w-full max-w-[960px] items-start gap-3">
                  <button type="button" onClick={() => setSelectedThreadId(null)} className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-inkmed transition-colors hover:bg-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand xl:hidden" aria-label="Zurück zum Posteingang" data-testid="gmail-back-to-list-btn"><ArrowLeft size={17} /></button>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-inkmed">Konversation</p>
                    <h2 className="mt-0.5 break-words text-base font-semibold leading-6 text-ink sm:text-lg">{threadDetail.subject || "(Kein Betreff)"}</h2>
                    <p className="mt-1 text-xs text-inkmed">{threadDetail.messageCount} Nachricht{threadDetail.messageCount !== 1 ? "en" : ""} · Letzte Aktivität {formatFullDate(threadDetail.date)}</p>
                  </div>
                  <button type="button" onClick={() => mutateThread()} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line text-inkmed transition-colors hover:bg-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" aria-label="Konversation aktualisieren" title="Konversation aktualisieren" data-testid="gmail-refresh-thread-btn"><RefreshCw size={14} /></button>
                </div>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5 lg:px-8 xl:px-10" data-testid="gmail-message-thread">
                <div className="mx-auto w-full max-w-[960px] space-y-3">
                  {threadDetail.messages?.map((message) => <MessageCard key={message.id} message={message} />)}
                </div>
              </div>
              <div className="mx-auto w-full max-w-[960px] shrink-0"><Composer thread={threadDetail} aiAvailable={Boolean(gmailStatus?.ai_available)} onSent={() => { mutateThread(); mutateThreads(); }} /></div>
            </>
          ) : (
            <div className="m-auto max-w-lg p-4"><ThreadListError error={threadError} onRetry={() => mutateThread()} /></div>
          )}
        </main>
      </div>
    </div>
  );
}
