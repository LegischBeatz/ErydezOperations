import React from "react";
import { useNavigate } from "react-router-dom";
import useSWR from "swr";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { PageHeader, StatusChip, EmptyState } from "@/components/common";
import { Skeleton } from "@/components/ui/skeleton";

export default function Returns() {
  const navigate = useNavigate();
  const { data: returns, isLoading } = useSWR("returns", api.returns);

  return (
    <div data-testid="returns-page">
      <PageHeader title="Returns & warranty" freshness="Every case stays in a visible, aged workflow until customer outcome and financial action are complete" />
      <div className="p-6">
        {isLoading ? (
          <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : !returns?.length ? (
          <EmptyState title="No open returns" description="No RMA or warranty cases exist — a genuine zero." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-semibold text-inkmed">
                  {["RMA", "Order", "Customer", "Product", "Type", "Problem", "State", "Age", "Financial impact"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {returns.map((r) => (
                  <tr key={r.id} onClick={() => navigate(`/returns/${r.id}`)} data-testid={`rma-row-${r.id}`}
                    className="h-[52px] cursor-pointer border-b border-line last:border-0 transition-colors hover:bg-subtle">
                    <td className="tnum px-3 font-medium text-brand">{r.id}</td>
                    <td className="tnum px-3">{r.order_id}</td>
                    <td className="px-3">{r.customer.name}</td>
                    <td className="px-3">{r.product}</td>
                    <td className="px-3 text-xs">{r.type}</td>
                    <td className="max-w-56 truncate px-3 text-xs text-inkmed">{r.problem}</td>
                    <td className="px-3"><StatusChip value={r.state} /></td>
                    <td className="tnum px-3 text-xs">{r.age_days} days</td>
                    <td className="tnum px-3 text-xs">{r.financial_impact}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
