import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import GradientText from "@/components/GradientText";
import StarfieldBackground from "@/components/StarfieldBackground";
import acroSupport from "@/assets/acro-support-transparent.png";
import { Clock, ShieldPlus, Sparkles } from "lucide-react";

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
    <div className="auth-shell min-h-screen overflow-hidden px-4 py-6 relative">
      <div className="auth-aurora pointer-events-none absolute inset-0 z-0" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="pointer-events-none absolute inset-0 z-[1]">
        <StarfieldBackground />
      </div>
      <div className="pointer-events-none absolute inset-0 z-[2] bg-[linear-gradient(110deg,rgba(1,10,22,0.3),transparent_56%,rgba(1,9,18,0.2))]" />

      <div className="relative z-10 mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-6xl items-center gap-10 py-10 lg:grid-cols-[1.05fr_.95fr]">
        <section className="hidden lg:block pr-10">
          <p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em]">
            <Sparkles className="h-4 w-4 text-[#35aacd]" />
            <GradientText
              colors={["#35AACD", "#00A88E", "#00C8EC", "#3FE0BF"]}
              animationSpeed={5.5}
              scale={3}
              yoyo={false}
              glow={0.45}
              className="acx-event-kicker"
            >
              Техническая поддержка ACROTIX
            </GradientText>
          </p>
          <h1 className="max-w-xl text-[2rem] font-medium leading-tight tracking-tight xl:text-[2.65rem]">
            <GradientText
              colors={["#FFFFFF", "#35AACD", "#00A88E", "#00C8EC", "#FFFFFF"]}
              animationSpeed={8}
              scale={3.5}
              yoyo={false}
              glow={0.36}
              className="acx-event-heading"
            >
              Поддержка, которая рядом
            </GradientText>
          </h1>

          <div className="mt-7 max-w-lg">
            <div className="mx-auto h-[17rem] max-w-[19rem] -translate-y-1">
              <img
                src={acroSupport}
                alt="Акро, помощник технической поддержки"
                draggable={false}
                className="pointer-events-none h-full w-full select-none object-contain object-bottom drop-shadow-[0_18px_28px_rgba(0,0,0,0.32)] [-webkit-user-drag:none]"
              />
            </div>
          </div>
        </section>

        <div className="w-full max-w-md justify-self-center">
          <div className="relative mb-3 h-[6.5rem] lg:hidden">
            <img
              src={acroSupport}
              alt="Акро, помощник технической поддержки"
              draggable={false}
              className="pointer-events-none h-full w-full select-none object-contain object-center drop-shadow-[0_12px_20px_rgba(0,0,0,0.28)] [-webkit-user-drag:none]"
            />
          </div>
          <Card className="auth-card border-border/80 bg-card/90 backdrop-blur-xl">
            <CardHeader className="pb-4 text-center">
              <CardTitle className="font-heading text-2xl">Добро пожаловать</CardTitle>
              <CardDescription>Войдите в Assist Portal</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="login">
                <TabsList className="grid w-full grid-cols-2 bg-secondary/80">
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
                <Button type="submit" className="acx-event-button w-full" disabled={loading}>
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
                <Button type="submit" className="acx-event-button w-full" disabled={loading}>
                  {loading ? "Регистрация..." : "Зарегистрироваться"}
                </Button>
              </form>
            </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {bootstrapAvailable && (
            <Card className="mt-4 border-dashed border-primary/50 bg-card/85">
              <CardContent className="space-y-2 p-4 text-sm">
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

          <div className="mt-6 text-center text-xs text-muted-foreground inline-flex w-full items-center gap-1 justify-center">
            <Clock className="h-3 w-3" />
            Пн–Пт: 9:00 – 18:00
          </div>
        </div>
      </div>

    </div>
  );
}
