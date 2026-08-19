import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import useSWR from "swr";
import { api } from "@/lib/api";
import { PageHeader, EmptyState, InlineAlert } from "@/components/common";
import { useT } from "@/lib/i18n";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Mail,
  Search,
  Sparkles,
  Send,
  RefreshCw,
  ArrowLeft,
  Paperclip,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Link2,
  ShieldCheck,
  Unplug,
} from "lucide-react";

/* -------------------------------------------------------------------------- */
/* Helper functions                                                            */
/* -------------------------------------------------------------------------- */

function formatDate(isoDate) {
  if (!isoDate) return "";
  const d = new Date(isoDate);
  const now = new Date();
  const diffMs = now - d;
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 1) {
    const mins = Math.floor(diffMs / (1000 * 60));
    return `vor ${mins} Min.`;
  }
  if (diffHours < 24) {
    return d.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
  }
  if (diffHours < 48) return "Gestern";
  return d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatFullDate(isoDate) {
  if (!isoDate) return "";
  const d = new Date(isoDate);
  return d.toLocaleDateString("de-CH", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function extractName(fromHeader) {
  if (!fromHeader) return "Unbekannt";
  const match = fromHeader.match(/^"?([^"<]+)"?\s*</);
  if (match) return match[1].trim();
  if (!fromHeader.includes("<") && fromHeader.includes("@")) return fromHeader.split("@")[0];
  return fromHeader;
}

function extractEmail(fromHeader) {
  if (!fromHeader) return "";
  const match = fromHeader.match(/<([^>]+)>/);
  if (match) return match[1];
  if (fromHeader.includes("@")) return fromHeader.trim();
  return "";
}

/* -------------------------------------------------------------------------- */
/* Thread List Item                                                            */
/* -------------------------------------------------------------------------- */

function ThreadListItem({ thread, isActive, onClick }) {
  const senderName = extractName(thread.from);
  const hasMultiple = thread.messageCount > 1;

  return (
    <button
      onClick={onClick}
      data-testid={`gmail-thread-${thread.id}`}
      className={cn(
        "flex w-full flex-col gap-0.5 border-b border-line px-3 py-2.5 text-left transition-colors hover:bg-subtle",
        isActive && "bg-blue-50/70 border-l-2 border-l-brand"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
          <Mail size={13} className="shrink-0 text-inkmed" />
          <span className="truncate">{senderName}</span>
          {hasMultiple && (
            <span className="shrink-0 rounded-full bg-subtle px-1.5 text-[10px] font-medium text-inkmed">
              {thread.messageCount}
            </span>
          )}
        </span>
        <span className="tnum shrink-0 text-[10px] text-inkmed">{formatDate(thread.date)}</span>
      </div>
      <p className="truncate text-xs font-medium text-ink">{thread.subject || "(Kein Betreff)"}</p>
      <p className="truncate text-xs text-inkmed">{thread.snippet}</p>
      {thread.hasAttachments && (
        <div className="mt-0.5 flex items-center gap-1 text-[10px] text-inkmed">
          <Paperclip size={10} /> Anhang
        </div>
      )}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Message Bubble                                                              */
/* -------------------------------------------------------------------------- */

function MessageBubble({ message }) {
  const isOutbound = message.direction === "out";
  const senderName = extractName(message.from);

  return (
    <div
      data-testid={`gmail-message-${message.direction}`}
      className={cn(
        "max-w-2xl rounded-lg border p-4 text-sm",
        isOutbound
          ? "ml-auto border-blue-200 bg-blue-50"
          : "border-line bg-surface"
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs text-inkmed">
          <span className="font-semibold text-ink">{senderName}</span>
          {isOutbound && (
            <span className="rounded bg-blue-100 px-1 py-0.5 text-[10px] font-medium text-info">Gesendet</span>
          )}
        </p>
        <span className="tnum text-[10px] text-inkmed">{formatFullDate(message.date)}</span>
      </div>
      <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
        {message.body}
      </div>
      {message.attachments?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {message.attachments.map((att, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded border border-line bg-subtle px-2 py-0.5 text-[10px] text-inkmed">
              <Paperclip size={9} /> {att.filename || "Anhang"}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* AI Draft Panel                                                              */
/* -------------------------------------------------------------------------- */

function AiDraftPanel({ draft, factsUsed, disclaimer, onDismiss }) {
  if (!draft) return null;

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3" data-testid="ai-draft-info">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-info">
          <Sparkles size={12} /> KI-generierter Entwurf
        </p>
        <button
          onClick={onDismiss}
          className="text-[10px] text-inkmed hover:text-ink"
        >
          Ausblenden
        </button>
      </div>
      {factsUsed?.length > 0 && (
        <ul className="mt-1.5 list-disc pl-4 text-[11px] text-inkmed">
          {factsUsed.map((fact, i) => (
            <li key={i}>{fact}</li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 text-[10px] text-inkmed italic">{disclaimer}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Composer                                                                    */
/* -------------------------------------------------------------------------- */

function Composer({ thread, onSent }) {
  const { t } = useT();
  const [draft, setDraft] = useState("");
  const [aiMeta, setAiMeta] = useState(null);
  const [aiInstructions, setAiInstructions] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Determine reply-to address from last inbound message
  const lastInbound = [...(thread?.messages || [])].reverse().find((m) => m.direction === "in");
  const replyTo = lastInbound ? extractEmail(lastInbound.from) : "";
  const replySubject = thread?.subject
    ? thread.subject.startsWith("Re:") ? thread.subject : `Re: ${thread.subject}`
    : "";

  const handleGenerateAiDraft = async () => {
    if (!thread?.id) return;
    setIsGenerating(true);
    setAiMeta(null);
    setShowConfirm(false);
    try {
      const result = await api.gmailAiReply(thread.id, {
        instructions: aiInstructions.trim() || undefined,
      });
      setDraft(result.draft || "");
      setAiMeta(result);
      toast.success("KI-Entwurf generiert");
    } catch (err) {
      toast.error("KI-Entwurf fehlgeschlagen: " + (err?.response?.data?.detail || err.message));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSend = async () => {
    if (!draft.trim() || !replyTo) return;
    setIsSending(true);
    try {
      await api.gmailSend({
        content: draft.trim(),
        thread_id: thread.id,
      });
      toast.success("E-Mail gesendet");
      setDraft("");
      setAiMeta(null);
      setAiInstructions("");
      setShowConfirm(false);
      if (onSent) onSent();
    } catch (err) {
      toast.error("Senden fehlgeschlagen: " + (err?.response?.data?.detail || err.message));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="border-t border-line bg-surface p-4" data-testid="gmail-composer">
      {/* Reply info */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-inkmed">
        <span>
          An: <span className="font-medium text-ink">{replyTo || "—"}</span>
        </span>
        <span className="text-[10px]">· Antwort im Thread</span>
      </div>

      {/* AI Draft metadata */}
      {aiMeta && (
        <AiDraftPanel
          draft={aiMeta.draft}
          factsUsed={aiMeta.facts_used}
          disclaimer={aiMeta.disclaimer}
          onDismiss={() => setAiMeta(null)}
        />
      )}

      {/* Optional, per-draft AI guidance. It is neither persisted nor sent as email content. */}
      <div className="mb-2 mt-3 rounded-md border border-line bg-subtle/40 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <label htmlFor={`gmail-ai-instructions-${thread?.id}`} className="text-xs font-semibold text-ink">Hinweise für die KI <span className="font-normal text-inkmed">(optional)</span></label>
            <p className="mt-0.5 text-[11px] leading-4 text-inkmed">Geben Sie nur die konkrete Information, Tonalität oder offene Frage für diesen Entwurf an. Die Hinweise werden nicht versendet und nur bei der nächsten KI-Generierung verwendet.</p>
          </div>
          <span className="shrink-0 text-[10px] text-inkmed">{aiInstructions.length}/500</span>
        </div>
        <Textarea
          id={`gmail-ai-instructions-${thread?.id}`}
          value={aiInstructions}
          onChange={(e) => setAiInstructions(e.target.value.slice(0, 500))}
          placeholder="Beispiel: Abholung ist möglich. Bitte nach gewünschtem Termin fragen und keinen Einbau zusagen."
          className="mt-2 min-h-20 resize-y bg-surface text-xs"
          maxLength={500}
          data-testid="gmail-ai-instructions-input"
        />
      </div>

      {/* Action buttons row */}
      <div className="mb-2 mt-2 flex flex-wrap items-center gap-2">
        <button
          onClick={handleGenerateAiDraft}
          disabled={isGenerating || !thread?.id}
          className="flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-info transition-colors hover:bg-blue-100 disabled:opacity-50"
          data-testid="gmail-ai-draft-btn"
        >
          {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {isGenerating ? "Generiere..." : "KI-Antwort generieren"}
        </button>
      </div>

      {/* Textarea */}
      <Textarea
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          if (aiMeta) setAiMeta({ ...aiMeta, disclaimer: "KI-Entwurf wurde manuell bearbeitet." });
        }}
        placeholder="Antwort schreiben…"
        className="min-h-32 text-sm"
        data-testid="gmail-composer-input"
      />

      {/* Send area */}
      <div className="mt-3 flex items-center gap-2">
        {!showConfirm ? (
          <button
            onClick={() => setShowConfirm(true)}
            disabled={!draft.trim() || !replyTo}
            className="flex h-9 items-center gap-1.5 rounded-md bg-brand px-4 text-sm font-medium text-white transition-colors hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-40"
            data-testid="gmail-prepare-send-btn"
          >
            <Send size={13} /> Senden vorbereiten
          </button>
        ) : (
          <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-2">
            <AlertTriangle size={14} className="text-warn" />
            <span className="text-xs text-ink">
              E-Mail an <strong>{replyTo}</strong> senden?
            </span>
            <button
              onClick={handleSend}
              disabled={isSending}
              className="flex h-8 items-center gap-1 rounded-md bg-brand px-3 text-xs font-medium text-white hover:bg-brand/90 disabled:opacity-50"
              data-testid="gmail-confirm-send-btn"
            >
              {isSending ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
              Jetzt senden
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className="rounded-md border border-line px-2 py-1 text-xs text-inkmed hover:bg-subtle"
            >
              Abbrechen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Gmail connection state                                                      */
/* -------------------------------------------------------------------------- */

function GmailConnectionPanel({ status, statusError, onConnect, onDisconnect, disconnecting }) {
  if (statusError) {
    return (
      <div className="m-4">
        <InlineAlert toneName="danger" title="Gmail-Status nicht verfügbar">
          Der Verbindungsstatus konnte nicht geladen werden. Bitte aktualisieren Sie die Seite oder prüfen Sie die Backend-Protokolle.
        </InlineAlert>
      </div>
    );
  }

  if (!status?.oauth_configured) {
    const missing = (status?.missing_configuration || []).join(", ");
    return (
      <div className="m-4 rounded-lg border border-amber-200 bg-amber-50 p-4" data-testid="gmail-oauth-config-required">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 shrink-0 text-warn" size={18} />
          <div>
            <h2 className="text-sm font-semibold text-ink">Google OAuth muss konfiguriert werden</h2>
            <p className="mt-1 text-sm leading-5 text-inkmed">
              Hinterlegen Sie die Google-Client-ID, das Client-Secret und den Token-Verschlüsselungsschlüssel in der lokalen Docker-Umgebung. Die registrierte Redirect-URI muss exakt mit der in der Konsole angegebenen URI übereinstimmen.
            </p>
            {missing && <p className="mt-2 text-xs text-inkmed">Fehlende Konfiguration: {missing}</p>}
          </div>
        </div>
      </div>
    );
  }

  if (!status?.connected) {
    return (
      <div className="m-4 rounded-lg border border-blue-200 bg-blue-50 p-5" data-testid="gmail-oauth-connect-panel">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white text-info shadow-sm"><Mail size={19} /></div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">Gmail-Konto verbinden</h2>
            <p className="mt-1 text-sm leading-5 text-inkmed">
              Verbinden Sie ein Gmail-Konto über Google OAuth. E-RYDEZ kann anschließend Konversationen lesen und nur nach Ihrer Bestätigung Antworten innerhalb des jeweiligen Threads senden.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-inkmed">
              <span className="inline-flex items-center gap-1"><ShieldCheck size={12} /> Verschlüsselte Refresh-Tokens</span>
              <span>·</span>
              <span>Kein Passwort wird gespeichert</span>
            </div>
            <button onClick={onConnect} className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-md bg-brand px-3 text-sm font-medium text-white hover:bg-brand/90" data-testid="gmail-connect-btn">
              <Link2 size={14} /> Mit Google verbinden
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-3 mt-2 flex items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2" data-testid="gmail-connected-status">
      <div className="min-w-0 text-xs text-ok">
        <p className="flex items-center gap-1 font-semibold"><CheckCircle size={13} /> Verbunden mit {status.email_address}</p>
        <p className="mt-0.5 text-[10px] text-inkmed">Threads werden bei Bedarf direkt über die Gmail API abgerufen.{status.ai_available ? "" : " Die KI-Entwürfe benötigen zusätzlich einen konfigurierten KI-API-Schlüssel."}</p>
      </div>
      <button onClick={onDisconnect} disabled={disconnecting} className="inline-flex shrink-0 items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-50" data-testid="gmail-disconnect-btn">
        {disconnecting ? <Loader2 size={11} className="animate-spin" /> : <Unplug size={11} />} Trennen
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Main GmailInbox Page                                                        */
/* -------------------------------------------------------------------------- */

export default function GmailInbox() {
  const { t } = useT();
  const [params, setParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(params.get("q") || "");
  const [activeSearch, setActiveSearch] = useState(params.get("q") || "");
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const {
    data: gmailStatus,
    error: gmailStatusError,
    isLoading: gmailStatusLoading,
    mutate: mutateGmailStatus,
  } = useSWR("gmail-status", api.gmailStatus, { revalidateOnFocus: false });
  const gmailReady = Boolean(gmailStatus?.connected && gmailStatus?.lifecycle_state === "active");

  useEffect(() => {
    const oauthResult = params.get("oauth");
    if (!oauthResult) return;
    const message = {
      connected: ["success", "Gmail-Konto erfolgreich verbunden"],
      cancelled: ["info", "Google-Verbindung wurde abgebrochen"],
      failed: ["error", "Google-Verbindung konnte nicht abgeschlossen werden"],
    }[oauthResult];
    if (message) toast[message[0]](message[1]);
    const next = new URLSearchParams(params);
    next.delete("oauth");
    setParams(next, { replace: true });
    mutateGmailStatus();
  }, [params, setParams, mutateGmailStatus]);

  // Fetch thread list only for an active, authorized Gmail connection.
  const {
    data: threadsData,
    error: threadsError,
    isLoading: threadsLoading,
    mutate: mutateThreads,
  } = useSWR(
    gmailReady ? ["gmail-threads", activeSearch] : null,
    () => api.gmailThreads({ q: activeSearch || undefined, max_results: 30 }),
    { revalidateOnFocus: false }
  );

  // Fetch selected thread detail only after the connection is active.
  const {
    data: threadDetail,
    error: threadError,
    isLoading: threadLoading,
    mutate: mutateThread,
  } = useSWR(
    gmailReady && selectedThreadId ? ["gmail-thread", selectedThreadId] : null,
    () => api.gmailThread(selectedThreadId),
    { revalidateOnFocus: false }
  );

  const threads = threadsData?.threads || [];
  const userEmail = threadsData?.userEmail || gmailStatus?.email_address || "";

  const handleSearch = (e) => {
    e.preventDefault();
    if (!gmailReady) return;
    setActiveSearch(searchQuery);
    setParams(searchQuery ? { q: searchQuery } : {});
    setSelectedThreadId(null);
  };

  const handleRefresh = async () => {
    try {
      await mutateGmailStatus();
      if (!gmailReady) return;
      await mutateThreads();
      if (selectedThreadId) await mutateThread();
      toast.success("Posteingang aktualisiert");
    } catch (error) {
      toast.error("Posteingang konnte nicht aktualisiert werden", { description: error?.response?.data?.detail || error.message });
    }
  };

  const handleConnect = () => {
    window.location.assign(api.gmailOAuthStartUrl());
  };

  const handleDisconnect = async () => {
    if (!window.confirm("Gmail-Verbindung wirklich trennen? Der Google-Zugriff wird widerrufen und der lokale verschlüsselte Refresh-Token gelöscht.")) return;
    setDisconnecting(true);
    try {
      await api.gmailDisconnect();
      setSelectedThreadId(null);
      await mutateGmailStatus();
      toast.success("Gmail-Verbindung wurde getrennt");
    } catch (error) {
      toast.error("Gmail-Verbindung konnte nicht getrennt werden", { description: error?.response?.data?.detail || error.message });
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-56px)]" data-testid="gmail-inbox-page">
      {/* Left panel: Thread list */}
      <div className="flex w-[360px] shrink-0 flex-col border-r border-line bg-surface">
        {/* Header */}
        <div className="border-b border-line p-3">
          <div className="flex items-center justify-between">
            <h1 className="flex items-center gap-2 text-lg font-semibold">
              <Mail size={18} /> Gmail
            </h1>
            <button
              onClick={handleRefresh}
              className="rounded-md border border-line p-1.5 text-inkmed hover:bg-subtle"
              title="Aktualisieren"
              data-testid="gmail-refresh-btn"
            >
              <RefreshCw size={14} />
            </button>
          </div>
          {userEmail ? (
            <p className="mt-1 text-[10px] text-inkmed">{userEmail}</p>
          ) : (
            <p className="mt-1 text-[10px] text-inkmed">{gmailStatusLoading ? "Verbindungsstatus wird geprüft…" : "Kein Gmail-Konto verbunden"}</p>
          )}
          {/* Search */}
          <form onSubmit={handleSearch} className="mt-2 flex gap-1">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-2.5 top-2 text-inkmed" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="E-Mails durchsuchen…"
                disabled={!gmailReady}
                className="h-8 pl-8 text-xs"
                data-testid="gmail-search-input"
              />
            </div>
            <button
              type="submit"
              disabled={!gmailReady}
              className="rounded-md border border-line bg-surface px-2.5 text-xs font-medium hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-50"
            >
              Suchen
            </button>
          </form>
          {/* Quick filters */}
          <div className="mt-2 flex flex-wrap gap-1">
            {[
              ["", "Alle"],
              ["is:unread", "Ungelesen"],
              ["is:starred", "Markiert"],
              ["from:customer", "Kunden"],
            ].map(([q, label]) => (
              <button
                key={q}
                disabled={!gmailReady}
                onClick={() => {
                  setSearchQuery(q);
                  setActiveSearch(q);
                  setParams(q ? { q } : {});
                  setSelectedThreadId(null);
                }}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  activeSearch === q
                    ? "border-brand bg-brand text-white"
                    : "border-line text-inkmed hover:text-ink"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Thread list */}
        <div className="flex-1 overflow-y-auto">
          {!gmailReady ? (
            <div className="p-4 text-xs leading-5 text-inkmed">
              {gmailStatusLoading ? "Gmail-Verbindungsstatus wird geladen…" : "Verbinden Sie zunächst ein Gmail-Konto, um Konversationen abzurufen."}
            </div>
          ) : threadsLoading ? (
            <div className="space-y-2 p-3">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : threadsError ? (
            <div className="p-3"><InlineAlert toneName="danger" title="Posteingang konnte nicht geladen werden">{threadsError?.response?.data?.detail || threadsError.message}</InlineAlert></div>
          ) : threads.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="Keine E-Mails"
                description={activeSearch ? "Keine E-Mails für diese Suche gefunden." : "Der Posteingang ist leer."}
              />
            </div>
          ) : (
            threads.map((thread) => (
              <ThreadListItem
                key={thread.id}
                thread={thread}
                isActive={selectedThreadId === thread.id}
                onClick={() => setSelectedThreadId(thread.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Right panel: Thread detail + Composer */}
      <div className="flex min-w-[520px] flex-1 flex-col bg-canvas">
        {!gmailReady ? (
          <GmailConnectionPanel
            status={gmailStatus}
            statusError={gmailStatusError}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            disconnecting={disconnecting}
          />
        ) : !selectedThreadId ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              title="E-Mail auswählen"
              description="Wählen Sie eine Konversation aus der Liste, um sie anzuzeigen."
            />
          </div>
        ) : threadLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 size={24} className="animate-spin text-brand" />
          </div>
        ) : threadDetail ? (
          <>
            {/* Thread header */}
            <div className="border-b border-line bg-surface px-4 py-3" data-testid="gmail-thread-header">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedThreadId(null)}
                  className="rounded-md p-1 text-inkmed hover:bg-subtle lg:hidden"
                >
                  <ArrowLeft size={16} />
                </button>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-semibold">{threadDetail.subject || "(Kein Betreff)"}</h2>
                  <p className="mt-0.5 text-xs text-inkmed">
                    {threadDetail.messageCount} Nachricht{threadDetail.messageCount !== 1 ? "en" : ""} · Letztes Update: {formatFullDate(threadDetail.date)}
                  </p>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 space-y-3 overflow-y-auto p-4" data-testid="gmail-message-thread">
              {threadDetail.messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
            </div>

            {/* Composer */}
            <Composer
              thread={threadDetail}
              onSent={() => {
                mutateThread();
                mutateThreads();
              }}
            />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-4">
            <InlineAlert toneName="danger" title="Thread konnte nicht geladen werden">{threadError?.response?.data?.detail || threadError?.message || "Bitte aktualisieren Sie die Seite und versuchen Sie es erneut."}</InlineAlert>
          </div>
        )}
      </div>
    </div>
  );
}
