import React, { useState } from "react";
import { Link, NavLink, useParams } from "react-router-dom";
import useSWR, { mutate as mutateGlobal } from "swr";
import { api } from "@/lib/api";
import { fmtDateTime, fmtRel } from "@/lib/format";
import { PageHeader, FactList, InlineAlert, SectionCard, StatusChip } from "@/components/common";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, Mail, Pause, Play, RefreshCw, ShieldCheck, Store, UserRound } from "lucide-react";
import { toast } from "sonner";

const SECTIONS = [["integrations", "Integrations"], ["data", "Data model"]];
const labelize = (value) => String(value || "—").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function Settings() {
  const { section } = useParams();
  const [syncing, setSyncing] = useState(false);
  const [savingControl, setSavingControl] = useState(false);
  const { data: status, mutate: mutateStatus } = useSWR("shopify-status", () => api.shopifyStatus(false), { refreshInterval: 15000 });
  const { data: runs, mutate: mutateRuns } = useSWR("shopify-sync-runs", api.syncRuns, { refreshInterval: 15000 });
  const { data: integrations, mutate: mutateIntegrations } = useSWR("integration-registry", api.integrations, { refreshInterval: 15000 });
  const gmail = integrations?.find((integration) => integration.provider === "gmail");
  const { data: audit, mutate: mutateAudit } = useSWR(gmail ? ["integration-audit", gmail.id] : null, () => api.integrationAudit(gmail.id), { refreshInterval: 15000 });

  const refreshControl = async () => {
    await Promise.all([mutateIntegrations(), gmail ? mutateAudit() : Promise.resolve()]);
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      const result = await api.syncShopify();
      toast.success("Complete Shopify snapshot activated", { description: `${result.counts?.orders || 0} orders · ${result.counts?.products || 0} products · ${result.counts?.customers || 0} customers` });
      await Promise.all([mutateStatus(), mutateRuns(), mutateGlobal("overview")]);
      mutateGlobal((key) => Array.isArray(key) && ["orders", "products", "inventory", "customers"].includes(key[0]));
    } catch (error) {
      toast.error("Shopify synchronization failed", { description: error?.response?.data?.detail || error.message });
    } finally {
      setSyncing(false);
    }
  };

  const initializeGmail = async () => {
    const reason = window.prompt("Reason for creating the local Gmail readiness record", "Initialize approved local Gmail readiness record");
    if (!reason) return;
    setSavingControl(true);
    try {
      await api.initializeGmailReadiness(reason);
      toast.success("Gmail readiness record created", { description: "No Gmail authorization, message sync, or sending was enabled." });
      await refreshControl();
    } catch (error) {
      toast.error("Could not initialize Gmail readiness", { description: error?.response?.data?.detail || error.message });
    } finally {
      setSavingControl(false);
    }
  };

  const lifecycleAction = async (action) => {
    if (!gmail) return;
    if (action === "request_disconnect" && !window.confirm("Request disconnect? This records a pending request only; it does not revoke any provider access.")) return;
    const reason = window.prompt(`Reason to ${labelize(action)}`, "Local operator lifecycle action");
    if (!reason) return;
    setSavingControl(true);
    try {
      await api.changeIntegrationLifecycle(gmail.id, action, reason);
      toast.success("Lifecycle state recorded", { description: "No Gmail message, OAuth, webhook, or sending action was performed." });
      await refreshControl();
    } catch (error) {
      toast.error("Lifecycle action was blocked", { description: error?.response?.data?.detail || error.message });
    } finally {
      setSavingControl(false);
    }
  };

  const assignRecoveryOwner = async () => {
    if (!gmail) return;
    const displayName = window.prompt("Recovery owner name", "Pablo Yanelli");
    if (!displayName) return;
    const reason = window.prompt("Reason for assigning the recovery owner", "Assign recovery owner for future Gmail connection recovery");
    if (!reason) return;
    setSavingControl(true);
    try {
      await api.assignIntegrationRecoveryOwner(gmail.id, displayName, reason);
      toast.success("Recovery owner assigned");
      await refreshControl();
    } catch (error) {
      toast.error("Could not assign recovery owner", { description: error?.response?.data?.detail || error.message });
    } finally {
      setSavingControl(false);
    }
  };

  return (
    <div data-testid="settings-page">
      <PageHeader title="Settings" freshness="Local operator mode: this console is managed from the browser on this machine. Credentials remain local and are never returned by the API." />
      <div className="flex gap-6 p-6">
        <nav className="w-52 shrink-0 space-y-1">{SECTIONS.map(([key, label]) => <NavLink key={key} to={`/settings/${key}`} className={({ isActive }) => cn("block rounded-md px-3 py-2 text-sm font-medium", isActive ? "bg-brand/10 text-brand" : "text-inkmed hover:bg-subtle hover:text-ink")}>{label}</NavLink>)}</nav>
        <div className="min-w-0 flex-1 space-y-4">
          {section === "integrations" && <>
            <InlineAlert toneName="info" title="Shopify remains the commerce source">The Integration Control Center stores only operational connection readiness, ownership, health, and audit records. It does not alter canonical Shopify records.</InlineAlert>
            <SectionCard title="Shopify connection" action={<StatusChip value={status?.status || (status?.configured ? "Configured" : "Disconnected")} />}>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
                <div><div className="mb-4 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-50 text-ok"><Store size={20} /></div><div><p className="text-sm font-semibold">{status?.store_domain || "Shopify not configured"}</p><p className="text-xs text-inkmed">Admin GraphQL API · {status?.authentication_mode || "—"}</p></div></div><FactList facts={[["API version", status?.api_version || "—"], ["Authentication", status?.authentication_mode || "—"], ["Schema version", status?.schema_version || "—"], ["Last complete sync", status?.active_snapshot?.last_synced_at ? `${fmtRel(status.active_snapshot.last_synced_at)} · ${fmtDateTime(status.active_snapshot.last_synced_at)}` : "Never"], ["Active snapshot", status?.active_snapshot?.active_sync_id || "—"]]} /></div>
                <button onClick={syncNow} disabled={syncing || status?.sync_running || !status?.configured} className="flex h-10 items-center justify-center gap-2 self-start rounded-md bg-brand px-4 text-sm font-medium text-white hover:bg-brand/90 disabled:cursor-wait disabled:opacity-50"><RefreshCw size={15} className={cn((syncing || status?.sync_running) && "animate-spin")} />{syncing || status?.sync_running ? "Synchronizing…" : "Run complete sync"}</button>
              </div>
            </SectionCard>

            <SectionCard title="Connection Registry" action={gmail ? <StatusChip value={gmail.health?.overall_status || gmail.lifecycle_state} /> : <StatusChip value="not_configured" />}>
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"><ShieldCheck className="mt-0.5 shrink-0" size={17} /><div><p className="font-medium">Local operator control plane</p><p className="mt-1 leading-5">This console is managed only from this machine’s browser. The readiness record never authorizes Gmail OAuth, message reading, sending, webhooks, watches, or synchronization.</p></div></div>
                {!gmail ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed border-line bg-subtle/40 p-4"><div><p className="font-medium">Gmail readiness is not registered</p><p className="mt-1 text-sm text-inkmed">Create a safe local control record for the existing authorized mailbox identity. No credential or message data is requested.</p></div><button onClick={initializeGmail} disabled={savingControl} className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Initialize Gmail readiness</button></div> : <>
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
                    <div className="flex gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-red-50 text-red-600"><Mail size={20} /></div><div><p className="font-semibold">Gmail · {gmail.display_identity}</p><p className="mt-1 text-sm text-inkmed">{labelize(gmail.lifecycle_state)} · desired state: {labelize(gmail.desired_state)}</p></div></div>
                    <div className="flex flex-wrap gap-2 self-start"><button onClick={() => lifecycleAction(gmail.lifecycle_state === "paused" ? "resume" : "pause")} disabled={savingControl || ["disconnect_pending", "disconnected"].includes(gmail.lifecycle_state)} className="inline-flex items-center gap-1 rounded-md border border-line px-3 py-2 text-sm font-medium hover:bg-subtle disabled:opacity-50">{gmail.lifecycle_state === "paused" ? <Play size={15} /> : <Pause size={15} />}{gmail.lifecycle_state === "paused" ? "Resume" : "Pause"}</button><button onClick={() => lifecycleAction("request_reauthorization")} disabled={savingControl || gmail.lifecycle_state === "disconnected"} className="rounded-md border border-line px-3 py-2 text-sm font-medium hover:bg-subtle disabled:opacity-50">Request reauthorization</button><button onClick={() => lifecycleAction("request_disconnect")} disabled={savingControl || gmail.lifecycle_state === "disconnected"} className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">Request disconnect</button></div>
                  </div>
                  <FactList facts={[["Environment", labelize(gmail.environment)], ["Business owner", gmail.business_owner?.display_name || "Unassigned"], ["Recovery owner", gmail.recovery_owner?.display_name || "Pending assignment"], ["Capabilities", (gmail.capabilities || []).map(labelize).join(", ") || "—"], ["Last action", gmail.last_action_reason || "—"]]} />
                  <div className="flex flex-wrap gap-2"><button onClick={async () => { await api.recordIntegrationHealth(gmail.id); await refreshControl(); toast.success("Safe readiness check recorded"); }} className="inline-flex items-center gap-1 rounded-md border border-line px-3 py-2 text-sm font-medium hover:bg-subtle"><RefreshCw size={15} />Check readiness</button><button onClick={assignRecoveryOwner} disabled={savingControl} className="inline-flex items-center gap-1 rounded-md border border-line px-3 py-2 text-sm font-medium hover:bg-subtle disabled:opacity-50"><UserRound size={15} />{gmail.recovery_owner?.display_name ? "Change recovery owner" : "Assign recovery owner"}</button></div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{Object.entries(gmail.health?.dimensions || {}).map(([name, dimension]) => <div key={name} className="rounded-md border border-line bg-subtle/40 p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-wide text-inkmed">{labelize(name)}</p><StatusChip value={dimension.status} /></div><p className="mt-2 text-sm leading-5 text-ink">{dimension.detail}</p></div>)}</div>
                  <InlineAlert toneName={gmail.health?.overall_status === "setup_required" ? "warning" : "info"} title={labelize(gmail.health?.overall_status || gmail.lifecycle_state)}>{gmail.health?.next_action || "Run a safe readiness check to see the next action."}</InlineAlert>
                  <div className="rounded-md border border-line"><div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3"><div><p className="text-sm font-semibold">Connection audit</p><p className="mt-1 text-xs text-inkmed">Safe, append-only lifecycle evidence. Credentials and provider payloads are not shown.</p></div><Link to="/audit-timeline" className="shrink-0 text-xs font-medium text-brand hover:underline">View timeline</Link></div>{!audit?.length ? <p className="p-4 text-sm text-inkmed">No lifecycle events recorded yet.</p> : <div className="divide-y divide-line">{audit.slice(0, 8).map((event) => <div key={event.id} className="grid gap-1 px-4 py-3 text-sm md:grid-cols-[1fr_auto]"><div><p className="font-medium">{labelize(event.action)} · {labelize(event.outcome)}</p><p className="mt-1 text-inkmed">{event.reason}</p></div><p className="text-xs text-inkmed md:text-right">{fmtDateTime(event.created_at)}<br />{event.actor}</p></div>)}</div>}</div>
                </>}
              </div>
            </SectionCard>

            <SectionCard title="Active Shopify snapshot">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{["orders", "products", "variants", "inventory_items", "customers", "fulfillments", "refunds", "returns"].map((name) => <div key={name} className="rounded-md border border-line bg-subtle/50 p-3"><p className="tnum text-xl font-semibold">{status?.active_snapshot?.counts?.[name] ?? "—"}</p><p className="mt-0.5 text-[10px] uppercase tracking-wide text-inkmed">{name.replace("_", " ")}</p></div>)}</div>
              {status?.active_snapshot?.validation && <div className="mt-4 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-ok"><CheckCircle2 size={16} /><span className="font-medium">Snapshot integrity validated</span><span className="ml-auto text-xs">No missing cross-record links</span></div>}
            </SectionCard>
            <SectionCard title="Synchronization history">
              {!runs?.length ? <p className="text-sm text-inkmed">No synchronization runs recorded.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead className="border-b border-line text-[11px] uppercase tracking-wide text-inkmed"><tr><th className="px-3 py-2">Started</th><th className="px-3 py-2">Mode</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Orders</th><th className="px-3 py-2 text-right">Products</th><th className="px-3 py-2">Run ID</th></tr></thead><tbody className="divide-y divide-line">{runs.map((run) => <tr key={run.id}><td className="tnum px-3 py-2.5 text-sm">{fmtDateTime(run.started_at)}</td><td className="px-3 py-2.5 text-sm">{run.mode}</td><td className="px-3 py-2.5"><StatusChip value={run.status} /></td><td className="tnum px-3 py-2.5 text-right text-sm">{run.counts?.orders ?? run.fetched_counts?.orders ?? "—"}</td><td className="tnum px-3 py-2.5 text-right text-sm">{run.counts?.products ?? run.fetched_counts?.products ?? "—"}</td><td className="tnum max-w-[220px] truncate px-3 py-2.5 text-xs text-inkmed">{run.id}</td></tr>)}</tbody></table></div>}
            </SectionCard>
          </>}
          {section === "data" && <>
            <SectionCard title="Canonical Shopify collections"><div className="space-y-3 text-sm leading-6"><p>The local database stores normalized Shopify records for <strong>orders, products, variants, inventory items, customers, fulfillments, refunds, and returns</strong>. Every document belongs to one complete snapshot through a shared synchronization identifier.</p><p>Relations retain Shopify GraphQL identifiers, so order-to-customer, variant-to-product, inventory-to-variant, and fulfillment/refund/return-to-order links can be validated deterministically.</p><p>Integration Registry records are console-owned operational metadata. They do not change Shopify canonical collections.</p></div></SectionCard>
            <SectionCard title="Activation semantics"><ol className="list-decimal space-y-2 pl-5 text-sm leading-6"><li>Fetch every accessible Shopify page using cursor pagination.</li><li>Normalize records without inventing unavailable facts.</li><li>Validate counts, uniqueness, and cross-record links.</li><li>Insert the new snapshot under a new synchronization ID.</li><li>Atomically activate the validated snapshot, then remove stale and mock data.</li></ol></SectionCard>
          </>}
        </div>
      </div>
    </div>
  );
}
