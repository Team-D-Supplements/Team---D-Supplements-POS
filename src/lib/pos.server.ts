// Server-only POS data layer for Turso/libSQL. Replaces the Supabase table
// reads/writes and the PostgreSQL functions (create_sale, create_purchase,
// create_sales_return, adjust_stock, set_opening_stock, dashboard_stats,
// db_usage). Money is stored as integer paise and tax rates as basis points;
// values are converted back to rupees / percent at this edge so the screens
// receive exactly the same shapes and numbers they got from Supabase.
import type { InArgs, Row, Transaction } from "@libsql/client/web";
import { getDb, newId, withWriteTx } from "./db.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Obj = Record<string, any>;
type Exec = {
  execute: (s: { sql: string; args?: InArgs }) => Promise<{ rows: Row[]; columns: string[] }>;
};

// ---------------------------------------------------------------- conversions
const MONEY = new Set([
  "purchase_price",
  "selling_price",
  "subtotal",
  "discount_amount",
  "taxable_amount",
  "tax_amount",
  "total_amount",
  "unit_price",
  "cost_price_snapshot",
  "line_discount_amount",
  "line_total",
  "amount",
  "refund_amount",
  "cost_amount",
  "total_refund",
]);
const RATE = new Set(["tax_percent", "default_gst_rate"]);
const BOOL = new Set([
  "is_active",
  "gst_applied",
  "prices_include_tax",
  "invoice_include_year",
  "gst_enabled_by_default",
  "singleton",
]);

/** Rupees (number, <= 2 decimals expected) -> integer paise, exact half-up. */
export const toPaise = (v: unknown): number => {
  const n = Number(v) || 0;
  return Math.round(Number((n * 100).toFixed(6)));
};
/** Percent -> basis points (18 -> 1800). */
export const toBp = (v: unknown): number => toPaise(v);
/** Exact integer rounding of a/b, half away from zero (PostgreSQL round()). */
export const roundDiv = (a: number, b: number): number => {
  const s = Math.sign(a) * Math.sign(b);
  const A = Math.abs(a),
    B = Math.abs(b);
  return s * Math.floor((2 * A + B) / (2 * B));
};

function plain(row: Row, columns: string[]): Obj {
  const o: Obj = {};
  for (const c of columns) o[c] = row[c] as unknown;
  return o;
}

/** Converts one stored row into the shape the UI got from Supabase. */
export function out(row: Obj): Obj {
  const o: Obj = { ...row };
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (v === null || v === undefined) continue;
    if (MONEY.has(k)) o[k] = Number(v) / 100;
    else if (RATE.has(k)) o[k] = Number(v) / 100;
    else if (BOOL.has(k)) o[k] = Number(v) === 1;
    else if (k === "allowed_gst_rates")
      o[k] = (JSON.parse(String(v)) as number[]).map((x) => x / 100);
    else if (k === "errors") o[k] = JSON.parse(String(v));
    else if (typeof v === "bigint") o[k] = Number(v);
  }
  if ("discount_value" in o && o["discount_value"] != null) {
    o["discount_value"] = Number(o["discount_value"]) / 100; // paise or basis points -> rupees or percent
  }
  return o;
}

async function all(db: Exec, sql: string, args: InArgs = []): Promise<Obj[]> {
  const r = await db.execute({ sql, args });
  return r.rows.map((row) => out(plain(row, r.columns)));
}
async function raw(db: Exec, sql: string, args: InArgs = []): Promise<Obj[]> {
  const r = await db.execute({ sql, args });
  return r.rows.map((row) => plain(row, r.columns));
}
const inList = (n: number) => Array.from({ length: n }, () => "?").join(",");

/** Keeps the error wording the screens already look for (e.g. "duplicate"). */
export function friendly(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (/UNIQUE constraint failed/i.test(msg)) {
    const m = /UNIQUE constraint failed: (\w+)\.(\w+)/.exec(msg);
    return new Error(
      `duplicate key value violates unique constraint${m ? ` "${m[1]}_${m[2]}"` : ""}`,
    );
  }
  if (/FOREIGN KEY constraint failed/i.test(msg))
    return new Error("Linked record not found or still in use");
  if (/CHECK constraint failed/i.test(msg)) return new Error("Invalid value");
  return e instanceof Error ? e : new Error(msg);
}
async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw friendly(e);
  }
}

/** Timestamps from the screens without a zone are UTC, as PostgreSQL read them. */
export function utcTs(s: string): string {
  const hasZone = /(Z|[+-]\d\d:?\d\d)$/.test(s);
  const d = new Date(hasZone ? s : `${s}Z`);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date");
  return d.toISOString();
}

// ---------------------------------------------------------------- settings
export const getShopSettings = async () =>
  (await all(getDb(), "SELECT * FROM shop_settings LIMIT 1"))[0] ?? null;

