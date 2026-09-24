import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listMovements, listProducts } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdjustStockDialog } from "@/components/products/adjust-stock-dialog";
import type { Product } from "@/components/products/product-form-dialog";
import { money, dateTime } from "@/lib/format";
import { Boxes } from "lucide-react";

export const Route = createFileRoute("/_authenticated/stock")({
  head: () => ({
    meta: [
      { title: "Stock — SuppPOS" },
      {
        name: "description",
        content: "Live stock levels, low-stock alerts and a full stock movement history.",
      },
      { property: "og:title", content: "Stock — SuppPOS" },
      {
        property: "og:description",
        content: "Live stock levels, low-stock alerts and a full stock movement history.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Stock,
});

function Stock() {
  const [search, setSearch] = useState("");
  const [adjusting, setAdjusting] = useState<Product | null>(null);

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      return listProducts();
    },
  });

  const { data: movements } = useQuery({
    queryKey: ["stock-movements"],
    queryFn: async () => {
      return listMovements(300);
    },
  });

  const q = search.trim().toLowerCase();
  const list = (products ?? []).filter(
    (p) => !q || p.name.toLowerCase().includes(q) || (p.barcode ?? "").includes(q),
  );
  const low = list.filter((p) => p.current_stock <= p.reorder_level);

  return (
    <div>
      <PageHeader title="Stock" subtitle="Every change is recorded and auditable" />
      <div className="space-y-3 p-4 md:p-6">
        <Tabs defaultValue="current">
          <TabsList>
            <TabsTrigger value="current">Current stock</TabsTrigger>
            <TabsTrigger value="low">Low stock ({low.length})</TabsTrigger>
            <TabsTrigger value="movements">Movements</TabsTrigger>
          </TabsList>

          <TabsContent value="current" className="space-y-3">
            <Input
              placeholder="Search product"
              className="max-w-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <StockTable rows={list} onAdjust={setAdjusting} />
          </TabsContent>

          <TabsContent value="low">
            <StockTable rows={low} onAdjust={setAdjusting} />
          </TabsContent>

          <TabsContent value="movements">
            <div className="overflow-x-auto rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                    <TableHead className="text-right">Stock after</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(movements ?? []).map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-sm text-muted-foreground">
                        {dateTime(m.created_at)}
                      </TableCell>
                      <TableCell>{m.products?.name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{m.movement_type}</Badge>
                      </TableCell>
                      <TableCell
                        className={`tabular text-right font-medium ${m.quantity_change < 0 ? "text-destructive" : "text-emerald-600"}`}
                      >
                        {m.quantity_change > 0 ? "+" : ""}
                        {m.quantity_change}
                      </TableCell>
                      <TableCell className="tabular text-right">{m.resulting_stock}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {m.note || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!movements?.length && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                        No stock movements yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <AdjustStockDialog product={adjusting} onOpenChange={() => setAdjusting(null)} />
    </div>
  );
}

function StockTable({ rows, onAdjust }: { rows: Product[]; onAdjust: (p: Product) => void }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead className="text-right">Stock</TableHead>
            <TableHead className="text-right">Reorder level</TableHead>
            <TableHead className="text-right">Stock value (cost)</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p) => (
            <TableRow key={p.id}>
              <TableCell>
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.brand || "—"}</p>
              </TableCell>
              <TableCell className="tabular text-right font-semibold">
                {p.current_stock}
                {p.current_stock <= p.reorder_level && (
                  <Badge variant="destructive" className="ml-2">
                    Low
                  </Badge>
                )}
              </TableCell>
              <TableCell className="tabular text-right">{p.reorder_level}</TableCell>
              <TableCell className="tabular text-right">
                {money(Number(p.purchase_price) * p.current_stock)}
              </TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="icon" onClick={() => onAdjust(p)}>
                  <Boxes className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {!rows.length && (
            <TableRow>
              <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                Nothing to show.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
