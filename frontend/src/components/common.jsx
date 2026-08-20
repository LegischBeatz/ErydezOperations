import React from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import {
  AlertTriangle, AlertOctagon, CheckCircle2, Info, CircleDashed, Mail, MessageSquare,
  Phone, Store, Truck, Calendar, Zap, StickyNote, ShieldCheck, Undo2, PackageCheck, MoveHorizontal,
} from "lucide-react";

const DANGER = ["critical", "failed", "overdue", "disconnected", "delivery exception", "breached", "critical shortage", "rejected", "exception", "not ready — awaiting stock", "refunded", "cancelled", "voided", "inactive"];
const WARN = ["high", "degraded", "delayed", "at risk", "shortage", "approval required", "pending", "awaiting stock", "unconfirmed", "reminder pending", "pending approval", "authorizing", "not sent", "more info requested", "partially refunded", "partially fulfilled", "unfulfilled", "unpaid", "on hold", "draft"];
const OK = ["healthy", "fulfilled", "resolved", "sent", "delivered", "active", "approved", "ok", "ready", "confirmed", "completed", "item on site", "received", "paid", "fully paid", "success", "tracked", "open"];
const INFO = ["in progress", "scheduled", "picking", "packed", "allocated", "normal", "in transit", "in production", "under review", "handed off", "upcoming", "ready to allocate", "sending", "carrier handoff / ready for pickup", "configured", "authorized", "partially paid"];

export function tone(value) {
  const v = String(value || "").toLowerCase();
  if (DANGER.includes(v)) return "danger";
  if (WARN.includes(v)) return "warn";
  if (OK.includes(v)) return "ok";
  if (INFO.includes(v)) return "info";
  return "neut";
}

const TONE_STYLES = {
  danger: "bg-red-50 text-danger border-red-200",
  warn: "bg-amber-50 text-warn border-amber-200",
  ok: "bg-emerald-50 text-ok border-emerald-200",
  info: "bg-blue-50 text-info border-blue-200",
  neut: "bg-subtle text-neut border-line",
};

const TONE_ICONS = {
  danger: AlertOctagon,
  warn: AlertTriangle,
  ok: CheckCircle2,
  info: Info,
  neut: CircleDashed,
};

