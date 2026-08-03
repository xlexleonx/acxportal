import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { logAudit } from "@/lib/audit";
import type { UserProfile } from "@/pages/UsersAdmin";
import { NON_ADMIN_MODULES } from "@/lib/modules";

type AppRole = "admin" | "org_admin" | "engineer" | "customer";

const roleLabels: Record<AppRole, string> = {
  admin: "Оператор",
  org_admin: "Админ организации",
  engineer: "Инженер",
  customer: "Пользователь",
};

const MODULES = NON_ADMIN_MODULES;

// Тарифные пресеты доступа к модулям. Стартовая точка — оператор может дотюнить галочками.
const MODULE_PRESETS: { label: string; keys: string[] }[] = [
  { label: "Демо",        keys: ["dashboard", "equipment", "monitoring", "tickets", "help"] },
  { label: "Базовая",     keys: ["dashboard", "tickets", "notifications", "equipment", "monitoring", "help"] },
  { label: "Расширенная", keys: ["dashboard", "tickets", "notifications", "equipment", "monitoring", "help", "documents", "schedules", "protocols"] },
];

interface EditUserDialogProps {
  userId: string;
  users: UserProfile[];
  organizations: string[];
  onClose: () => void;
}

export function EditUserDialog({ userId, users, organizations, onClose }: EditUserDialogProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const user = users.find((u) => u.user_id === userId);

  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [organization, setOrganization] = useState(user?.organization ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [position, setPosition] = useState((user as any)?.position ?? "");
  const [selectedRoles, setSelectedRoles] = useState<AppRole[]>(user?.roles ?? []);
  const [editModules, setEditModules] = useState<string[]>([]);

  // Load module permissions
  useEffect(() => {
    if (!userId) return;
    supabase.from("user_module_permissions").select("module_key").eq("user_id", userId).then(({ data }) => {
      const perms = (data ?? []).map((p) => p.module_key);
      setEditModules(perms.length > 0 ? perms : MODULES.map((m) => m.key));
    });
  }, [userId]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await supabase.functions.invoke("manage-user", {
        body: {
          action: "update",
          user_id: userId,
          full_name: fullName || null,
          organization: organization || null,
          phone: phone || null,
          position: position || null,
          roles: selectedRoles,
        },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);

      // Save module permissions (non-admins only)
      if (!selectedRoles.includes("admin")) {
        await supabase.from("user_module_permissions").delete().eq("user_id", userId);
        if (editModules.length > 0 && editModules.length < MODULES.length) {
          await supabase.from("user_module_permissions").insert(
            editModules.map((m) => ({ user_id: userId, module_key: m }))
          );
        }
      }

      await logAudit({
        action: "Редактирование пользователя",
        module: "users",
        entityId: userId,
        details: `ФИО: ${fullName}, Роли: ${selectedRoles.join(", ")}`,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "Пользователь обновлён" });
      onClose();
    },
    onError: (e: any) => {
      toast({ title: "Ошибка", description: e.message, variant: "destructive" });
    },
  });

  const toggleRole = (role: AppRole) => {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  if (!user) return null;

  return (
    <Dialog open={true} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Редактирование пользователя</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={user.email} disabled className="opacity-70" />
          </div>
          <div className="space-y-2">
            <Label>ФИО</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Организация</Label>
            <Select value={organization || "__custom"} onValueChange={(v) => v !== "__custom" && setOrganization(v)}>
              <SelectTrigger><SelectValue placeholder="Выберите организацию" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Без организации</SelectItem>
                {organizations.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                <SelectItem value="__custom">Другая...</SelectItem>
              </SelectContent>
            </Select>
            {(organization && !organizations.includes(organization)) && (
              <Input value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder="Название организации" className="mt-2" />
            )}
          </div>
          <div className="space-y-2">
            <Label>Телефон</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+375 (__) ___-__-__" />
          </div>
          <div className="space-y-2">
            <Label>Должность</Label>
            <Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="например, Инженер сервисной поддержки" />
          </div>

          {/* Roles */}
          <div className="space-y-2">
            <Label>Роли</Label>
            <div className="space-y-2">
              {(["admin", "org_admin", "engineer", "customer"] as AppRole[]).map((role) => (
                <div key={role} className="flex items-center gap-2">
                  <Checkbox
                    id={`role-${role}`}
                    checked={selectedRoles.includes(role)}
                    onCheckedChange={() => toggleRole(role)}
                  />
                  <label htmlFor={`role-${role}`} className="text-sm cursor-pointer">{roleLabels[role]}</label>
                </div>
              ))}
            </div>
            {selectedRoles.length === 0 && (
              <p className="text-xs text-destructive">Выберите хотя бы одну роль</p>
            )}
          </div>

          {/* Module permissions (non-admins) */}
          {!selectedRoles.includes("admin") && (
            <div className="space-y-2">
              <Label>Доступ к модулям</Label>
              <p className="text-xs text-muted-foreground">Отметьте модули, к которым пользователь будет иметь доступ</p>
              <div className="flex flex-wrap gap-2 pb-1">
                {MODULE_PRESETS.map((preset) => (
                  <Button
                    key={preset.label}
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-7 text-xs"
                    onClick={() => setEditModules(preset.keys)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {MODULES.map((m) => (
                  <div key={m.key} className="flex items-center gap-2">
                    <Checkbox
                      id={`mod-${m.key}`}
                      checked={editModules.includes(m.key)}
                      onCheckedChange={(checked) => {
                        setEditModules((prev) => checked ? [...prev, m.key] : prev.filter((k) => k !== m.key));
                      }}
                    />
                    <label htmlFor={`mod-${m.key}`} className="text-sm cursor-pointer">{m.label}</label>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || selectedRoles.length === 0}>
            {saveMutation.isPending ? "Сохранение..." : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
