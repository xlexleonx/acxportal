import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import ThemeToggle from "@/components/ThemeToggle";
import BrandLogo from "@/components/BrandLogo";
import { Clock, ShieldPlus } from "lucide-react";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [bootstrapAvailable, setBootstrapAvailable] = useState(false);
  const [bootstrapBusy, setBootstrapBusy] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextParam = searchParams.get("next");
  const nextTarget = nextParam && nextParam.startsWith("/") ? nextParam : "/";

  useEffect(() => {
    // Check whether system is empty and offers initial superadmin setup.
    supabase.functions
      .invoke("bootstrap-admin", { method: "GET" })
      .then(({ data }) => setBootstrapAvailable(!!data?.needs_bootstrap))
      .catch(() => setBootstrapAvailable(false));
  }, []);

  const handleBootstrap = async () => {
    if (!confirm("Создать суперадминистратора admin@assist.local с паролем derby3713? Это работает только при пустой БД.")) return;
    setBootstrapBusy(true);
    const { data, error } = await supabase.functions.invoke("bootstrap-admin", { method: "POST" });
    setBootstrapBusy(false);
    if (error || data?.error) {
      toast({ title: "Не удалось", description: data?.error ?? error?.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Суперадмин создан",
      description: `Логин: ${data.email}  •  Пароль: ${data.password}. СРАЗУ смените пароль в профиле!`,
    });
    setEmail(data.email);
    setPassword(data.password);
    setBootstrapAvailable(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast({ title: "Ошибка входа", description: error.message, variant: "destructive" });
    } else {
      // Full navigation so the OAuth consent route re-reads the session.
      window.location.href = nextTarget;
    }
    setLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: window.location.origin + nextTarget,
      },
    });
    if (error) {
      toast({ title: "Ошибка регистрации", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Регистрация успешна", description: "Проверьте почту для подтверждения." });
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex justify-center">
            {/* В тёмной теме — оригинал; в светлой — инвертируем чёрный в красный (--primary) через CSS-фильтр */}
            <BrandLogo className="h-20 w-auto mx-auto" />
          </div>
          <CardTitle className="font-heading text-2xl">Assist Portal</CardTitle>
          <CardDescription>Портал технической поддержки</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Вход</TabsTrigger>
              <TabsTrigger value="signup">Регистрация</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Пароль</Label>
                  <Input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Вход..." : "Войти"}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">ФИО</Label>
                  <Input id="signup-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input id="signup-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Пароль</Label>
                  <Input id="signup-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Регистрация..." : "Зарегистрироваться"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {bootstrapAvailable && (
        <Card className="w-full max-w-md mt-4 border-dashed border-primary/50">
          <CardContent className="p-4 space-y-2 text-sm">
            <div className="flex items-center gap-2 font-medium">
              <ShieldPlus className="h-4 w-4 text-primary" />
              Первичная инициализация портала
            </div>
            <p className="text-xs text-muted-foreground">
              В системе ещё нет пользователей. Создайте суперадминистратора одним кликом —
              логин <code>admin@assist.local</code>, пароль <code>derby3713</code>.
              Сразу после входа смените пароль в профиле.
            </p>
            <Button size="sm" className="w-full" onClick={handleBootstrap} disabled={bootstrapBusy}>
              {bootstrapBusy ? "Создаём…" : "Создать суперадмина"}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="mt-8 text-center text-xs text-muted-foreground inline-flex items-center gap-1 justify-center">
        <Clock className="h-3 w-3" />
        Пн–Пт: 9:00 – 18:00
      </div>
    </div>
  );
}
