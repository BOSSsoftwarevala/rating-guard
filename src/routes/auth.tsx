import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP_NAME, APP_DOMAIN } from "@/lib/config";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — The Rating Guard" },
      { name: "description", content: "Admin sign in for the Google The Rating Guard." },
      { property: "og:title", content: "Sign in — The Rating Guard" },
      { property: "og:description", content: "Admin sign in for the Google The Rating Guard." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already signed in? Skip the login form and go straight to the dashboard.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      setError(error.message === "Invalid login credentials" ? "Invalid username or password." : error.message);
      return;
    }
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="bg-scanner relative hidden overflow-hidden p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="grid-lines absolute inset-0" />
        <div className="relative flex items-center gap-2 font-bold"><Star className="h-5 w-5 text-star" fill="currentColor" strokeWidth={0} /> {APP_NAME}</div>
        <div className="relative">
          <h1 className="text-4xl font-bold leading-tight tracking-tight">Scan. Analyze.<br />Find. Report.</h1>
          <p className="mt-4 max-w-md opacity-75">Paste a Google Maps link. Get the rating, available reviews, risk classification and an evidence report for Google's official reporting path.</p>
        </div>
        <div className="relative text-xs opacity-60">{APP_DOMAIN} · Official Google Places data only</div>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="surface w-full max-w-sm space-y-5 p-8">
          <div>
            <h2 className="text-2xl font-bold">Admin login</h2>
            <p className="mt-1 text-sm text-muted-foreground">Sign in to continue.</p>
          </div>
          <div className="space-y-2"><Label htmlFor="email">Username / Email</Label><Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="pw">Password</Label><Input id="pw" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          {error && <p role="alert" className="rounded-md bg-risk-high-soft px-3 py-2 text-sm text-risk-high">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
        </form>
      </div>
    </div>
  );
}
