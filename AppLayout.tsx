import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  Receipt,
  LogOut,
  Store,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

interface AppLayoutProps {
  children: ReactNode;
  userEmail: string;
  fullName: string;
  isAdmin: boolean;
}

export function AppLayout({ children, userEmail, fullName, isAdmin }: AppLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const nav = [
    { to: "/pos", label: "Kasir", icon: ShoppingCart, show: true },
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, show: isAdmin },
    { to: "/products", label: "Produk", icon: Package, show: isAdmin },
    { to: "/customers", label: "Pelanggan & Hutang", icon: Users, show: true },
    { to: "/transactions", label: "Transaksi", icon: Receipt, show: true },
  ].filter((i) => i.show);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex h-screen w-full bg-background">
      <aside className="no-print flex w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-2 px-5 py-5 border-b border-sidebar-border">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-sidebar-accent text-sidebar-accent-foreground">
            <Store className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">Cipta Jaya</div>
            <div className="text-[11px] opacity-70">POS System</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {nav.map((item) => {
            const active = location.pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow"
                    : "text-sidebar-foreground/85 hover:bg-white/5",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border px-4 py-3">
          <div className="text-xs opacity-70">Login sebagai</div>
          <div className="truncate text-sm font-semibold">{fullName}</div>
          <div className="truncate text-[11px] opacity-70">{userEmail}</div>
          <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-sidebar-accent/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-accent">
            {isAdmin ? "Admin" : "Kasir"}
          </div>
          <button
            onClick={signOut}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-white/10 py-2 text-sm font-medium hover:bg-white/20"
          >
            <LogOut className="h-4 w-4" /> Keluar
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
