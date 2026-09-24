import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listProducts } from "@/lib/data";
import { useShopSettings } from "@/hooks/useShopSettings";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProductFormDialog, type Product } from "@/components/products/product-form-dialog";
import { ImportDialog } from "@/components/products/import-dialog";
import { money } from "@/lib/format";
import { Plus, Upload, Search, Pencil } from "lucide-react";

export const Route = createFileRoute("/_authenticated/products")({
  head: () => ({
    meta: [
      { title: "Products — SuppPOS" },
      {
        name: "description",
        content: "Manage supplement products, prices, GST rates and stock levels.",
      },
      { property: "og:title", content: "Products — SuppPOS" },
      {
        property: "og:description",
        content: "Manage supplement products, prices, GST rates and stock levels.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Products,
});

function Products() {
  const { data: settings } = useShopSettings();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("active");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      return listProducts();
    },
  });

  const categories = useMemo(
    () => Array.from(new Set((products ?? []).map((p) => p.category).filter(Boolean))) as string[],
    [products],
  );

  const filtered = (products ?? []).filter((p) => {
    const q = search.trim().toLowerCase();
    const matches =
      !q ||
      p.name.toLowerCase().includes(q) ||
      (p.brand ?? "").toLowerCase().includes(q) ||
      (p.barcode ?? "").includes(q);
    const cat = category === "all" || p.category === category;
    const st =
      status === "all" ||
      (status === "active" && p.is_active) ||
      (status === "inactive" && !p.is_active) ||
      (status === "low" && p.current_stock <= p.reorder_level);
    return matches && cat && st;
  });

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle={`${products?.length ?? 0} products in your catalogue`}
        actions={
          <>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="mr-2 size-4" /> Import
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="mr-2 size-4" /> Add product
            </Button>
          </>
        }
      />

      <div className="space-y-3 p-4 md:p-6">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name, brand or barcode"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="low">Low stock</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Barcode</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">GST</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id} className={!p.is_active ? "opacity-60" : ""}>
                  <TableCell>
                    <p className="max-w-64 truncate font-medium" title={p.name}>
                      {p.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[p.brand, p.category].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {p.barcode || "—"}
                  </TableCell>
                  <TableCell className="tabular text-right">{money(p.purchase_price)}</TableCell>
                  <TableCell className="tabular text-right font-medium">
                    {money(p.selling_price)}
                  </TableCell>
                  <TableCell className="tabular text-right">{p.tax_percent}%</TableCell>
                  <TableCell className="text-right">
                    <span className="tabular font-semibold">{p.current_stock}</span>
                    {p.current_stock <= p.reorder_level && (
                      <Badge variant="destructive" className="ml-2">
                        Low
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Edit"
                      onClick={() => {
                        setEditing(p);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!filtered.length && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    No products match your filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <ProductFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        product={editing}
        defaultTax={Number(settings?.default_gst_rate ?? 18)}
      />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
