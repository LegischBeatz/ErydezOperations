import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import useSWR from "swr";
import dayjs from "dayjs";
import { api } from "@/lib/api";
import { fmtTime, fmtDateTime } from "@/lib/format";
import { PageHeader, StatusChip, EmptyState, InlineAlert } from "@/components/common";
import { useT } from "@/lib/i18n";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Phone, CheckCircle2, CalendarClock, UserX, LogIn } from "lucide-react";

const TYPES = ["Customer pickup", "Return handoff", "Warranty inspection", "Local delivery", "Internal fulfillment commitment"];

export default function Appointments() {
  const { t, locale } = useT();
  const { data: appts, isLoading, mutate } = useSWR("appointments", api.appointments);
  const [view, setView] = useState("agenda");
  const [typeFilter, setTypeFilter] = useState("");
  const navigate = useNavigate();

  const act = async (a, status, label) => {
    await api.updateAppointment(a.id, { status });
    mutate();
    toast.success(label);
  };

  const filtered = useMemo(() => (appts || []).filter((a) => !typeFilter || a.type === typeFilter), [appts, typeFilter]);
  const byDay = useMemo(() => {
    const g = {};
    filtered.forEach((a) => {
      const d = dayjs(a.time).format("DD.MM.YYYY");
      (g[d] = g[d] || []).push(a);
    });
    return g;
  }, [filtered]);

  const Card = ({ a }) => (
    <div className={cn("rounded-lg border bg-surface p-4", a.status === "Completed" ? "border-line opacity-60" : a.readiness.startsWith("Not ready") ? "border-red-200" : "border-line")} data-testid={`appointment-card-${a.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="tnum text-lg font-semibold text-brand">{fmtTime(a.time)}</span>
          <div>
            <p className="text-sm font-semibold">{t(a.type)} — {a.customer}</p>
            <p className="text-xs text-inkmed">{a.product} · <button onClick={() => a.order_id?.startsWith("E-") && navigate(`/orders/${a.order_id}`)} className="tnum hover:text-brand">{a.order_id}</button> · {a.location}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <StatusChip value={a.readiness} />
          <StatusChip value={a.confirmation_state} />
          <StatusChip value={`${t("Reminder")}: ${t(a.reminder_state)}`} toneOverride={a.reminder_state === "Sent" ? "ok" : "neut"} />
        </div>
      </div>
      {a.payment_due && <p className="mt-2 text-sm font-medium text-warn" data-testid="payment-due-note">{a.payment_due}</p>}
      {a.readiness.startsWith("Not ready") && (
        <div className="mt-2"><InlineAlert toneName="danger" testId="readiness-warning">{t("This pickup is scheduled before stock is allocated or the item is ready. Resolve stock first or reschedule.")}</InlineAlert></div>
      )}
      {a.status === "Upcoming" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={`tel:${a.phone.replace(/\s/g, "")}`} className="flex h-8 items-center gap-1 rounded-md border border-line px-2.5 text-xs font-medium hover:bg-subtle" data-testid="appt-contact-btn"><Phone size={12} /> {t("Contact")}</a>
          <button onClick={() => act(a, "Checked in", t("Checked in"))} className="flex h-8 items-center gap-1 rounded-md border border-line px-2.5 text-xs font-medium hover:bg-subtle" data-testid="appt-checkin-btn"><LogIn size={12} /> {t("Check in")}</button>
          <button onClick={() => act(a, "Completed", t("Marked complete"))} className="flex h-8 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-medium text-ok hover:bg-emerald-100" data-testid="appt-complete-btn"><CheckCircle2 size={12} /> {t("Complete")}</button>
          <button onClick={() => toast(t("Reschedule flow: booking link sent to customer"))} className="flex h-8 items-center gap-1 rounded-md border border-line px-2.5 text-xs font-medium hover:bg-subtle" data-testid="appt-reschedule-btn"><CalendarClock size={12} /> {t("Reschedule")}</button>
          <button onClick={() => act(a, "No-show", t("Marked no-show"))} className="flex h-8 items-center gap-1 rounded-md border border-red-200 px-2.5 text-xs font-medium text-danger hover:bg-red-50" data-testid="appt-noshow-btn"><UserX size={12} /> {t("No-show")}</button>
        </div>
      )}
      {a.status !== "Upcoming" && <p className="mt-2 text-xs font-medium text-inkmed">{t("Status")}: {t(a.status)}</p>}
    </div>
  );

  return (
    <div data-testid="appointments-page">
      <PageHeader title={t("Appointments")} freshness={t("Timezone Europe/Zurich · Google Calendar synced")}
        actions={
          <div className="flex rounded-md border border-line bg-surface p-0.5">
            {["agenda", "week", "list"].map((v) => (
              <button key={v} onClick={() => setView(v)} data-testid={`appt-view-${v}`}
                className={cn("h-8 rounded px-2.5 text-xs font-medium capitalize", view === v ? "bg-brand text-white" : "text-inkmed hover:text-ink")}>{t(v)}</button>
            ))}
          </div>
        }>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button onClick={() => setTypeFilter("")} className={cn("rounded-full border px-3 py-1 text-xs font-medium", !typeFilter ? "border-brand bg-brand text-white" : "border-line text-inkmed")} data-testid="appt-filter-all">{t("All types")}</button>
          {TYPES.map((tp) => (
            <button key={tp} onClick={() => setTypeFilter(tp)} className={cn("rounded-full border px-3 py-1 text-xs font-medium", typeFilter === tp ? "border-brand bg-brand text-white" : "border-line text-inkmed hover:text-ink")} data-testid={`appt-filter-${tp.toLowerCase().replace(/\s+/g, "-")}`}>{t(tp)}</button>
          ))}
        </div>
      </PageHeader>
      <div className="p-6">
        {isLoading ? (
          <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
        ) : view === "list" ? (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line text-left text-xs font-semibold text-inkmed">
                {["Time", "Type", "Customer", "Order", "Product", "Readiness", "Confirmation", "Status"].map((h) => <th key={h} className="px-3 py-2.5">{t(h)}</th>)}
              </tr></thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id} className="h-[52px] border-b border-line last:border-0 hover:bg-subtle" data-testid="appt-list-row">
                    <td className="tnum px-3">{fmtDateTime(a.time)}</td>
                    <td className="px-3">{t(a.type)}</td>
                    <td className="px-3">{a.customer}</td>
                    <td className="tnum px-3">{a.order_id}</td>
                    <td className="px-3 text-xs">{a.product}</td>
                    <td className="px-3"><StatusChip value={a.readiness} /></td>
                    <td className="px-3"><StatusChip value={a.confirmation_state} /></td>
                    <td className="px-3"><StatusChip value={a.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : view === "week" ? (
          <div className="grid grid-cols-7 gap-2" data-testid="appt-week-view">
            {[...Array(7)].map((_, i) => {
              const day = dayjs().startOf("week").add(i + 1, "day").locale(locale);
              const dayAppts = filtered.filter((a) => dayjs(a.time).isSame(day, "day"));
              return (
                <div key={i} className={cn("min-h-48 rounded-lg border bg-surface p-2", day.isSame(dayjs(), "day") ? "border-brand" : "border-line")}>
                  <p className="mb-2 text-xs font-semibold">{day.format("dd DD.MM")}</p>
                  {dayAppts.map((a) => (
                    <div key={a.id} className="mb-1.5 rounded-md border border-line bg-subtle p-1.5 text-[10px]" data-testid="week-appt">
                      <p className="tnum font-semibold">{fmtTime(a.time)}</p>
                      <p className="truncate">{t(a.type)}</p>
                      <p className="truncate text-inkmed">{a.customer}</p>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ) : Object.keys(byDay).length === 0 ? (
          <EmptyState title={t("No appointments")} description={t("No appointments match this filter.")} />
        ) : (
          <div className="space-y-5">
            {Object.entries(byDay).map(([day, list]) => (
              <div key={day}>
                <h2 className="tnum mb-2 text-sm font-semibold">{day}{day === dayjs().format("DD.MM.YYYY") && <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-[10px] text-white">{t("Today")}</span>}</h2>
                <div className="space-y-2">{list.map((a) => <Card key={a.id} a={a} />)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
