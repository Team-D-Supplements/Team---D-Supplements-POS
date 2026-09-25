// Turso-mode POS server functions. Every function runs adminMiddleware first:
// no session -> 401, signed in but not admin -> 403 (replaces the Supabase
// RLS "admin only" policies). Inputs are validated with zod. The browser only
// ever calls these RPCs; it never sees Turso credentials.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { adminMiddleware } from "./admin-middleware";
import * as pos from "./pos.server";
// NOTE: each function is written as a literal createServerFn(...) chain so the
// build can strip the handler (and every pos.server import) from browser code.

const id = z.string().min(1).max(64);
const text = (max = 500) => z.string().max(max);
const optText = (max = 500) => z.string().max(max).nullable();
const optPhone = z
  .string()
  .max(50)
  .nullable()
  .optional()
  .refine((val) => !val || !val.trim() || /^\d{10}$/.test(val.trim()), {
    message: "Phone number must be exactly 10 digits",
  });
const phoneSchema = z
  .string()
  .max(50)
  .optional()
  .refine((val) => !val || !val.trim() || /^\d{10}$/.test(val.trim()), {
    message: "Phone number must be exactly 10 digits",
  });
const money = z.number().finite().min(0).max(1e10);

// ---------- settings
export const tGetShopSettings = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .handler(() => pos.getShopSettings());
export const tUpdateShopSettings = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator((d: unknown) =>
    z
      .object({
        id,
        shop_name: text(200),
        legal_name: optText(200),
        address: optText(1000),
        phone: optText(50),
        gstin: optText(50),
        invoice_prefix: text(30),
        invoice_number_padding: z.number().int().min(1).max(20),
        invoice_include_year: z.boolean(),
        receipt_width: z.enum(["58mm", "80mm"]),
        receipt_footer_text: text(1000),
        storage_limit_mb: z.number().int().min(0).max(1e7),
        storage_warn_percent: z.number().int().min(0).max(100),
      })
      .parse(d),
  )
  .handler(({ data }) => pos.updateShopSettings(data));

// ---------- products
export const tListProducts = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .inputValidator((d: unknown) => z.object({ activeOnly: z.boolean() }).parse(d))
  .handler(({ data }) => pos.listProducts(data.activeOnly));
export const tSearchProducts = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .inputValidator((d: unknown) =>
    z
      .object({
        q: text(200),
        fields: z.array(z.enum(["name", "brand", "barcode"])).min(1),
        activeOnly: z.boolean(),
        limit: z.number().int().min(1).max(100),
      })
      .parse(d),
  )
  .handler(({ data }) => pos.searchProducts(data.q, data.fields, data.activeOnly, data.limit));
export const tProductByBarcode = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .inputValidator((d: unknown) =>
    z.object({ barcode: text(200), activeOnly: z.boolean() }).parse(d),
  )
  .handler(({ data }) => pos.productByBarcode(data.barcode, data.activeOnly));
const productInput = z.object({
  name: z.string().trim().min(1, "Product name is required").max(300),
  brand: optText(200),
  category: optText(200),
  barcode: optText(200),
  purchase_price: money,
  selling_price: money,
  tax_percent: z.number().min(0).max(100),
  reorder_level: z.number().int().min(0).max(1e9),
  is_active: z.boolean().optional(),
});
export const tSaveProduct = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator((d: unknown) => z.object({ id: id.nullable(), product: productInput }).parse(d))
  .handler(({ data }) => pos.saveProduct(data.id, data.product));

// ---------- customers / suppliers
export const tListCustomers = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .handler(() => pos.listCustomers());
export const tCustomerByPhone = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .inputValidator((d: unknown) => z.object({ phone: text(50) }).parse(d))
  .handler(({ data }) => pos.customerByPhone(data.phone));
export const tSaveCustomer = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator((d: unknown) =>
    z
      .object({ id: id.nullable(), name: z.string().trim().min(1).max(200), phone: optPhone })
      .parse(d),
  )
  .handler(({ data }) => pos.saveCustomer(data.id, { name: data.name, phone: data.phone ?? null }));
export const tListSuppliers = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .handler(() => pos.listSuppliers());
export const tAddSupplier = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator((d: unknown) =>
    z
      .object({ name: z.string().trim().min(1).max(200), phone: optText(50), gstin: optText(50) })
      .parse(d),
  )
  .handler(({ data }) => pos.addSupplier(data));

