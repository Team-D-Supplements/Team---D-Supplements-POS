export type CartLine = {
  product_id: string;
  name: string;
  unit_price: number;
  tax_percent: number;
  quantity: number;
  stock: number;
};

export type Totals = {
  subtotal: number;
  discount: number;
  taxable: number;
  tax: number;
  total: number;
  lines: { line_total: number; tax: number }[];
};

/**
 * Mirrors the database calculation exactly (paise integers, proportional
 * discount apportionment with the remainder on the last line).
 */
export function computeTotals(
  lines: CartLine[],
  discountType: "none" | "percent" | "amount",
  discountValue: number,
  gstApplied: boolean,
  pricesIncludeTax: boolean,
): Totals {
  const gross = lines.map((l) => Math.round(l.unit_price * l.quantity * 100));
  const subtotal = gross.reduce((a, b) => a + b, 0);

  let discount = 0;
  if (discountType === "percent")
    discount = Math.round((subtotal * Math.max(discountValue, 0)) / 100);
  else if (discountType === "amount") discount = Math.round(Math.max(discountValue, 0) * 100);
  if (discount > subtotal) discount = subtotal;

  let allocated = 0;
  let taxable = 0;
  let tax = 0;
  let total = 0;
  const out: { line_total: number; tax: number }[] = [];

  lines.forEach((l, i) => {
    const lineGross = gross[i] ?? 0;
    const lineDisc =
      i === lines.length - 1
        ? discount - allocated
        : subtotal > 0
          ? Math.floor((discount * lineGross) / subtotal)
          : 0;
    allocated += lineDisc;
    const net = lineGross - lineDisc;
    const rate = gstApplied ? l.tax_percent : 0;

    let lineTaxable: number;
    let lineTax: number;
    let lineTotal: number;
    if (gstApplied && rate > 0) {
      if (pricesIncludeTax) {
        lineTaxable = Math.round(net / (1 + rate / 100));
        lineTax = net - lineTaxable;
        lineTotal = net;
      } else {
        lineTaxable = net;
        lineTax = Math.round((net * rate) / 100);
        lineTotal = net + lineTax;
      }
    } else {
      lineTaxable = net;
      lineTax = 0;
      lineTotal = net;
    }
    taxable += lineTaxable;
    tax += lineTax;
    total += lineTotal;
    out.push({ line_total: lineTotal / 100, tax: lineTax / 100 });
  });

  return {
    subtotal: subtotal / 100,
    discount: discount / 100,
    taxable: taxable / 100,
    tax: tax / 100,
    total: total / 100,
    lines: out,
  };
}
