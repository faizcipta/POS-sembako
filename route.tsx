import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    // Fetch roles
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", data.user.id)
      .maybeSingle();
    return {
      user: data.user,
      roles: (roles ?? []).map((r) => r.role as "admin" | "kasir"),
      profile,
    };
  },
  component: LayoutComponent,
});

function LayoutComponent() {
  const ctx = Route.useRouteContext();
  return (
    <AppLayout
      userEmail={ctx.user.email ?? ""}
      fullName={ctx.profile?.full_name ?? ctx.user.email ?? ""}
      isAdmin={ctx.roles.includes("admin")}
    >
      <Outlet />
    </AppLayout>
  );
}
