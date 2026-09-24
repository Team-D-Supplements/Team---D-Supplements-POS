import type { ShopSettings } from "@/hooks/useShopSettings";
import { dateOnly, money } from "@/lib/format";

type PdfRow = (string | number)[];

const safeName = (value: string) => value.replace(/[^a-z0-9-]+/gi, "-").replace(/-+/g, "-");

async function makeDocument(title: string, subtitle: string, settings?: ShopSettings | null) {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const autoTable = autoTableModule.default;
  doc.setFillColor(26, 89, 62);
  doc.rect(0, 0, 595, 92, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(settings?.shop_name ?? "SuppPOS", 40, 38);
  doc.setFontSize(13);
  doc.text(title, 40, 62);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(subtitle, 40, 79);
  doc.setTextColor(32, 38, 45);
  return { doc, autoTable };
}

function download(doc: { save: (filename: string) => void }, name: string) {
  doc.save(`${safeName(name)}.pdf`);
}

export type DailyReportPdf = {
  date: string;
  totalSales: number;
  netSales: number;
  profit: number;
  gst: number;
  returnCount: number;
  returnProducts: number;
  refunded: number;
  payments: { method: string; amount: number }[];
  sales: PdfRow[];
  returns: PdfRow[];
};

function paymentChart(payments: DailyReportPdf["payments"]) {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 240;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const colors = ["#1a593e", "#d69e2e", "#3b82f6"];
  const total = payments.reduce((sum, item) => sum + Math.max(0, item.amount), 0);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  let angle = -Math.PI / 2;
  payments.forEach((item, index) => {
    const color = colors[index % colors.length] ?? "#1a593e";
    const slice = total > 0 ? (Math.max(0, item.amount) / total) * Math.PI * 2 : 0;
    context.beginPath();
    context.moveTo(120, 120);
    context.arc(120, 120, 90, angle, angle + slice);
    context.closePath();
    context.fillStyle = color;
    context.fill();
    angle += slice;
  });
  context.font = "bold 24px Arial";
  payments.forEach((item, index) => {
    const color = colors[index % colors.length] ?? "#1a593e";
    const y = 65 + index * 55;
    context.fillStyle = color;
    context.fillRect(270, y - 18, 24, 24);
    context.fillStyle = "#20262d";
    const share = total > 0 ? Math.round((Math.max(0, item.amount) / total) * 100) : 0;
    context.fillText(`${item.method}: ${share}%`, 310, y + 2);
  });
  return canvas.toDataURL("image/png");
}

export async function downloadDailySalesPdf(data: DailyReportPdf, settings?: ShopSettings | null) {
  const { doc, autoTable } = await makeDocument(
    "Daily sales report",
    dateOnly(data.date),
    settings,
  );
  const metrics = [
    ["Total sales", money(data.totalSales), "Net sales", money(data.netSales)],
    ["Profit earned", money(data.profit), "GST generated", money(data.gst)],
    ["Returns", data.returnCount, "Products returned", data.returnProducts],
    ["Money refunded", money(data.refunded), "", ""],
  ];
  autoTable(doc, {
    startY: 112,
    body: metrics,
    theme: "grid",
    styles: { fontSize: 10, cellPadding: 7 },
    columnStyles: { 0: { fontStyle: "bold" }, 2: { fontStyle: "bold" } },
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Payment mix", 40, finalY + 28);
  const chart = paymentChart(data.payments);
  if (chart) doc.addImage(chart, "PNG", 40, finalY + 36, 320, 120);
  autoTable(doc, {
    startY: finalY + 36,
    margin: { left: 380 },
    tableWidth: 175,
    head: [["Method", "Net amount"]],
    body: data.payments.map((item) => [item.method, money(item.amount)]),
    theme: "striped",
    headStyles: { fillColor: [26, 89, 62] },
  });
  let y = Math.max(
    finalY + 156,
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 28,
  );
  doc.text("Sales", 40, y);
  autoTable(doc, {
    startY: y + 8,
    head: [["Invoice", "Time", "Customer", "Payment", "Total"]],
    body: data.sales,
    theme: "striped",
    headStyles: { fillColor: [26, 89, 62] },
    styles: { fontSize: 8 },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 28;
  doc.text("Returns and refunds", 40, y);
  autoTable(doc, {
    startY: y + 8,
    head: [["Return", "Invoice", "Products", "Method", "Refund"]],
    body: data.returns,
    theme: "striped",
    headStyles: { fillColor: [26, 89, 62] },
    styles: { fontSize: 8 },
  });
  download(doc, `daily-sales-${data.date}`);
}

export async function downloadStockPdf(
  rows: PdfRow[],
  totals: { quantity: number; cost: number; selling: number },
  stockDate: string,
  settings?: ShopSettings | null,
) {
  const { doc, autoTable } = await makeDocument(
    "Stock report",
    `Stock as of ${dateOnly(stockDate)}`,
    settings,
  );
  autoTable(doc, {
    startY: 112,
    body: [
      ["Available units", totals.quantity, "Purchase value", money(totals.cost)],
      ["Potential selling value", money(totals.selling), "", ""],
    ],
    theme: "grid",
    styles: { fontSize: 10, cellPadding: 7 },
    columnStyles: { 0: { fontStyle: "bold" }, 2: { fontStyle: "bold" } },
  });
  const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;
  autoTable(doc, {
    startY: y,
    head: [["Product", "Qty", "Cost/unit", "Purchase value", "Selling value"]],
    body: rows,
    theme: "striped",
    headStyles: { fillColor: [26, 89, 62] },
    styles: { fontSize: 8 },
    columnStyles: { 0: { cellWidth: 200 } },
  });
  download(doc, `stock-report-${stockDate}`);
}
