import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import useSWR from "swr";
import { api } from "@/lib/api";
import { fmtRel, fmtDateTime, isOverdue } from "@/lib/format";
import { PageHeader, Severity, StatusChip, SourceBadge, EmptyState, FactList, InlineAlert } from "@/components/common";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ExternalLink, UserPlus, CheckCheck, ChevronDown } from "lucide-react";

const VIEWS = [
  ["my-work", "My work"], ["critical", "Critical"], ["due-today", "Due today"],
  ["overdue-orders", "Overdue orders"], ["customer-waiting", "Customer waiting"],
  ["awaiting-stock", "Awaiting stock"], ["awaiting-approval", "Awaiting approval"],
  ["failed-automation", "Failed automation"], ["unassigned", "Unassigned"], ["all-open", "All open"],
];

export default function WorkQueue() {
  const [params, setParams] = useSearchParams();
  const view = params.get("view") || "all-open";
  const navigate = useNavigate();
  const { data, isLoading, mutate } = useSWR(["work", view], () => api.workItems(view));
  const [selectedId, setSelectedId] = useState(null);
  const [checked, setChecked] = useState([]);
  const items = data?.items || [];
  const selected = items.find((w) => w.id === selectedId);

  useEffect(() => { setChecked([]); }, [view]);

  const assign = async (id, owner) => {
    await api.updateWorkItem(id, { owner });
    mutate();
    toast.success(`Assigned to ${owner}`);
  };

  const resolve = async (item) => {
    await api.updateWorkItem(item.id, { state: "Resolved" });
    setSelectedId(null);
    mutate();
    toast.success("Work item resolved", {
      action: { label: "Undo", onClick: async () => { await api.updateWorkItem(item.id, { state: "Open" }); mutate(); } },
    });
  };

  const bulk = async (fn, label) => {
    await Promise.all(checked.map(fn));
    setChecked([]);
    mutate();
    toast.success(label);
  };

  useEffect(() => {
    const h = (e) => {
      if (["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
      const idx = items.findIndex((w) => w.id === selectedId);
      if (e.key === "j" || e.key === "J") setSelectedId(items[Math.min(idx + 1, items.length - 1)]?.id);
      if (e.key === "k" || e.key === "K") setSelectedId(items[Math.max(idx - 1, 0)]?.id);
      if ((e.key === "e" || e.key === "E") && selected) assign(selected.id, "Pablo");
      if ((e.key === "r" || e.key === "R") && selected) resolve(selected);
      if (e.key === "Enter" && selected?.order_id) navigate(`/orders/${selected.order_id}`);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  return (
    <div data-testid="work-queue-page">
      <PageHeader title="Work queue" freshness="Counts reconcile with source data · Keyboard: J/K move · E assign to me · R resolve · Enter open">
        <div className="mt-3 flex flex-wrap gap-1.5" data-testid="saved-views">
          {VIEWS.map(([key, label]) => (
            <button key={key} data-testid={`view-${key}`}
              onClick={() => setParams({ view: key })}
              className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                view === key ? "border-brand bg-brand text-white" : "border-line bg-surface text-inkmed hover:border-brand/40 hover:text-ink")}>
              {label} <span className="tnum ml-0.5 opacity-70">{data?.counts?.[key] ?? ""}</span>
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="p-6">
        {checked.length > 0 && (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-brand/30 bg-blue-50 px-3 py-2 text-sm" data-testid="bulk-actions-bar">
            <span className="tnum font-medium text-info">{checked.length} selected</span>
            <button className="rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium hover:bg-subtle" data-testid="bulk-assign"
              onClick={() => bulk((id) => api.updateWorkItem(id, { owner: "Pablo" }), "Assigned to Pablo")}>Assign to me</button>
            <button className="rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium hover:bg-subtle" data-testid="bulk-priority"
              onClick={() => bulk((id) => api.updateWorkItem(id, { severity: "High" }), "Priority set to High")}>Set priority High</button>
            <span className="ml-auto text-xs text-inkmed">Financial and customer-facing actions are never bulk actions.</span>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState title="No items in this view" description="This view has no matching open work — a genuine empty result, not a data failure."
            action={<button onClick={() => setParams({ view: "all-open" })} className="text-xs font-medium text-brand hover:underline" data-testid="clear-filters">Show all open</button>} />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-semibold text-inkmed">
                  <th className="w-10 px-3 py-2.5"></th>
                  <th className="px-3 py-2.5">Severity</th>
                  <th className="px-3 py-2.5">Item</th>
                  <th className="px-3 py-2.5">Reason</th>
                  <th className="px-3 py-2.5">State</th>
                  <th className="px-3 py-2.5">Customer waiting</th>
                  <th className="px-3 py-2.5">Due</th>
                  <th className="px-3 py-2.5">Owner</th>
                  <th className="px-3 py-2.5">Recommended action</th>
                  <th className="px-3 py-2.5">Updated</th>
                </tr>
              </thead>
              <tbody>
                {items.map((w) => (
                  <tr key={w.id} data-testid="work-item-row"
                    onClick={() => setSelectedId(w.id)}
                    className={cn("h-[52px] cursor-pointer border-b border-line last:border-0 transition-colors hover:bg-subtle", selectedId === w.id && "bg-blue-50/60")}>
                    <td className="px-3" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={checked.includes(w.id)} onCheckedChange={(v) => setChecked(v ? [...checked, w.id] : checked.filter((x) => x !== w.id))} data-testid="work-item-checkbox" />
                    </td>
                    <td className="px-3"><Severity value={w.severity} /></td>
                    <td className="px-3">
                      <p className="font-medium text-ink">{w.title}</p>
                      <p className="tnum text-xs text-inkmed">{w.order_id} · {w.customer}</p>
                    </td>
                    <td className="max-w-64 px-3 text-xs text-inkmed">{w.reason}</td>
                    <td className="px-3"><StatusChip value={w.state} /></td>
                    <td className="tnum px-3 text-xs">{w.customer_waiting || "—"}</td>
                    <td className={cn("tnum px-3 text-xs", isOverdue(w.due) ? "font-semibold text-danger" : "text-inkmed")}>{w.due ? fmtRel(w.due) : "—"}</td>
                    <td className="px-3" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs hover:bg-subtle" data-testid="owner-select">
                            {w.owner} <ChevronDown size={11} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          {["Pablo", "Support", "Fulfillment", "Unassigned"].map((o) => (
                            <DropdownMenuItem key={o} onClick={() => assign(w.id, o)}>{o}</DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                    <td className="px-3 text-xs font-medium text-brand">{w.recommended_action}</td>
                    <td className="px-3 text-xs text-inkmed">
                      <div className="flex items-center gap-1.5"><SourceBadge channel={w.source} label="" /><span className="tnum">{fmtRel(w.updated_at)}</span></div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent className="w-[440px] overflow-y-auto sm:max-w-[440px]" data-testid="work-item-drawer">
          {selected && (
            <>
              <SheetHeader className="space-y-2">
                <div className="flex items-center gap-2"><Severity value={selected.severity} /><StatusChip value={selected.state} /></div>
                <SheetTitle className="text-left text-lg leading-6">{selected.title}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-inkmed">Why this item exists</p>
                  <p className="mt-1 text-sm text-ink">{selected.reason}</p>
                </div>
                <div className="rounded-md border border-line bg-subtle p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-inkmed">Facts</p>
                  <FactList facts={[
                    ["Order", selected.order_id || "—"],
                    ["Customer", selected.customer || "—"],
                    ["Customer waiting", selected.customer_waiting || "Not waiting"],
                    ["Due", selected.due ? fmtDateTime(selected.due) : "No deadline"],
                    ["Owner", selected.owner],
                    ["Source", selected.source],
                  ]} />
                </div>
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-info">System recommendation</p>
                  <p className="mt-1 text-sm font-medium text-ink">{selected.recommended_action}</p>
                  <p className="mt-0.5 text-xs text-inkmed">Recommendation based on rule evaluation — facts shown above.</p>
                </div>
                {selected.category === "conversation" && (
                  <InlineAlert toneName="warn" testId="duplicate-alert">A reply may already exist on another channel. Review the timeline before responding.</InlineAlert>
                )}
                <div className="flex flex-col gap-2">
                  {selected.order_id && (
                    <button onClick={() => navigate(`/orders/${selected.order_id}`)} data-testid="drawer-open-order"
                      className="flex h-10 items-center justify-center gap-2 rounded-md bg-brand text-sm font-medium text-white transition-colors hover:bg-brand/90">
                      <ExternalLink size={14} /> Open order {selected.order_id}
                    </button>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => assign(selected.id, "Pablo")} data-testid="drawer-assign-me"
                      className="flex h-9 items-center justify-center gap-1.5 rounded-md border border-line bg-surface text-sm font-medium transition-colors hover:bg-subtle">
                      <UserPlus size={14} /> Assign to me
                    </button>
                    <button onClick={() => resolve(selected)} data-testid="drawer-resolve"
                      className="flex h-9 items-center justify-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 text-sm font-medium text-ok transition-colors hover:bg-emerald-100">
                      <CheckCheck size={14} /> Resolve
                    </button>
                  </div>
                </div>
                <p className="text-xs text-inkmed">Updated {fmtRel(selected.updated_at)} · Created {fmtRel(selected.created_at)}</p>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
