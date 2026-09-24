import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SuppPOS — Supplement Store Billing & Inventory" },
      {
        name: "description",
        content:
          "Fast counter billing, GST invoices, stock control and reports for gym supplement stores.",
      },
      { property: "og:title", content: "SuppPOS — Supplement Store Billing & Inventory" },
      {
        property: "og:description",
        content:
          "Fast counter billing, GST invoices, stock control and reports for gym supplement stores.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
  component: () => null,
});
