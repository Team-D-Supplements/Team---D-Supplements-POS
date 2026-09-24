// Application row shapes as the screens receive them (money in rupees,
// rates in percent, booleans as true/false). The server converts from the
// stored Turso formats (paise, basis points, 0/1) before returning.

export type Customer = {
  id: string;
  name: string;
  phone: string | null;
  created_at: string;
  updated_at: string;
};

export type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  gstin: string | null;
  notes: string | null;
  created_at: string;
};

export type Product = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  sku: string | null;
  barcode: string | null;
  purchase_price: number;
  selling_price: number;
  tax_percent: number;
  current_stock: number;
  reorder_level: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ShopSettings = {
  id: string;
  singleton: boolean;
  shop_name: string;
  legal_name: string | null;
  address: string | null;
  phone: string | null;
  gstin: string | null;
  receipt_footer_text: string;
  receipt_width: string;
  invoice_prefix: string;
  invoice_include_year: boolean;
  invoice_next_number: number;
  invoice_number_padding: number;
  default_gst_rate: number;
  allowed_gst_rates: number[];
  gst_enabled_by_default: boolean;
  prices_include_tax: boolean;
  storage_limit_mb: number;
  storage_warn_percent: number;
  created_at: string;
  updated_at: string;
};

export type Invoice = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  customer_id: string | null;
  customer_name_snapshot: string | null;
  customer_phone_snapshot: string | null;
  subtotal: number;
  discount_type: string;
  discount_value: number;
  discount_amount: number;
  taxable_amount: number;
  tax_amount: number;
  total_amount: number;
  gst_applied: boolean;
  prices_include_tax: boolean;
  status: string;
  created_by: string | null;
  created_at: string;
  public_token?: string | null;
};

export type InvoiceItem = {
  id: string;
  invoice_id: string;
  product_id: string | null;
  product_name_snapshot: string;
  sku_snapshot: string | null;
  quantity: number;
  unit_price: number;
  line_discount_amount: number;
  taxable_amount: number;
  tax_percent: number;
  tax_amount: number;
  line_total: number;
  cost_price_snapshot: number;
  returned_quantity: number;
};

export type SalesReturn = {
  id: string;
  return_number: string;
  invoice_id: string;
  return_date: string;
  refund_method: string;
  total_refund: number;
  reason: string | null;
  created_by: string | null;
  created_at: string;
};

export type SalesReturnItem = {
  id: string;
  return_id: string;
  invoice_item_id: string;
  product_id: string | null;
  quantity: number;
  unit_price: number;
  refund_amount: number;
  taxable_amount: number;
  tax_amount: number;
  cost_amount: number;
};

/** Invoice with items, payments and returns (invoice detail screen). */
export type InvoiceDetail = Invoice & {
  invoice_items: InvoiceItem[];
  payments: { method: string }[];
  sales_returns: (SalesReturn & {
    sales_return_items: (SalesReturnItem & {
      invoice_items: { product_name_snapshot: string } | null;
    })[];
  })[];
};

/** Sales report row. */
export type ReportSale = Invoice & {
  payments: { method: string }[];
  invoice_items: Pick<
    InvoiceItem,
    "quantity" | "taxable_amount" | "tax_amount" | "cost_price_snapshot"
  >[];
};

/** Returns report row. */
export type ReportReturn = SalesReturn & {
  invoices: { invoice_number: string } | null;
  sales_return_items: (Pick<
    SalesReturnItem,
    "quantity" | "refund_amount" | "taxable_amount" | "tax_amount" | "cost_amount"
  > & {
    invoice_items: { product_name_snapshot: string } | null;
  })[];
};
