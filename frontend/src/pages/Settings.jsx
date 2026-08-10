import React from "react";
import { useParams, NavLink } from "react-router-dom";
import useSWR from "swr";
import { api } from "@/lib/api";
import { fmtRel } from "@/lib/format";
import { PageHeader, StatusChip, SectionCard, InlineAlert } from "@/components/common";
import { useT } from "@/lib/i18n";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const SECTIONS = [["users", "Users & roles"], ["integrations", "Integrations"], ["rules", "Business rules"], ["templates", "Message templates"]];

const ROLES = [
  { role: "Owner / operator", user: "Pablo", perms: "Full access; financial actions subject to approval policy" },
  { role: "Support operator", user: "—", perms: "Read orders; create/update cases; send low-risk messages; no refunds or purchasing" },
  { role: "Fulfillment operator", user: "—", perms: "Read relevant orders/inventory; update fulfillment steps; no customer financial data" },
  { role: "Manager", user: "—", perms: "Read all; approve configured actions; export reports" },
  { role: "System administrator", user: "—", perms: "Full configuration; financial actions remain subject to approval policy" },
];

const RULES = [
  ["Delay update thresholds", "8 / 14 / 21 business days after payment"],
  ["Auto-link confidence threshold", "90% — below this, conversations enter the Unlinked queue"],
  ["Recently-contacted suppression", "No automatic message within 5 days of any customer contact"],
  ["High-risk topics", "Refund, cancellation, warranty, legal — always require approval"],
  ["Financial reauthentication threshold", "CHF 500.00"],
];

const TEMPLATES = [
  ["delay_update_v3", "DE / FR / EN", "Proactive status update with verified order facts"],
  ["tracking_sent_v2", "DE / FR / EN", "Tracking link after fulfillment"],
  ["pickup_ready_v1", "DE / FR / EN", "Pickup booking invitation"],
  ["evidence_request_v1", "DE / FR / EN", "Warranty evidence request (serial + video)"],
];

export default function Settings() {
  const { t } = useT();
  const { section } = useParams();
  const { data: integrations } = useSWR("integrations", api.integrations);

  return (
    <div data-testid="settings-page">
      <PageHeader title={t("Settings")} freshness={t("Admin area · sensitive actions record actor, timestamp, previous state, new state, source and reason")} />
      <div className="flex gap-6 p-6">
        <nav className="w-48 shrink-0 space-y-1" data-testid="settings-nav">
          {SECTIONS.map(([key, label]) => (
            <NavLink key={key} to={`/settings/${key}`} data-testid={`settings-nav-${key}`}
              className={({ isActive }) => cn("block rounded-md px-3 py-2 text-sm font-medium transition-colors", isActive ? "bg-brand/10 text-brand" : "text-inkmed hover:bg-subtle hover:text-ink")}>
              {t(label)}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0 flex-1 space-y-4">
          {section === "users" && (
            <SectionCard title={t("Users & roles")} testId="settings-users">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-line text-left text-xs font-semibold text-inkmed">
                    <th className="px-3 py-2">{t("Role")}</th><th className="px-3 py-2">{t("User")}</th><th className="px-3 py-2">{t("Default permissions")}</th>
                  </tr></thead>
                  <tbody>
                    {ROLES.map((r) => (
                      <tr key={r.role} className="h-11 border-b border-line last:border-0">
                        <td className="px-3 font-medium">{t(r.role)}</td><td className="px-3">{r.user}</td><td className="px-3 text-xs text-inkmed">{r.perms}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-inkmed">{t("Role-based access control with optional per-user overrides. Demo runs as Pablo (Owner).")}</p>
            </SectionCard>
          )}
          {section === "integrations" && (
            <SectionCard title={t("Integrations")} testId="settings-integrations">
              <InlineAlert toneName="info">{t("Credential values are never displayed after save. \"Open in external system\" actions always show the destination.")}</InlineAlert>
              <div className="mt-3 space-y-2">
                {integrations?.map((i) => (
                  <div key={i.name} className="flex items-center justify-between rounded-md border border-line p-3" data-testid={`settings-integration-${i.name.toLowerCase().replace(/\s+/g, "-")}`}>
                    <div>
                      <p className="text-sm font-medium">{i.name}</p>
                      <p className="text-xs text-inkmed">{i.detail} · {t("Last event")} {fmtRel(i.last_event)}</p>
                      <p className="tnum text-xs text-inkmed">API key: ••••••••••••</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusChip value={i.status} />
                      <button onClick={() => toast(`${i.name}: reconnection flow would open the provider consent screen`)} className="h-8 rounded-md border border-line px-2.5 text-xs font-medium hover:bg-subtle" data-testid="integration-reconnect-btn">{t("Reconnect")}</button>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
          {section === "rules" && (
            <SectionCard title={t("Business rules")} testId="settings-rules">
              <div className="space-y-3">
                {RULES.map(([name, value]) => (
                  <div key={name} className="flex items-center justify-between gap-4 rounded-md border border-line p-3">
                    <div><p className="text-sm font-medium">{name}</p><p className="text-xs text-inkmed">{value}</p></div>
                    <Switch defaultChecked onCheckedChange={() => toast(`Rule "${name}" toggled (demo)`)} data-testid={`rule-switch-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} />
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
          {section === "templates" && (
            <SectionCard title={t("Message templates")} testId="settings-templates">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-line text-left text-xs font-semibold text-inkmed">
                    <th className="px-3 py-2">{t("Template")}</th><th className="px-3 py-2">{t("Languages")}</th><th className="px-3 py-2">{t("Purpose")}</th>
                  </tr></thead>
                  <tbody>
                    {TEMPLATES.map(([id, langs, purpose]) => (
                      <tr key={id} className="h-11 border-b border-line last:border-0 hover:bg-subtle">
                        <td className="tnum px-3 font-medium">{id}</td><td className="px-3 text-xs">{langs}</td><td className="px-3 text-xs text-inkmed">{purpose}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-inkmed">{t("Templates render with verified order facts only. No default telephone number in signatures.")}</p>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
