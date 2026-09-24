import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adjustStock } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { Product } from "./product-form-dialog";

export function AdjustStockDialog({
  product,
  onOpenChange,
}: {
  product: Product | null;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [stock, setStock] = useState("0");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (product) {
      setStock(String(product.current_stock));
      setNote("");
    }
  }, [product]);

  const save = useMutation({
    mutationFn: async () => {
      if (!product) return;
      await adjustStock(product.id, Number(stock), note || undefined);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
      toast.success("Stock updated");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!product} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>
            {product?.name} — currently {product?.current_stock} in stock
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="newstock">New stock count</Label>
            <Input
              id="newstock"
              type="number"
              inputMode="numeric"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note">Reason (optional)</Label>
            <Input
              id="note"
              placeholder="Damaged, stock count, expiry..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
