import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { addImportBatch, productByBarcode, saveProduct, setOpeningStock } from "@/lib/data";
import { parseSpreadsheet, downloadCSV } from "@/lib/export";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";

type ParsedRow = {
  line: number;
  name: string;
  brand: string;
  category: string;
  barcode: string;
  purchase_price: number;
  selling_price: number;
  tax_percent: number;
  stock: number;
  reorder_level: number;
  error?: string;
};

const pick = (r: Record<string, unknown>, keys: string[]) => {
  for (const k of Object.keys(r)) {
    if (keys.includes(k.trim().toLowerCase().replace(/\s+/g, "_")))
      return String(r[k] ?? "").trim();
  }
  return "";
};

export function ImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [filename, setFilename] = useState("");
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File) => {
    setFilename(file.name);
    try {
      const raw = await parseSpreadsheet(file);
      const seenBar = new Set<string>();
      const parsed: ParsedRow[] = raw.map((r, i) => {
        const row: ParsedRow = {
          line: i + 2,
          name: pick(r, ["name", "product", "product_name"]),
          brand: pick(r, ["brand"]),
          category: pick(r, ["category"]),
          barcode: pick(r, ["barcode", "ean"]),
          purchase_price: Number(pick(r, ["purchase_price", "cost", "cost_price"]) || 0),
          selling_price: Number(pick(r, ["selling_price", "price", "mrp"]) || 0),
          tax_percent: Number(pick(r, ["tax_percent", "gst", "gst_percent", "tax"]) || 18),
          stock: Number(pick(r, ["stock", "current_stock", "quantity", "qty"]) || 0),
          reorder_level: Number(pick(r, ["reorder_level", "reorder", "min_stock"]) || 0),
        };
        if (!row.name) row.error = "Missing product name";
        else if (Number.isNaN(row.selling_price) || row.selling_price < 0)
          row.error = "Invalid selling price";
        else if (Number.isNaN(row.stock)) row.error = "Invalid stock";
        else if (row.barcode && seenBar.has(row.barcode)) row.error = "Duplicate barcode in file";
        if (row.barcode) seenBar.add(row.barcode);
        return row;
      });
      setRows(parsed);
    } catch {
      toast.error("Could not read that file. Use a CSV or XLSX export.");
    }
  };

  const valid = rows.filter((r) => !r.error);
  const invalid = rows.filter((r) => r.error);

  const runImport = async () => {
    setBusy(true);
    let success = 0;
    const errors: { line: number; error: string }[] = [];
    for (const r of valid) {
      try {
        let existingId: string | null = null;
        if (r.barcode) {
          const data = await productByBarcode(r.barcode, false);
          existingId = data?.id ?? null;
        }
        const payload = {
          name: r.name,
          brand: r.brand || null,
          category: r.category || null,
          barcode: r.barcode || null,
          purchase_price: r.purchase_price || 0,
          selling_price: r.selling_price || 0,
          tax_percent: r.tax_percent || 0,
          reorder_level: r.reorder_level || 0,
        };
        const id = await saveProduct(existingId, payload);
        if (id && r.stock > 0) {
          await setOpeningStock(id, r.stock, `Import: ${filename}`);
        }
        success++;
      } catch (e) {
        errors.push({ line: r.line, error: e instanceof Error ? e.message : "Failed" });
      }
    }
    await addImportBatch({
      filename,
      row_count: rows.length,
      success_count: success,
      error_count: invalid.length + errors.length,
      errors: [...invalid.map((r) => ({ line: r.line, error: r.error })), ...errors],
    });
    setBusy(false);
    qc.invalidateQueries({ queryKey: ["products"] });
    toast.success(`${success} products imported`);
    setRows([]);
    setFilename("");
    onOpenChange(false);
  };

  const template = () =>
    downloadCSV(
      [
        {
          name: "Whey Protein 1kg",
          brand: "MuscleBlaze",
          category: "Protein",
          barcode: "8901234567890",
          purchase_price: 1800,
          selling_price: 2299,
          tax_percent: 18,
          stock: 10,
          reorder_level: 3,
        },
      ],
      "product-import-template",
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import products</DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel file. Existing products are matched by barcode and updated.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="file"
            accept=".csv,.xlsx,.xls"
            className="max-w-xs"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <Button variant="outline" size="sm" onClick={template}>
            <Download className="mr-2 size-4" /> Sample file
          </Button>
        </div>

        {rows.length > 0 && (
          <>
            <p className="text-sm">
              <span className="font-medium text-success">{valid.length} ready</span>
              {invalid.length > 0 && (
                <span className="ml-3 font-medium text-destructive">
                  {invalid.length} with problems
                </span>
              )}
            </p>
            <div className="max-h-72 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 200).map((r) => (
                    <TableRow key={r.line}>
                      <TableCell>{r.line}</TableCell>
                      <TableCell className="max-w-48 truncate">{r.name}</TableCell>
                      <TableCell className="tabular">{r.selling_price}</TableCell>
                      <TableCell className="tabular">{r.stock}</TableCell>
                      <TableCell className={r.error ? "text-destructive" : "text-success"}>
                        {r.error ?? "OK"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={runImport} disabled={busy || valid.length === 0}>
            {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
            Import {valid.length} products
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
