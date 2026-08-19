import React from "react";
import { Link, useParams } from "react-router-dom";
import useSWR from "swr";
import { api } from "@/lib/api";
import { fmtDateTime, fmtRel } from "@/lib/format";
import { addressLine, customerName, money, statusLabel } from "@/lib/shopify";
import { EmptyState, FactList, InlineAlert, PageHeader, SectionCard, StatusChip } from "@/components/common";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, MapPin, Store, Truck, User } from "lucide-react";

function AddressBlock({ address, label }) {
  return (
    <SectionCard title={label}>
      {!address ? <p className="text-sm text-inkmed">Not provided by Shopify.</p> : (
        <div className="text-sm leading-6">
          <p className="font-medium">{address.name || [address.first_name, address.last_name].filter(Boolean).join(" ") || "—"}</p>
          {address.company && <p>{address.company}</p>}
          <p>{address.address1 || "—"}{address.address2 ? `, ${address.address2}` : ""}</p>
          <p>{[address.postal_code, address.city].filter(Boolean).join(" ")}</p>
          <p>{[address.province, address.country].filter(Boolean).join(", ")}</p>
          {address.phone && <p className="tnum mt-1 text-inkmed">{address.phone}</p>}
        </div>
      )}
    </SectionCard>
  );
}

function MoneyRow({ label, value, emphasized = false }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-2 text-sm last:border-0">
      <span className="text-inkmed">{label}</span>
      <span className={`tnum ${emphasized ? "text-base font-semibold text-ink" : "font-medium"}`}>{money(value)}</span>
    </div>
  );
}

