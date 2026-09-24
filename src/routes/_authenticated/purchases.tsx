import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  addSupplier,
  createPurchase,
  listPurchases,
  listSuppliers,
  searchProducts,
} from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { money, dateOnly, todayISO } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Trash2, Loader2 } from "lucide-react";
import type { Product as ProductRow, Supplier } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/purchases")({
  head: () => ({
    meta: [
      { title: "Purchases — SuppPOS" },
      {
        name: "description",
        content: "Record supplier purchases and add received stock to your inventory.",
      },
      { property: "og:title", content: "Purchases — SuppPOS" },
      {
        property: "og:description",
        content: "Record supplier purchases and add received stock to your inventory.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Purchases,
});

type Product = ProductRow;
type Line = { product_id: string; name: string; quantity: number; purchase_price: number };

function Purchases() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [supplierOpen, setSupplierOpen] = useState(false);

  const { data: purchases } = useQuery({
    queryKey: ["purchases"],
    queryFn: async () => {
      return listPurchases();
    },
  });

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      return listSuppliers();
    },
  });

  return (
    <div>
      <PageHeader
        title="Purchases"
        subtitle="Stock received from suppliers"
        actions={
          <>
            <Button variant="outline" onClick={() => setSupplierOpen(true)}>
              Add supplier
            </Button>
            <Button onClick={() => setOpen(true)}>
              <Plus className="mr-2 size-4" /> New purchase
            </Button>
          </>
        }
      />
      <div className="space-y-3 p-4 md:p-6">
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Bill ref</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(purchases ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{dateOnly(p.purchase_date)}</TableCell>
                  <TableCell className="font-medium">{p.suppliers?.name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{p.invoice_ref || "—"}</TableCell>
                  <TableCell className="tabular text-right">
                    {p.purchase_items?.length ?? 0}
                  </TableCell>
                  <TableCell className="tabular text-right font-semibold">
                    {money(p.total_amount)}
                  </TableCell>
                </TableRow>
              ))}
              {!purchases?.length && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    No purchases recorded yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <PurchaseDialog open={open} onOpenChange={setOpen} suppliers={suppliers ?? []} />
      <SupplierDialog
        open={supplierOpen}
        onOpenChange={setSupplierOpen}
        onSaved={() => qc.invalidateQueries({ queryKey: ["suppliers"] })}
      />
    </div>
  );
}

function PurchaseDialog({
  open,
  onOpenChange,
  suppliers,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  suppliers: Supplier[];
}) {
  const qc = useQueryClient();
  const [supplierId, setSupplierId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [ref, setRef] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!query.trim()) return setResults([]);
    const t = setTimeout(async () => {
      const data = await searchProducts(query.trim(), ["name", "barcode"], false, 6);
      setResults(data ?? []);
    }, 180);
    return () => clearTimeout(t);
  }, [query]);

  const total = lines.reduce((s, l) => s + l.quantity * l.purchase_price, 0);

  const save = async () => {
    if (!supplierId) {
      toast.error("Choose a supplier");
      return;
    }
    if (!lines.length) {
      toast.error("Add at least one product");
      return;
    }
    setSaving(true);
    try {
      await createPurchase({
        supplier_id: supplierId,
        purchase_date: date,
        ...(ref.trim() ? { invoice_ref: ref.trim() } : {}),
        items: lines.map((l) => ({
          product_id: l.product_id,
          quantity: l.quantity,
          purchase_price: l.purchase_price,
        })),
      });
      toast.success("Purchase recorded and stock updated");
      onOpenChange(false);
      setLines([]);
      setRef("");
      qc.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the purchase");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] min-w-0 overflow-x-hidden overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New purchase</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Supplier</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Supplier bill no.</Label>
            <Input value={ref} onChange={(e) => setRef(e.target.value)} />
          </div>
        </div>

        <div className="relative">
          <Input
            placeholder="Search product to add…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {results.length > 0 && (
            <div className="absolute z-20 mt-1 w-full min-w-0 overflow-hidden rounded-md border bg-popover shadow-lg">
              {results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="block w-full min-w-0 truncate px-3 py-2 text-left text-sm hover:bg-muted"
                  title={p.name}
                  onClick={() => {
                    setLines((prev) =>
                      prev.some((l) => l.product_id === p.id)
                        ? prev
                        : [
                            ...prev,
                            {
                              product_id: p.id,
                              name: p.name,
                              quantity: 1,
                              purchase_price: Number(p.purchase_price),
                            },
                          ],
                    );
                    setQuery("");
                    setResults([]);
                  }}
                >
                  {p.name}
                  <span className="text-xs text-muted-foreground"> · stock {p.current_stock}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <Card>
          <CardContent className="p-0">
            {!lines.length && (
              <p className="py-8 text-center text-sm text-muted-foreground">No items added.</p>
            )}
            {lines.map((l, i) => (
              <div
                key={l.product_id}
                className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 border-b p-2 last:border-0 sm:grid-cols-[minmax(0,1fr)_5rem_7rem_6rem_auto] sm:items-center"
              >
                <span className="min-w-0 break-words text-sm" title={l.name}>
                  {l.name}
                </span>
                <Input
                  className="tabular h-9 w-20 text-center"
                  inputMode="numeric"
                  value={l.quantity}
                  onChange={(e) =>
                    setLines((p) =>
                      p.map((x, xi) =>
                        xi === i ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x,
                      ),
                    )
                  }
                />
                <Input
                  className="tabular h-9 w-28 text-right"
                  inputMode="decimal"
                  value={l.purchase_price}
                  onChange={(e) =>
                    setLines((p) =>
                      p.map((x, xi) =>
                        xi === i ? { ...x, purchase_price: Number(e.target.value) || 0 } : x,
                      ),
                    )
                  }
                />
                <span className="tabular text-right text-sm font-medium max-sm:col-start-1 max-sm:text-left sm:w-24">
                  {money(l.quantity * l.purchase_price)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setLines((p) => p.filter((_, xi) => xi !== i))}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <DialogFooter className="items-center gap-3">
          <span className="tabular mr-auto text-lg font-semibold">Total {money(total)}</span>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />} Save purchase
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SupplierDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [gstin, setGstin] = useState("");

  const save = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    try {
      await addSupplier({
        name: name.trim(),
        phone: phone.trim() || null,
        gstin: gstin.trim() || null,
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : String((error as { message?: string })?.message ?? error),
      );
      return;
    }
    toast.success("Supplier added");
    setName("");
    setPhone("");
    setGstin("");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add supplier</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>GSTIN</Label>
            <Input value={gstin} onChange={(e) => setGstin(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
