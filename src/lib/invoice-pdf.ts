import { jsPDF } from "jspdf";
import type { ReceiptInvoice } from "@/components/receipt";
import type { ReturnReceiptData } from "@/components/return-receipt";
import type { ShopSettings } from "@/hooks/useShopSettings";
import { dateTime } from "@/lib/format";

const pdfMoney = (value: number | string | null | undefined) =>
  `Rs. ${Number(value ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Build a clean invoice PDF (receipt-width, like the thermal receipt). */
export function buildInvoicePdf(
  inv: ReceiptInvoice,
  settings: ShopSettings | null | undefined,
): jsPDF {
  const shopName = settings?.shop_name ?? "Store";
  const widthMm = settings?.receipt_width === "58mm" ? 58 : 80;
  const margin = widthMm === 58 ? 3.5 : 5;
  const contentWidth = widthMm - margin * 2;
  const measureDoc = new jsPDF({ unit: "mm", format: [widthMm, 100] });
  const addressLines = settings?.address
    ? (measureDoc.splitTextToSize(settings.address, contentWidth) as string[])
    : [];
  const customerLines = inv.customer_name_snapshot
    ? (measureDoc.splitTextToSize(
        `Customer: ${inv.customer_name_snapshot}`,
        contentWidth,
      ) as string[])
    : [];
  const itemRows = inv.items.map((item) => ({
    item,
    lines: measureDoc.splitTextToSize(item.product_name_snapshot, contentWidth) as string[],
  }));
  const itemHeight = itemRows.reduce((sum, row) => sum + row.lines.length * 3.2 + 4.2, 0);
  const optionalHeaderHeight =
    addressLines.length * 3.2 + (settings?.phone ? 3.5 : 0) + (settings?.gstin ? 3.5 : 0);
  const customerHeight = customerLines.length * 3.2 + (inv.customer_phone_snapshot ? 3.5 : 0);
  const totalsHeight =
    15 + (Number(inv.discount_amount) > 0 ? 3.5 : 0) + (inv.gst_applied ? 3.5 : 0);
  const height = Math.max(
    70,
    45 + optionalHeaderHeight + customerHeight + itemHeight + totalsHeight,
  );
  const doc = new jsPDF({ unit: "mm", format: [widthMm, height], orientation: "portrait" });
  let y = 7;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(widthMm === 58 ? 10 : 12);
  doc.text(shopName.toUpperCase(), widthMm / 2, y, { align: "center" });
  y += 4.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(widthMm === 58 ? 7 : 8);
  if (addressLines.length) {
    doc.text(addressLines, widthMm / 2, y, { align: "center" });
    y += addressLines.length * 3.2;
  }
  if (settings?.phone) {
    doc.text(`Ph: ${settings.phone}`, widthMm / 2, y, { align: "center" });
    y += 3.5;
  }
  if (settings?.gstin) {
    doc.text(`GSTIN: ${settings.gstin}`, widthMm / 2, y, { align: "center" });
    y += 3.5;
  }
  y += 1;
  doc.setLineDashPattern([1, 1], 0);
  doc.line(margin, y, widthMm - margin, y);
  y += 4;
  doc.text(`Invoice: ${inv.invoice_number}`, margin, y, { maxWidth: contentWidth });
  y += 3.5;
  doc.text(dateTime(inv.invoice_date), margin, y, { maxWidth: contentWidth });
  y += 3.5;
  if (customerLines.length) {
    doc.text(customerLines, margin, y);
    y += customerLines.length * 3.2;
  }
  if (inv.customer_phone_snapshot) {
    doc.text(`Phone: ${inv.customer_phone_snapshot}`, margin, y);
    y += 3.5;
  }
  y += 0.5;
  doc.line(margin, y, widthMm - margin, y);
  y += 3;
  const rightX = widthMm - margin;
  doc.setFont("helvetica", "bold");
  doc.text("Item", margin, y);
  doc.text("Amount", rightX, y, { align: "right" });
  y += 2;
  doc.line(margin, y, rightX, y);
  y += 3;
  doc.setFont("helvetica", "normal");
  for (const row of itemRows) {
    doc.text(row.lines, margin, y);
    y += row.lines.length * 3.2;
    doc.setTextColor(80);
    doc.text(`${row.item.quantity} x ${Number(row.item.unit_price).toFixed(2)}`, margin, y);
    doc.setTextColor(20);
    doc.text(Number(row.item.line_total).toFixed(2), rightX, y, { align: "right" });
    y += 4.2;
  }
  doc.line(margin, y, widthMm - margin, y);
  y += 4;
  doc.text("Subtotal:", margin, y);
  doc.text(pdfMoney(inv.subtotal), rightX, y, { align: "right" });
  y += 3.5;
  if (Number(inv.discount_amount) > 0) {
    doc.text("Discount:", margin, y);
    doc.text(`-${pdfMoney(inv.discount_amount)}`, rightX, y, { align: "right" });
    y += 3.5;
  }
  if (inv.gst_applied) {
    doc.text("GST:", margin, y);
    doc.text(pdfMoney(inv.tax_amount), rightX, y, { align: "right" });
    y += 3.5;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("TOTAL:", margin, y + 1);
  doc.text(pdfMoney(inv.total_amount), rightX, y + 1, { align: "right" });
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  if (inv.payment_method) {
    doc.text(`Paid by: ${inv.payment_method.toUpperCase()}`, margin, y);
    y += 4;
  }
  doc.line(margin, y, widthMm - margin, y);
  y += 4;
  doc.text(settings?.receipt_footer_text ?? "Thank you! Visit again.", widthMm / 2, y, {
    align: "center",
    maxWidth: contentWidth,
  });
  return doc;
}

/** Build a return/refund receipt PDF (receipt-width). */
export function buildReturnPdf(
  value: ReturnReceiptData,
  settings: ShopSettings | null | undefined,
): jsPDF {
  const shopName = settings?.shop_name ?? "Store";
  const widthMm = settings?.receipt_width === "58mm" ? 58 : 80;
  const margin = widthMm === 58 ? 3.5 : 5;
  const contentWidth = widthMm - margin * 2;
  const measureDoc = new jsPDF({ unit: "mm", format: [widthMm, 100] });
  const addressLines = settings?.address
    ? (measureDoc.splitTextToSize(settings.address, contentWidth) as string[])
    : [];
  const itemRows = value.items.map((item) => ({
    item,
    lines: measureDoc.splitTextToSize(item.product_name, contentWidth) as string[],
  }));
  const itemHeight = itemRows.reduce((sum, row) => sum + row.lines.length * 3.2 + 3.2, 0);
  const reasonLines = value.reason
    ? (measureDoc.splitTextToSize(`Reason: ${value.reason}`, contentWidth) as string[])
    : [];
  const height = Math.max(
    60,
    45 +
      addressLines.length * 3.2 +
      (settings?.phone ? 3.5 : 0) +
      itemHeight +
      reasonLines.length * 3.2,
  );
  const doc = new jsPDF({ unit: "mm", format: [widthMm, height], orientation: "portrait" });
  let y = 7;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(widthMm === 58 ? 10 : 12);
  doc.text(shopName.toUpperCase(), widthMm / 2, y, { align: "center" });
  y += 4;
  doc.setFontSize(widthMm === 58 ? 8 : 9);
  doc.text("RETURN / REFUND RECEIPT", widthMm / 2, y, { align: "center" });
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(widthMm === 58 ? 7 : 8);
  if (addressLines.length) {
    doc.text(addressLines, widthMm / 2, y, { align: "center" });
    y += addressLines.length * 3.2;
  }
  if (settings?.phone) {
    doc.text(`Ph: ${settings.phone}`, widthMm / 2, y, { align: "center" });
    y += 3.5;
  }
  y += 1;
  doc.setLineDashPattern([1, 1], 0);
  doc.line(margin, y, widthMm - margin, y);
  y += 4;
  doc.text(`Return: ${value.return_number}`, margin, y, { maxWidth: contentWidth });
  y += 3.5;
  doc.text(`Original bill: ${value.invoice_number}`, margin, y, { maxWidth: contentWidth });
  y += 3.5;
  doc.text(dateTime(value.return_date), margin, y, { maxWidth: contentWidth });
  y += 3;
  doc.line(margin, y, widthMm - margin, y);
  y += 3.5;
  const rightX = widthMm - margin;
  doc.setFont("helvetica", "bold");
  doc.text("Item", margin, y);
  doc.text("Refund", rightX, y, { align: "right" });
  y += 2;
  doc.line(margin, y, rightX, y);
  y += 3;
  doc.setFont("helvetica", "normal");
  for (const row of itemRows) {
    doc.text(row.lines, margin, y);
    y += row.lines.length * 3.2;
    doc.setTextColor(80);
    doc.text(`Qty: ${row.item.quantity}`, margin, y);
    doc.setTextColor(20);
    doc.text(Number(row.item.refund_amount).toFixed(2), rightX, y, { align: "right" });
    y += 3.2;
  }
  doc.line(margin, y, widthMm - margin, y);
  y += 4.5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("REFUND:", margin, y);
  doc.text(pdfMoney(value.total_refund), rightX, y, { align: "right" });
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Method: ${value.refund_method.toUpperCase()}`, margin, y);
  y += 3.5;
  if (reasonLines.length) {
    doc.text(reasonLines, margin, y);
    y += reasonLines.length * 3.2;
  }
  y += 1;
  doc.line(margin, y, widthMm - margin, y);
  y += 4;
  doc.text("Returned stock restored to inventory", widthMm / 2, y, {
    align: "center",
    maxWidth: contentWidth,
  });
  return doc;
}

