import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { dbUsage, updateShopSettings } from "@/lib/data";
import { useShopSettings, type ShopSettings } from "@/hooks/useShopSettings";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { ChangePasswordCard } from "@/components/change-password-card";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — SuppPOS" },
      {
        name: "description",
        content: "Shop profile, invoice numbering, receipt size and system health.",
      },
      { property: "og:title", content: "Settings — SuppPOS" },
      {
        property: "og:description",
        content: "Shop profile, invoice numbering, receipt size and system health.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Settings,
});

function Settings() {
  const { data } = useShopSettings();
  const qc = useQueryClient();
  const [form, setForm] = useState<ShopSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const usage = useQuery({
    queryKey: ["db-usage"],
    queryFn: async () => {
      return (await dbUsage()) as { bytes: number | null };
    },
  });

  const set = <K extends keyof ShopSettings>(k: K, v: ShopSettings[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      await updateShopSettings(form.id, {
        shop_name: form.shop_name,
        legal_name: form.legal_name,
        address: form.address,
        phone: form.phone,
        gstin: form.gstin,
        invoice_prefix: form.invoice_prefix,
        invoice_number_padding: form.invoice_number_padding,
        invoice_include_year: form.invoice_include_year,
        receipt_width: form.receipt_width,
        receipt_footer_text: form.receipt_footer_text,
        storage_limit_mb: form.storage_limit_mb,
        storage_warn_percent: form.storage_warn_percent,
      });
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["shop_settings"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save settings");
    } finally {
      setSaving(false);
    }
  };

  if (!form)
    return (
      <div className="grid gap-4 p-4 md:p-6 lg:grid-cols-2">
        <ChangePasswordCard />
      </div>
    );

  // db_usage returns `bytes` (not size_mb); convert to MB here.
  const usedBytes = Number((usage.data as { bytes?: number | null } | undefined)?.bytes ?? 0);
  const usedMb = Number.isFinite(usedBytes) ? usedBytes / (1024 * 1024) : 0;
  const pct = form.storage_limit_mb ? Math.min(100, (usedMb / form.storage_limit_mb) * 100) : 0;

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Shop details, invoice numbering and receipts"
        actions={
          <Button onClick={save} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Save className="mr-2 size-4" />
            )}{" "}
            Save
          </Button>
        }
      />
      <div className="grid gap-4 p-4 md:p-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Shop profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Shop name" value={form.shop_name} onChange={(v) => set("shop_name", v)} />
            <Field
              label="Legal name"
              value={form.legal_name ?? ""}
              onChange={(v) => set("legal_name", v)}
            />
            <Field label="Address" value={form.address ?? ""} onChange={(v) => set("address", v)} />
            <Field label="Phone" value={form.phone ?? ""} onChange={(v) => set("phone", v)} />
            <Field label="GSTIN" value={form.gstin ?? ""} onChange={(v) => set("gstin", v)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Invoice numbering</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field
              label="Prefix"
              value={form.invoice_prefix}
              onChange={(v) => set("invoice_prefix", v)}
            />
            <div className="space-y-1.5">
              <Label>Number padding</Label>
              <Input
                type="number"
                value={form.invoice_number_padding}
                onChange={(e) => set("invoice_number_padding", Number(e.target.value) || 1)}
              />
            </div>
            <Toggle
              label="Include year in bill number"
              checked={form.invoice_include_year}
              onChange={(v) => set("invoice_include_year", v)}
            />
            <p className="text-sm text-muted-foreground">
              Next bill number: <span className="font-medium">{form.invoice_next_number}</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Receipt</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Thermal paper width</Label>
              <Select value={form.receipt_width} onValueChange={(v) => set("receipt_width", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="58mm">58 mm</SelectItem>
                  <SelectItem value="80mm">80 mm</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Field
              label="Footer message"
              value={form.receipt_footer_text}
              onChange={(v) => set("receipt_footer_text", v)}
            />
          </CardContent>
        </Card>

        <ChangePasswordCard />

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>System health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end justify-between">
              <p className="text-sm text-muted-foreground">Database usage</p>
              <p className="tabular text-sm font-medium">
                {usedMb.toFixed(1)} MB of {form.storage_limit_mb} MB ({pct.toFixed(1)}%)
              </p>
            </div>
            <Progress value={pct} />
            {pct >= form.storage_warn_percent && (
              <p className="text-sm font-medium text-destructive">
                Usage is above your {form.storage_warn_percent}% warning level. Review old import
                records or plan for more storage. Business records are never deleted automatically.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Storage limit (MB)</Label>
                <Input
                  type="number"
                  value={form.storage_limit_mb}
                  onChange={(e) => set("storage_limit_mb", Number(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Warn at (%)</Label>
                <Input
                  type="number"
                  value={form.storage_warn_percent}
                  onChange={(e) => set("storage_warn_percent", Number(e.target.value) || 0)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md bg-muted px-3 py-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
