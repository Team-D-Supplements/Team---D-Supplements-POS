import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  createSale,
  customerByPhone,
  getInvoiceForReceipt,
  productByBarcode,
  searchProducts,
} from "@/lib/data";
import { useShopSettings } from "@/hooks/useShopSettings";
import { useOnline } from "@/hooks/useOnline";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Receipt, type ReceiptInvoice } from "@/components/receipt";
import { computeTotals, type CartLine } from "@/lib/billing";
import { buildShortBillText, whatsappLink } from "@/lib/share";
import { money } from "@/lib/format";
import {
  getCustomerNameValidationError,
  getPhoneValidationError,
  isValidIndianPhone,
} from "@/lib/validation";
import { toast } from "sonner";
import type { Product as ProductRow } from "@/lib/types";
import {
  ScanBarcode,
  Trash2,
  Plus,
  Minus,
  Banknote,
  CreditCard,
  Smartphone,
  Printer,
  Share2,
  FilePlus2,
  Loader2,
  Percent,
  IndianRupee,
  UserCheck,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({
    meta: [
      { title: "Billing — SuppPOS" },
      {
        name: "description",
        content: "Scan or search products and complete a counter sale in seconds.",
      },
      { property: "og:title", content: "Billing — SuppPOS" },
      {
        property: "og:description",
        content: "Scan or search products and complete a counter sale in seconds.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Billing,
});

type Product = ProductRow;

function Billing() {
  const { data: settings } = useShopSettings();
  const online = useOnline();
  const qc = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);
  const autoFilledNameRef = useRef<string | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [matchedCustomer, setMatchedCustomer] = useState<string | null>(null);
  const [discountType, setDiscountType] = useState<"none" | "percent" | "amount">("none");
  const [discountValue, setDiscountValue] = useState("");
  const [gstOn, setGstOn] = useState(true);
  const [method, setMethod] = useState<"cash" | "card" | "upi">("cash");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<ReceiptInvoice | null>(null);

  const phoneError = getPhoneValidationError(customerPhone, false);
  const nameError = getCustomerNameValidationError(customerName, customerPhone);
  const hasPhone = customerPhone.trim().length > 0;

  useEffect(() => {
    if (settings) setGstOn(settings.gst_enabled_by_default);
  }, [settings]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const q = query.trim();
      const data = await searchProducts(q, ["name", "brand", "barcode"], true, 8);
      setResults(data ?? []);
    }, 180);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const phone = customerPhone.trim();
    let active = true;

    if (!phone || !isValidIndianPhone(phone)) {
      if (autoFilledNameRef.current) {
        setCustomerName((current) => (current === autoFilledNameRef.current ? "" : current));
      }
      autoFilledNameRef.current = null;
      setMatchedCustomer(null);
      return;
    }

    const timer = setTimeout(async () => {
      const data = await customerByPhone(phone);

      if (!active) return;
      if (data) {
        autoFilledNameRef.current = data.name;
        setCustomerName(data.name);
        setMatchedCustomer(data.name);
        return;
      }

      if (autoFilledNameRef.current) {
        setCustomerName((current) => (current === autoFilledNameRef.current ? "" : current));
      }
      autoFilledNameRef.current = null;
      setMatchedCustomer(null);
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [customerPhone]);

  const addProduct = (p: Product) => {
    setCart((prev) => {
      const found = prev.find((l) => l.product_id === p.id);
      if (found) {
        if (found.quantity + 1 > p.current_stock) {
          toast.error(`Only ${p.current_stock} left of ${p.name}`);
          return prev;
        }
        return prev.map((l) => (l.product_id === p.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      if (p.current_stock < 1) {
        toast.error(`${p.name} is out of stock`);
        return prev;
      }
      return [
        ...prev,
        {
          product_id: p.id,
          name: p.name,
          unit_price: Number(p.selling_price),
          tax_percent: Number(p.tax_percent),
          quantity: 1,
          stock: p.current_stock,
        },
      ];
    });
    setQuery("");
    setResults([]);
    searchRef.current?.focus();
  };

  const onSearchKey = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    const exact = await productByBarcode(q, true);
    if (exact) return addProduct(exact);
    const first = results[0];
    if (first) return addProduct(first);
    toast.error("No product found for that code");
  };

  const setQty = (id: string, qty: number) =>
    setCart((prev) =>
      prev.map((l) =>
        l.product_id === id ? { ...l, quantity: Math.max(1, Math.min(qty, l.stock)) } : l,
      ),
    );

  const totals = useMemo(
    () =>
      computeTotals(
        cart,
        discountType,
        Number(discountValue) || 0,
        gstOn,
        settings?.prices_include_tax ?? false,
      ),
    [cart, discountType, discountValue, gstOn, settings],
  );

  const reset = () => {
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    autoFilledNameRef.current = null;
    setMatchedCustomer(null);
    setDiscountType("none");
    setDiscountValue("");
    setGstOn(settings?.gst_enabled_by_default ?? true);
    setMethod("cash");
    setDone(null);
    setQuery("");
    setTimeout(() => searchRef.current?.focus(), 50);
  };

  const completeSale = async () => {
    if (!cart.length) return;
    if (!online) {
      toast.error("You are offline — cannot complete the sale safely.");
      return;
    }
    const currentPhoneError = getPhoneValidationError(customerPhone, false);
    if (currentPhoneError) {
      toast.error(currentPhoneError);
      return;
    }
    const currentNameError = getCustomerNameValidationError(customerName, customerPhone);
    if (currentNameError) {
      toast.error(currentNameError);
      return;
    }
    setSaving(true);
    try {
      const result = await createSale({
        items: cart.map((l) => ({ product_id: l.product_id, quantity: l.quantity })),
        ...(customerName.trim() ? { customer_name: customerName.trim() } : {}),
        ...(customerPhone.trim() ? { customer_phone: customerPhone.trim() } : {}),
        discount_type: discountType,
        discount_value: Number(discountValue) || 0,
        gst_applied: gstOn,
        payment_method: method,
      });
      const inv = await getInvoiceForReceipt(result.invoice_id);
      if (inv) {
        setDone({
          ...inv,
          items: inv.invoice_items,
          payment_method: inv.payments?.[0]?.method ?? method,
        } as unknown as ReceiptInvoice);
      }
      qc.invalidateQueries();
      toast.success("Sale completed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not complete the sale");
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    const shareWhatsApp = () => {
      const phone = done.customer_phone_snapshot?.trim() || customerPhone.trim();
      const token = done.public_token;
      if (!token) {
        toast.error("Could not generate secure invoice link. Please try again.");
        return;
      }
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const invoiceUrl = `${origin}/invoice/${token}`;
      const text = buildShortBillText({
        shopName: settings?.shop_name ?? "Store",
        invoiceNumber: done.invoice_number,
        totalAmount: done.total_amount,
        invoiceUrl,
      });
      const link = whatsappLink(phone, text);
      if (!link) {
        toast.error("Please enter the customer's WhatsApp number before sharing the bill.");
        return;
      }
      window.open(link, "_blank", "noopener,noreferrer");
    };
    return (
      <div>
        <PageHeader title="Sale completed" subtitle={done.invoice_number} />
        <div className="grid gap-4 p-4 md:p-6 lg:grid-cols-[minmax(0,320px)_1fr]">
          <div className="rounded-lg border bg-white p-3 shadow-sm">
            <Receipt invoice={done} settings={settings} />
          </div>
          <div className="no-print space-y-3">
            <Card>
              <CardContent className="space-y-3 p-4">
                <p className="tabular font-display text-3xl font-semibold">
                  {money(done.total_amount)}
                </p>
                <p className="text-sm text-muted-foreground">
                  Paid by {done.payment_method?.toUpperCase()} ·{" "}
                  {done.gst_applied ? "GST applied" : "No GST on this bill"}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => window.print()}>
                    <Printer className="mr-2 size-4" /> Print receipt
                  </Button>
                  <Button variant="outline" onClick={shareWhatsApp}>
                    <Share2 className="mr-2 size-4" /> WhatsApp Bill
                  </Button>
                  <Button variant="secondary" onClick={reset}>
                    <FilePlus2 className="mr-2 size-4" /> New bill
                  </Button>
                </div>
                <Button variant="link" asChild className="px-0">
                  <Link to="/invoices">View all invoices</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Billing" subtitle="Scan a barcode or search to add products" />
      <div className="grid min-w-0 gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-3">
          <div className="relative">
            <ScanBarcode className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKey}
              placeholder="Scan barcode or type product name…"
              className="h-12 pl-11 text-base"
            />
            {results.length > 0 && (
              <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-lg">
                {results.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProduct(p)}
                    className="flex min-w-0 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{p.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {p.brand ? `${p.brand} · ` : ""}
                        {p.current_stock} in stock
                      </span>
                    </span>
                    <span className="tabular shrink-0 font-semibold">{money(p.selling_price)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
              {!cart.length && (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  Cart is empty. Scan a product to start.
                </p>
              )}
              {cart.map((l, i) => (
                <div
                  key={l.product_id}
                  className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 border-b p-3 last:border-0 sm:grid-cols-[minmax(0,1fr)_auto_6rem_auto] sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-medium" title={l.name}>
                      {l.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {money(l.unit_price)} each{gstOn ? ` · GST ${l.tax_percent}%` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setQty(l.product_id, l.quantity - 1)}
                    >
                      <Minus className="size-4" />
                    </Button>
                    <Input
                      className="tabular h-9 w-14 text-center"
                      value={l.quantity}
                      onChange={(e) => setQty(l.product_id, Number(e.target.value) || 1)}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setQty(l.product_id, l.quantity + 1)}
                    >
                      <Plus className="size-4" />
                    </Button>
                  </div>
                  <span className="tabular text-right font-semibold max-sm:col-start-1 max-sm:text-left sm:w-24">
                    {money(totals.lines[i]?.line_total ?? 0)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setCart(cart.filter((c) => c.product_id !== l.product_id))}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-3">
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="cname">
                    Customer name {hasPhone && <span className="text-destructive">*</span>}
                  </Label>
                  <Input
                    id="cname"
                    value={customerName}
                    aria-invalid={!!nameError}
                    onChange={(e) => {
                      setCustomerName(e.target.value);
                      autoFilledNameRef.current = null;
                      setMatchedCustomer(null);
                    }}
                  />
                  {nameError && <p className="text-xs text-destructive">{nameError}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cphone">Phone</Label>
                  <Input
                    id="cphone"
                    inputMode="tel"
                    value={customerPhone}
                    aria-invalid={!!phoneError}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                  />
                  {phoneError && <p className="text-xs text-destructive">{phoneError}</p>}
                </div>
              </div>
              {matchedCustomer && (
                <p className="flex items-center gap-1.5 text-xs text-success">
                  <UserCheck className="size-3.5" /> Existing customer found
                </p>
              )}

              <div className="space-y-1.5">
                <Label>Discount (optional)</Label>
                <div className="flex gap-2">
                  <div className="flex rounded-md border p-0.5">
                    <Button
                      type="button"
                      size="sm"
                      variant={discountType === "percent" ? "default" : "ghost"}
                      onClick={() => setDiscountType("percent")}
                    >
                      <Percent className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={discountType === "amount" ? "default" : "ghost"}
                      onClick={() => setDiscountType("amount")}
                    >
                      <IndianRupee className="size-4" />
                    </Button>
                  </div>
                  <Input
                    inputMode="decimal"
                    placeholder="0"
                    value={discountValue}
                    onChange={(e) => {
                      setDiscountValue(e.target.value);
                      if (discountType === "none") setDiscountType("percent");
                    }}
                  />
                  {discountType !== "none" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setDiscountType("none");
                        setDiscountValue("");
                      }}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2">
                <div>
                  <Label htmlFor="gst" className="font-medium">
                    GST on this bill
                  </Label>
                  <p className="tabular text-xs text-muted-foreground">
                    GST amount: {money(totals.tax)}
                  </p>
                </div>
                <Switch id="gst" checked={gstOn} onCheckedChange={setGstOn} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 p-4">
              <Row label="Subtotal" value={money(totals.subtotal)} />
              {totals.discount > 0 && (
                <Row label="Discount" value={`- ${money(totals.discount)}`} tone="destructive" />
              )}
              {gstOn && (
                <>
                  <Row label="Taxable amount" value={money(totals.taxable)} />
                  <Row label="GST" value={money(totals.tax)} />
                </>
              )}
              <div className="flex items-end justify-between border-t pt-2">
                <span className="font-medium">Final payable</span>
                <span className="tabular font-display text-3xl font-bold">
                  {money(totals.total)}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2">
                {(
                  [
                    { key: "cash", label: "Cash", icon: Banknote },
                    { key: "card", label: "Card", icon: CreditCard },
                    { key: "upi", label: "UPI", icon: Smartphone },
                  ] as const
                ).map((m) => (
                  <Button
                    key={m.key}
                    type="button"
                    variant={method === m.key ? "default" : "outline"}
                    onClick={() => setMethod(m.key)}
                  >
                    <m.icon className="mr-1.5 size-4" /> {m.label}
                  </Button>
                ))}
              </div>

              <Button
                className="h-12 w-full text-base"
                disabled={!cart.length || saving || !online || !!phoneError || !!nameError}
                onClick={completeSale}
              >
                {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
                Complete sale · {money(totals.total)}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "destructive" }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular font-medium ${tone === "destructive" ? "text-destructive" : ""}`}>
        {value}
      </span>
    </div>
  );
}
