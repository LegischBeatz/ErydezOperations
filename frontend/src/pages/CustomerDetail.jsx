import React from "react";
import { Link, useParams } from "react-router-dom";
import useSWR from "swr";
import { api } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { addressLine, customerDisplayName, itemSummary, money, statusLabel } from "@/lib/shopify";
import { EmptyState, FactList, PageHeader, SectionCard, StatusChip } from "@/components/common";
import { Skeleton } from "@/components/ui/skeleton";

export default function CustomerDetail() {
  const { customerId } = useParams();
  const { data: customer, isLoading, error } = useSWR(["customer", customerId], () => api.customer(customerId));
  if (isLoading || !customer) return <div className="space-y-4 p-6"><Skeleton className="h-10 w-96" /><Skeleton className="h-[480px]" /></div>;
  if (error) return <div className="p-6 text-sm text-danger">Unable to load this Shopify customer.</div>;

  return (
    <div data-testid="customer-detail-page">
      <PageHeader breadcrumb={<Link to="/customers" className="hover:text-brand">Customers</Link>} title={customerDisplayName(customer)} status={<StatusChip value={statusLabel(customer.state)} />} freshness={`Updated ${fmtDateTime(customer.updated_at)} · ${customer.orders?.length || 0} linked orders`} />
      <div className="grid grid-cols-1 gap-4 p-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <SectionCard title={`Shopify order history (${customer.orders?.length || 0})`}>
            {!customer.orders?.length ? <EmptyState title="No orders linked to this customer" /> : <div className="-m-4 overflow-x-auto"><table className="w-full min-w-[860px] text-left"><thead className="border-b border-line bg-subtle/60 text-[11px] uppercase tracking-wide text-inkmed"><tr><th className="px-4 py-2">Order</th><th className="px-3 py-2">Processed</th><th className="px-3 py-2">Items</th><th className="px-3 py-2 text-right">Current total</th><th className="px-3 py-2">Payment</th><th className="px-3 py-2">Fulfillment</th></tr></thead><tbody className="divide-y divide-line">{customer.orders.map((order) => <tr key={order.shopify_id} className="hover:bg-subtle/60"><td className="px-4 py-3"><Link to={`/orders/${order.id}`} className="tnum text-sm font-semibold text-brand hover:underline">{order.order_number}</Link></td><td className="tnum px-3 py-3 text-sm">{fmtDateTime(order.processed_at)}</td><td className="max-w-xs px-3 py-3"><p className="truncate text-sm">{itemSummary(order)}</p><p className="text-xs text-inkmed">{order.line_item_count} units</p></td><td className="tnum px-3 py-3 text-right text-sm font-semibold">{money(order.money?.current_total, order.currency)}</td><td className="px-3 py-3"><StatusChip value={statusLabel(order.financial_status)} /></td><td className="px-3 py-3"><StatusChip value={statusLabel(order.fulfillment_status)} /></td></tr>)}</tbody></table></div>}
          </SectionCard>
        </div>
        <aside className="space-y-4">
          <SectionCard title="Customer facts"><FactList facts={[["Email", customer.email || "—"], ["Phone", customer.phone || "—"], ["Verified email", customer.verified_email ? "Yes" : "No"], ["Tax exempt", customer.tax_exempt ? "Yes" : "No"], ["Number of orders", customer.number_of_orders], ["Amount spent", money(customer.amount_spent)], ["Created", fmtDateTime(customer.created_at)]]} /></SectionCard>
          <SectionCard title="Default address"><p className="text-sm font-medium">{customer.default_address?.name || customerDisplayName(customer)}</p><p className="mt-1 text-sm leading-6 text-inkmed">{customer.default_address?.address1 || "—"}{customer.default_address?.address2 ? `, ${customer.default_address.address2}` : ""}<br />{[customer.default_address?.postal_code, customer.default_address?.city].filter(Boolean).join(" ")}<br />{[customer.default_address?.province, customer.default_address?.country].filter(Boolean).join(", ")}</p><p className="mt-2 text-xs text-inkmed">{addressLine(customer.default_address)}</p></SectionCard>
          <SectionCard title="Tags & notes"><div className="flex flex-wrap gap-1.5">{customer.tags?.length ? customer.tags.map((tag) => <span key={tag} className="rounded-full border border-line bg-subtle px-2 py-0.5 text-xs">{tag}</span>) : <span className="text-sm text-inkmed">No tags</span>}</div>{customer.note && <p className="mt-3 whitespace-pre-wrap rounded-md bg-subtle p-3 text-sm">{customer.note}</p>}</SectionCard>
          <SectionCard title="Shopify identity"><FactList facts={[["Customer ID", customer.id], ["Legacy ID", customer.legacy_id], ["Shopify GID", customer.shopify_id], ["Synchronized", fmtDateTime(customer.synced_at)]]} /></SectionCard>
        </aside>
      </div>
    </div>
  );
}