export type SettingsInput = {
  id: string;
  shop_name: string;
  legal_name: string | null;
  address: string | null;
  phone: string | null;
  gstin: string | null;
  invoice_prefix: string;
  invoice_number_padding: number;
  invoice_include_year: boolean;
  receipt_width: string;
  receipt_footer_text: string;
  storage_limit_mb: number;
  storage_warn_percent: number;
};
export const updateShopSettings = (s: SettingsInput) =>
  guard(async () => {
    await getDb().execute({
      sql: `UPDATE shop_settings SET shop_name=?, legal_name=?, address=?, phone=?, gstin=?, invoice_prefix=?,
              invoice_number_padding=?, invoice_include_year=?, receipt_width=?, receipt_footer_text=?,
              storage_limit_mb=?, storage_warn_percent=? WHERE id=?`,
      args: [
        s.shop_name,
        s.legal_name,
        s.address,
        s.phone,
        s.gstin,
        s.invoice_prefix,
        s.invoice_number_padding,
        s.invoice_include_year ? 1 : 0,
        s.receipt_width,
        s.receipt_footer_text,
        s.storage_limit_mb,
        s.storage_warn_percent,
        s.id,
      ],
    });
  });

// ---------------------------------------------------------------- products
export const listProducts = (activeOnly: boolean) =>
  all(
    getDb(),
    `SELECT * FROM products ${activeOnly ? "WHERE is_active = 1" : ""} ORDER BY name COLLATE NOCASE`,
  );

/** Same as PostgREST name/brand/barcode ilike '%q%' search. */
export function searchProducts(
  q: string,
  fields: ("name" | "brand" | "barcode")[],
  activeOnly: boolean,
  limit: number,
) {
  const where = fields.map((f) => `${f} LIKE ?`).join(" OR ");
  return all(
    getDb(),
    `SELECT * FROM products WHERE (${where}) ${activeOnly ? "AND is_active = 1" : ""} ORDER BY name COLLATE NOCASE LIMIT ?`,
    [...fields.map(() => `%${q}%`), limit],
  );
}
export const productByBarcode = async (barcode: string, activeOnly: boolean) =>
  (
    await all(
      getDb(),
      `SELECT * FROM products WHERE barcode = ? ${activeOnly ? "AND is_active = 1" : ""} LIMIT 1`,
      [barcode],
    )
  )[0] ?? null;

