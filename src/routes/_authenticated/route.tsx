import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { useOnline } from "@/hooks/useOnline";
import { useShopSettings } from "@/hooks/useShopSettings";
import {
  LayoutDashboard,
  ScanBarcode,
  Package,
  Truck,
  Users,
  ReceiptIndianRupee,
  Boxes,
  FileBarChart,
  Settings,
  Menu,
  LogOut,
  WifiOff,
} from "lucide-react";
import logo from "@/assets/logo.png";
import { useQueryClient } from "@tanstack/react-query";
import { getSessionUser, signOut as serverSignOut } from "@/lib/auth.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const user = await getSessionUser().catch(() => null);
    if (!user?.isAdmin) throw redirect({ to: "/auth" });
    return { user };
  },
  component: Shell,
});

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/billing", label: "Billing", icon: ScanBarcode },
  { to: "/products", label: "Products", icon: Package },
  { to: "/purchases", label: "Purchases", icon: Truck },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/invoices", label: "Sales / Invoices", icon: ReceiptIndianRupee },
  { to: "/stock", label: "Stock", icon: Boxes },
  { to: "/reports", label: "Reports", icon: FileBarChart },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1 p-3">
      {nav.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&.active]:bg-sidebar-primary [&.active]:text-sidebar-primary-foreground"
        >
          <item.icon className="size-4 shrink-0" />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function Shell() {
  const navigate = useNavigate();
  const online = useOnline();
  const { data: settings } = useShopSettings();
  const [open, setOpen] = useState(false);

  const qc = useQueryClient();
  const signOut = async () => {
    await serverSignOut();
    await qc.cancelQueries();
    qc.clear();
    navigate({ to: "/auth", replace: true });
  };

  const brand = (
    <div className="flex items-center gap-2 border-b border-sidebar-border px-4 py-4">
      <img src={logo} alt="" className="size-9 rounded-lg" />
      <div className="min-w-0">
        <p className="truncate font-display text-sm font-semibold text-sidebar-foreground">
          {settings?.shop_name ?? "SuppPOS"}
        </p>
        <p className="text-xs text-sidebar-foreground/60">Point of Sale</p>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background md:h-screen md:overflow-hidden">
      <aside className="hidden h-screen w-60 shrink-0 flex-col bg-sidebar md:flex">
        {brand}
        <div className="flex-1">
          <NavLinks />
        </div>
        <div className="p-3">
          <Button
            variant="ghost"
            className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={signOut}
          >
            <LogOut className="mr-2 size-4" /> Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col md:h-screen md:overflow-hidden">
        <header className="flex items-center gap-2 border-b bg-card px-3 py-2 md:hidden no-print">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 bg-sidebar p-0">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              {brand}
              <NavLinks onNavigate={() => setOpen(false)} />
              <div className="p-3">
                <Button
                  variant="ghost"
                  className="w-full justify-start text-sidebar-foreground/80"
                  onClick={signOut}
                >
                  <LogOut className="mr-2 size-4" /> Sign out
                </Button>
              </div>
            </SheetContent>
          </Sheet>
          <span className="font-display font-semibold">{settings?.shop_name ?? "SuppPOS"}</span>
        </header>

        {!online && (
          <div className="no-print flex items-center gap-2 bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground">
            <WifiOff className="size-4" /> You are offline — billing and saving are paused until the
            connection is back.
          </div>
        )}

        <main className="min-w-0 flex-1 md:overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
