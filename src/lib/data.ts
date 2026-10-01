// Single data-access entry point for the screens. Every function calls the
// matching admin-only server function (src/lib/pos.functions.ts); the browser
// never talks to the database directly.
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as fns from "./pos.functions";
import type { InvoiceDetail, ReportReturn, ReportSale } from "./types";
export type { InvoiceDetail } from "./types";
const t = fns as unknown as Record<keyof typeof fns, (arg?: any) => Promise<any>>;

// ---------- settings
export async function getShopSettings(): Promise<any> {
  return t.tGetShopSettings();
}
export async function updateShopSettings(id: string, v: any) {
  await t.tUpdateShopSettings({ data: { id, ...v } });
}
export async function dbUsage(): Promise<any> {
  return t.tDbUsage();
}
export async function dashboardStats(): Promise<any> {
  return t.tDashboardStats();
}

// ---------- products
export async function listProducts(activeOnly = false): Promise<any[]> {
  return t.tListProducts({ data: { activeOnly } });
}
/** Returns [] on error, like the previous search boxes. */
export async function searchProducts(
  query: string,
  fields: ("name" | "brand" | "barcode")[],
  activeOnly: boolean,
  limit: number,
): Promise<any[]> {
  return t.tSearchProducts({ data: { q: query, fields, activeOnly, limit } }).catch(() => []);
}
export async function productByBarcode(barcode: string, activeOnly: boolean): Promise<any | null> {
  return t.tProductByBarcode({ data: { barcode, activeOnly } }).catch(() => null);
}
/** Insert when id is null. Returns the product id. */
export async function saveProduct(id: string | null, product: any): Promise<string> {
  return t.tSaveProduct({ data: { id, product } });
}
export async function deleteProduct(
  id: string,
): Promise<{ action: "deleted" | "deactivated"; message: string }> {
  return t.tDeleteProduct({ data: { id } });
}

// ---------- customers / suppliers
export async function listCustomers(): Promise<any[]> {
  return t.tListCustomers();
}
export async function customerByPhone(phone: string): Promise<{ name: string } | null> {
  return (await t.tCustomerByPhone({ data: { phone } }).catch(() => null)) as any;
}
export async function saveCustomer(
  id: string | null,
  payload: { name: string; phone: string | null },
) {
  await t.tSaveCustomer({ data: { id, ...payload } });
}
export async function listSuppliers(): Promise<any[]> {
  return t.tListSuppliers();
}
export async function addSupplier(s: { name: string; phone: string | null; gstin: string | null }) {
  await t.tAddSupplier({ data: s });
}

// ---------- purchases
export async function listPurchases(): Promise<any[]> {
  return t.tListPurchases();
}
export async function createPurchase(p: {
  supplier_id: string;
  purchase_date: string;
  invoice_ref?: string;
  items: { product_id: string; quantity: number; purchase_price: number }[];
}) {
  await t.tCreatePurchase({ data: p });
}

// ---------- invoices
export async function listInvoices(limit: number): Promise<any[]> {
  return t.tListInvoices({ data: { limit } });
}
export async function recentInvoices(): Promise<any[]> {
  return t.tListInvoices({ data: { limit: 8 } });
}
/** Invoice with items and payments (receipt shape). */
export async function getInvoiceForReceipt(id: string): Promise<any | null> {
  return t.tGetInvoice({ data: { id, withReturns: false } }).catch(() => null);
}
/** Invoice with items, payments and returns (invoice detail shape). */
export async function getInvoiceDetail(id: string): Promise<InvoiceDetail> {
  return t.tGetInvoice({ data: { id, withReturns: true } });
}
/** Public customer view of an invoice via secure token. */
export async function getPublicInvoice(token: string): Promise<any | null> {
  return t.tGetPublicInvoice({ data: { token } }).catch(() => null);
}
export async function createSale(s: {
  items: { product_id: string; quantity: number }[];
  customer_name?: string;
  customer_phone?: string;
  discount_type: "none" | "percent" | "amount";
  discount_value: number;
  gst_applied: boolean;
  payment_method: "cash" | "card" | "upi";
}): Promise<{ invoice_id: string }> {
  return t.tCreateSale({ data: s });
}
export async function createSalesReturn(r: {
  invoice_id: string;
  items: { invoice_item_id: string; quantity: number }[];
  refund_method: "cash" | "card" | "upi" | "adjustment";
  reason?: string;
}): Promise<{
  return_id: string;
  return_number: string;
  total_refund: number;
  refund_method: string;
}> {
  return t.tCreateSalesReturn({ data: r });
}

// ---------- stock
export async function listMovements(limit: number): Promise<any[]> {
  return t.tListMovements({ data: { limit } });
}
export async function recentMovements(): Promise<any[]> {
  return t.tListMovements({ data: { limit: 8 } });
}
export async function movementsAfter(
  ts: string,
): Promise<{ product_id: string; quantity_change: number }[]> {
  return t.tMovementsAfter({ data: { ts } });
}
export async function adjustStock(productId: string, newStock: number, note?: string) {
  await t.tAdjustStock({
    data: { product_id: productId, new_stock: newStock, note: note || null },
  });
}
export async function setOpeningStock(productId: string, stock: number, note: string) {
  await t.tSetOpeningStock({ data: { product_id: productId, stock, note } });
}
/** Fire-and-forget like before: errors are ignored. */
export async function addImportBatch(b: {
  filename: string;
  row_count: number;
  success_count: number;
  error_count: number;
  errors: { line: number; error?: string | undefined }[];
}) {
  await t.tAddImportBatch({ data: b }).catch(() => {});
}

// ---------- reports
export async function reportSales(from: string, to: string): Promise<ReportSale[]> {
  return t.tReportSales({ data: { from, to } });
}
export async function reportReturns(from: string, to: string): Promise<ReportReturn[]> {
  return t.tReportReturns({ data: { from, to } });
}