export type ProductInput = {
  name: string;
  brand: string | null;
  category: string | null;
  barcode: string | null;
  purchase_price: number;
  selling_price: number;
  tax_percent: number;
  reorder_level: number;
  is_active?: boolean | undefined;
};
export const saveProduct = (id: string | null, p: ProductInput) =>
  guard(async () => {
    const vals = [
      p.name,
      p.brand,
      p.category,
      p.barcode,
      toPaise(p.purchase_price),
      toPaise(p.selling_price),
      toBp(p.tax_percent),
      Math.trunc(p.reorder_level),
    ];
    if (id) {
      const r = await getDb().execute({
        sql: `UPDATE products SET name=?, brand=?, category=?, barcode=?, purchase_price=?, selling_price=?,
                tax_percent=?, reorder_level=? ${p.is_active === undefined ? "" : ", is_active=?"} WHERE id=?`,
        args: [...vals, ...(p.is_active === undefined ? [] : [p.is_active ? 1 : 0]), id],
      });
      if (r.rowsAffected === 0) throw new Error("Product not found");
      return id;
    }
    const nid = newId();
    await getDb().execute({
      sql: `INSERT INTO products (id, name, brand, category, barcode, purchase_price, selling_price, tax_percent,
              reorder_level, is_active) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      args: [nid, ...vals, p.is_active === false ? 0 : 1],
    });
    return nid;
  });

export const deleteProduct = (id: string) =>
  guard(async () => {
    const db = getDb();
    const p = (await all(db, "SELECT id, name FROM products WHERE id = ?", [id]))[0];
    if (!p) throw new Error("Product not found");

    // Check if referenced by existing transaction records
    const [invoices, purchases, returns, movements] = await Promise.all([
      all(db, "SELECT 1 FROM invoice_items WHERE product_id = ? LIMIT 1", [id]),
      all(db, "SELECT 1 FROM purchase_items WHERE product_id = ? LIMIT 1", [id]),
      all(db, "SELECT 1 FROM sales_return_items WHERE product_id = ? LIMIT 1", [id]),
      all(db, "SELECT 1 FROM stock_movements WHERE product_id = ? LIMIT 1", [id]),
    ]);

    const isReferenced =
      invoices.length > 0 || purchases.length > 0 || returns.length > 0 || movements.length > 0;

    if (isReferenced) {
      // Safely deactivate instead of deleting to preserve historical records
      await db.execute({
        sql: "UPDATE products SET is_active = 0 WHERE id = ?",
        args: [id],
      });
      return {
        action: "deactivated" as const,
        message: `"${p["name"]}" has existing transaction records and was deactivated to preserve historical data.`,
      };
    }

    // Completely safe to delete
    await db.execute({
      sql: "DELETE FROM products WHERE id = ?",
      args: [id],
    });
    return {
      action: "deleted" as const,
      message: `"${p["name"]}" was permanently deleted.`,
    };
  });

// ---------------------------------------------------------------- customers / suppliers
export const listCustomers = () =>
  all(getDb(), "SELECT * FROM customers ORDER BY name COLLATE NOCASE");
export const customerByPhone = async (phone: string) =>
  (await all(getDb(), "SELECT name FROM customers WHERE phone = ? LIMIT 1", [phone]))[0] ?? null;
export const saveCustomer = (id: string | null, c: { name: string; phone: string | null }) =>
  guard(async () => {
    const name = (c.name ?? "").trim();
    if (!name) throw new Error("Customer name is required");
    const rawPhone = (c.phone ?? "").trim();
    const phone = rawPhone.length ? rawPhone : null;
    if (phone) {
      if (!/^\d{10}$/.test(phone)) {
        throw new Error("Customer phone number must be exactly 10 digits");
      }
      const existing = (
        await all(getDb(), "SELECT id FROM customers WHERE phone = ? LIMIT 1", [phone])
      )[0];
      if (existing) {
        if (!id || existing["id"] === id) {
          // If saving without id or updating same customer, update name and reuse customer
          await getDb().execute({
            sql: "UPDATE customers SET name=?, phone=? WHERE id=?",
            args: [name, phone, existing["id"]],
          });
          return;
        } else {
          throw new Error("Another customer with this phone number already exists");
        }
      }
    }
    if (id) {
      await getDb().execute({
        sql: "UPDATE customers SET name=?, phone=? WHERE id=?",
        args: [name, phone, id],
      });
    } else {
      await getDb().execute({
        sql: "INSERT INTO customers (id, name, phone) VALUES (?,?,?)",
        args: [newId(), name, phone],
      });
    }
  });
export const listSuppliers = () =>
  all(getDb(), "SELECT * FROM suppliers ORDER BY name COLLATE NOCASE");
export const addSupplier = (s: { name: string; phone: string | null; gstin: string | null }) =>
  guard(async () => {
    await getDb().execute({
      sql: "INSERT INTO suppliers (id, name, phone, gstin) VALUES (?,?,?,?)",
      args: [newId(), s.name, s.phone, s.gstin],
    });
  });

// ---------------------------------------------------------------- purchases
export async function listPurchases() {
  const db = getDb();
  const rows = await all(
    db,
    "SELECT * FROM purchases ORDER BY purchase_date DESC, created_at DESC LIMIT 200",
  );
  if (!rows.length) return rows;
  const ids = rows.map((r) => r["id"] as string);
  const items = await raw(
    db,
    `SELECT id, purchase_id FROM purchase_items WHERE purchase_id IN (${inList(ids.length)})`,
    ids,
  );
  const supIds = [...new Set(rows.map((r) => r["supplier_id"]).filter(Boolean))] as string[];
  const sups = supIds.length
    ? await raw(db, `SELECT id, name FROM suppliers WHERE id IN (${inList(supIds.length)})`, supIds)
    : [];
  return rows.map((r) => {
    const s = sups.find((x) => x["id"] === r["supplier_id"]);
    return {
      ...r,
      suppliers: s ? { name: s["name"] } : null,
      purchase_items: items
        .filter((i) => i["purchase_id"] === r["id"])
        .map((i) => ({ id: i["id"] })),
    };
  });
}

// ---------------------------------------------------------------- invoices
export const listInvoices = (limit: number) =>
  all(getDb(), "SELECT * FROM invoices ORDER BY invoice_date DESC LIMIT ?", [limit]);

export function generatePublicToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function getInvoice(id: string, withReturns: boolean) {
  const db = getDb();
  const inv = (await all(db, "SELECT * FROM invoices WHERE id = ?", [id]))[0];
  if (!inv) throw new Error("Invoice not found");
  if (!inv["public_token"]) {
    const token = generatePublicToken();
    await db.execute({
      sql: "UPDATE invoices SET public_token = ? WHERE id = ?",
      args: [token, id],
    });
    inv["public_token"] = token;
  }
  const items = await all(db, "SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY rowid", [
    id,
  ]);
  const pays = await raw(db, "SELECT method FROM payments WHERE invoice_id = ? ORDER BY paid_at", [
    id,
  ]);
  const result: Obj = { ...inv, invoice_items: items, payments: pays };
  if (withReturns) {
    const rets = await all(
      db,
      "SELECT * FROM sales_returns WHERE invoice_id = ? ORDER BY return_date",
      [id],
    );
    for (const r of rets) {
      const ri = await all(
        db,
        "SELECT * FROM sales_return_items WHERE return_id = ? ORDER BY rowid",
        [r["id"] as string],
      );
      r["sales_return_items"] = ri.map((x) => {
        const ii = items.find((i) => i["id"] === x["invoice_item_id"]);
        return {
          ...x,
          invoice_items: ii ? { product_name_snapshot: ii["product_name_snapshot"] } : null,
        };
      });
    }
    result["sales_returns"] = rets;
  }
  return result;
}

export async function getInvoiceByPublicToken(token: string) {
  if (!token || typeof token !== "string" || token.length < 16) {
    return null;
  }
  const db = getDb();
  const inv = (await all(db, "SELECT * FROM invoices WHERE public_token = ?", [token]))[0];
  if (!inv) return null;
  const items = await all(db, "SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY rowid", [
    inv["id"] as string,
  ]);
  const pays = await raw(db, "SELECT method FROM payments WHERE invoice_id = ? ORDER BY paid_at", [
    inv["id"] as string,
  ]);
  const settings = (await all(db, "SELECT * FROM shop_settings WHERE singleton = 1 LIMIT 1"))[0];

  return {
    invoice: {
      invoice_number: String(inv["invoice_number"]),
      invoice_date: String(inv["invoice_date"]),
      customer_name_snapshot: (inv["customer_name_snapshot"] as string) || null,
      customer_phone_snapshot: (inv["customer_phone_snapshot"] as string) || null,
      subtotal: Number(inv["subtotal"]),
      discount_type: String(inv["discount_type"]),
      discount_value: Number(inv["discount_value"]),
      discount_amount: Number(inv["discount_amount"]),
      gst_applied: Boolean(inv["gst_applied"]),
      taxable_amount: Number(inv["taxable_amount"]),
      tax_amount: Number(inv["tax_amount"]),
      total_amount: Number(inv["total_amount"]),
      payment_method: (pays[0]?.["method"] as string) ?? null,
      public_token: token,
      items: items.map((i) => ({
        product_name_snapshot: String(i["product_name_snapshot"]),
        quantity: Number(i["quantity"]),
        unit_price: Number(i["unit_price"]),
        line_total: Number(i["line_total"]),
      })),
    },
    settings: settings
      ? {
          shop_name: String(settings["shop_name"] ?? "Store"),
          legal_name: (settings["legal_name"] as string) || null,
          address: (settings["address"] as string) || null,
          phone: (settings["phone"] as string) || null,
          gstin: (settings["gstin"] as string) || null,
          receipt_width: (settings["receipt_width"] as "58mm" | "80mm") ?? "80mm",
          receipt_footer_text: (settings["receipt_footer_text"] as string) || null,
        }
      : null,
  };
}

// ---------------------------------------------------------------- stock
export async function listMovements(limit: number) {
  return all(
    getDb(),
    `SELECT m.*, p.name AS _pname FROM stock_movements m LEFT JOIN products p ON p.id = m.product_id
     ORDER BY m.created_at DESC LIMIT ?`,
    [limit],
  ).then((rows) =>
    rows.map(({ _pname, ...m }) => ({ ...m, products: _pname == null ? null : { name: _pname } })),
  );
}
export const movementsAfter = (ts: string) =>
  all(getDb(), "SELECT product_id, quantity_change FROM stock_movements WHERE created_at > ?", [
    utcTs(ts),
  ]);

// ---------------------------------------------------------------- reports
export async function reportSales(from: string, to: string) {
  const db = getDb();
  const invs = await all(
    db,
    "SELECT * FROM invoices WHERE invoice_date >= ? AND invoice_date <= ? ORDER BY invoice_date DESC",
    [utcTs(from), utcTs(to)],
  );
  if (!invs.length) return invs;
  const ids = invs.map((i) => i["id"] as string);
  const pays = await raw(
    db,
    `SELECT invoice_id, method FROM payments WHERE invoice_id IN (${inList(ids.length)})`,
    ids,
  );
  const items = await all(
    db,
    `SELECT invoice_id, quantity, taxable_amount, tax_amount, cost_price_snapshot FROM invoice_items WHERE invoice_id IN (${inList(ids.length)})`,
    ids,
  );
  return invs.map((i) => ({
    ...i,
    payments: pays.filter((p) => p["invoice_id"] === i["id"]).map((p) => ({ method: p["method"] })),
    invoice_items: items
      .filter((x) => x["invoice_id"] === i["id"])
      .map(({ invoice_id: _, ...x }) => x),
  }));
}
export async function reportReturns(from: string, to: string) {
  const db = getDb();
  const rets = await all(
    db,
    `SELECT r.*, i.invoice_number AS _inv FROM sales_returns r LEFT JOIN invoices i ON i.id = r.invoice_id
     WHERE r.return_date >= ? AND r.return_date <= ? ORDER BY r.return_date DESC`,
    [utcTs(from), utcTs(to)],
  );
  if (!rets.length) return rets;
  const ids = rets.map((r) => r["id"] as string);
  const items = await all(
    db,
    `SELECT sri.return_id, sri.quantity, sri.refund_amount, sri.taxable_amount, sri.tax_amount, sri.cost_amount,
            ii.product_name_snapshot AS _pname
     FROM sales_return_items sri LEFT JOIN invoice_items ii ON ii.id = sri.invoice_item_id
     WHERE sri.return_id IN (${inList(ids.length)})`,
    ids,
  );
  return rets.map(({ _inv, ...r }) => ({
    ...r,
    invoices: _inv == null ? null : { invoice_number: _inv },
    sales_return_items: items
      .filter((x) => x["return_id"] === r["id"])
      .map(({ return_id: _, _pname, ...x }) => ({
        ...x,
        invoice_items: _pname == null ? null : { product_name_snapshot: _pname },
      })),
  }));
}

// ---------------------------------------------------------------- stock change helper (was apply_stock_change)
async function applyStockChange(
  tx: Transaction,
  productId: string,
  delta: number,
  type: string,
  refTable: string,
  refId: string,
  note: string | null,
  userId: string,
  requireAvailable = false,
): Promise<number> {
  const r = await tx.execute({
    sql: `UPDATE products SET current_stock = current_stock + ? WHERE id = ?
          ${requireAvailable ? "AND current_stock + ? >= 0" : ""} RETURNING current_stock`,
    args: requireAvailable ? [delta, productId, delta] : [delta, productId],
  });
  const row = r.rows[0];
  if (!row) throw new Error(requireAvailable ? "Not enough stock" : "Product not found");
  const newStock = Number(row["current_stock"]);
  await tx.execute({
    sql: `INSERT INTO stock_movements (id, product_id, movement_type, quantity_change, resulting_stock,
            reference_table, reference_id, note, created_by) VALUES (?,?,?,?,?,?,?,?,?)`,
    args: [newId(), productId, type, delta, newStock, refTable, refId, note, userId],
  });
  return newStock;
}

// ---------------------------------------------------------------- sale (was create_sale)
export type SaleInput = {
  items: { product_id: string; quantity: number }[];
  customer_name?: string | undefined;
  customer_phone?: string | undefined;
  discount_type: "none" | "percent" | "amount";
  discount_value: number;
  gst_applied: boolean;
  payment_method: "cash" | "card" | "upi";
};
const nz = (s: string | undefined | null) => {
  const t = (s ?? "").trim();
  return t.length ? t : null;
};

export function createSale(input: SaleInput, userId: string) {
  if (!input.items.length) throw new Error("Cart is empty");
  return guard(() =>
    withWriteTx(async (tx) => {
      const s = (await raw(tx, "SELECT * FROM shop_settings WHERE singleton = 1 LIMIT 1"))[0];
      if (!s) throw new Error("Shop settings missing");
      const gst = input.gst_applied;
      const lines: {
        product_id: string;
        name: string;
        sku: unknown;
        qty: number;
        unit: number;
        cost: number;
        rate: number;
        gross: number;
      }[] = [];
      let subtotal = 0;
      for (const it of input.items) {
        const qty = it.quantity;
        if (!Number.isInteger(qty) || qty <= 0) throw new Error("Invalid quantity");
        const p = (await raw(tx, "SELECT * FROM products WHERE id = ?", [it.product_id]))[0];
        if (!p) throw new Error("Product not found");
        const stock = Number(p["current_stock"]);
        if (stock < qty)
          throw new Error(`Not enough stock for ${String(p["name"])}: ${stock} left`);
        const unit = Number(p["selling_price"]);
        const gross = unit * qty;
        subtotal += gross;
        lines.push({
          product_id: String(p["id"]),
          name: String(p["name"]),
          sku: p["sku"],
          qty,
          unit,
          cost: Number(p["purchase_price"]),
          rate: gst ? Number(p["tax_percent"]) : 0,
          gross,
        });
      }

      const dvRaw = Math.max(Number(input.discount_value) || 0, 0);
      const dvStored =
        input.discount_type === "none"
          ? toPaise(Number(input.discount_value) || 0)
          : toPaise(dvRaw);
      let discount = 0;
      if (input.discount_type === "percent") discount = roundDiv(subtotal * toBp(dvRaw), 10000);
      else if (input.discount_type === "amount") discount = toPaise(dvRaw);
      if (discount > subtotal) discount = subtotal;

      // customer (same matching rules as before)
      const phone = nz(input.customer_phone);
      const name = nz(input.customer_name);
      let custId: string | null = null;
      if (phone) {
        if (!/^\d{10}$/.test(phone)) {
          throw new Error("Customer phone number must be exactly 10 digits");
        }
        const c = (await raw(tx, "SELECT id FROM customers WHERE phone = ?", [phone]))[0];
        if (!c) {
          if (!name) {
            throw new Error("Customer name is required when phone number is entered");
          }
          custId = newId();
          await tx.execute({
            sql: "INSERT INTO customers (id, name, phone) VALUES (?,?,?)",
            args: [custId, name, phone],
          });
        } else {
          custId = String(c["id"]);
          if (name)
            await tx.execute({
              sql: "UPDATE customers SET name = ? WHERE id = ?",
              args: [name, custId],
            });
        }
      } else if (name) {
        const c = (
          await raw(
            tx,
            "SELECT id FROM customers WHERE lower(name) = lower(?) AND (phone IS NULL OR phone = '') LIMIT 1",
            [name],
          )
        )[0];
        if (c) custId = String(c["id"]);
        else {
          custId = newId();
          await tx.execute({
            sql: "INSERT INTO customers (id, name) VALUES (?,?)",
            args: [custId, name],
          });
        }
      }

      // invoice number: reserved inside the same write transaction (write lock held)
      const n = Number(s["invoice_next_number"]);
      const pad = Number(s["invoice_number_padding"]);
      const digits = String(n);
      // Never truncate/wrap: once the number no longer fits the configured digits, refuse the sale.
      // Throwing here rolls back the whole transaction (no invoice, no stock change, counter unchanged).
      if (!Number.isInteger(n) || n < 1 || digits.length > pad) {
        throw new Error(
          `Invoice number limit reached: next number ${digits} does not fit ${pad} digit(s). ` +
            `An administrator must increase "Number padding" in Settings before billing can continue.`,
        );
      }
      const padded = digits.padStart(pad, "0");
      const invNo = `${String(s["invoice_prefix"])}-${Number(s["invoice_include_year"]) === 1 ? `${new Date().getUTCFullYear()}-` : ""}${padded}`;
      await tx.execute({
        sql: "UPDATE shop_settings SET invoice_next_number = ? WHERE id = ?",
        args: [n + 1, s["id"] as string],
      });

      const inclusive = Number(s["prices_include_tax"]) === 1;
      const invId = newId();
      const publicToken = generatePublicToken();
      await tx.execute({
        sql: `INSERT INTO invoices (id, invoice_number, customer_id, customer_name_snapshot, customer_phone_snapshot, subtotal,
                discount_type, discount_value, discount_amount, gst_applied, prices_include_tax, created_by, public_token)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [
          invId,
          invNo,
          custId,
          name,
          phone,
          subtotal,
          input.discount_type,
          dvStored,
          discount,
          gst ? 1 : 0,
          inclusive ? 1 : 0,
          userId,
          publicToken,
        ],
      });

      let allocated = 0,
        totTaxable = 0,
        totTax = 0,
        total = 0;
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i]!;
        let lineDisc: number;
        if (i === lines.length - 1) lineDisc = discount - allocated;
        else if (subtotal > 0) lineDisc = Math.floor((discount * l.gross) / subtotal);
        else lineDisc = 0;
        allocated += lineDisc;
        const net = l.gross - lineDisc;
        let taxable = net,
          tax = 0,
          lineTotal = net;
        if (gst && l.rate > 0) {
          if (inclusive) {
            taxable = roundDiv(net * 10000, 10000 + l.rate);
            tax = net - taxable;
            lineTotal = net;
          } else {
            tax = roundDiv(net * l.rate, 10000);
            lineTotal = net + tax;
          }
        }
        totTaxable += taxable;
        totTax += tax;
        total += lineTotal;
        await tx.execute({
          sql: `INSERT INTO invoice_items (id, invoice_id, product_id, product_name_snapshot, sku_snapshot, quantity, unit_price,
                  cost_price_snapshot, tax_percent, line_discount_amount, taxable_amount, tax_amount, line_total)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          args: [
            newId(),
            invId,
            l.product_id,
            l.name,
            (l.sku as string | null) ?? null,
            l.qty,
            l.unit,
            l.cost,
            gst ? l.rate : 0,
            lineDisc,
            taxable,
            tax,
            lineTotal,
          ],
        });
      }
      await tx.execute({
        sql: "UPDATE invoices SET taxable_amount=?, tax_amount=?, total_amount=? WHERE id=?",
        args: [totTaxable, totTax, total, invId],
      });
      await tx.execute({
        sql: "INSERT INTO payments (id, invoice_id, method, amount) VALUES (?,?,?,?)",
        args: [newId(), invId, input.payment_method, total],
      });
      for (const l of lines) {
        await applyStockChange(
          tx,
          l.product_id,
          -l.qty,
          "sale",
          "invoices",
          invId,
          invNo,
          userId,
          true,
        );
      }
      return {
        invoice_id: invId,
        invoice_number: invNo,
        total: total / 100,
        public_token: publicToken,
      };
    }),
  );
}

// ---------------------------------------------------------------- purchase (was create_purchase)
export type PurchaseInput = {
  supplier_id: string;
  purchase_date?: string | null | undefined;
  invoice_ref?: string | undefined;
  items: { product_id: string; quantity: number; purchase_price: number }[];
};
export function createPurchase(p: PurchaseInput, userId: string) {
  if (!p.items.length) throw new Error("No items");
  return guard(() =>
    withWriteTx(async (tx) => {
      const pid = newId();
      const ref = p.invoice_ref ?? null;
      await tx.execute({
        sql: `INSERT INTO purchases (id, supplier_id, purchase_date, invoice_ref, created_by)
              VALUES (?, ?, COALESCE(?, date('now')), ?, ?)`,
        args: [pid, p.supplier_id, p.purchase_date || null, ref, userId],
      });
      let total = 0;
      for (const it of p.items) {
        const qty = it.quantity;
        if (!Number.isInteger(qty) || qty <= 0) throw new Error("Invalid quantity");
        const price = toPaise(it.purchase_price);
        const line = price * qty;
        await tx.execute({
          sql: "INSERT INTO purchase_items (id, purchase_id, product_id, quantity, purchase_price, line_total) VALUES (?,?,?,?,?,?)",
          args: [newId(), pid, it.product_id, qty, price, line],
        });
        total += line;
        if (price > 0)
          await tx.execute({
            sql: "UPDATE products SET purchase_price = ? WHERE id = ?",
            args: [price, it.product_id],
          });
        await applyStockChange(tx, it.product_id, qty, "purchase", "purchases", pid, ref, userId);
      }
      await tx.execute({
        sql: "UPDATE purchases SET total_amount = ? WHERE id = ?",
        args: [total, pid],
      });
      return pid;
    }),
  );
}

// ---------------------------------------------------------------- return (was create_sales_return)
export type ReturnInput = {
  invoice_id: string;
  items: { invoice_item_id: string; quantity: number }[];
  refund_method: "cash" | "card" | "upi" | "adjustment";
  reason?: string | undefined;
};
const ymd = (d: Date) => d.toISOString().slice(0, 10).replaceAll("-", "");
export function createSalesReturn(r: ReturnInput, userId: string) {
  if (!r.items.length) throw new Error("No items selected");
  return guard(() =>
    withWriteTx(async (tx) => {
      const inv = (await raw(tx, "SELECT id FROM invoices WHERE id = ?", [r.invoice_id]))[0];
      if (!inv) throw new Error("Invoice not found");
      // RET-YYYYMMDD-NNNNN as before; re-drawn if the random suffix is already taken.
      let rno = "";
      for (let a = 0; a < 20; a++) {
        rno = `RET-${ymd(new Date())}-${String(Math.floor(Math.random() * 100000)).padStart(5, "0")}`;
        if (!(await raw(tx, "SELECT 1 FROM sales_returns WHERE return_number = ?", [rno])).length)
          break;
      }
      const rid = newId();
      await tx.execute({
        sql: "INSERT INTO sales_returns (id, return_number, invoice_id, refund_method, reason, created_by) VALUES (?,?,?,?,?,?)",
        args: [rid, rno, r.invoice_id, r.refund_method, nz(r.reason), userId],
      });
      let refund = 0;
      for (const it of r.items) {
        const qty = it.quantity;
        if (!Number.isInteger(qty) || qty <= 0) continue;
        const ii = (
          await raw(tx, "SELECT * FROM invoice_items WHERE id = ? AND invoice_id = ?", [
            it.invoice_item_id,
            r.invoice_id,
          ])
        )[0];
        if (!ii) throw new Error("Invoice line not found");
        const sold = Number(ii["quantity"]);
        if (qty > sold - Number(ii["returned_quantity"]))
          throw new Error(
            `Cannot return more than sold for ${String(ii["product_name_snapshot"])}`,
          );
        const lineRefund = roundDiv(Number(ii["line_total"]) * qty, sold);
        const lineTaxable = roundDiv(Number(ii["taxable_amount"]) * qty, sold);
        const lineTax = roundDiv(Number(ii["tax_amount"]) * qty, sold);
        const lineCost = Number(ii["cost_price_snapshot"]) * qty;
        refund += lineRefund;
        await tx.execute({
          sql: `INSERT INTO sales_return_items (id, return_id, invoice_item_id, product_id, quantity, unit_price, refund_amount,
                  taxable_amount, tax_amount, cost_amount) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          args: [
            newId(),
            rid,
            ii["id"] as string,
            (ii["product_id"] as string | null) ?? null,
            qty,
            Number(ii["unit_price"]),
            lineRefund,
            lineTaxable,
            lineTax,
            lineCost,
          ],
        });
        const upd = await tx.execute({
          sql: "UPDATE invoice_items SET returned_quantity = returned_quantity + ? WHERE id = ? AND returned_quantity + ? <= quantity",
          args: [qty, ii["id"] as string, qty],
        });
        if (upd.rowsAffected !== 1)
          throw new Error(
            `Cannot return more than sold for ${String(ii["product_name_snapshot"])}`,
          );
        if (ii["product_id"])
          await applyStockChange(
            tx,
            String(ii["product_id"]),
            qty,
            "return",
            "sales_returns",
            rid,
            rno,
            userId,
          );
      }
      if (refund <= 0) throw new Error("No valid return quantity");
      await tx.execute({
        sql: "UPDATE sales_returns SET total_refund = ? WHERE id = ?",
        args: [refund, rid],
      });
      const rem = await raw(
        tx,
        "SELECT count(*) AS c FROM invoice_items WHERE invoice_id = ? AND returned_quantity < quantity",
        [r.invoice_id],
      );
      await tx.execute({
        sql: "UPDATE invoices SET status = ? WHERE id = ?",
        args: [Number(rem[0]?.["c"]) === 0 ? "returned" : "partially_returned", r.invoice_id],
      });
      return {
        return_id: rid,
        return_number: rno,
        total_refund: refund / 100,
        refund_method: r.refund_method,
      };
    }),
  );
}

