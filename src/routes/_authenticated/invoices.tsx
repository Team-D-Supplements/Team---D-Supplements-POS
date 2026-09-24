import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { createSalesReturn, customerByPhone, getInvoiceDetail, listInvoices } from "@/lib/data";
import { useShopSettings } from "@/hooks/useShopSettings";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Receipt, type ReceiptInvoice } from "@/components/receipt";
import { ReturnReceipt, type ReturnReceiptData } from "@/components/return-receipt";
import { buildShortBillText, whatsappLink } from "@/lib/share";
import { shareReturnPdf } from "@/lib/invoice-pdf";
import { money, dateTime } from "@/lib/format";
import { toast } from "sonner";
import { Printer, Share2, Undo2, Loader2, CheckCircle2, UserCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/invoices")({
  head: () => ({
    meta: [
      { title: "Invoices — SuppPOS" },
      {
        name: "description",
        content: "Browse bills, reprint receipts, and record auditable refunds.",
      },
      { property: "og:title", content: "Invoices — SuppPOS" },
      {
        property: "og:description",
        content: "Browse bills, reprint receipts, and record auditable refunds.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Invoices,
});

type RefundMethod = "cash" | "card" | "upi" | "adjustment";

function Invoices() {
  const { data: settings } = useShopSettings();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [returnMode, setReturnMode] = useState(false);
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const [refundMethod, setRefundMethod] = useState<RefundMethod>("cash");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [completedReturn, setCompletedReturn] = useState<ReturnReceiptData | null>(null);

  // ---- phone-entry state for sharing invoices that have no customer phone ----
  const [sharePhone, setSharePhone] = useState("");
  const [shareName, setShareName] = useState("");
  const [shareAutoFilledName, setShareAutoFilledName] = useState<string | null>(null);
  const shareAutoFilledRef = useRef<string | null>(null);

  const { data: invoices } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      return listInvoices(500);
    },
  });

  const { data: detail } = useQuery({
    queryKey: ["invoice", openId],
    enabled: !!openId,
    queryFn: async () => {
      if (!openId) throw new Error("Invoice not selected");
      return getInvoiceDetail(openId);
    },
  });

  const filtered = (invoices ?? []).filter((invoice) => {
    const q = search.trim().toLowerCase();
    return (
      !q ||
      invoice.invoice_number.toLowerCase().includes(q) ||
      (invoice.customer_name_snapshot ?? "").toLowerCase().includes(q) ||
      (invoice.customer_phone_snapshot ?? "").includes(q)
    );
  });

  const receipt: ReceiptInvoice | null = detail
    ? ({
        ...detail,
        items: detail.invoice_items,
        payment_method: detail.payments?.[0]?.method ?? null,
      } as unknown as ReceiptInvoice)
    : null;

  const selectedLines = useMemo(() => {
    if (!detail) return [];
    return detail.invoice_items.flatMap((item) => {
      const quantity = returnQty[item.id] ?? 0;
      if (quantity <= 0) return [];
      return [{ item, quantity, refund: (Number(item.line_total) * quantity) / item.quantity }];
    });
  }, [detail, returnQty]);
  const refundTotal = selectedLines.reduce((sum, line) => sum + line.refund, 0);

  // Mirrors the customerByPhone autofill pattern used in billing.tsx.
  useEffect(() => {
    const phone = sharePhone.trim();
    let active = true;
    if (!phone) {
      if (shareAutoFilledRef.current) {
        setShareName((n) => (n === shareAutoFilledRef.current ? "" : n));
      }
      shareAutoFilledRef.current = null;
      setShareAutoFilledName(null);
      return;
    }
    const timer = setTimeout(async () => {
      const data = await customerByPhone(phone);
      if (!active) return;
      if (data) {
        shareAutoFilledRef.current = data.name;
        setShareName(data.name);
        setShareAutoFilledName(data.name);
      } else {
        if (shareAutoFilledRef.current) {
          setShareName((n) => (n === shareAutoFilledRef.current ? "" : n));
        }
        shareAutoFilledRef.current = null;
        setShareAutoFilledName(null);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [sharePhone]);

  const submitReturn = async () => {
    if (!openId || !detail || !selectedLines.length) {
      toast.error("Enter at least one quantity to return");
      return;
    }
    setSaving(true);
    try {
      const result = await createSalesReturn({
        invoice_id: openId,
        items: selectedLines.map(({ item, quantity }) => ({ invoice_item_id: item.id, quantity })),
        refund_method: refundMethod as "cash" | "card" | "upi" | "adjustment",
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      setCompletedReturn({
        return_number: result.return_number,
        return_date: new Date().toISOString(),
        invoice_number: detail.invoice_number,
        refund_method: result.refund_method,
        reason: reason.trim() || null,
        total_refund: Number(result.total_refund),
        items: selectedLines.map(({ item, quantity, refund }) => ({
          product_name: item.product_name_snapshot,
          quantity,
          refund_amount: refund,
        })),
      });
      setReturnMode(false);
      setReturnQty({});
      setReason("");
      await qc.invalidateQueries();
      toast.success(`${result.return_number} recorded · ${money(result.total_refund)} to refund`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not record the return");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Sales / Invoices"
        subtitle="Original bills stay unchanged; returns create a separate refund receipt"
      />
      <div className="space-y-3 p-4 md:p-6">
        <Input
          placeholder="Search bill number, customer or phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bill</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>GST</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((invoice) => (
                <TableRow
                  key={invoice.id}
                  className="cursor-pointer"
                  onClick={() => setOpenId(invoice.id)}
                >
                  <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {dateTime(invoice.invoice_date)}
                  </TableCell>
                  <TableCell>
                    <p
                      className="max-w-48 truncate"
                      title={invoice.customer_name_snapshot ?? "Walk-in"}
                    >
                      {invoice.customer_name_snapshot || "Walk-in"}
                    </p>
                  </TableCell>
                  <TableCell>{invoice.gst_applied ? "Yes" : "No"}</TableCell>
                  <TableCell>
                    <Badge variant={invoice.status === "completed" ? "secondary" : "outline"}>
                      {invoice.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="tabular text-right font-semibold">
                    {money(invoice.total_amount)}
                  </TableCell>
                </TableRow>
              ))}
              {!filtered.length && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    No invoices yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog
        open={!!openId}
        onOpenChange={(open) => {
          if (!open) {
            setOpenId(null);
            setReturnMode(false);
            setReturnQty({});
            setCompletedReturn(null);
            setReason("");
            setSharePhone("");
            setShareName("");
            shareAutoFilledRef.current = null;
            setShareAutoFilledName(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {completedReturn?.return_number ?? detail?.invoice_number ?? "Invoice"}
            </DialogTitle>
          </DialogHeader>

          {completedReturn ? (
            <div className="space-y-3">
              <div className="no-print rounded-md border border-success/40 bg-success/10 p-3">
                <div className="flex items-center gap-2 font-medium text-success">
                  <CheckCircle2 className="size-4" /> Return recorded
                </div>
                <p className="mt-1 text-sm">
                  Refund {money(completedReturn.total_refund)} by{" "}
                  {completedReturn.refund_method.toUpperCase()}. Stock has been restored.
                </p>
              </div>
              <div className="rounded-md border bg-white p-2">
                <ReturnReceipt value={completedReturn} settings={settings} />
              </div>
            </div>
          ) : !returnMode && receipt ? (
            <div className="space-y-3">
              <div className="rounded-md border bg-white p-2">
                <Receipt invoice={receipt} settings={settings} />
              </div>
              {!!detail?.sales_returns.length && (
                <div className="no-print space-y-2">
                  <p className="text-sm font-semibold">Return history</p>
                  {detail.sales_returns.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className="flex w-full items-center justify-between rounded-md border p-3 text-left text-sm hover:bg-muted"
                      onClick={() =>
                        setCompletedReturn({
                          return_number: entry.return_number,
                          return_date: entry.return_date,
                          invoice_number: detail.invoice_number,
                          refund_method: entry.refund_method,
                          reason: entry.reason,
                          total_refund: Number(entry.total_refund),
                          items: entry.sales_return_items.map((item) => ({
                            product_name: item.invoice_items?.product_name_snapshot ?? "Product",
                            quantity: item.quantity,
                            refund_amount: Number(item.refund_amount),
                          })),
                        })
                      }
                    >
                      <span>
                        <span className="block font-medium">{entry.return_number}</span>
                        <span className="text-xs text-muted-foreground">
                          {dateTime(entry.return_date)} · {entry.refund_method.toUpperCase()}
                        </span>
                      </span>
                      <span className="tabular font-semibold">{money(entry.total_refund)}</span>
                    </button>
                  ))}
                </div>
              )}
              {/* Phone-entry panel — only shown when the invoice has no customer phone */}
              {!receipt.customer_phone_snapshot && (
                <div className="no-print space-y-2 rounded-md border p-3">
                  <p className="text-sm font-medium">Share via WhatsApp</p>
                  <p className="text-xs text-muted-foreground">
                    This invoice has no phone number. Enter one to share it on WhatsApp.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="share-phone" className="text-xs">
                        Phone
                      </Label>
                      <Input
                        id="share-phone"
                        inputMode="tel"
                        placeholder="Customer phone"
                        value={sharePhone}
                        onChange={(e) => {
                          setSharePhone(e.target.value);
                          shareAutoFilledRef.current = null;
                          setShareAutoFilledName(null);
                        }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="share-name" className="text-xs">
                        Name (optional)
                      </Label>
                      <Input
                        id="share-name"
                        placeholder="Customer name"
                        value={shareName}
                        onChange={(e) => {
                          setShareName(e.target.value);
                          shareAutoFilledRef.current = null;
                        }}
                      />
                    </div>
                  </div>
                  {shareAutoFilledName && (
                    <p className="flex items-center gap-1.5 text-xs text-success">
                      <UserCheck className="size-3.5" /> Existing customer found
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : returnMode && detail ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Select returned quantities. The refund below uses the exact amount originally paid
                for each line.
              </p>
              {detail.invoice_items.map((item) => {
                const remaining = item.quantity - item.returned_quantity;
                const quantity = returnQty[item.id] ?? 0;
                const lineRefund = (Number(item.line_total) * quantity) / item.quantity;
                return (
                  <div
                    key={item.id}
                    className="grid min-w-0 grid-cols-[minmax(0,1fr)_5rem] gap-2 border-b py-2 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium">
                        {item.product_name_snapshot}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Sold {item.quantity} · returned {item.returned_quantity} · available{" "}
                        {remaining}
                      </p>
                      {quantity > 0 && (
                        <p className="mt-1 text-xs font-medium text-success">
                          Refund {money(lineRefund)}
                        </p>
                      )}
                    </div>
                    <Input
                      className="tabular h-9 text-center"
                      inputMode="numeric"
                      disabled={remaining <= 0}
                      value={returnQty[item.id] ?? ""}
                      aria-label={`Return quantity for ${item.product_name_snapshot}`}
                      onChange={(e) =>
                        setReturnQty((current) => ({
                          ...current,
                          [item.id]: Math.max(0, Math.min(Number(e.target.value) || 0, remaining)),
                        }))
                      }
                    />
                  </div>
                );
              })}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Refund method</Label>
                  <Select
                    value={refundMethod}
                    onValueChange={(value) => setRefundMethod(value as RefundMethod)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                      <SelectItem value="adjustment">Adjustment / store credit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="return-reason">Reason (optional)</Label>
                  <Input
                    id="return-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Damaged, wrong item…"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md bg-muted p-3">
                <span className="font-medium">Total refund</span>
                <span className="tabular text-xl font-bold">{money(refundTotal)}</span>
              </div>
            </div>
          ) : null}

          <DialogFooter className="no-print flex-wrap gap-2">
            {completedReturn ? (
              <>
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      const outcome = await shareReturnPdf(completedReturn, settings);
                      if (outcome === "unsupported") {
                        toast.error(
                          "PDF sharing is not supported by this browser. Open SuppPOS on your phone to share it directly to WhatsApp.",
                        );
                      }
                    } catch (e) {
                      if (e instanceof Error && e.name === "AbortError") return;
                      toast.error("Could not share the return receipt PDF");
                    }
                  }}
                >
                  <Share2 className="mr-2 size-4" /> WhatsApp PDF
                </Button>
                <Button onClick={() => setCompletedReturn(null)}>Back to invoice</Button>
              </>
            ) : !returnMode ? (
              <>
                <Button variant="outline" onClick={() => window.print()}>
                  <Printer className="mr-2 size-4" /> Print
                </Button>
                <Button
                  variant="outline"
                  disabled={!!receipt && !receipt.customer_phone_snapshot && !sharePhone.trim()}
                  onClick={() => {
                    if (!receipt) return;
                    // Use the snapshot phone when present; fall back to the user-entered phone.
                    const phone = receipt.customer_phone_snapshot?.trim() || sharePhone.trim();
                    const token = receipt.public_token;
                    if (!token) {
                      toast.error("Could not generate secure invoice link. Please try again.");
                      return;
                    }
                    const origin = typeof window !== "undefined" ? window.location.origin : "";
                    const invoiceUrl = `${origin}/invoice/${token}`;
                    const text = buildShortBillText({
                      shopName: settings?.shop_name ?? "Store",
                      invoiceNumber: receipt.invoice_number,
                      totalAmount: receipt.total_amount,
                      invoiceUrl,
                    });
                    const link = whatsappLink(phone, text);
                    if (!link) {
                      toast.error(
                        "Please enter the customer's WhatsApp number before sharing the bill.",
                      );
                      return;
                    }
                    window.open(link, "_blank", "noopener,noreferrer");
                  }}
                >
                  <Share2 className="mr-2 size-4" /> WhatsApp Bill
                </Button>
                <Button
                  onClick={() => setReturnMode(true)}
                  disabled={detail?.status === "returned"}
                >
                  <Undo2 className="mr-2 size-4" /> Create return
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setReturnMode(false)}>
                  Cancel
                </Button>
                <Button onClick={submitReturn} disabled={saving || !selectedLines.length}>
                  {saving && <Loader2 className="mr-2 size-4 animate-spin" />} Record return ·{" "}
                  {money(refundTotal)}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
