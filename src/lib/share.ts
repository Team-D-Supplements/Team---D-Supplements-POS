import type { ReceiptInvoice } from "@/components/receipt";
import { money, dateTime } from "@/lib/format";

export function buildShortBillText({
  shopName,
  invoiceNumber,
  totalAmount,
  invoiceUrl,
}: {
  shopName: string;
  invoiceNumber: string;
  totalAmount: number;
  invoiceUrl: string;
}): string {
  return [
    `Your invoice from ${shopName}`,
    `Invoice: ${invoiceNumber}`,
    `Total: ${money(totalAmount)}`,
    "",
    "View Invoice:",
    invoiceUrl,
    "",
    "Thank you!",
  ].join("\n");
}

export function buildBillText(inv: ReceiptInvoice, shopName: string) {
  const lines = [`*${shopName}*`, `Bill ${inv.invoice_number}`, dateTime(inv.invoice_date)];
  if (inv.customer_name_snapshot) {
    lines.push(`Customer: ${inv.customer_name_snapshot}`);
  }
  lines.push(
    "",
    ...inv.items.map((i) => `${i.product_name_snapshot} x${i.quantity} = ${money(i.line_total)}`),
    "",
    `Subtotal: ${money(inv.subtotal)}`,
  );
  if (Number(inv.discount_amount) > 0) lines.push(`Discount: -${money(inv.discount_amount)}`);
  if (inv.gst_applied) lines.push(`GST: ${money(inv.tax_amount)}`);
  lines.push(`*Total: ${money(inv.total_amount)}*`);
  if (inv.payment_method) lines.push(`Paid by: ${inv.payment_method.toUpperCase()}`);
  lines.push("", "Thank you!");
  return lines.join("\n");
}

export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  const rawDigits = (phone ?? "").replace(/\D/g, "");
  if (!rawDigits) return null;
  // Normalise Indian numbers:
  //   "0" + 10 digits (STD prefix)  → drop the leading 0 → 10-digit number
  //   10 digits                     → prefix 91
  //   12 digits starting with 91    → already E.164 for India, keep as-is
  // Any other length is invalid; return null so callers can show a toast.
  let num: string;
  if (rawDigits.length === 11 && rawDigits.startsWith("0")) {
    num = `91${rawDigits.slice(1)}`;
  } else if (rawDigits.length === 10) {
    num = `91${rawDigits}`;
  } else if (rawDigits.length === 12 && rawDigits.startsWith("91")) {
    num = rawDigits;
  } else {
    return null;
  }
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}