// ---------- purchases
export const tListPurchases = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .handler(() => pos.listPurchases());
export const tCreatePurchase = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator((d: unknown) =>
    z
      .object({
        supplier_id: id,
        purchase_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional(),
        invoice_ref: text(200).optional(),
        items: z
          .array(z.object({ product_id: id, quantity: z.number(), purchase_price: money }))
          .max(500),
      })
      .parse(d),
  )
  .handler(({ data, context }) => pos.createPurchase(data, context.user.id));

// ---------- invoices / sale / returns
export const tListInvoices = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .inputValidator((d: unknown) => z.object({ limit: z.number().int().min(1).max(1000) }).parse(d))
  .handler(({ data }) => pos.listInvoices(data.limit));
export const tGetInvoice = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .inputValidator((d: unknown) => z.object({ id, withReturns: z.boolean() }).parse(d))
  .handler(({ data }) => pos.getInvoice(data.id, data.withReturns));
export const tGetPublicInvoice = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(16).max(128) }).parse(d))
  .handler(({ data }) => pos.getInvoiceByPublicToken(data.token));
export const tCreateSale = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator((d: unknown) =>
    z
      .object({
        items: z.array(z.object({ product_id: id, quantity: z.number() })).max(500),
        customer_name: text(200).optional(),
        customer_phone: phoneSchema,
        discount_type: z.enum(["none", "percent", "amount"], { message: "Invalid discount type" }),
        discount_value: z.number().finite(),
        gst_applied: z.boolean(),
        payment_method: z.enum(["cash", "card", "upi"], { message: "Invalid payment method" }),
      })
      .parse(d),
  )
  .handler(({ data, context }) => pos.createSale(data, context.user.id));
export const tCreateSalesReturn = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator((d: unknown) =>
    z
      .object({
        invoice_id: id,
        items: z.array(z.object({ invoice_item_id: id, quantity: z.number() })).max(500),
        refund_method: z.enum(["cash", "card", "upi", "adjustment"], {
          message: "Invalid refund method",
        }),
        reason: text(1000).optional(),
      })
      .parse(d),
  )
  .handler(({ data, context }) => pos.createSalesReturn(data, context.user.id));

// ---------- stock
export const tListMovements = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .inputValidator((d: unknown) => z.object({ limit: z.number().int().min(1).max(1000) }).parse(d))
  .handler(({ data }) => pos.listMovements(data.limit));
export const tMovementsAfter = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .inputValidator((d: unknown) => z.object({ ts: text(40) }).parse(d))
  .handler(({ data }) => pos.movementsAfter(data.ts));
export const tAdjustStock = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator((d: unknown) =>
    z
      .object({ product_id: id, new_stock: z.number().finite(), note: text(500).nullable() })
      .parse(d),
  )
  .handler(({ data, context }) =>
    pos.adjustStock(data.product_id, Math.round(data.new_stock), data.note, context.user.id),
  );
export const tSetOpeningStock = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator((d: unknown) =>
    z.object({ product_id: id, stock: z.number().finite(), note: text(500) }).parse(d),
  )
  .handler(({ data, context }) =>
    pos.setOpeningStock(data.product_id, Math.round(data.stock), data.note, context.user.id),
  );
export const tAddImportBatch = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator((d: unknown) =>
    z
      .object({
        filename: text(300),
        row_count: z.number().int().min(0),
        success_count: z.number().int().min(0),
        error_count: z.number().int().min(0),
        errors: z
          .array(z.object({ line: z.number(), error: z.string().max(1000).optional() }))
          .max(20000),
      })
      .parse(d),
  )
  .handler(({ data }) => pos.addImportBatch(data));

// ---------- reports / dashboard / usage
const range = z.object({ from: text(40), to: text(40) });
export const tReportSales = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .inputValidator((d: unknown) => range.parse(d))
  .handler(({ data }) => pos.reportSales(data.from, data.to));
export const tReportReturns = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .inputValidator((d: unknown) => range.parse(d))
  .handler(({ data }) => pos.reportReturns(data.from, data.to));
export const tDashboardStats = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .handler(() => pos.dashboardStats());
export const tDbUsage = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .handler(() => pos.dbUsage());
