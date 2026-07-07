import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { payDebt } from "@/lib/pos.functions";
import { rupiah, formatDate } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Users } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/customers")({
  component: CustomersPage,
});

type Customer = { id: string; name: string; phone: string | null; address: string | null };
type DebtRow = {
  id: string; code: string; total: number; paid: number; debt_remaining: number;
  created_at: string; customer_id: string;
};

function CustomersPage() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<null | (Partial<Customer> & { id?: string })>(null);
  const [detailCustomerId, setDetailCustomerId] = useState<string | null>(null);
  const [payFor, setPayFor] = useState<DebtRow | null>(null);
  const [payAmt, setPayAmt] = useState("");
  const doPayDebt = useServerFn(payDebt);

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async (): Promise<Customer[]> => {
      const { data, error } = await supabase.from("customers").select("*").order("name");
      if (error) throw error;
      return (data as unknown as Customer[]) ?? [];
    },
  });

  const { data: debts = [] } = useQuery({
    queryKey: ["debts"],
    queryFn: async (): Promise<DebtRow[]> => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id,code,total,paid,debt_remaining,created_at,customer_id")
        .gt("debt_remaining", 0)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as DebtRow[]) ?? [];
    },
  });

  const debtByCustomer = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of debts) m.set(d.customer_id, (m.get(d.customer_id) ?? 0) + Number(d.debt_remaining));
    return m;
  }, [debts]);

  const save = useMutation({
    mutationFn: async (c: Partial<Customer>) => {
      if (c.id) {
        const { error } = await supabase.from("customers").update({ name: c.name, phone: c.phone, address: c.address }).eq("id", c.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("customers").insert({ name: c.name!, phone: c.phone ?? null, address: c.address ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Pelanggan disimpan"); qc.invalidateQueries({ queryKey: ["customers"] }); setDialog(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const detailCustomer = customers.find((c) => c.id === detailCustomerId) ?? null;
  const detailDebts = debts.filter((d) => d.customer_id === detailCustomerId);

  async function submitPay() {
    if (!payFor) return;
    const amount = Number(payAmt);
    if (!amount || amount <= 0) return toast.error("Jumlah tidak valid");
    if (amount > Number(payFor.debt_remaining)) return toast.error("Melebihi sisa hutang");
    try {
      await doPayDebt({ data: { transaction_id: payFor.id, amount } });
      toast.success("Pembayaran dicatat");
      setPayFor(null); setPayAmt("");
      qc.invalidateQueries();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Gagal");
    }
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pelanggan & Hutang</h1>
          <p className="text-sm text-muted-foreground">Manajemen pelanggan dan buku bon</p>
        </div>
        <Button onClick={() => setDialog({})} className="bg-accent text-accent-foreground hover:bg-accent-hover">
          <Plus className="mr-2 h-4 w-4" /> Pelanggan
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-lg border bg-card">
          <div className="border-b px-4 py-3 font-semibold flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Daftar Pelanggan</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Telepon</TableHead>
                <TableHead className="text-right">Total Hutang</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => {
                const debt = debtByCustomer.get(c.id) ?? 0;
                return (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => setDetailCustomerId(c.id)}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.phone ?? "—"}</TableCell>
                    <TableCell className={"text-right font-semibold " + (debt > 0 ? "text-accent" : "text-muted-foreground")}>{rupiah(debt)}</TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); setDialog(c); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!customers.length && <TableRow><TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">Belum ada pelanggan</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>

        <div className="rounded-lg border bg-card">
          <div className="border-b px-4 py-3 font-semibold">Buku Bon (Piutang Aktif)</div>
          <div className="max-h-[500px] overflow-auto p-3 text-sm">
            {debts.length === 0 && <div className="py-8 text-center text-muted-foreground">Tidak ada hutang aktif 🎉</div>}
            {debts.map((d) => {
              const c = customers.find((x) => x.id === d.customer_id);
              return (
                <div key={d.id} className="mb-2 rounded-md border p-2">
                  <div className="flex justify-between font-medium">
                    <span>{c?.name ?? "?"}</span>
                    <span className="text-accent">{rupiah(d.debt_remaining)}</span>
                  </div>
                  <div className="mt-0.5 flex justify-between text-xs text-muted-foreground">
                    <span>#{d.code} • {formatDate(d.created_at)}</span>
                    <button className="text-primary hover:underline" onClick={() => { setPayFor(d); setPayAmt(String(d.debt_remaining)); }}>Bayar</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {dialog && (
        <Dialog open onOpenChange={() => setDialog(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>{dialog.id ? "Edit Pelanggan" : "Pelanggan Baru"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nama</Label><Input value={dialog.name ?? ""} onChange={(e) => setDialog({ ...dialog, name: e.target.value })} /></div>
              <div><Label>Telepon</Label><Input value={dialog.phone ?? ""} onChange={(e) => setDialog({ ...dialog, phone: e.target.value })} /></div>
              <div><Label>Alamat</Label><Input value={dialog.address ?? ""} onChange={(e) => setDialog({ ...dialog, address: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialog(null)}>Batal</Button>
              <Button onClick={() => save.mutate(dialog)} disabled={!dialog.name}>Simpan</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {detailCustomer && (
        <Dialog open onOpenChange={() => setDetailCustomerId(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{detailCustomer.name}</DialogTitle>
            </DialogHeader>
            <div className="text-sm text-muted-foreground">{detailCustomer.phone} • {detailCustomer.address}</div>
            <div className="mt-3">
              <div className="mb-1 text-sm font-semibold">Riwayat Hutang</div>
              <div className="max-h-80 overflow-auto rounded border">
                <Table>
                  <TableHeader><TableRow><TableHead>Kode</TableHead><TableHead>Tanggal</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Dibayar</TableHead><TableHead className="text-right">Sisa</TableHead><TableHead /></TableRow></TableHeader>
                  <TableBody>
                    {detailDebts.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-mono text-xs">{d.code}</TableCell>
                        <TableCell>{formatDate(d.created_at)}</TableCell>
                        <TableCell className="text-right">{rupiah(d.total)}</TableCell>
                        <TableCell className="text-right">{rupiah(d.paid)}</TableCell>
                        <TableCell className="text-right font-semibold text-accent">{rupiah(d.debt_remaining)}</TableCell>
                        <TableCell><Button size="sm" onClick={() => { setPayFor(d); setPayAmt(String(d.debt_remaining)); }}>Cicil</Button></TableCell>
                      </TableRow>
                    ))}
                    {!detailDebts.length && <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">Tidak ada hutang aktif</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {payFor && (
        <Dialog open onOpenChange={() => setPayFor(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Pembayaran Hutang</DialogTitle></DialogHeader>
            <div className="text-sm">Sisa hutang: <b className="text-accent">{rupiah(payFor.debt_remaining)}</b></div>
            <div>
              <Label>Jumlah bayar</Label>
              <Input inputMode="numeric" value={payAmt} onChange={(e) => setPayAmt(e.target.value.replace(/\D/g, ""))} className="text-right text-xl font-semibold" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPayFor(null)}>Batal</Button>
              <Button onClick={submitPay} className="bg-primary hover:bg-primary-hover">Bayar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
