import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { createSale } from "@/lib/pos.functions";
import { rupiah, parseNum } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, Plus, Minus, Trash2, Pause, Play, ShoppingCart, Printer } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/pos")({
  component: POSPage,
});

type Product = {
  id: string; name: string; barcode: string | null;
  selling_price: number; stock: number; category_id: string | null;
};
type Category = { id: string; name: string };
type Customer = { id: string; name: string; phone: string | null };

type CartItem = { product_id: string; name: string; qty: number; unit_price: number; stock: number };
type HeldOrder = { id: string; label: string; cart: CartItem[]; note: string };

function POSPage() {
  const qc = useQueryClient();
  const doCreateSale = useServerFn(createSale);

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,barcode,selling_price,stock,category_id")
        .order("name");
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

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async (): Promise<Customer[]> => {
      const { data, error } = await supabase.from("customers").select("id,name,phone").order("name");
      if (error) throw error;
      return (data as unknown as Customer[]) ?? [];
    },
  });

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [held, setHeld] = useState<HeldOrder[]>([]);
  const [discountType, setDiscountType] = useState<"none" | "percent" | "flat">("none");
  const [discountValue, setDiscountValue] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<"tunai" | "hutang">("tunai");
  const [customerId, setCustomerId] = useState<string>("");
  const [tenderedStr, setTenderedStr] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [receipt, setReceipt] = useState<null | ReceiptData>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { searchRef.current?.focus(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      const okCat = categoryId === "all" || p.category_id === categoryId;
      if (!okCat) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.barcode ?? "").toLowerCase().includes(q)
      );
    });
  }, [products, search, categoryId]);

  const subtotal = cart.reduce((s, i) => s + i.qty * i.unit_price, 0);
  const discountAmount =
    discountType === "percent" ? Math.round(subtotal * (discountValue / 100))
    : discountType === "flat" ? Math.min(discountValue, subtotal) : 0;
  const total = Math.max(subtotal - discountAmount, 0);
  const tendered = parseNum(tenderedStr);
  const change = paymentMethod === "tunai" ? Math.max(tendered - total, 0) : 0;
  const debtRemaining = paymentMethod === "hutang" ? Math.max(total - tendered, 0) : 0;

  function addToCart(p: Product) {
    if (p.stock <= 0) return toast.error(`${p.name} stok habis`);
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.product_id === p.id);
      if (idx >= 0) {
        const it = prev[idx];
        if (it.qty + 1 > p.stock) { toast.error("Stok tidak cukup"); return prev; }
        const next = [...prev];
        next[idx] = { ...it, qty: it.qty + 1 };
        return next;
      }
      return [...prev, { product_id: p.id, name: p.name, qty: 1, unit_price: Number(p.selling_price), stock: p.stock }];
    });
  }

  function updateQty(id: string, delta: number) {
    setCart((prev) =>
      prev.flatMap((i) => {
        if (i.product_id !== id) return [i];
        const q = i.qty + delta;
        if (q <= 0) return [];
        if (q > i.stock) { toast.error("Stok tidak cukup"); return [i]; }
        return [{ ...i, qty: q }];
      }),
    );
  }
  function setQty(id: string, qty: number) {
    setCart((prev) => prev.flatMap((i) => {
      if (i.product_id !== id) return [i];
      if (qty <= 0) return [];
      if (qty > i.stock) { toast.error("Stok tidak cukup"); return [{ ...i, qty: i.stock }]; }
      return [{ ...i, qty }];
    }));
  }
  function removeItem(id: string) {
    setCart((prev) => prev.filter((i) => i.product_id !== id));
  }
  function clearCart() {
    setCart([]); setDiscountType("none"); setDiscountValue(0); setTenderedStr("");
    setPaymentMethod("tunai"); setCustomerId("");
  }

  function holdOrder() {
    if (!cart.length) return;
    const label = `Antrian ${held.length + 1} — ${cart.length} item`;
    setHeld((h) => [...h, { id: crypto.randomUUID(), label, cart, note: "" }]);
    clearCart();
    toast.success("Transaksi ditahan");
  }
  function resumeOrder(id: string) {
    const o = held.find((x) => x.id === id);
    if (!o) return;
    setCart(o.cart);
    setHeld((h) => h.filter((x) => x.id !== id));
  }

  async function submit() {
    if (!cart.length) return;
    if (paymentMethod === "hutang" && !customerId) return toast.error("Pilih pelanggan untuk bon/hutang");
    if (paymentMethod === "tunai" && tendered < total) return toast.error("Uang tunai kurang");
    try {
      const { transactionId } = await doCreateSale({
        data: {
          customer_id: customerId || null,
          items: cart.map((i) => ({ product_id: i.product_id, qty: i.qty })),
          discount_type: discountType,
          discount_value: discountValue,
          paid: paymentMethod === "hutang" ? tendered : tendered,
          payment_method: paymentMethod,
        },
      });
      // Build receipt data (locally — we already know values)
      setReceipt({
        code: "",
        transactionId,
        items: cart.map((i) => ({ name: i.name, qty: i.qty, unit_price: i.unit_price, subtotal: i.qty * i.unit_price })),
        subtotal, discountAmount, total,
        paid: tendered, change,
        payment_method: paymentMethod,
        status: paymentMethod === "hutang" && debtRemaining > 0 ? "hutang" : "lunas",
        customer: customers.find((c) => c.id === customerId)?.name ?? null,
        created_at: new Date().toISOString(),
      });
      // Fetch generated code
      const { data: tx } = await supabase.from("transactions").select("code").eq("id", transactionId).maybeSingle();
      if (tx?.code) setReceipt((r) => (r ? { ...r, code: tx.code as string } : r));
      qc.invalidateQueries();
      clearCart();
      setCheckoutOpen(false);
      toast.success("Transaksi berhasil");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Gagal memproses transaksi");
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="no-print flex items-center justify-between border-b bg-card px-6 py-3">
        <div>
          <h1 className="text-lg font-bold">Kasir</h1>
          <p className="text-xs text-muted-foreground">Pilih produk lalu proses transaksi</p>
        </div>
        {held.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Ditahan:</span>
            {held.map((h) => (
              <Button key={h.id} size="sm" variant="secondary" onClick={() => resumeOrder(h.id)}>
                <Play className="mr-1 h-3 w-3" /> {h.label}
              </Button>
            ))}
          </div>
        )}
      </header>

      <div className="grid flex-1 grid-cols-[1fr_420px] overflow-hidden">
        {/* Catalogue */}
        <section className="flex flex-col overflow-hidden border-r">
          <div className="flex gap-2 border-b bg-muted/30 px-6 py-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchRef}
                autoFocus
                placeholder="Cari nama produk / barcode... (Enter untuk tambah pertama)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && filtered[0]) { addToCart(filtered[0]); setSearch(""); }
                }}
                className="pl-9"
              />
            </div>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua kategori</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid flex-1 grid-cols-2 gap-3 overflow-auto p-6 md:grid-cols-3 xl:grid-cols-4">
            {filtered.map((p) => {
              const low = p.stock <= 5;
              return (
                <button
                  key={p.id}
                  disabled={p.stock <= 0}
                  onClick={() => addToCart(p)}
                  className={cn(
                    "group flex flex-col rounded-lg border bg-card p-3 text-left transition hover:border-primary hover:shadow-md",
                    p.stock <= 0 && "opacity-50",
                  )}
                >
                  <div className="line-clamp-2 min-h-[2.5em] text-sm font-semibold">{p.name}</div>
                  <div className="mt-2 text-base font-bold text-primary">{rupiah(p.selling_price)}</div>
                  <div className="mt-1 flex items-center justify-between text-[11px]">
                    <span className={cn("rounded px-1.5 py-0.5", low ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}>
                      Stok: {p.stock}
                    </span>
                    {p.barcode && <span className="text-muted-foreground">{p.barcode}</span>}
                  </div>
                </button>
              );
            })}
            {!filtered.length && (
              <div className="col-span-full py-12 text-center text-sm text-muted-foreground">
                Tidak ada produk. Silakan tambahkan di menu Produk (admin).
              </div>
            )}
          </div>
        </section>

        {/* Cart */}
        <aside className="flex flex-col overflow-hidden bg-card">
          <div className="flex items-center justify-between border-b px-5 py-3">
            <div className="flex items-center gap-2 font-semibold">
              <ShoppingCart className="h-4 w-4 text-primary" /> Keranjang ({cart.length})
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={holdOrder} disabled={!cart.length}>
                <Pause className="mr-1 h-3 w-3" /> Tahan
              </Button>
              <Button size="sm" variant="ghost" onClick={clearCart} disabled={!cart.length}>
                <Trash2 className="mr-1 h-3 w-3" /> Kosongkan
              </Button>
            </div>
          </div>
          <div className="flex-1 space-y-2 overflow-auto p-4">
            {cart.length === 0 && (
              <div className="pt-10 text-center text-sm text-muted-foreground">Keranjang kosong</div>
            )}
            {cart.map((i) => (
              <div key={i.product_id} className="rounded-md border bg-background p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 text-sm font-medium">{i.name}</div>
                  <button onClick={() => removeItem(i.product_id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{rupiah(i.unit_price)} × {i.qty}</div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(i.product_id, -1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <Input
                      className="h-7 w-14 text-center"
                      value={i.qty}
                      onChange={(e) => setQty(i.product_id, Number(e.target.value.replace(/\D/g, "")) || 0)}
                    />
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(i.product_id, 1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="text-sm font-semibold">{rupiah(i.qty * i.unit_price)}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2 border-t bg-muted/30 p-4 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span className="font-semibold">{rupiah(subtotal)}</span></div>
            <div className="flex items-center gap-2">
              <Select value={discountType} onValueChange={(v) => setDiscountType(v as "none" | "percent" | "flat")}>
                <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Tanpa diskon</SelectItem>
                  <SelectItem value="percent">Diskon %</SelectItem>
                  <SelectItem value="flat">Diskon Rp</SelectItem>
                </SelectContent>
              </Select>
              {discountType !== "none" && (
                <Input
                  className="h-8 flex-1"
                  type="number"
                  min={0}
                  value={discountValue || ""}
                  onChange={(e) => setDiscountValue(Number(e.target.value) || 0)}
                  placeholder={discountType === "percent" ? "0-100" : "Rp"}
                />
              )}
              <div className="text-right text-xs text-muted-foreground">−{rupiah(discountAmount)}</div>
            </div>
            <div className="flex justify-between border-t pt-2 text-base"><span className="font-semibold">Total</span><span className="font-bold text-primary">{rupiah(total)}</span></div>
            <Button className="w-full bg-accent text-accent-foreground hover:bg-accent-hover" size="lg" disabled={!cart.length} onClick={() => setCheckoutOpen(true)}>
              Bayar (F2)
            </Button>
          </div>
        </aside>
      </div>

      {/* Checkout dialog */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pembayaran</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md bg-muted p-3 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{rupiah(subtotal)}</span></div>
              <div className="flex justify-between"><span>Diskon</span><span>−{rupiah(discountAmount)}</span></div>
              <div className="mt-1 flex justify-between border-t pt-1 text-base font-bold text-primary"><span>Total</span><span>{rupiah(total)}</span></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant={paymentMethod === "tunai" ? "default" : "outline"} onClick={() => setPaymentMethod("tunai")}>Tunai</Button>
              <Button variant={paymentMethod === "hutang" ? "default" : "outline"} onClick={() => setPaymentMethod("hutang")} className={paymentMethod === "hutang" ? "bg-accent hover:bg-accent-hover text-accent-foreground" : ""}>Hutang / Bon</Button>
            </div>

            {paymentMethod === "hutang" && (
              <div>
                <Label>Pelanggan</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger><SelectValue placeholder="Pilih pelanggan…" /></SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}{c.phone ? ` — ${c.phone}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label>{paymentMethod === "tunai" ? "Uang Tunai" : "DP / Pembayaran Awal"}</Label>
              <Input
                autoFocus
                inputMode="numeric"
                value={tenderedStr}
                onChange={(e) => setTenderedStr(e.target.value.replace(/\D/g, ""))}
                placeholder="0"
                className="text-right text-xl font-semibold"
              />
              {paymentMethod === "tunai" && (
                <div className="mt-2 grid grid-cols-4 gap-1 text-xs">
                  {[total, 20000, 50000, 100000].map((v, idx) => (
                    <button key={idx} type="button" className="rounded border bg-background py-1 hover:bg-muted"
                      onClick={() => setTenderedStr(String(v))}>
                      {rupiah(v)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-md border-2 border-dashed p-3 text-sm">
              {paymentMethod === "tunai" ? (
                <div className="flex justify-between text-lg font-bold">
                  <span>Kembalian</span>
                  <span className={change < 0 ? "text-destructive" : "text-success"}>{rupiah(change)}</span>
                </div>
              ) : (
                <div className="flex justify-between text-lg font-bold">
                  <span>Sisa Hutang</span>
                  <span className="text-accent">{rupiah(debtRemaining)}</span>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckoutOpen(false)}>Batal</Button>
            <Button onClick={submit} className="bg-primary hover:bg-primary-hover">Konfirmasi & Cetak</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt */}
      {receipt && (
        <Dialog open onOpenChange={() => setReceipt(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Struk</DialogTitle>
            </DialogHeader>
            <Receipt data={receipt} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setReceipt(null)}>Tutup</Button>
              <Button onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" /> Cetak</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

type ReceiptData = {
  code: string;
  transactionId: string;
  items: { name: string; qty: number; unit_price: number; subtotal: number }[];
  subtotal: number; discountAmount: number; total: number;
  paid: number; change: number;
  payment_method: "tunai" | "hutang";
  status: "lunas" | "hutang";
  customer: string | null;
  created_at: string;
};

function Receipt({ data }: { data: ReceiptData }) {
  return (
    <div className="print-receipt mx-auto max-w-xs bg-white p-3 font-mono text-[12px] text-black">
      <div className="text-center">
        <div className="text-sm font-bold">TOKO SEMBAKO</div>
        <div>Jl. Merdeka No. 12</div>
        <div>{new Date(data.created_at).toLocaleString("id-ID")}</div>
        <div>#{data.code || data.transactionId.slice(0, 8)}</div>
      </div>
      <div className="my-2 border-t border-dashed border-black" />
      {data.items.map((i, idx) => (
        <div key={idx} className="mb-1">
          <div>{i.name}</div>
          <div className="flex justify-between">
            <span>{i.qty} × {rupiah(i.unit_price)}</span>
            <span>{rupiah(i.subtotal)}</span>
          </div>
        </div>
      ))}
      <div className="my-2 border-t border-dashed border-black" />
      <div className="flex justify-between"><span>Subtotal</span><span>{rupiah(data.subtotal)}</span></div>
      {data.discountAmount > 0 && (
        <div className="flex justify-between"><span>Diskon</span><span>−{rupiah(data.discountAmount)}</span></div>
      )}
      <div className="flex justify-between font-bold"><span>TOTAL</span><span>{rupiah(data.total)}</span></div>
      <div className="flex justify-between"><span>{data.payment_method === "tunai" ? "Tunai" : "DP"}</span><span>{rupiah(data.paid)}</span></div>
      {data.payment_method === "tunai" ? (
        <div className="flex justify-between"><span>Kembali</span><span>{rupiah(data.change)}</span></div>
      ) : (
        <div className="flex justify-between"><span>Sisa Hutang</span><span>{rupiah(Math.max(data.total - data.paid, 0))}</span></div>
      )}
      {data.customer && <div className="mt-1">Pelanggan: {data.customer}</div>}
      <div className="my-2 border-t border-dashed border-black" />
      <div className="text-center text-sm font-bold">
        {data.status === "lunas" ? "*** LUNAS ***" : "*** BON / HUTANG ***"}
      </div>
      <div className="mt-2 text-center text-[11px]">Terima kasih & selamat belanja 🙏</div>
    </div>
  );
}