export default function OrderDetail() {
  const { orderId } = useParams();
  const { data: order, isLoading, error } = useSWR(["order", orderId], () => api.order(orderId));

  if (isLoading || !order) {
    return <div className="space-y-4 p-6"><Skeleton className="h-10 w-96" /><Skeleton className="h-[520px]" /></div>;
  }
  if (error) return <div className="p-6 text-sm text-danger">Unable to load this Shopify order.</div>;

  const adminUrl = order.legacy_id ? `https://r239z0-21.myshopify.com/admin/orders/${order.legacy_id}` : null;
  const customerId = order.customer?.id;

  return (
    <div data-testid="order-detail-page">
      <PageHeader
        breadcrumb={<Link to="/orders" className="hover:text-brand">Orders</Link>}
        title={order.order_number || "Order"}
        identifier={order.confirmation_number ? `· ${order.confirmation_number}` : null}
        status={<div className="flex flex-wrap gap-2"><StatusChip value={statusLabel(order.financial_status)} /><StatusChip value={statusLabel(order.fulfillment_status)} />{order.cancelled_at && <StatusChip value="Cancelled" toneOverride="danger" />}</div>}
        freshness={`Processed ${fmtDateTime(order.processed_at)} · updated ${fmtRel(order.updated_at)} · synchronized ${fmtRel(order.synced_at)}`}
        actions={adminUrl && <a href={adminUrl} target="_blank" rel="noreferrer" className="flex h-9 items-center gap-1.5 rounded-md border border-line bg-surface px-3 text-sm font-medium hover:bg-subtle"><ExternalLink size={14} /> Open in Shopify</a>}
      />

      <div className="grid grid-cols-1 gap-4 p-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <InlineAlert toneName="info" title="Shopify is authoritative">
            This console mirrors the current Shopify order. Financial, fulfillment, refund, return, address, and line-item information is read-only here.
          </InlineAlert>

          <Tabs defaultValue="overview">
            <TabsList className="h-10 bg-subtle">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="items">Line items ({order.line_items?.length || 0})</TabsTrigger>
              <TabsTrigger value="fulfillment">Fulfillments ({order.fulfillments?.length || 0})</TabsTrigger>
              <TabsTrigger value="financials">Financials</TabsTrigger>
              <TabsTrigger value="adjustments">Refunds & returns ({(order.refunds?.length || 0) + (order.returns?.length || 0)})</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <SectionCard title="Customer">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-subtle text-inkmed"><User size={16} /></div>
                  <div className="min-w-0">
                    {customerId ? <Link to={`/customers/${customerId}`} className="font-medium text-brand hover:underline">{customerName(order)}</Link> : <p className="font-medium">{customerName(order)}</p>}
                    <p className="truncate text-sm text-inkmed">{order.customer?.email || order.email || "No email"}</p>
                    <p className="tnum text-sm text-inkmed">{order.customer?.phone || order.phone || "No phone"}</p>
                  </div>
                </div>
              </SectionCard>
              <SectionCard title="Order facts">
                <FactList facts={[
                  ["Source", statusLabel(order.source_name || "Shopify")],
                  ["Delivery", order.shipping_line?.title || statusLabel(order.delivery_method)],
                  ["Requires shipping", order.requires_shipping ? "Yes" : "No"],
                  ["Items", `${order.line_item_count} units across ${order.line_items?.length || 0} lines`],
                  ["Test order", order.test ? "Yes" : "No"],
                  ["Return status", statusLabel(order.return_status)],
                ]} />
              </SectionCard>
              <AddressBlock address={order.shipping_address} label="Shipping address" />
              <AddressBlock address={order.billing_address} label="Billing address" />
              <SectionCard title="Tags & note" className="md:col-span-2">
                <div className="flex flex-wrap gap-1.5">{order.tags?.length ? order.tags.map((tag) => <span key={tag} className="rounded-full border border-line bg-subtle px-2 py-0.5 text-xs">{tag}</span>) : <span className="text-sm text-inkmed">No Shopify tags</span>}</div>
                {order.note && <p className="mt-3 whitespace-pre-wrap rounded-md bg-subtle p-3 text-sm">{order.note}</p>}
              </SectionCard>
            </TabsContent>

            <TabsContent value="items" className="mt-4">
              <SectionCard title="Shopify line items">
                <div className="-m-4 overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left">
                    <thead className="border-b border-line bg-subtle/60 text-[11px] uppercase tracking-wide text-inkmed"><tr><th className="px-4 py-2">Product / variant</th><th className="px-3 py-2">SKU</th><th className="px-3 py-2 text-right">Ordered</th><th className="px-3 py-2 text-right">Current</th><th className="px-3 py-2 text-right">Refundable</th><th className="px-3 py-2 text-right">Unit price</th><th className="px-3 py-2 text-right">Discounted total</th></tr></thead>
                    <tbody className="divide-y divide-line">
                      {(order.line_items || []).map((item) => (
                        <tr key={item.shopify_id}>
                          <td className="px-4 py-3"><p className="text-sm font-medium">{item.product_title || item.title}</p><p className="text-xs text-inkmed">{item.variant_title || "Default variant"}</p></td>
                          <td className="tnum px-3 py-3 text-sm">{item.sku || "—"}</td>
                          <td className="tnum px-3 py-3 text-right text-sm">{item.quantity}</td>
                          <td className="tnum px-3 py-3 text-right text-sm">{item.current_quantity}</td>
                          <td className="tnum px-3 py-3 text-right text-sm">{item.refundable_quantity}</td>
                          <td className="tnum px-3 py-3 text-right text-sm">{money(item.discounted_unit_price || item.original_unit_price)}</td>
                          <td className="tnum px-3 py-3 text-right text-sm font-semibold">{money(item.discounted_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            </TabsContent>

            <TabsContent value="fulfillment" className="mt-4 space-y-4">
              {order.fulfillments?.length ? order.fulfillments.map((fulfillment) => (
                <SectionCard key={fulfillment.shopify_id} title={`Fulfillment ${fulfillment.id}`} action={<StatusChip value={statusLabel(fulfillment.status)} />}>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <FactList facts={[["Created", fmtDateTime(fulfillment.created_at)], ["Updated", fmtDateTime(fulfillment.updated_at)], ["Delivered", fulfillment.delivered_at ? fmtDateTime(fulfillment.delivered_at) : "—"], ["Estimated delivery", fulfillment.estimated_delivery_at ? fmtDateTime(fulfillment.estimated_delivery_at) : "—"]]} />
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-inkmed">Tracking</p>
                      {fulfillment.tracking?.length ? fulfillment.tracking.map((entry, index) => (
                        <div key={`${entry.number}-${index}`} className="mb-2 rounded-md border border-line p-2 last:mb-0"><p className="tnum text-sm font-medium">{entry.number || "No number"}</p><p className="text-xs text-inkmed">{entry.company || "Carrier not supplied"}</p>{entry.url && <a href={entry.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">Track shipment <ExternalLink size={11} /></a>}</div>
                      )) : <p className="text-sm text-inkmed">No tracking information.</p>}
                    </div>
                  </div>
                </SectionCard>
              )) : <EmptyState title="No Shopify fulfillments" description="This order has not produced a fulfillment record." />}
            </TabsContent>

            <TabsContent value="financials" className="mt-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <SectionCard title="Current amounts">
                  <MoneyRow label="Subtotal" value={order.money?.current_subtotal} />
                  <MoneyRow label="Discounts" value={order.money?.current_discounts} />
                  <MoneyRow label="Shipping" value={order.money?.current_shipping} />
                  <MoneyRow label="Tax" value={order.money?.current_tax} />
                  <MoneyRow label="Current total" value={order.money?.current_total} emphasized />
                </SectionCard>
                <SectionCard title="Settlement">
                  <MoneyRow label="Original total" value={order.money?.total} />
                  <MoneyRow label="Refunded" value={order.money?.refunded} />
                  <MoneyRow label="Outstanding" value={order.money?.outstanding} />
                  <div className="mt-3 flex flex-wrap gap-2"><StatusChip value={statusLabel(order.financial_status)} />{order.fully_paid && <StatusChip value="Fully paid" toneOverride="ok" />}{order.unpaid && <StatusChip value="Unpaid" toneOverride="warn" />}</div>
                </SectionCard>
              </div>
            </TabsContent>

            <TabsContent value="adjustments" className="mt-4 space-y-4">
              <SectionCard title={`Refunds (${order.refunds?.length || 0})`}>
                {order.refunds?.length ? order.refunds.map((refund) => (
                  <div key={refund.shopify_id} className="flex items-start justify-between gap-4 border-b border-line py-3 first:pt-0 last:border-0 last:pb-0"><div><p className="tnum text-sm font-medium">Refund {refund.id}</p><p className="text-xs text-inkmed">{fmtDateTime(refund.created_at)} · {refund.line_items?.length || 0} line adjustments</p>{refund.note && <p className="mt-1 text-sm">{refund.note}</p>}</div><p className="tnum text-sm font-semibold text-danger">{money(refund.total_refunded)}</p></div>
                )) : <p className="text-sm text-inkmed">No Shopify refunds.</p>}
              </SectionCard>
              <SectionCard title={`Returns (${order.returns?.length || 0})`}>
                {order.returns?.length ? order.returns.map((record) => (
                  <div key={record.shopify_id} className="flex items-center justify-between border-b border-line py-3 first:pt-0 last:border-0 last:pb-0"><div><p className="text-sm font-medium">{record.name}</p><p className="text-xs text-inkmed">{fmtDateTime(record.created_at)} · {record.total_quantity} units</p></div><StatusChip value={statusLabel(record.status)} /></div>
                )) : <p className="text-sm text-inkmed">No Shopify Return objects are associated with this order.</p>}
              </SectionCard>
            </TabsContent>
          </Tabs>
        </div>

        <aside className="space-y-4">
          <SectionCard title="Shopify record">
            <div className="mb-3 flex items-center gap-2 text-sm"><Store size={15} className="text-brand" /><span className="font-medium">Authoritative Shopify order</span></div>
            <FactList facts={[["Order ID", order.id], ["Legacy ID", order.legacy_id], ["Shopify GID", order.shopify_id], ["Created", fmtDateTime(order.created_at)], ["Updated", fmtDateTime(order.updated_at)], ["Closed", order.closed_at ? fmtDateTime(order.closed_at) : "—"], ["Cancelled", order.cancelled_at ? fmtDateTime(order.cancelled_at) : "—"]]} />
          </SectionCard>
          <SectionCard title="Delivery">
            <div className="mb-3 flex items-center gap-2"><MapPin size={15} className="text-inkmed" /><span className="text-sm font-medium">{addressLine(order.shipping_address)}</span></div>
            <FactList facts={[["Method", order.shipping_line?.title || statusLabel(order.delivery_method)], ["Tracking entries", order.tracking?.length || 0], ["Requires shipping", order.requires_shipping ? "Yes" : "No"]]} />
            {order.status_page_url && <a href={order.status_page_url} target="_blank" rel="noreferrer" className="mt-3 flex h-9 items-center justify-center gap-1.5 rounded-md border border-line text-sm font-medium hover:bg-subtle"><Truck size={14} /> Customer status page <ExternalLink size={12} /></a>}
          </SectionCard>
          {order.cancelled_at && <InlineAlert toneName="danger" title="Order cancelled">{statusLabel(order.cancel_reason)} · {fmtDateTime(order.cancelled_at)}</InlineAlert>}
        </aside>
      </div>
    </div>
  );
}
