import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { rupiah, formatDate } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/transactions")({
  component: TransactionsPage,
});

type Tx = {
  id: string; code: string; total: number; paid: number; change_amount: number;
  payment_method: string; status: string; debt_remaining: number;
  created_at: string; customer_id: string | null;
};

function TransactionsPage() {
  const [search, setSearch] = useState("");
  const { data: txs = [] } = useQuery({
    queryKey: ["transactions"],
    queryFn: async (): Promise<Tx[]> => {
      const { data, error } = await supabase.from("transactions")
        .select("id,code,total,paid,change_amount,payment_method,status,debt_remaining,created_at,customer_id")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data as unknown as Tx[]) ?? [];
    },
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return txs;
    return txs.filter((t) => t.code.toLowerCase().includes(q));
  }, [txs, search]);

  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Riwayat Transaksi</h1>
        <p className="text-sm text-muted-foreground">500 transaksi terakhir</p>
      </div>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Cari kode transaksi…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kode</TableHead>
              <TableHead>Waktu</TableHead>
              <TableHead>Metode</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Dibayar</TableHead>
              <TableHead className="text-right">Sisa Hutang</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-mono text-xs">{t.code}</TableCell>
                <TableCell>{formatDate(t.created_at)}</TableCell>
                <TableCell><span className="capitalize">{t.payment_method}</span></TableCell>
                <TableCell>
                  <Badge className={t.status === "lunas" ? "bg-success text-success-foreground" : "bg-accent text-accent-foreground"}>
                    {t.status.toUpperCase()}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-semibold">{rupiah(t.total)}</TableCell>
                <TableCell className="text-right">{rupiah(t.paid)}</TableCell>
                <TableCell className="text-right text-accent">{Number(t.debt_remaining) > 0 ? rupiah(t.debt_remaining) : "—"}</TableCell>
              </TableRow>
            ))}
            {!filtered.length && <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">Belum ada transaksi</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
