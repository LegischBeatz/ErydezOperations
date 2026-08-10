import React, { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate, Outlet } from "react-router-dom";
import useSWR from "swr";
import { api } from "@/lib/api";
import { fmtRel, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { StatusChip, tone } from "@/components/common";
import { useT } from "@/lib/i18n";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  PanelLeft, Search, Plus, Activity, Bell, LayoutDashboard, ListTodo, Package,
  Inbox as InboxIcon, PackageCheck, Boxes, Undo2, Calendar, ShoppingCart,
  BarChart3, Zap, Settings, ChevronDown, Phone, FileText, CalendarPlus, RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

const NAV = [
  { to: "/overview", key: "Overview", icon: LayoutDashboard },
  { to: "/work", key: "Work queue", icon: ListTodo },
  { to: "/orders", key: "Orders", icon: Package },
  { to: "/inbox", key: "Inbox", icon: InboxIcon },
  { to: "/fulfillment", key: "Fulfillment", icon: PackageCheck },
  { to: "/inventory", key: "Inventory", icon: Boxes },
  { to: "/returns", key: "Returns", icon: Undo2 },
  { to: "/appointments", key: "Appointments", icon: Calendar },
  { to: "/purchasing", key: "Purchasing", icon: ShoppingCart },
  { to: "/reports", key: "Reports", icon: BarChart3 },
  { to: "/automations", key: "Automations", icon: Zap },
  { to: "/settings/users", key: "Settings", icon: Settings },
];

function GlobalSearch({ open, setOpen }) {
  const { t } = useT();
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const { data } = useSWR(q.length >= 2 ? ["search", q] : null, () => api.search(q));
  const go = (path) => { setOpen(false); setQ(""); navigate(path); };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="top-24 max-w-xl translate-y-0 gap-0 p-0" data-testid="global-search-dialog">
        <DialogTitle className="sr-only">{t("Global search")}</DialogTitle>
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search size={16} className="text-inkmed" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search order, customer, email, phone, tracking, SKU, RMA…")}
            className="h-12 border-0 shadow-none focus-visible:ring-0" data-testid="global-search-input" />
        </div>
        <div className="max-h-96 overflow-y-auto p-2">
          {!data && <p className="p-3 text-xs text-inkmed">{t("Type at least 2 characters. Searches orders, conversations, RMAs and inventory.")}</p>}
          {data && ["orders", "conversations", "returns", "inventory"].every((k) => data[k].length === 0) && (
            <p className="p-3 text-xs text-inkmed">No matches. This means no records match "{q}" — not a data failure.</p>
          )}
          {data?.orders.map((o) => (
            <button key={o.id} onClick={() => go(`/orders/${o.id}`)} data-testid={`search-result-order-${o.id}`}
              className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-subtle">
              <span><span className="tnum font-medium">{o.id}</span> · {o.customer.name}</span>
              <span className="tnum text-xs text-inkmed">{o.business_day_age} {t("business days")}</span>
            </button>
          ))}
          {data?.conversations.map((c) => (
            <button key={c.id} onClick={() => go(`/cases/${c.id}`)} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-subtle" data-testid="search-result-conversation">
              <span>{c.customer.name} · {c.subject}</span><span className="text-xs text-inkmed">{t("Case")}</span>
            </button>
          ))}
          {data?.returns.map((r) => (
            <button key={r.id} onClick={() => go(`/returns/${r.id}`)} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-subtle" data-testid="search-result-rma">
              <span className="tnum">{r.id} · {r.customer.name}</span><span className="text-xs text-inkmed">{t("RMA")}</span>
            </button>
          ))}
          {data?.inventory.map((i) => (
            <button key={i.sku} onClick={() => go(`/inventory?sku=${i.sku}`)} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-subtle" data-testid="search-result-inventory">
              <span className="tnum">{i.sku} · {i.product}</span><span className="text-xs text-inkmed">{t("ATP")} {i.atp}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LanguageSwitch() {
  const { locale, setLocale } = useT();
  return (
    <div className="flex overflow-hidden rounded-md border border-line bg-surface" role="group" aria-label="Language" data-testid="language-switch">
      {["de", "en"].map((l) => (
        <button
          key={l}
          onClick={() => setLocale(l)}
          data-testid={`lang-${l}`}
          aria-pressed={locale === l}
          className={cn(
            "h-8 w-9 text-[11px] font-semibold uppercase tracking-wide transition-colors",
            locale === l ? "bg-brand text-white" : "text-inkmed hover:bg-subtle hover:text-ink"
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export default function AppShell() {
  const { t } = useT();
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const navigate = useNavigate();
  const { data: integrations } = useSWR("integrations", api.integrations, { refreshInterval: 60000 });
  const { data: notifications, mutate: mutateNotifs } = useSWR("notifications", api.notifications, { refreshInterval: 60000 });

  useEffect(() => {
    const h = (e) => {
      if (e.key === "/" && !["INPUT", "TEXTAREA"].includes(e.target.tagName) && !e.target.isContentEditable) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const health = useMemo(() => {
    if (!integrations) return { label: t("Checking"), tone: "neut" };
    const bad = integrations.filter((i) => i.status === "Disconnected").length;
    const delayed = integrations.filter((i) => i.status === "Delayed").length;
    if (bad) return { label: `${bad} ${t("Disconnected").toLowerCase()}`, tone: "danger" };
    if (delayed) return { label: `${delayed} ${t("Delayed").toLowerCase()}`, tone: "warn" };
    return { label: t("All healthy"), tone: "ok" };
  }, [integrations, t]);

  const unread = notifications?.filter((n) => !n.read).length || 0;

  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      <aside className={cn("fixed inset-y-0 left-0 z-40 flex flex-col border-r border-line bg-surface transition-[width] duration-200", collapsed ? "w-[72px]" : "w-[240px]")} data-testid="app-sidebar">
        <div className="flex h-14 items-center gap-2 border-b border-line px-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand text-sm font-bold text-white">E</div>
          {!collapsed && <span className="text-sm font-semibold tracking-tight">E-RYDEZ Console</span>}
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2" aria-label="Primary">
          {NAV.map(({ to, key, icon: Icon }) => (
            <NavLink key={to} to={to} data-testid={`nav-${key.toLowerCase().replace(/\s+/g, "-")}`}
              className={({ isActive }) => cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150",
                isActive ? "bg-brand/10 text-brand" : "text-inkmed hover:bg-subtle hover:text-ink",
                collapsed && "justify-center px-0"
              )}>
              <Icon size={18} strokeWidth={2} />
              {!collapsed && t(key)}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className={cn("flex min-w-0 flex-1 flex-col transition-[margin] duration-200", collapsed ? "ml-[72px]" : "ml-[240px]")}>
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface px-4" data-testid="top-bar">
          <button onClick={() => setCollapsed(!collapsed)} aria-label="Toggle sidebar" data-testid="sidebar-toggle"
            className="rounded-md p-2 text-inkmed transition-colors hover:bg-subtle hover:text-ink">
            <PanelLeft size={18} />
          </button>
          <button onClick={() => setSearchOpen(true)} data-testid="global-search-trigger"
            className="flex h-9 w-full max-w-md items-center gap-2 rounded-md border border-line bg-canvas px-3 text-sm text-inkmed transition-colors hover:border-brand/40">
            <Search size={15} /> {t("Search orders, customers, tracking…")}
            <kbd className="ml-auto rounded border border-line bg-surface px-1.5 text-[10px]">/</kbd>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex h-9 items-center gap-1.5 rounded-md bg-brand px-3 text-sm font-medium text-white transition-colors hover:bg-brand/90" data-testid="create-menu-trigger">
                  <Plus size={15} /> {t("Create")} <ChevronDown size={13} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem data-testid="create-phone-note" onClick={() => { navigate("/orders"); toast(t("Open an order to add a phone note")); }}><Phone size={14} className="mr-2" /> {t("Phone note")}</DropdownMenuItem>
                <DropdownMenuItem data-testid="create-manual-case" onClick={() => navigate("/inbox")}><FileText size={14} className="mr-2" /> {t("Manual case")}</DropdownMenuItem>
                <DropdownMenuItem data-testid="create-appointment" onClick={() => navigate("/appointments")}><CalendarPlus size={14} className="mr-2" /> {t("Appointment")}</DropdownMenuItem>
                <DropdownMenuItem data-testid="create-rma" onClick={() => navigate("/returns")}><RotateCcw size={14} className="mr-2" /> {t("RMA")}</DropdownMenuItem>
                <DropdownMenuItem data-testid="create-po" onClick={() => navigate("/purchasing")}><ShoppingCart size={14} className="mr-2" /> {t("Purchase order")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Popover>
              <PopoverTrigger asChild>
                <button aria-label={t("Integration health")} data-testid="integration-health-trigger"
                  className={cn("flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
                    health.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-ok" : health.tone === "warn" ? "border-amber-200 bg-amber-50 text-warn" : health.tone === "danger" ? "border-red-200 bg-red-50 text-danger" : "border-line bg-subtle text-neut")}>
                  <Activity size={14} /> {health.label}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-2" data-testid="integration-health-popover">
                <p className="px-2 py-1 text-xs font-semibold text-inkmed">{t("Integration health")}</p>
                {integrations?.map((i) => (
                  <div key={i.name} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-subtle">
                    <div>
                      <p className="text-sm font-medium">{i.name}</p>
                      <p className="text-xs text-inkmed">{i.detail}</p>
                    </div>
                    <div className="text-right">
                      <StatusChip value={i.status} />
                      <p className="mt-0.5 text-[10px] text-inkmed">{t("Last event")} {fmtRel(i.last_event)}</p>
                    </div>
                  </div>
                ))}
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <button aria-label={t("Notifications")} data-testid="notifications-trigger" className="relative rounded-md p-2 text-inkmed transition-colors hover:bg-subtle hover:text-ink">
                  <Bell size={18} />
                  {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white tnum">{unread}</span>}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-96 p-2" data-testid="notifications-popover">
                <p className="px-2 py-1 text-xs font-semibold text-inkmed">{t("Notifications")}</p>
                <div className="max-h-96 overflow-y-auto">
                  {notifications?.map((n) => (
                    <button key={n.id} data-testid="notification-item"
                      onClick={async () => { await api.markNotification(n.id); mutateNotifs(); navigate(n.link); }}
                      className={cn("flex w-full flex-col items-start rounded-md px-2 py-2 text-left hover:bg-subtle", !n.read && "bg-blue-50/50")}>
                      <div className="flex w-full items-center justify-between gap-2">
                        <StatusChip value={n.priority} toneOverride={tone(n.priority === "Informational" ? "neutral" : n.priority)} />
                        <span className="tnum text-[10px] text-inkmed">{fmtRel(n.ts)}</span>
                      </div>
                      <p className="mt-1 text-sm font-medium text-ink">{n.title}</p>
                      <p className="text-xs text-inkmed">{n.detail}</p>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            <LanguageSwitch />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-md p-1.5 transition-colors hover:bg-subtle" data-testid="user-menu-trigger">
                  <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?crop=entropy&cs=srgb&fm=jpg&q=85&w=64" alt="Pablo" className="h-7 w-7 rounded-full object-cover" />
                  <div className="hidden text-left md:block">
                    <p className="text-xs font-semibold leading-tight">Pablo</p>
                    <p className="text-[10px] leading-tight text-inkmed">{t("Owner / operator")}</p>
                  </div>
                  <ChevronDown size={13} className="text-inkmed" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>{t("Pablo · Owner")}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/settings/users")}>{t("Settings")}</DropdownMenuItem>
                <DropdownMenuItem disabled>{t("Sign out (demo)")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
      <GlobalSearch open={searchOpen} setOpen={setSearchOpen} />
    </div>
  );
}
