import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { saveProduct } from "@/lib/data";
import type { Product as ProductRow } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export type Product = ProductRow;

const empty = {
  name: "",
  brand: "",
  category: "",
  barcode: "",
  purchase_price: "0",
  selling_price: "0",
  tax_percent: "18",
  reorder_level: "5",
  is_active: true,
};

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
  defaultTax,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product?: Product | null;
  defaultTax?: number;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...empty });

  useEffect(() => {
    if (product) {
      setForm({
        name: product.name,
        brand: product.brand ?? "",
        category: product.category ?? "",
        barcode: product.barcode ?? "",
        purchase_price: String(product.purchase_price),
        selling_price: String(product.selling_price),
        tax_percent: String(product.tax_percent),
        reorder_level: String(product.reorder_level),
        is_active: product.is_active,
      });
    } else {
      setForm({ ...empty, tax_percent: String(defaultTax ?? 18) });
    }
  }, [product, open, defaultTax]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        brand: form.brand.trim() || null,
        category: form.category.trim() || null,
        barcode: form.barcode.trim() || null,
        purchase_price: Number(form.purchase_price) || 0,
        selling_price: Number(form.selling_price) || 0,
        tax_percent: Number(form.tax_percent) || 0,
        reorder_level: Number(form.reorder_level) || 0,
        is_active: form.is_active,
      };
      if (!payload.name) throw new Error("Product name is required");
      await saveProduct(product ? product.id : null, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success(product ? "Product updated" : "Product added");
      onOpenChange(false);
    },
    onError: (e: Error) =>
      toast.error(e.message.includes("duplicate") ? "That barcode is already used" : e.message),
  });

  const field = (key: keyof typeof form, label: string, type = "text") => (
    <div className="space-y-1.5">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        type={type}
        inputMode={type === "number" ? "decimal" : undefined}
        value={String(form[key])}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{product ? "Edit product" : "Add product"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">{field("name", "Product name")}</div>
          {field("brand", "Brand")}
          {field("category", "Category")}
          {field("barcode", "Barcode")}
          {field("purchase_price", "Purchase price (₹)", "number")}
          {field("selling_price", "Selling price (₹)", "number")}
          {field("tax_percent", "GST %", "number")}
          {field("reorder_level", "Reorder level", "number")}
          <div className="flex items-center gap-3 sm:col-span-2">
            <Switch
              id="active"
              checked={form.is_active}
              onCheckedChange={(v) => setForm({ ...form, is_active: v })}
            />
            <Label htmlFor="active">Active (available for billing)</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Save product
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
