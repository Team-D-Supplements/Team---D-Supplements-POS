import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import logo from "@/assets/logo.png";
import { signIn, signUp, getSessionUser } from "@/lib/auth.functions";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — SuppPOS" },
      { name: "description", content: "Sign in to your supplement store point of sale." },
      { property: "og:title", content: "Sign in — SuppPOS" },
      { property: "og:description", content: "Sign in to your supplement store point of sale." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    getSessionUser()
      .then((u) => {
        if (u?.isAdmin) navigate({ to: "/dashboard" });
      })
      .catch(() => {});
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") await signUp({ data: { email, password } });
      else await signIn({ data: { email, password } });
      // A successful password check alone does not establish that the browser
      // retained the session cookie or that this account has store access.
      const user = await getSessionUser();
      if (!user)
        throw new Error(
          mode === "signup"
            ? "Your account was saved, but your session could not be verified. Please allow cookies and sign in again."
            : "Your session could not be verified. Please allow cookies and try again.",
        );
      if (!user.isAdmin)
        throw new Error("This account is not an administrator. Contact your store owner.");
      await navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <img src={logo} alt="SuppPOS" className="mx-auto mb-2 size-12 rounded-xl" />
          <CardTitle className="font-display text-2xl">SuppPOS</CardTitle>
          <CardDescription>
            {mode === "signin" ? "Sign in to your store" : "Create the store owner account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <PasswordInput
                id="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {mode === "signin" && (
              <p className="text-right text-xs text-muted-foreground">
                Forgot your password? Contact your system administrator.
              </p>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>
          <Button
            type="button"
            variant="link"
            className="mt-4 w-full text-muted-foreground"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin"
              ? "First time? Create the owner account"
              : "Already have an account? Sign in"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
