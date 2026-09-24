import { money, dateTime } from "@/lib/format";
import type { ShopSettings } from "@/hooks/useShopSettings";

export type ReceiptInvoice = {
  invoice_number: string;
  invoice_date: string;
  customer_name_snapshot: string | null;
  customer_phone_snapshot: string | null;
  subtotal: number;
  discount_type: string;
  discount_value: number;
  discount_amount: number;
  gst_applied: boolean;
  taxable_amount: number;
  tax_amount: number;
  total_amount: number;
  payment_method?: string | null;
  public_token?: string | null;
  items: {
    product_name_snapshot: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }[];
};

export function Receipt({
  invoice,
  settings,
}: {
  invoice: ReceiptInvoice;
  settings: ShopSettings | null | undefined;
}) {
  const width = settings?.receipt_width === "58mm" ? "58mm" : "80mm";
  const line = <div className="my-1 border-t border-dashed border-black" />;

  return (
    <div
      className={`receipt-print-area receipt-sheet receipt-${width} mx-auto bg-white p-2 text-[11px] leading-tight`}
      style={{ width, maxWidth: "100%" }}
    >
      <div className="text-center">
        <p className="text-sm font-bold uppercase">{settings?.shop_name ?? "Store"}</p>
        {settings?.address && <p>{settings.address}</p>}
        {settings?.phone && <p>Ph: {settings.phone}</p>}
        {settings?.gstin && <p>GSTIN: {settings.gstin}</p>}
      </div>
      {line}
      <div className="flex justify-between">
        <span>Bill: {invoice.invoice_number}</span>
      </div>
      <div>{dateTime(invoice.invoice_date)}</div>
      {invoice.customer_name_snapshot && <div>Customer: {invoice.customer_name_snapshot}</div>}
      {invoice.customer_phone_snapshot && <div>Phone: {invoice.customer_phone_snapshot}</div>}
      {line}
      <table className="w-full">
        <thead>
          <tr className="text-left">
            <th className="font-normal">Item</th>
            <th className="w-8 text-right font-normal">Qty</th>
            <th className="w-14 text-right font-normal">Rate</th>
            <th className="w-16 text-right font-normal">Amt</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((it, i) => (
            <tr key={i} className="align-top">
              <td className="pr-1">{it.product_name_snapshot}</td>
              <td className="text-right">{it.quantity}</td>
              <td className="text-right">{Number(it.unit_price).toFixed(2)}</td>
              <td className="text-right">{Number(it.line_total).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {line}
      <Row label="Subtotal" value={money(invoice.subtotal)} />
      {Number(invoice.discount_amount) > 0 && (
        <Row
          label={`Discount${invoice.discount_type === "percent" ? ` (${Number(invoice.discount_value)}%)` : ""}`}
          value={`- ${money(invoice.discount_amount)}`}
        />
      )}
      {invoice.gst_applied && (
        <>
          <Row label="Taxable" value={money(invoice.taxable_amount)} />
          <Row label="GST" value={money(invoice.tax_amount)} />
        </>
      )}
      {line}
      <div className="flex justify-between text-sm font-bold">
        <span>TOTAL</span>
        <span>{money(invoice.total_amount)}</span>
      </div>
      {invoice.payment_method && (
        <div className="mt-1 uppercase">Paid by: {invoice.payment_method}</div>
      )}
      {line}
      <p className="text-center">{settings?.receipt_footer_text ?? "Thank you!"}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
