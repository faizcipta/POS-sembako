import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { rupiah } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { TrendingUp, Wallet, PackageX, AlertTriangle, Trophy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

type TxRow = { id: string; total: number; discount_amount: number; debt_remaining: number; created_at: string };
type ItemRow = { product_id: string | null; product_name: string; qty: number; unit_price: number; cost_price: number; subtotal: number; transaction_id: string };
type LowStock = { id: string; name: string; stock: number; low_stock_threshold: number };

function Dashboard() {
  const { data: todayTxs = [] } = useQuery({
    queryKey: ["dash-tx-today"],
    queryFn: async (): Promise<TxRow[]> => {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const { data, error } = await supabase.from("transactions")
        .select("id,total,discount_amount,debt_remaining,created_at")
        .gte("created_at", start.toISOString());
      if (error) throw error;
      return (data as unknown as TxRow[]) ?? [];
    },
  });

  const { data: todayItems = [] } = useQuery({
    queryKey: ["dash-items-today", todayTxs.map((t) => t.id).join(",")],
    enabled: todayTxs.length > 0,
    queryFn: async (): Promise<ItemRow[]> => {
      const ids = todayTxs.map((t) => t.id);
      const { data, error } = await supabase.from("transaction_items")
        .select("product_id,product_name,qty,unit_price,cost_price,subtotal,transaction_id")
        .in("transaction_id", ids);
      if (error) throw error;
      return (data as unknown as ItemRow[]) ?? [];
    },
  });

  const { data: outstanding = 0 } = useQuery({
    queryKey: ["dash-outstanding"],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.from("transactions").select("debt_remaining").gt("debt_remaining", 0);
      if (error) throw error;
      return (data ?? []).reduce((s: number, r: { debt_remaining: number }) => s + Number(r.debt_remaining), 0);
    },
  });

  const { data: lowStock = [] } = useQuery({
    queryKey: ["dash-low-stock"],
    queryFn: async (): Promise<LowStock[]> => {
      const { data, error } = await supabase.from("products").select("id,name,stock,low_stock_threshold");
      if (error) throw error;
      return ((data as unknown as LowStock[]) ?? []).filter((p) => p.stock <= p.low_stock_threshold).slice(0, 10);
    },
  });

  const { data: bestSellers = [] } = useQuery({
    queryKey: ["dash-best-sellers"],
    queryFn: async (): Promise<{ name: string; qty: number; revenue: number }[]> => {
      const start = new Date(); start.setDate(start.getDate() - 30);
      const { data: txs, error: e1 } = await supabase.from("transactions").select("id").gte("created_at", start.toISOString());
      if (e1) throw e1;
      const ids = (txs ?? []).map((t) => t.id);
      if (!ids.length) return [];
      const { data: items, error: e2 } = await supabase.from("transaction_items")
        .select("product_name,qty,subtotal").in("transaction_id", ids);
      if (e2) throw e2;
      const map = new Map<string, { qty: number; revenue: number }>();
      for (const it of items ?? []) {
        const cur = map.get(it.product_name) ?? { qty: 0, revenue: 0 };
        cur.qty += Number(it.qty); cur.revenue += Number(it.subtotal);
        map.set(it.product_name, cur);
      }
      return Array.from(map.entries())
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.qty - a.qty).slice(0, 5);
    },
  });

  const revenue = todayTxs.reduce((s, t) => s + Number(t.total), 0);
  const discountGiven = todayTxs.reduce((s, t) => s + Number(t.discount_amount), 0);
  const cogs = todayItems.reduce((s, i) => s + Number(i.cost_price) * Number(i.qty), 0);
  const netProfit = revenue - cogs;
  const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

  const chartData = useMemo(() => bestSellers.map((b) => ({ name: b.name.length > 12 ? b.name.slice(0, 12) + "…" : b.name, qty: b.qty })), [bestSellers]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Ringkasan hari ini</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Pendapatan Hari Ini" value={rupiah(revenue)} sub={`${todayTxs.length} transaksi`} icon={<TrendingUp className="h-5 w-5" />} tone="primary" />
        <StatCard label="Laba Bersih" value={rupiah(netProfit)} sub={`Margin ${margin.toFixed(1)}% • Diskon ${rupiah(discountGiven)}`} icon={<Wallet className="h-5 w-5" />} tone="success" />
        <StatCard label="Total Piutang Aktif" value={rupiah(outstanding)} sub="Bon pelanggan" icon={<PackageX className="h-5 w-5" />} tone="accent" />
        <StatCard label="Stok Menipis" value={String(lowStock.length)} sub="Produk perlu restock" icon={<AlertTriangle className="h-5 w-5" />} tone="warning" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="flex items-center gap-2"><Trophy className="h-4 w-4 text-accent" /> 5 Produk Terlaris (30 Hari)</CardTitle></CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <div className="py-14 text-center text-sm text-muted-foreground">Belum ada data penjualan</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="qty" fill="var(--color-accent)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" /> Stok Rendah</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {lowStock.length === 0 && <div className="py-6 text-center text-muted-foreground">Semua stok aman ✅</div>}
            {lowStock.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded border p-2">
                <span className="truncate">{p.name}</span>
                <span className="rounded bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">{p.stock} tersisa</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, icon, tone }: { label: string; value: string; sub: string; icon: React.ReactNode; tone: "primary" | "success" | "accent" | "warning" }) {
  const bg = tone === "primary" ? "bg-primary text-primary-foreground"
    : tone === "success" ? "bg-success text-success-foreground"
    : tone === "accent" ? "bg-accent text-accent-foreground"
    : "bg-warning text-warning-foreground";
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className={`flex h-9 w-9 items-center justify-center rounded-md ${bg}`}>{icon}</div>
        </div>
        <div className="mt-3 text-2xl font-bold">{value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}
