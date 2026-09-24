import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pie, PieChart, Cell } from "recharts";
import {
  listProducts,
  movementsAfter as fetchMovementsAfter,
  reportReturns,
  reportSales,
} from "@/lib/data";
import { useShopSettings } from "@/hooks/useShopSettings";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { downloadDailySalesPdf, downloadStockPdf } from "@/lib/report-pdf";
import { dateTime, money, todayISO } from "@/lib/format";
import {
  Download,
  Banknote,
  CircleDollarSign,
  PackageCheck,
  ReceiptText,
  RotateCcw,
  ShoppingBasket,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports — SuppPOS" },
      {
        name: "description",
        content: "Daily sales, profit, refunds, payment mix and current stock valuation reports.",
      },
      { property: "og:title", content: "Reports — SuppPOS" },
      {
        property: "og:description",
        content: "Daily sales, profit, refunds, payment mix and current stock valuation reports.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Reports,
});

const chartConfig = {
  cash: { label: "Cash", color: "var(--color-chart-1)" },
  card: { label: "Card", color: "var(--color-chart-2)" },
  upi: { label: "UPI", color: "var(--color-chart-3)" },
} satisfies ChartConfig;

function Reports() {
  const { data: settings } = useShopSettings();
  const [date, setDate] = useState(todayISO());
  const fromTs = `${date}T00:00:00`;
  const toTs = `${date}T23:59:59.999`;

  const sales = useQuery({
    queryKey: ["daily-sales-report", date],
    queryFn: async () => {
      return reportSales(fromTs, toTs);
    },
  });
  const returns = useQuery({
    queryKey: ["daily-return-report", date],
    queryFn: async () => {
      return reportReturns(fromTs, toTs);
    },
  });
  const products = useQuery({
    queryKey: ["stock-report-products"],
    queryFn: async () => {
      return listProducts(true);
    },
  });
  const [stockDate, setStockDate] = useState(todayISO());
  const stockEndTs = `${stockDate}T23:59:59.999`;
  const movementsAfter = useQuery({
    queryKey: ["stock-report-movements-after", stockDate],
    queryFn: async () => {
      return fetchMovementsAfter(stockEndTs);
    },
  });

  const report = useMemo(() => {
    const invoiceRows = sales.data ?? [];
    const returnRows = returns.data ?? [];
    const totalSales = invoiceRows.reduce((sum, invoice) => sum + Number(invoice.total_amount), 0);
    const grossTax = invoiceRows.reduce((sum, invoice) => sum + Number(invoice.tax_amount), 0);
    const grossProfit = invoiceRows.reduce(
      (sum, invoice) =>
        sum +
        invoice.invoice_items.reduce(
          (lineSum, item) =>
            lineSum +
            Number(item.taxable_amount) -
            Number(item.cost_price_snapshot) * item.quantity,
          0,
        ),
      0,
    );
    const refunded = returnRows.reduce((sum, entry) => sum + Number(entry.total_refund), 0);
    const returnedTax = returnRows.reduce(
      (sum, entry) =>
        sum +
        entry.sales_return_items.reduce((lineSum, item) => lineSum + Number(item.tax_amount), 0),
      0,
    );
    const returnedProfit = returnRows.reduce(
      (sum, entry) =>
        sum +
        entry.sales_return_items.reduce(
          (lineSum, item) => lineSum + Number(item.taxable_amount) - Number(item.cost_amount),
          0,
        ),
      0,
    );
    const returnProducts = returnRows.reduce(
      (sum, entry) =>
        sum + entry.sales_return_items.reduce((lineSum, item) => lineSum + item.quantity, 0),
      0,
    );
    const paymentAmounts: Record<"cash" | "card" | "upi", number> = { cash: 0, card: 0, upi: 0 };
    invoiceRows.forEach((invoice) => {
      const method = invoice.payments?.[0]?.method as keyof typeof paymentAmounts | undefined;
      if (method) paymentAmounts[method] += Number(invoice.total_amount);
    });
    returnRows.forEach((entry) => {
      const method = entry.refund_method as keyof typeof paymentAmounts;
      if (method in paymentAmounts) paymentAmounts[method] -= Number(entry.total_refund);
    });
    const payments = Object.entries(paymentAmounts).map(([method, amount]) => ({
      method,
      amount: Math.max(0, amount),
      fill: `var(--color-${method})`,
    }));
    return {
      invoiceRows,
      returnRows,
      totalSales,
      refunded,
      netSales: totalSales - refunded,
      gst: grossTax - returnedTax,
      profit: grossProfit - returnedProfit,
      returnProducts,
      payments,
    };
  }, [sales.data, returns.data]);

  const stockRows = useMemo(() => {
    const deltas = new Map<string, number>();
    (movementsAfter.data ?? []).forEach((movement) => {
      deltas.set(
        movement.product_id,
        (deltas.get(movement.product_id) ?? 0) + movement.quantity_change,
      );
    });
    return (products.data ?? []).map((product) => {
      const stock = product.current_stock - (deltas.get(product.id) ?? 0);
      return {
        product,
        stock,
        costValue: Number(product.purchase_price) * stock,
        sellingValue: Number(product.selling_price) * stock,
      };
    });
  }, [products.data, movementsAfter.data]);
  const stockTotals = stockRows.reduce(
    (total, row) => ({
      quantity: total.quantity + row.stock,
      cost: total.cost + row.costValue,
      selling: total.selling + row.sellingValue,
    }),
    { quantity: 0, cost: 0, selling: 0 },
  );

  const dailyPdf = () =>
    downloadDailySalesPdf(
      {
        date,
        totalSales: report.totalSales,
        netSales: report.netSales,
        profit: report.profit,
        gst: report.gst,
        returnCount: report.returnRows.length,
        returnProducts: report.returnProducts,
        refunded: report.refunded,
        payments: report.payments.map((item) => ({
          method: item.method.toUpperCase(),
          amount: item.amount,
        })),
        sales: report.invoiceRows.map((invoice) => [
          invoice.invoice_number,
          dateTime(invoice.invoice_date),
          invoice.customer_name_snapshot ?? "Walk-in",
          invoice.payments?.[0]?.method?.toUpperCase() ?? "",
          money(invoice.total_amount),
        ]),
        returns: report.returnRows.map((entry) => [
          entry.return_number,
          entry.invoices?.invoice_number ?? "",
          entry.sales_return_items.reduce((sum, item) => sum + item.quantity, 0),
          entry.refund_method.toUpperCase(),
          money(entry.total_refund),
        ]),
      },
      settings,
    );

  const stockPdf = () =>
    downloadStockPdf(
      stockRows.map(({ product, stock, costValue, sellingValue }) => [
        product.name,
        stock,
        money(product.purchase_price),
        money(costValue),
        money(sellingValue),
      ]),
      stockTotals,
      stockDate,
      settings,
    );

  return (
    <div>
      <PageHeader title="Reports" subtitle="Clear daily performance and current stock value" />
      <div className="space-y-4 p-4 md:p-6">
        <Tabs defaultValue="daily">
          <TabsList>
            <TabsTrigger value="daily">Daily sales</TabsTrigger>
            <TabsTrigger value="stock">Stock</TabsTrigger>
          </TabsList>
          <TabsContent value="daily" className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="report-date">Report date</Label>
                <Input
                  id="report-date"
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="w-48"
                />
              </div>
              <Button onClick={dailyPdf} disabled={sales.isLoading || returns.isLoading}>
                <Download className="mr-2 size-4" /> Download PDF
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                icon={CircleDollarSign}
                label="Total sales"
                value={money(report.totalSales)}
              />
              <Metric icon={Banknote} label="Net sales" value={money(report.netSales)} />
              <Metric icon={ShoppingBasket} label="Profit earned" value={money(report.profit)} />
              <Metric icon={ReceiptText} label="GST generated" value={money(report.gst)} />
              <Metric
                icon={RotateCcw}
                label="Return count"
                value={String(report.returnRows.length)}
              />
              <Metric
                icon={PackageCheck}
                label="Products returned"
                value={String(report.returnProducts)}
              />
              <Metric icon={Banknote} label="Money refunded" value={money(report.refunded)} />
            </div>
            <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
              <Card>
                <CardHeader>
                  <CardTitle>Payment mix</CardTitle>
                </CardHeader>
                <CardContent>
                  {report.payments.some((item) => item.amount > 0) ? (
                    <ChartContainer config={chartConfig} className="mx-auto h-64 w-full max-w-72">
                      <PieChart>
                        <ChartTooltip
                          content={
                            <ChartTooltipContent
                              hideLabel
                              formatter={(value, name) => (
                                <div className="flex min-w-28 justify-between gap-3">
                                  <span>{String(name).toUpperCase()}</span>
                                  <span className="font-semibold">{money(Number(value))}</span>
                                </div>
                              )}
                            />
                          }
                        />
                        <Pie
                          data={report.payments}
                          dataKey="amount"
                          nameKey="method"
                          innerRadius={55}
                          outerRadius={90}
                        >
                          {report.payments.map((entry) => (
                            <Cell key={entry.method} fill={entry.fill} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ChartContainer>
                  ) : (
                    <p className="py-20 text-center text-sm text-muted-foreground">
                      No payments for this day.
                    </p>
                  )}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    {report.payments.map((item) => (
                      <div key={item.method}>
                        <span className="font-medium uppercase">{item.method}</span>
                        <p className="tabular text-muted-foreground">{money(item.amount)}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Sales and returns</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="mb-2 text-sm font-semibold">Sales</p>
                    <CompactTable
                      headers={["Invoice", "Customer", "Payment", "Total"]}
                      rows={report.invoiceRows.map((invoice) => [
                        invoice.invoice_number,
                        invoice.customer_name_snapshot ?? "Walk-in",
                        invoice.payments?.[0]?.method?.toUpperCase() ?? "",
                        money(invoice.total_amount),
                      ])}
                      empty="No sales recorded."
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-semibold">Returns</p>
                    <CompactTable
                      headers={["Return", "Products", "Method", "Refund"]}
                      rows={report.returnRows.map((entry) => [
                        entry.return_number,
                        entry.sales_return_items.reduce((sum, item) => sum + item.quantity, 0),
                        entry.refund_method.toUpperCase(),
                        money(entry.total_refund),
                      ])}
                      empty="No returns recorded."
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          <TabsContent value="stock" className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="stock-report-date">Stock as of date</Label>
                <Input
                  id="stock-report-date"
                  type="date"
                  value={stockDate}
                  onChange={(event) => setStockDate(event.target.value)}
                  className="w-48"
                />
              </div>
              <Button onClick={stockPdf} disabled={products.isLoading || movementsAfter.isLoading}>
                <Download className="mr-2 size-4" /> Download PDF
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric
                icon={PackageCheck}
                label="Available units"
                value={stockTotals.quantity.toLocaleString("en-IN")}
              />
              <Metric icon={Banknote} label="Purchase value" value={money(stockTotals.cost)} />
              <Metric
                icon={CircleDollarSign}
                label="Potential selling value"
                value={money(stockTotals.selling)}
              />
            </div>
            <div className="overflow-x-auto rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Purchase value</TableHead>
                    <TableHead className="text-right">Selling value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockRows.map(({ product, stock, costValue, sellingValue }) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <p className="max-w-72 truncate font-medium" title={product.name}>
                          {product.name}
                        </p>
                      </TableCell>
                      <TableCell className="tabular text-right">{stock}</TableCell>
                      <TableCell className="tabular text-right">{money(costValue)}</TableCell>
                      <TableCell className="tabular text-right font-medium">
                        {money(sellingValue)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Banknote;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="tabular truncate font-display text-xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function CompactTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: (string | number)[][];
  empty: string;
}) {
  if (!rows.length)
    return (
      <p className="rounded-md bg-muted py-6 text-center text-sm text-muted-foreground">{empty}</p>
    );
  return (
    <div className="max-h-56 overflow-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((header) => (
              <TableHead key={header}>{header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={index}>
              {row.map((cell, cellIndex) => (
                <TableCell
                  key={cellIndex}
                  className={cellIndex === row.length - 1 ? "tabular text-right" : ""}
                >
                  {cell}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
