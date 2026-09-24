import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  hint?: string;
  tone?: "default" | "warning" | "success";
}) {
  const toneClass =
    tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : "text-foreground";
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className={`tabular font-display text-2xl font-semibold ${toneClass}`}>{value}</p>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {Icon && (
          <div className="rounded-lg bg-accent p-2 text-accent-foreground">
            <Icon className="size-5" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
