import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import useSWR, { mutate as mutateGlobal } from "swr";
import { api } from "@/lib/api";
import { fmtRel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { StatusChip } from "@/components/common";
import { useT } from "@/lib/i18n";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Boxes,
  ChevronDown,
  History,
  ListTree,
  LayoutDashboard,
  Mail,
  Package,
  PackageCheck,
  PanelLeft,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShoppingBag,
  Store,
  Users,
} from "lucide-react";
import { toast } from "sonner";

const NAV = [
  { to: "/overview", key: "Overview", icon: LayoutDashboard },
  { to: "/orders", key: "Orders", icon: Package },
  { to: "/products", key: "Products", icon: ShoppingBag },
  { to: "/inventory", key: "Inventory", icon: Boxes },
  { to: "/customers", key: "Customers", icon: Users },
  { to: "/fulfillment", key: "Fulfillment", icon: PackageCheck },
  { to: "/returns", key: "Returns & refunds", icon: RotateCcw },
  { to: "/gmail", key: "Gmail", icon: Mail },
  { to: "/audit-timeline", key: "Audit Timeline", icon: History },
  { to: "/provider-ledger", key: "Provider Ledger", icon: ListTree },
  { to: "/settings/integrations", key: "Settings", icon: Settings },
];

function GlobalSearch({ open, setOpen }) {
  const { t } = useT();
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const { data, isLoading } = useSWR(q.trim().length >= 2 ? ["search", q.trim()] : null, () => api.search(q.trim()));
  const go = (path) => {
    setOpen(false);
    setQ("");
    navigate(path);
  };
  const total = data ? Object.values(data).reduce((sum, records) => sum + records.length, 0) : 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="top-24 max-w-2xl translate-y-0 gap-0 p-0" data-testid="global-search-dialog">
        <DialogTitle className="sr-only">{t("Global search")}</DialogTitle>
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search size={16} className="text-inkmed" />
          <Input
            autoFocus
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder={t("Search orders, products, customers, SKU or tracking…")}
            className="h-12 border-0 shadow-none focus-visible:ring-0"
            data-testid="global-search-input"
          />
        </div>
        <div className="max-h-[34rem] overflow-y-auto p-2">
          {q.trim().length < 2 && <p className="p-3 text-xs text-inkmed">{t("Type at least 2 characters to search the active Shopify snapshot.")}</p>}
          {isLoading && <p className="p-3 text-xs text-inkmed">{t("Searching Shopify data…")}</p>}
          {data && total === 0 && <p className="p-3 text-xs text-inkmed">{t("No matching Shopify records.")}</p>}

          {data?.orders?.length > 0 && (
            <SearchGroup title={t("Orders")}>
              {data.orders.map((order) => (
                <SearchRow
                  key={order.shopify_id}
                  onClick={() => go(`/orders/${order.id}`)}
                  primary={`${order.order_number} · ${order.customer?.display_name || order.email || t("Guest")}`}
                  secondary={`${order.financial_status || "—"} · ${order.fulfillment_status || "—"}`}
                />
              ))}
            </SearchGroup>
          )}
          {data?.products?.length > 0 && (
            <SearchGroup title={t("Products")}>
              {data.products.map((product) => (
                <SearchRow
                  key={product.shopify_id}
                  onClick={() => go(`/products/${product.id}`)}
                  primary={product.title}
                  secondary={`${product.vendor || "—"} · ${product.variant_count} ${t("variants")}`}
                />
              ))}
            </SearchGroup>
          )}
          {data?.customers?.length > 0 && (
            <SearchGroup title={t("Customers")}>
              {data.customers.map((customer) => (
                <SearchRow
                  key={customer.shopify_id}
                  onClick={() => go(`/customers/${customer.id}`)}
                  primary={customer.display_name || customer.email || t("Guest")}
                  secondary={`${customer.number_of_orders} ${t("orders")} · ${customer.email || "—"}`}
                />
              ))}
            </SearchGroup>
          )}
          {data?.inventory?.length > 0 && (
            <SearchGroup title={t("Inventory")}>
              {data.inventory.map((item) => (
                <SearchRow
                  key={item.shopify_id}
                  onClick={() => go(`/inventory?item=${encodeURIComponent(item.id)}`)}
                  primary={`${item.product_title || t("Unknown product")} · ${item.variant_title || t("Default")}`}
                  secondary={`${item.sku || t("No SKU")} · ${item.quantities?.available ?? 0} ${t("available")}`}
                />
              ))}
            </SearchGroup>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SearchGroup({ title, children }) {
  return (
    <section className="mb-2 last:mb-0">
      <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-inkmed">{title}</p>
      {children}
    </section>
  );
}

function SearchRow({ primary, secondary, onClick }) {
  return (
    <button onClick={onClick} className="flex w-full items-center justify-between gap-4 rounded-md px-3 py-2 text-left hover:bg-subtle">
      <span className="truncate text-sm font-medium text-ink">{primary}</span>
      <span className="shrink-0 text-xs text-inkmed">{secondary}</span>
    </button>
  );
}

function LanguageSwitch() {
  const { locale, setLocale } = useT();
  return (
    <div className="flex overflow-hidden rounded-md border border-line bg-surface" role="group" aria-label="Language">
      {["de", "en"].map((language) => (
        <button
          key={language}
          onClick={() => setLocale(language)}
          aria-pressed={locale === language}
          className={cn(
            "h-8 w-9 text-[11px] font-semibold uppercase tracking-wide",
            locale === language ? "bg-brand text-white" : "text-inkmed hover:bg-subtle hover:text-ink"
          )}
        >
          {language}
        </button>
      ))}
    </div>
  );
}

export default function AppShell() {
  const { t } = useT();
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const { data: status, mutate: mutateStatus } = useSWR("shopify-status", () => api.shopifyStatus(false), { refreshInterval: 30000 });

  useEffect(() => {
    const handler = (event) => {
      if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(event.target.tagName) && !event.target.isContentEditable) {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const syncNow = async () => {
    setSyncing(true);
    try {
      const result = await api.syncShopify();
      toast.success(t("Shopify synchronization completed"), {
        description: `${result.counts?.orders || 0} ${t("orders")} · ${result.counts?.products || 0} ${t("products")}`,
      });
      await mutateStatus();
      await Promise.all([
        mutateGlobal("overview"),
        mutateGlobal((key) => Array.isArray(key) && ["orders", "products", "inventory", "customers"].includes(key[0])),
      ]);
    } catch (error) {
      toast.error(t("Shopify synchronization failed"), { description: error?.response?.data?.detail || error.message });
    } finally {
      setSyncing(false);
    }
  };

  const health = status?.status || (status?.configured ? "Configured" : "Disconnected");
  const lastSync = status?.active_snapshot?.last_synced_at;

  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      <aside className={cn("fixed inset-y-0 left-0 z-40 flex flex-col border-r border-line bg-surface transition-[width] duration-200", collapsed ? "w-[72px]" : "w-[240px]")} data-testid="app-sidebar">
        <div className="flex h-14 items-center gap-2 border-b border-line px-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand text-sm font-bold text-white">E</div>
          {!collapsed && (
            <div>
              <p className="text-sm font-semibold tracking-tight">E-RYDEZ Console</p>
              <p className="text-[10px] text-inkmed">Shopify operations</p>
            </div>
          )}
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2" aria-label="Primary">
          {NAV.map(({ to, key, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              data-testid={`nav-${key.toLowerCase().replace(/\s+/g, "-")}`}
              className={({ isActive }) => cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150",
                isActive ? "bg-brand/10 text-brand" : "text-inkmed hover:bg-subtle hover:text-ink",
                collapsed && "justify-center px-0"
              )}
            >
              <Icon size={18} strokeWidth={2} />
              {!collapsed && t(key)}
            </NavLink>
          ))}
        </nav>
        {!collapsed && (
          <div className="border-t border-line p-3 text-[11px] text-inkmed">
            <div className="flex items-center gap-1.5"><Store size={12} /> Shopify is the source of truth</div>
            <p className="mt-1 truncate">{status?.store_domain || "Not configured"}</p>
          </div>
        )}
      </aside>

      <div className={cn("flex min-w-0 flex-1 flex-col transition-[margin] duration-200", collapsed ? "ml-[72px]" : "ml-[240px]")}>
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface px-4" data-testid="top-bar">
          <button onClick={() => setCollapsed(!collapsed)} aria-label="Toggle sidebar" className="rounded-md p-2 text-inkmed hover:bg-subtle hover:text-ink">
            <PanelLeft size={18} />
          </button>
          <button onClick={() => setSearchOpen(true)} className="flex h-9 w-full max-w-lg items-center gap-2 rounded-md border border-line bg-canvas px-3 text-sm text-inkmed hover:border-brand/40">
            <Search size={15} /> {t("Search Shopify orders, products, customers…")}
            <kbd className="ml-auto rounded border border-line bg-surface px-1.5 text-[10px]">/</kbd>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={syncNow}
              disabled={syncing || status?.sync_running}
              className="flex h-9 items-center gap-1.5 rounded-md bg-brand px-3 text-sm font-medium text-white hover:bg-brand/90 disabled:cursor-wait disabled:opacity-60"
              data-testid="sync-shopify-button"
            >
              <RefreshCw size={14} className={cn(syncing && "animate-spin")} />
              {syncing ? t("Synchronizing…") : t("Sync Shopify")}
            </button>
            <Popover>
              <PopoverTrigger asChild>
                <button className="flex h-9 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-xs font-medium" data-testid="integration-health-trigger">
                  <StatusChip value={health} /> <ChevronDown size={12} className="text-inkmed" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">Shopify</p>
                    <p className="text-xs text-inkmed">{status?.store_domain || t("Not configured")}</p>
                  </div>
                  <StatusChip value={health} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  {["orders", "products", "customers"].map((name) => (
                    <div key={name} className="rounded-md bg-subtle p-2">
                      <p className="tnum text-sm font-semibold">{status?.active_snapshot?.counts?.[name] ?? "—"}</p>
                      <p className="text-[10px] uppercase tracking-wide text-inkmed">{t(name)}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-inkmed">{lastSync ? `${t("Last complete sync")} ${fmtRel(lastSync)}` : t("No active Shopify snapshot")}</p>
              </PopoverContent>
            </Popover>
            <LanguageSwitch />
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-subtle text-xs font-semibold text-ink">P</div>
          </div>
        </header>
        <main className="min-w-0 flex-1"><Outlet /></main>
      </div>
      <GlobalSearch open={searchOpen} setOpen={setSearchOpen} />
    </div>
  );
}