export const StatusChip = ({ value, toneOverride, icon, className, testId }) => {
  const { t } = useT();
  const tn = toneOverride || tone(value);
  const Icon = icon || TONE_ICONS[tn];
  return (
    <span
      data-testid={testId || `status-chip-${String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
      className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium leading-[18px] whitespace-nowrap", TONE_STYLES[tn], className)}
    >
      <Icon size={12} strokeWidth={2} />
      {t(String(value))}
    </span>
  );
};

export const Severity = ({ value }) => {
  const { t } = useT();
  const tn = tone(value);
  const Icon = TONE_ICONS[tn];
  const color = { danger: "text-danger", warn: "text-warn", ok: "text-ok", info: "text-info", neut: "text-neut" }[tn];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", color)} data-testid={`severity-${String(value).toLowerCase()}`}>
      <Icon size={14} strokeWidth={2} /> {t(String(value))}
    </span>
  );
};

const CHANNEL_ICONS = {
  email: Mail, gmail: Mail, whatsapp: MessageSquare, phone: Phone, shopify: Store,
  planzer: Truck, calendar: Calendar, system: Zap, note: StickyNote, rule: Zap,
  automation: Zap, rma: Undo2, conversation: Mail, scan: PackageCheck, approval: ShieldCheck,
};

export const SourceBadge = ({ channel, label }) => {
  const Icon = CHANNEL_ICONS[String(channel).toLowerCase()] || Zap;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-inkmed" data-testid={`source-badge-${channel}`}>
      <Icon size={12} strokeWidth={2} /> {label || channel}
    </span>
  );
};

export const KpiCard = ({ label, value, toneName = "neut", onClick, testId, sub, failed }) => {
  const { t } = useT();
  const valColor = { danger: "text-danger", warn: "text-warn", ok: "text-ok", info: "text-info", neut: "text-ink" }[toneName];
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      className="group flex w-full flex-col items-start gap-1 rounded-lg border border-line bg-surface p-4 text-left transition-transform duration-150 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <span className="text-xs font-medium uppercase tracking-wide text-inkmed">{label}</span>
      {failed ? (
        <span className="text-sm font-semibold text-danger">{t("Data unavailable")}</span>
      ) : (
        <span className={cn("tnum text-2xl font-semibold leading-8", valColor)}>{value}</span>
      )}
      {sub && <span className="text-xs text-inkmed">{sub}</span>}
    </button>
  );
};

export const PageHeader = ({ title, identifier, freshness, status, actions, breadcrumb, children }) => (
  <div className="sticky top-14 z-20 border-b border-line bg-canvas/95 px-4 py-4 backdrop-blur-sm sm:px-6">
    {breadcrumb && <div className="mb-1 text-xs text-inkmed">{breadcrumb}</div>}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
        <h1 className="text-2xl font-semibold leading-8 text-ink" data-testid="page-title">
          {title} {identifier && <span className="tnum text-inkmed">{identifier}</span>}
        </h1>
        {status}
      </div>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </div>
    {freshness && <div className="mt-1 text-xs text-inkmed" data-testid="page-freshness">{freshness}</div>}
    {children}
  </div>
);

export function interactiveRowProps(onActivate, label) {
  return {
    tabIndex: 0,
    "aria-label": label,
    onKeyDown: (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onActivate();
      }
    },
  };
}

export const TableOverflowHint = ({ id, className }) => {
  const { t } = useT();
  return (
    <p id={id} data-testid={`table-overflow-hint-${id}`} className={cn("flex items-center gap-1.5 border-b border-line bg-subtle/50 px-4 py-2 text-xs text-inkmed 2xl:hidden", className)}>
      <MoveHorizontal size={14} strokeWidth={2} aria-hidden="true" />
      {t("Scroll horizontally to view all columns")}
    </p>
  );
};

export const EmptyState = ({ title, description, action, testId }) => (
  <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-surface py-12 text-center" data-testid={testId || "empty-state"}>
    <CircleDashed size={24} className="text-neut" strokeWidth={2} />
    <p className="text-sm font-medium text-ink">{title}</p>
    {description && <p className="max-w-sm text-xs text-inkmed">{description}</p>}
    {action}
  </div>
);

export const SectionCard = ({ title, action, children, className, testId }) => (
  <section className={cn("rounded-lg border border-line bg-surface", className)} data-testid={testId}>
    {title && (
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {action}
      </header>
    )}
    <div className="p-4">{children}</div>
  </section>
);

export const FactList = ({ facts }) => (
  <dl className="space-y-1.5">
    {facts.map(([k, v]) => (
      <div key={k} className="flex items-start justify-between gap-4 text-sm">
        <dt className="shrink-0 text-inkmed">{k}</dt>
        <dd className="tnum text-right font-medium text-ink">{v ?? "—"}</dd>
      </div>
    ))}
  </dl>
);

export const ConfidenceBadge = ({ value, label }) => {
  const { t } = useT();
  const tn = value >= 90 ? "ok" : value >= 70 ? "warn" : "danger";
  const finalLabel = label || t("Match confidence");
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", TONE_STYLES[tn])} data-testid="confidence-badge">
      {finalLabel}: {value}%
    </span>
  );
};

export const TimelineEvent = ({ event, expanded, onToggle }) => (
  <div className="relative flex gap-3 pb-5 last:pb-0" data-testid="timeline-event">
    <div className="flex flex-col items-center">
      <div className={cn("mt-1 flex h-6 w-6 items-center justify-center rounded-full border", event.type === "exception" ? "border-red-200 bg-red-50 text-danger" : event.actor === "Automation" ? "border-blue-200 bg-blue-50 text-info" : "border-line bg-subtle text-inkmed")}>
        {React.createElement(CHANNEL_ICONS[String(event.channel).toLowerCase()] || Zap, { size: 12, strokeWidth: 2 })}
      </div>
      <div className="mt-1 w-px flex-1 bg-line" />
    </div>
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2 text-xs text-inkmed">
        <span className="tnum">{event.tsLabel}</span>
        <span>·</span>
        <span className="font-medium">{event.actor}</span>
        {event.actor === "Automation" && <StatusChip value="Automation" toneOverride="info" icon={Zap} className="py-0" />}
        <SourceBadge channel={event.channel} label={event.source} />
      </div>
      <button onClick={onToggle} className="mt-0.5 text-left text-sm font-medium text-ink hover:text-brand" data-testid="timeline-event-summary">
        {event.summary}
      </button>
      {expanded && event.detail && <p className="mt-1 rounded-md bg-subtle p-2 text-xs text-inkmed">{event.detail}</p>}
    </div>
  </div>
);

export const AutomationExplain = ({ trigger, facts, decision, actions }) => {
  const { t } = useT();
  return (
    <div className="space-y-3 text-sm" data-testid="automation-explain-block">
      {[[t("Trigger"), trigger], [t("Facts"), facts], [t("Decision"), decision], [t("Action"), actions]].map(([label, content]) => (
        <div key={label} className="flex gap-3">
          <span className="w-16 shrink-0 text-xs font-semibold uppercase tracking-wide text-inkmed">{label}</span>
          <div className="min-w-0 flex-1 text-ink">{content}</div>
        </div>
      ))}
    </div>
  );
};

export const InlineAlert = ({ toneName = "warn", title, children, testId }) => {
  const Icon = TONE_ICONS[toneName];
  return (
    <div className={cn("flex items-start gap-2 rounded-md border p-3 text-sm", TONE_STYLES[toneName])} data-testid={testId || "inline-alert"} role="alert">
      <Icon size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
      <div>
        {title && <p className="font-semibold">{title}</p>}
        <div className="text-xs leading-[18px]">{children}</div>
      </div>
    </div>
  );
};
