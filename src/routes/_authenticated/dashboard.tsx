import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { dashboardStats, recentInvoices, recentMovements } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { money, dateTime } from "@/lib/format";
import {
  IndianRupee,
  ReceiptIndianRupee,
  TriangleAlert,
  CalendarRange,
  Banknote,
  CreditCard,
  Smartphone,
  ScanBarcode,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — SuppPOS" },
      {
        name: "description",
        content: "Today's sales, payment split, low stock and recent activity.",
      },
      { property: "og:title", content: "Dashboard — SuppPOS" },
      {
        property: "og:description",
        content: "Today's sales, payment split, low stock and recent activity.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

type Stats = {
  today_sales: number;
  today_invoices: number;
  today_cash: number;
  today_card: number;
  today_upi: number;
  month_sales: number;
  low_stock_count: number;
  product_count: number;
  top_products: { name: string; qty: number; amount: number }[];
};

function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      return (await dashboardStats()) as Stats;
    },
  });

  const { data: recent } = useQuery({
    queryKey: ["recent-invoices"],
    queryFn: async () => {
      return recentInvoices();
    },
  });

  const { data: movements } = useQuery({
    queryKey: ["recent-movements"],
    queryFn: async () => {
      return recentMovements();
    },
  });

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Your store at a glance"
        actions={
          <Button asChild>
            <Link to="/billing">
              <ScanBarcode className="mr-2 size-4" /> New bill
            </Link>
          </Button>
        }
      />
      <div className="space-y-4 p-4 md:p-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Today's sales" value={money(stats?.today_sales)} icon={IndianRupee} />
          <StatCard
            label="Bills today"
            value={stats?.today_invoices ?? 0}
            icon={ReceiptIndianRupee}
          />
          <StatCard label="This month" value={money(stats?.month_sales)} icon={CalendarRange} />
          <StatCard
            label="Low stock items"
            value={stats?.low_stock_count ?? 0}
            icon={TriangleAlert}
            tone={(stats?.low_stock_count ?? 0) > 0 ? "warning" : "default"}
            hint={`${stats?.product_count ?? 0} active products`}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Cash today" value={money(stats?.today_cash)} icon={Banknote} />
          <StatCard label="Card today" value={money(stats?.today_card)} icon={CreditCard} />
          <StatCard label="UPI today" value={money(stats?.today_upi)} icon={Smartphone} />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Recent sales</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {!recent?.length && (
                <p className="py-6 text-center text-sm text-muted-foreground">No sales yet.</p>
              )}
              {recent?.map((inv) => (
                <Link
                  key={inv.id}
                  to="/invoices"
                  className="flex items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-muted"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{inv.invoice_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {dateTime(inv.invoice_date)} · {inv.customer_name_snapshot || "Walk-in"}
                    </p>
                  </div>
                  <span className="tabular font-semibold">{money(inv.total_amount)}</span>
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Top products (30 days)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {!stats?.top_products?.length && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Not enough data yet.
                </p>
              )}
              {stats?.top_products?.map((p) => (
                <div key={p.name} className="flex items-center justify-between px-2 py-1.5 text-sm">
                  <span className="truncate pr-2">{p.name}</span>
                  <span className="tabular shrink-0 text-muted-foreground">{p.qty} sold</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent stock activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {!movements?.length && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No stock activity yet.
              </p>
            )}
            {movements?.map((m) => (
              <div key={m.id} className="flex items-center justify-between px-2 py-1.5 text-sm">
                <span className="truncate pr-2">
                  {(m.products as { name: string } | null)?.name ?? "Product"}
                  <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs capitalize text-muted-foreground">
                    {m.movement_type}
                  </span>
                </span>
                <span
                  className={`tabular shrink-0 font-medium ${m.quantity_change < 0 ? "text-destructive" : "text-success"}`}
                >
                  {m.quantity_change > 0 ? "+" : ""}
                  {m.quantity_change}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
