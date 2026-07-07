import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { rupiah } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Search, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/products")({
  component: ProductsPage,
});

type Product = {
  id: string; barcode: string | null; name: string; category_id: string | null;
  cost_price: number; selling_price: number; stock: number; low_stock_threshold: number;
};
type Category = { id: string; name: string };

function empty(): Omit<Product, "id"> & { id?: string } {
  return { barcode: "", name: "", category_id: null, cost_price: 0, selling_price: 0, stock: 0, low_stock_threshold: 5 };
}

function ProductsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [dialog, setDialog] = useState<null | (Omit<Product, "id"> & { id?: string })>(null);
  const [catDialog, setCatDialog] = useState(false);
  const [catName, setCatName] = useState("");

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return (data as unknown as Product[]) ?? [];
    },
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase.from("categories").select("id,name").order("name");
      if (error) throw error;
      return (data as unknown as Category[]) ?? [];
    },
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter((p) => {
      if (categoryId !== "all" && p.category_id !== categoryId) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || (p.barcode ?? "").toLowerCase().includes(q);
    });
  }, [products, search, categoryId]);

  const save = useMutation({
    mutationFn: async (p: Omit<Product, "id"> & { id?: string }) => {
      const payload = {
        barcode: p.barcode || null,
        name: p.name,
        category_id: p.category_id,
        cost_price: p.cost_price,
        selling_price: p.selling_price,
        stock: p.stock,
        low_stock_threshold: p.low_stock_threshold,
      };
      if (p.id) {
        const { error } = await supabase.from("products").update(payload).eq("id", p.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Produk disimpan"); qc.invalidateQueries({ queryKey: ["products"] }); setDialog(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Produk dihapus"); qc.invalidateQueries({ queryKey: ["products"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const addCategory = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("categories").insert({ name: catName });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Kategori ditambahkan"); setCatName(""); setCatDialog(false); qc.invalidateQueries({ queryKey: ["categories"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Manajemen Produk</h1>
          <p className="text-sm text-muted-foreground">Kelola stok, harga modal, dan harga jual</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={catDialog} onOpenChange={setCatDialog}>
            <DialogTrigger asChild><Button variant="outline">Tambah Kategori</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Kategori Baru</DialogTitle></DialogHeader>
              <Input placeholder="Nama kategori" value={catName} onChange={(e) => setCatName(e.target.value)} />
              <DialogFooter><Button onClick={() => addCategory.mutate()} disabled={!catName}>Simpan</Button></DialogFooter>
            </DialogContent>
          </Dialog>
          <Button onClick={() => setDialog(empty())} className="bg-accent text-accent-foreground hover:bg-accent-hover">
            <Plus className="mr-2 h-4 w-4" /> Produk
          </Button>
        </div>
      </div>

      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Cari nama / barcode…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua kategori</SelectItem>
            {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Barcode</TableHead>
              <TableHead>Nama</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead className="text-right">Modal</TableHead>
              <TableHead className="text-right">Jual</TableHead>
              <TableHead className="text-right">Stok</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((p) => {
              const low = p.stock <= p.low_stock_threshold;
              const cat = categories.find((c) => c.id === p.category_id);
              return (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.barcode || "—"}</TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-muted-foreground">{cat?.name ?? "—"}</TableCell>
                  <TableCell className="text-right">{rupiah(p.cost_price)}</TableCell>
                  <TableCell className="text-right font-semibold text-primary">{rupiah(p.selling_price)}</TableCell>
                  <TableCell className="text-right">
                    <span className={low ? "inline-flex items-center gap-1 rounded bg-destructive/10 px-2 py-0.5 text-destructive" : ""}>
                      {low && <AlertTriangle className="h-3 w-3" />} {p.stock}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setDialog(p)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => confirm(`Hapus ${p.name}?`) && del.mutate(p.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {!filtered.length && (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">Belum ada produk</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {dialog && (
        <Dialog open onOpenChange={() => setDialog(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>{dialog.id ? "Edit Produk" : "Produk Baru"}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Nama</Label>
                <Input value={dialog.name} onChange={(e) => setDialog({ ...dialog, name: e.target.value })} />
              </div>
              <div>
                <Label>Barcode / SKU</Label>
                <Input value={dialog.barcode ?? ""} onChange={(e) => setDialog({ ...dialog, barcode: e.target.value })} />
              </div>
              <div>
                <Label>Kategori</Label>
                <Select value={dialog.category_id ?? "none"} onValueChange={(v) => setDialog({ ...dialog, category_id: v === "none" ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Tanpa kategori —</SelectItem>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Harga Modal</Label>
                <Input type="number" value={dialog.cost_price} onChange={(e) => setDialog({ ...dialog, cost_price: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Harga Jual</Label>
                <Input type="number" value={dialog.selling_price} onChange={(e) => setDialog({ ...dialog, selling_price: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Stok</Label>
                <Input type="number" value={dialog.stock} onChange={(e) => setDialog({ ...dialog, stock: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Batas Stok Rendah</Label>
                <Input type="number" value={dialog.low_stock_threshold} onChange={(e) => setDialog({ ...dialog, low_stock_threshold: Number(e.target.value) })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialog(null)}>Batal</Button>
              <Button onClick={() => save.mutate(dialog)} disabled={!dialog.name || save.isPending}>Simpan</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
