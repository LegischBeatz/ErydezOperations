import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import useSWR from "swr";
import { api } from "@/lib/api";
import { money, statusLabel } from "@/lib/shopify";
import { EmptyState, interactiveRowProps, PageHeader, StatusChip, TableOverflowHint } from "@/components/common";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, ShoppingBag } from "lucide-react";

export default function Products() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const status = params.get("status") || "";
  const query = { q: q || undefined, status: status || undefined };
  const { data: products, isLoading, error } = useSWR(["products", query], () => api.products(query));

  const update = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next);
  };

  return (
    <div data-testid="products-page">
      <PageHeader title="Products" freshness={products ? `${products.length} products in the active Shopify snapshot` : "Loading Shopify products…"} status={<span className="inline-flex items-center gap-1 text-xs text-inkmed"><ShoppingBag size={12} /> Product and variant model</span>}>
        <div className="mt-4 flex flex-wrap gap-2">
          <div className="relative min-w-[280px] flex-1 md:max-w-md">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-inkmed" />
            <Input value={q} onChange={(event) => update("q", event.target.value)} placeholder="Product, vendor, type or handle…" className="h-9 pl-9" />
          </div>
          <select value={status} onChange={(event) => update("status", event.target.value)} className="h-9 rounded-md border border-line bg-surface px-3 text-sm">
            <option value="">All product states</option><option value="ACTIVE">Active</option><option value="DRAFT">Draft</option><option value="ARCHIVED">Archived</option>
          </select>
        </div>
      </PageHeader>
      <div className="p-4 sm:p-6">
        {isLoading ? <Skeleton className="h-[520px] w-full" /> : error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-danger">Unable to load Shopify products.</div> : !products?.length ? <EmptyState title="No matching Shopify products" /> : (
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <TableOverflowHint id="products-table-scroll-hint" />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left" aria-describedby="products-table-scroll-hint">
                <thead className="border-b border-line bg-subtle/70 text-[11px] uppercase tracking-wide text-inkmed"><tr><th className="px-4 py-2.5">Product</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5">Vendor / type</th><th className="px-3 py-2.5 text-right">Variants</th><th className="px-3 py-2.5 text-right">Price range</th><th className="px-3 py-2.5 text-right">Total inventory</th><th className="px-3 py-2.5">Availability</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {products.map((product) => (
                    <tr key={product.shopify_id} onClick={() => navigate(`/products/${product.id}`)} {...interactiveRowProps(() => navigate(`/products/${product.id}`), `Open details for ${product.title}`)} className="cursor-pointer transition-colors duration-150 hover:bg-subtle/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand" data-testid={`product-row-${product.id}`}>
                      <td className="px-4 py-3"><div className="flex items-center gap-3">{product.featured_image?.url ? <img src={product.featured_image.url} alt={product.featured_image.alt || product.title} className="h-12 w-12 rounded-md border border-line object-cover" loading="lazy" /> : <div className="flex h-12 w-12 items-center justify-center rounded-md bg-subtle text-inkmed"><ShoppingBag size={17} /></div>}<div className="min-w-0"><p className="max-w-md truncate text-sm font-semibold">{product.title}</p><p className="truncate text-xs text-inkmed">/{product.handle}</p></div></div></td>
                      <td className="px-3 py-3"><StatusChip value={statusLabel(product.status)} /></td>
                      <td className="px-3 py-3"><p className="text-sm">{product.vendor || "—"}</p><p className="text-xs text-inkmed">{product.product_type || "No product type"}</p></td>
                      <td className="tnum px-3 py-3 text-right text-sm font-medium">{product.variant_count}</td>
                      <td className="tnum whitespace-nowrap px-3 py-3 text-right text-sm">{money(product.price_range?.min, product.price_range?.currency)}{product.price_range?.max !== product.price_range?.min ? ` – ${money(product.price_range?.max, product.price_range?.currency)}` : ""}</td>
                      <td className="tnum px-3 py-3 text-right text-sm font-semibold">{product.total_inventory}</td>
                      <td className="px-3 py-3"><div className="flex flex-wrap gap-1">{product.tracks_inventory && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-info">Tracked</span>}{product.has_out_of_stock_variants && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-warn">Some out of stock</span>}{product.online_store_url && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-ok">Online</span>}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
