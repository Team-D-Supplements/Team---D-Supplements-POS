import { dateTime, money } from "@/lib/format";
import type { ShopSettings } from "@/hooks/useShopSettings";

export type ReturnReceiptData = {
  return_number: string;
  return_date: string;
  invoice_number: string;
  refund_method: string;
  reason: string | null;
  total_refund: number;
  items: {
    product_name: string;
    quantity: number;
    refund_amount: number;
  }[];
};

export function ReturnReceipt({
  value,
  settings,
}: {
  value: ReturnReceiptData;
  settings: ShopSettings | null | undefined;
}) {
  const width = settings?.receipt_width === "58mm" ? "58mm" : "80mm";
  const divider = <div className="my-1 border-t border-dashed border-black" />;

  return (
    <div
      className="receipt-print-area receipt-sheet mx-auto bg-white p-2 text-[11px] leading-tight"
      style={{ width, maxWidth: "100%" }}
    >
      <div className="text-center">
        <p className="text-sm font-bold uppercase">{settings?.shop_name ?? "Store"}</p>
        <p className="font-bold">RETURN / REFUND RECEIPT</p>
        {settings?.address && <p>{settings.address}</p>}
        {settings?.phone && <p>Ph: {settings.phone}</p>}
      </div>
      {divider}
      <p>Return: {value.return_number}</p>
      <p>Original bill: {value.invoice_number}</p>
      <p>{dateTime(value.return_date)}</p>
      {divider}
      <table className="w-full table-fixed">
        <thead>
          <tr className="text-left">
            <th className="font-normal">Item</th>
            <th className="w-8 text-right font-normal">Qty</th>
            <th className="w-16 text-right font-normal">Refund</th>
          </tr>
        </thead>
        <tbody>
          {value.items.map((item, index) => (
            <tr key={`${item.product_name}-${index}`} className="align-top">
              <td className="break-words pr-1">{item.product_name}</td>
              <td className="text-right">{item.quantity}</td>
              <td className="text-right">{Number(item.refund_amount).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {divider}
      <div className="flex justify-between text-sm font-bold">
        <span>REFUND</span>
        <span>{money(value.total_refund)}</span>
      </div>
      <p className="mt-1 uppercase">Method: {value.refund_method}</p>
      {value.reason && <p className="mt-1 break-words">Reason: {value.reason}</p>}
      {divider}
      <p className="text-center">Returned stock restored to inventory</p>
    </div>
  );
}
