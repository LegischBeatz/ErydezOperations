import React from "react";
import { Link, useParams } from "react-router-dom";
import useSWR from "swr";
import { api } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { money, statusLabel } from "@/lib/shopify";
import { EmptyState, FactList, PageHeader, SectionCard, StatusChip } from "@/components/common";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, ShoppingBag } from "lucide-react";

export default function ProductDetail() {
  const { productId } = useParams();
  const { data: product, isLoading, error } = useSWR(["product", productId], () => api.product(productId));
  if (isLoading || !product) return <div className="space-y-4 p-6"><Skeleton className="h-10 w-96" /><Skeleton className="h-[520px]" /></div>;
  if (error) return <div className="p-6 text-sm text-danger">Unable to load this Shopify product.</div>;

  return (
    <div data-testid="product-detail-page">
      <PageHeader breadcrumb={<Link to="/products" className="hover:text-brand">Products</Link>} title={product.title} status={<StatusChip value={statusLabel(product.status)} />} freshness={`Updated ${fmtDateTime(product.updated_at)} · ${product.variant_count} variants · ${product.total_inventory} total inventory`} actions={product.online_store_url && <a href={product.online_store_url} target="_blank" rel="noreferrer" className="flex h-9 items-center gap-1.5 rounded-md border border-line bg-surface px-3 text-sm font-medium hover:bg-subtle"><ExternalLink size={14} /> View storefront</a>} />
      <div className="grid grid-cols-1 gap-4 p-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <SectionCard title="Product">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[180px_1fr]">
              {product.featured_image?.url ? <img src={product.featured_image.url} alt={product.featured_image.alt || product.title} className="aspect-square w-full rounded-lg border border-line object-cover" /> : <div className="flex aspect-square items-center justify-center rounded-lg bg-subtle text-inkmed"><ShoppingBag size={28} /></div>}
              <div>
                <p className="whitespace-pre-wrap text-sm leading-6 text-ink">{product.description || "No Shopify product description."}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">{product.tags?.map((tag) => <span key={tag} className="rounded-full border border-line bg-subtle px-2 py-0.5 text-xs">{tag}</span>)}</div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title={`Variants (${product.variants?.length || 0})`}>
            {!product.variants?.length ? <EmptyState title="No Shopify variants" /> : (
              <div className="-m-4 overflow-x-auto">
                <table className="w-full min-w-[980px] text-left">
                  <thead className="border-b border-line bg-subtle/60 text-[11px] uppercase tracking-wide text-inkmed"><tr><th className="px-4 py-2">Variant</th><th className="px-3 py-2">SKU</th><th className="px-3 py-2">Options</th><th className="px-3 py-2 text-right">Price</th><th className="px-3 py-2 text-right">Compare at</th><th className="px-3 py-2 text-right">Inventory</th><th className="px-3 py-2">Policy</th></tr></thead>
                  <tbody className="divide-y divide-line">{product.variants.map((variant) => <tr key={variant.shopify_id}><td className="px-4 py-3"><p className="text-sm font-medium">{variant.title || "Default"}</p><p className="text-xs text-inkmed">{variant.available_for_sale ? "Available for sale" : "Unavailable for sale"}</p></td><td className="tnum px-3 py-3 text-sm">{variant.sku || "—"}</td><td className="px-3 py-3 text-sm">{variant.selected_options?.map((option) => `${option.name}: ${option.value}`).join(" · ") || "—"}</td><td className="tnum px-3 py-3 text-right text-sm font-semibold">{money(variant.price, variant.currency)}</td><td className="tnum px-3 py-3 text-right text-sm">{variant.compare_at_price != null ? money(variant.compare_at_price, variant.currency) : "—"}</td><td className="tnum px-3 py-3 text-right text-sm">{variant.inventory_quantity}</td><td className="px-3 py-3 text-sm">{statusLabel(variant.inventory_policy)}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Shopify inventory by variant">
            {!product.inventory?.length ? <EmptyState title="No inventory items linked" /> : (
              <div className="divide-y divide-line">{product.inventory.map((item) => <div key={item.shopify_id} className="grid grid-cols-2 gap-3 py-3 first:pt-0 last:pb-0 md:grid-cols-6"><div className="col-span-2"><p className="text-sm font-medium">{item.variant_title}</p><p className="tnum text-xs text-inkmed">{item.sku || "No SKU"}</p></div>{["available", "on_hand", "committed", "incoming"].map((name) => <div key={name} className="text-right"><p className="tnum text-sm font-semibold">{item.quantities?.[name] ?? 0}</p><p className="text-[10px] uppercase tracking-wide text-inkmed">{name.replace("_", " ")}</p></div>)}</div>)}</div>
            )}
          </SectionCard>
        </div>

        <aside className="space-y-4">
          <SectionCard title="Shopify product facts"><FactList facts={[["Vendor", product.vendor || "—"], ["Product type", product.product_type || "—"], ["Category", product.category?.full_name || product.category?.name || "—"], ["Handle", product.handle], ["Price range", `${money(product.price_range?.min, product.price_range?.currency)} – ${money(product.price_range?.max, product.price_range?.currency)}`], ["Tracks inventory", product.tracks_inventory ? "Yes" : "No"], ["Created", fmtDateTime(product.created_at)], ["Published", product.published_at ? fmtDateTime(product.published_at) : "Not published"]]} /></SectionCard>
          <SectionCard title="Options">{product.options?.length ? <div className="space-y-3">{product.options.map((option) => <div key={option.shopify_id}><p className="text-sm font-medium">{option.name}</p><p className="mt-1 text-xs text-inkmed">{option.values?.join(" · ")}</p></div>)}</div> : <p className="text-sm text-inkmed">No product options.</p>}</SectionCard>
          <SectionCard title="Shopify identity"><FactList facts={[["Product ID", product.id], ["Legacy ID", product.legacy_id], ["Shopify GID", product.shopify_id], ["Media", product.media?.length || 0]]} /></SectionCard>
        </aside>
      </div>
    </div>
  );
}
