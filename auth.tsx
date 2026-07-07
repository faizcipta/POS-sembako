import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Store, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/pos", replace: true });
    });
  }, [navigate]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Selamat datang!");
    navigate({ to: "/pos", replace: true });
  }

  async function signup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { full_name: fullName },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Akun dibuat. Silakan login.");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg">
            <Store className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Cipta Jaya</h1>
          <p className="text-sm text-muted-foreground">Sistem kasir cepat & ringan</p>
        </div>
        <Card className="border-border/60 shadow-xl">
          <CardHeader className="pb-3">
            <CardTitle>Masuk ke akun</CardTitle>
            <CardDescription>
              User pertama otomatis menjadi <b>Admin</b>. Selanjutnya = Kasir.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login">
              <TabsList className="mb-4 grid w-full grid-cols-2">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="signup">Daftar</TabsTrigger>
              </TabsList>
              <TabsContent value="login">
                <form onSubmit={login} className="space-y-3">
                  <div>
                    <Label htmlFor="e">Email</Label>
                    <Input id="e" type="email" value={email} onChange={(ev) => setEmail(ev.target.value)} required />
                  </div>
                  <div>
                    <Label htmlFor="p">Password</Label>
                    <Input id="p" type="password" value={password} onChange={(ev) => setPassword(ev.target.value)} required />
                  </div>
                  <Button className="w-full" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Masuk
                  </Button>
                </form>
              </TabsContent>
              <TabsContent value="signup">
                <form onSubmit={signup} className="space-y-3">
                  <div>
                    <Label htmlFor="n">Nama Lengkap</Label>
                    <Input id="n" value={fullName} onChange={(ev) => setFullName(ev.target.value)} required />
                  </div>
                  <div>
                    <Label htmlFor="e2">Email</Label>
                    <Input id="e2" type="email" value={email} onChange={(ev) => setEmail(ev.target.value)} required />
                  </div>
                  <div>
                    <Label htmlFor="p2">Password</Label>
                    <Input id="p2" type="password" minLength={6} value={password} onChange={(ev) => setPassword(ev.target.value)} required />
                  </div>
                  <Button className="w-full" disabled={loading} variant="default">
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Daftar
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
