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
import GalaxyBackground from "@/components/GalaxyBackground";
import GradientText from "@/components/GradientText";
import acroSupport from "@/assets/acro-support.png";
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
      <GalaxyBackground
        className="pointer-events-none absolute inset-0 z-0"
        hueShift={194}
        saturation={0}
        density={1}
        glowIntensity={0.3}
        starSize={1}
        flareIntensity={1}
        twinkleIntensity={0.3}
        starSpeed={0.5}
        speed={1}
        rotationSpeed={0.1}
        layers={4}
        direction="forward"
        mouseInteraction
        mouseRepulsion
        repulsionStrength={2}
        clickWarp
        intro
        lightMode={false}
      />
      <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(110deg,rgba(1,10,22,0.4),transparent_56%,rgba(1,9,18,0.3))]" />

      <div className="absolute top-4 right-4 z-10 md:top-6 md:right-6 flex items-center gap-2 rounded-full border border-border/70 bg-card/70 p-1.5 pl-3 backdrop-blur-md">
        <span className="text-xs text-muted-foreground">Тема</span>
        <ThemeToggle className="h-8 w-8 rounded-full hover:bg-primary/10 hover:text-primary" />
      </div>

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
          <h1 className="max-w-xl text-4xl font-medium leading-tight tracking-tight xl:text-5xl">
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

          <div className="relative mt-10 h-[23rem] max-w-md overflow-hidden rounded-3xl border border-primary/25 bg-[#07346c] shadow-2xl shadow-primary/15">
            <img
              src={acroSupport}
              alt="Акро, помощник технической поддержки"
              className="h-full w-full object-cover object-center"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#041d42]/95 via-[#041d42]/35 to-transparent px-6 pb-6 pt-16">
              <p className="font-heading text-xl font-semibold text-white">Акро уже на связи</p>
              <p className="mt-1 text-sm text-cyan-50/85">Поможем с вопросом по порталу и инфраструктуре.</p>
            </div>
          </div>
        </section>

        <div className="w-full max-w-md justify-self-center">
          <div className="relative mb-6 h-32 overflow-hidden rounded-2xl border border-primary/25 bg-[#07346c] lg:hidden">
            <img
              src={acroSupport}
              alt="Акро, помощник технической поддержки"
              className="h-full w-full object-cover object-[center_38%]"
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