// ---------------------------------------------------------------- adjust / opening stock
export function adjustStock(
  productId: string,
  newStock: number,
  note: string | null,
  userId: string,
) {
  return guard(() =>
    withWriteTx(async (tx) => {
      const p = (await raw(tx, "SELECT current_stock FROM products WHERE id = ?", [productId]))[0];
      if (!p) throw new Error("Product not found");
      const cur = Number(p["current_stock"]);
      if (newStock < 0) throw new Error("Stock cannot be negative");
      if (newStock === cur) return cur;
      return applyStockChange(
        tx,
        productId,
        newStock - cur,
        "adjustment",
        "products",
        productId,
        note,
        userId,
      );
    }),
  );
}
export function setOpeningStock(productId: string, stock: number, note: string, userId: string) {
  return guard(() =>
    withWriteTx(async (tx) => {
      const p = (await raw(tx, "SELECT current_stock FROM products WHERE id = ?", [productId]))[0];
      if (!p) throw new Error("Product not found");
      const cur = Number(p["current_stock"]);
      if (stock === cur) return cur;
      return applyStockChange(
        tx,
        productId,
        stock - cur,
        "import",
        "products",
        productId,
        note,
        userId,
      );
    }),
  );
}

export const addImportBatch = (b: {
  filename: string;
  row_count: number;
  success_count: number;
  error_count: number;
  errors: unknown;
}) =>
  guard(async () => {
    await getDb().execute({
      sql: "INSERT INTO import_batches (id, filename, row_count, success_count, error_count, errors) VALUES (?,?,?,?,?,?)",
      args: [
        newId(),
        b.filename,
        b.row_count,
        b.success_count,
        b.error_count,
        JSON.stringify(b.errors ?? []),
      ],
    });
    // Replaces Postgres cleanup_import_batches(): prune temporary import logs older than 30 days.
    // Runs whenever an import is recorded (no scheduler needed); never blocks the import.
    await cleanupImportBatches().catch(() => undefined);
  });