export function returnPdfFileName(value: ReturnReceiptData) {
  return `${value.return_number.replace(/[^\w-]/g, "_")}.pdf`;
}

/** Share the return receipt as a PDF through the device share sheet. */
export async function shareReturnPdf(
  value: ReturnReceiptData,
  settings: ShopSettings | null | undefined,
): Promise<"shared" | "unsupported"> {
  const doc = buildReturnPdf(value, settings);
  const file = new File([doc.output("blob")], returnPdfFileName(value), {
    type: "application/pdf",
  });

  if (
    typeof navigator !== "undefined" &&
    "canShare" in navigator &&
    navigator.canShare({ files: [file] })
  ) {
    await navigator.share({
      files: [file],
      title: value.return_number,
      text: `Return ${value.return_number} (bill ${value.invoice_number}) from ${settings?.shop_name ?? "our store"}`,
    });
    return "shared";
  }

  return "unsupported";
}

export function invoicePdfFileName(inv: ReceiptInvoice) {
  return `${inv.invoice_number.replace(/[^\w-]/g, "_")}.pdf`;
}

/**
 * Share the invoice as a real PDF through the device share sheet. The app
 * never downloads a fallback copy because sharing and downloading are
 * intentionally separate actions.
 */
export async function shareInvoicePdf(
  inv: ReceiptInvoice,
  settings: ShopSettings | null | undefined,
): Promise<"shared" | "unsupported"> {
  const doc = buildInvoicePdf(inv, settings);
  const fileName = invoicePdfFileName(inv);
  const blob = doc.output("blob");
  const file = new File([blob], fileName, { type: "application/pdf" });

  if (
    typeof navigator !== "undefined" &&
    "canShare" in navigator &&
    navigator.canShare({ files: [file] })
  ) {
    await navigator.share({
      files: [file],
      title: inv.invoice_number,
      text: `Invoice ${inv.invoice_number} from ${settings?.shop_name ?? "our store"}`,
    });
    return "shared";
  }

  return "unsupported";
}
