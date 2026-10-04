import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { Receipt, type ReceiptInvoice } from "@/components/receipt";
import type { ShopSettings } from "@/hooks/useShopSettings";
import { getPublicInvoice } from "@/lib/data";
import { buildInvoicePdf, invoicePdfFileName } from "@/lib/invoice-pdf";
import { Button } from "@/components/ui/button";
import { Download, Printer, FileX, Store } from "lucide-react";

type PublicInvoiceData = {
  invoice: ReceiptInvoice;
  settings: ShopSettings | null;
};

export const Route = createFileRoute("/invoice/$token")({
  head: ({ loaderData }) => {
    const data = loaderData as PublicInvoiceData | undefined;
    const invNo = data?.invoice?.invoice_number;
    const shop = data?.settings?.shop_name ?? "SuppPOS";
    return {
      meta: [
        { title: invNo ? `Invoice ${invNo} — ${shop}` : "Invoice" },
        { name: "description", content: `View and download invoice ${invNo ?? ""}.` },
      ],
    };
  },
  loader: async ({ params }): Promise<PublicInvoiceData> => {
    const data = await getPublicInvoice(params.token);
    if (!data || !data.invoice) {
      throw notFound();
    }
    return data as PublicInvoiceData;
  },
  notFoundComponent: PublicInvoiceNotFound,
  component: PublicInvoicePage,
});

function PublicInvoiceNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <FileX className="size-7" />
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Invoice Not Found
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This invoice link is invalid, expired, or does not exist. If you believe this is an error,
          please contact the store directly.
        </p>
        <div className="mt-6">
          <Button variant="outline" asChild>
            <Link to="/">
              <Store className="mr-2 size-4" /> Go to Home
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function PublicInvoicePage() {
  const { invoice, settings } = Route.useLoaderData() as PublicInvoiceData;

  const handleDownload = () => {
    try {
      const doc = buildInvoicePdf(invoice, settings);
      doc.save(invoicePdfFileName(invoice));
    } catch (e) {
      console.error("PDF download failed", e);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 py-6 px-3 sm:px-6">
      <div className="mx-auto max-w-lg space-y-4">
        {/* Top Action Bar (Hidden during print) */}
        <div className="no-print flex items-center justify-between rounded-xl border bg-card p-3 shadow-sm sm:p-4">
          <div className="min-w-0">
            <h2 className="truncate font-display text-base font-semibold text-foreground">
              {settings?.shop_name ?? "Store Receipt"}
            </h2>
            <p className="text-xs text-muted-foreground">Invoice {invoice.invoice_number}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.print()}
              title="Print receipt"
            >
              <Printer className="mr-1.5 size-4" /> Print
            </Button>
            <Button size="sm" onClick={handleDownload} title="Download PDF">
              <Download className="mr-1.5 size-4" /> Download PDF
            </Button>
          </div>
        </div>

        {/* Thermal / Paper Receipt View */}
        <div className="overflow-hidden rounded-xl border bg-white p-3 shadow-md sm:p-6">
          <Receipt invoice={invoice} settings={settings} />
        </div>

        {/* Footer note */}
        <div className="no-print text-center text-xs text-muted-foreground">
          Thank you for shopping with {settings?.shop_name ?? "us"}!
        </div>
      </div>
    </div>
  );
}