/** Deletes import_batches rows older than 30 days. Touches no other table. Returns rows deleted. */
export async function cleanupImportBatches(): Promise<number> {
  const r = await getDb().execute(
    "DELETE FROM import_batches WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days')",
  );
  return r.rowsAffected;
}

// ---------------------------------------------------------------- dashboard / usage
export async function dashboardStats() {
  const db = getDb();
  const one = async (sql: string) => Number((await raw(db, sql))[0]?.["v"] ?? 0);
  const today = "substr(%s,1,10) = strftime('%Y-%m-%d','now')";
  const t = (col: string) => today.replace("%s", col);
  const pay = (m: string) =>
    one(
      `SELECT COALESCE(SUM(amount),0) AS v FROM payments WHERE ${t("paid_at")} AND method='${m}'`,
    );
  const top = await raw(
    db,
    `SELECT ii.product_name_snapshot AS name, SUM(ii.quantity) AS qty, SUM(ii.line_total) AS amount
     FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
     WHERE i.invoice_date > strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days')
     GROUP BY 1 ORDER BY qty DESC LIMIT 5`,
  );
  return {
    today_sales:
      (await one(
        `SELECT COALESCE(SUM(total_amount),0) AS v FROM invoices WHERE ${t("invoice_date")}`,
      )) / 100,
    today_invoices: await one(`SELECT count(*) AS v FROM invoices WHERE ${t("invoice_date")}`),
    today_cash: (await pay("cash")) / 100,
    today_card: (await pay("card")) / 100,
    today_upi: (await pay("upi")) / 100,
    month_sales:
      (await one(
        `SELECT COALESCE(SUM(total_amount),0) AS v FROM invoices WHERE substr(invoice_date,1,7) = strftime('%Y-%m','now')`,
      )) / 100,
    low_stock_count: await one(
      "SELECT count(*) AS v FROM products WHERE is_active = 1 AND current_stock <= reorder_level",
    ),
    product_count: await one("SELECT count(*) AS v FROM products WHERE is_active = 1"),
    top_products: top.map((r) => ({
      name: r["name"],
      qty: Number(r["qty"]),
      amount: Number(r["amount"]) / 100,
    })),
  };
}

export async function dbUsage() {
  const db = getDb();
  const c = async (tbl: string) =>
    Number((await raw(db, `SELECT count(*) AS v FROM ${tbl}`))[0]?.["v"] ?? 0);
  let bytes: number | null = null;
  try {
    bytes = Number(
      (
        await raw(
          db,
          "SELECT page_count * page_size AS v FROM pragma_page_count(), pragma_page_size()",
        )
      )[0]?.["v"],
    );
  } catch {
    bytes = null;
  }
  return {
    bytes,
    products: await c("products"),
    customers: await c("customers"),
    invoices: await c("invoices"),
    invoice_items: await c("invoice_items"),
    payments: await c("payments"),
    purchases: await c("purchases"),
    stock_movements: await c("stock_movements"),
    returns: await c("sales_returns"),
    import_batches: await c("import_batches"),
  };
}
