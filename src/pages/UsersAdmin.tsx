import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Shield, Search, Plus, UserCog, KeyRound, Ban, Trash2, Download, ChevronUp, ChevronDown,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CreateUserDialog } from "@/components/users/CreateUserDialog";
import { EditUserDialog } from "@/components/users/EditUserDialog";
import { ConfirmDialog } from "@/components/users/ConfirmDialog";
import { ResetPasswordDialog } from "@/components/users/ResetPasswordDialog";
import { logAudit } from "@/lib/audit";

type AppRole = "admin" | "org_admin" | "engineer" | "customer";

const roleLabels: Record<AppRole, string> = {
  admin: "Оператор",
  org_admin: "Админ организации",
  engineer: "Инженер",
  customer: "Пользователь",
};
const roleBadgeVariant: Record<AppRole, "default" | "secondary" | "outline"> = {
  admin: "default",
  org_admin: "secondary",
  engineer: "secondary",
  customer: "outline",
};

export interface UserProfile {
  user_id: string;
  full_name: string | null;
  organization: string | null;
  phone: string | null;
  position: string | null;
  created_at: string;
  roles: AppRole[];
  email: string;
  is_active: boolean;
}

const PAGE_SIZES = [10, 25, 50];

type SortKey = "full_name" | "created_at" | "organization";

export default function UsersAdmin() {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isAdmin = hasRole("admin");

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [orgFilter, setOrgFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: "block" | "unblock" | "delete"; userId: string; userName: string } | null>(null);
  const [resetPwUser, setResetPwUser] = useState<{ userId: string; userName: string } | null>(null);
  const [newPassword, setNewPassword] = useState<string | null>(null);

  // Fetch profiles + roles + emails
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const [profilesRes, rolesRes, emailsRes] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, organization, phone, position, created_at, is_active").order("created_at", { ascending: true }),
        supabase.from("user_roles").select("user_id, role"),
        supabase.functions.invoke("manage-user", { body: { action: "list" } }),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (rolesRes.error) throw rolesRes.error;

      const roleMap = new Map<string, AppRole[]>();
      for (const r of rolesRes.data || []) {
        if (!roleMap.has(r.user_id)) roleMap.set(r.user_id, []);
        roleMap.get(r.user_id)!.push(r.role as AppRole);
      }

      const emailMap: Record<string, string> = emailsRes.data?.emails ?? {};
      const bannedMap: Record<string, boolean> = emailsRes.data?.banned ?? {};

      return (profilesRes.data || []).map((p: any) => ({
        ...p,
        roles: roleMap.get(p.user_id) || [],
        email: emailMap[p.user_id] || "",
        is_active: bannedMap[p.user_id] ? false : (p.is_active ?? true),
      })) as UserProfile[];
    },
  });

  // Derived: organizations list
  const { data: organizations = [] } = useQuery({
    queryKey: ["org-names"],
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations")
        .select("name").eq("is_active", true).order("name");
      if (error) throw error;
      return (data ?? []).map((o: any) => o.name as string);
    },
  });

  // Filter + search
  const filtered = useMemo(() => {
    let list = users;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((u) =>
        (u.full_name ?? "").toLowerCase().includes(q) ||
        (u.email ?? "").toLowerCase().includes(q) ||
        (u.organization ?? "").toLowerCase().includes(q) ||
        (u.phone ?? "").toLowerCase().includes(q)
      );
    }
    if (roleFilter === "none") {
      list = list.filter((u) => u.roles.length === 0);
    } else if (roleFilter !== "all") {
      list = list.filter((u) => u.roles.includes(roleFilter as AppRole));
    }
    if (orgFilter === "none") {
      list = list.filter((u) => !u.organization);
    } else if (orgFilter !== "all") {
      list = list.filter((u) => u.organization === orgFilter);
    }
    // Sort
    list = [...list].sort((a, b) => {
      const av = (a[sortKey] ?? "") as string;
      const bv = (b[sortKey] ?? "") as string;
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return list;
  }, [users, search, roleFilter, orgFilter, sortKey, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortAsc ? <ChevronUp className="h-3 w-3 inline ml-1" /> : <ChevronDown className="h-3 w-3 inline ml-1" />;
  };

  // Manage user action
  const manageMutation = useMutation({
    mutationFn: async (params: { action: string; user_id: string; [key: string]: any }) => {
      const res = await supabase.functions.invoke("manage-user", { body: params });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });

  const handleBlock = async () => {
    if (!confirmAction) return;
    try {
      await manageMutation.mutateAsync({
        action: confirmAction.type === "delete" ? "delete" : confirmAction.type,
        user_id: confirmAction.userId,
      });
      const actionLabel = confirmAction.type === "block" ? "Блокировка" : confirmAction.type === "unblock" ? "Разблокировка" : "Удаление";
      await logAudit({
        action: `${actionLabel} пользователя`,
        module: "users",
        entityId: confirmAction.userId,
        details: confirmAction.userName,
      });
      toast({ title: `${actionLabel} выполнена` });
    } catch (e: any) {
      toast({ title: "Ошибка", description: e.message, variant: "destructive" });
    }
    setConfirmAction(null);
  };

  const handleResetPassword = async () => {
    if (!resetPwUser) return;
    try {
      const res = await manageMutation.mutateAsync({
        action: "reset_password",
        user_id: resetPwUser.userId,
      });
      setNewPassword(res.new_password);
      await logAudit({
        action: "Сброс пароля",
        module: "users",
        entityId: resetPwUser.userId,
        details: resetPwUser.userName,
      });
      toast({ title: "Пароль сброшен" });
    } catch (e: any) {
      toast({ title: "Ошибка", description: e.message, variant: "destructive" });
      setResetPwUser(null);
    }
  };

  // Bulk actions
  const handleBulkBlock = async () => {
    for (const uid of selected) {
      try {
        await manageMutation.mutateAsync({ action: "block", user_id: uid });
      } catch {}
    }
    setSelected(new Set());
    toast({ title: "Выбранные пользователи заблокированы" });
  };

  const handleExportCSV = () => {
    const BOM = "\uFEFF";
    const header = "ФИО;Email;Организация;Телефон;Роли;Статус;Регистрация\n";
    const rows = filtered.map((u) =>
      [
        u.full_name ?? "",
        u.email,
        u.organization ?? "",
        u.phone ?? "",
        u.roles.map((r) => roleLabels[r]).join(", ") || "Нет роли",
        u.is_active ? "Активен" : "Заблокирован",
        format(new Date(u.created_at), "dd.MM.yyyy"),
      ].join(";")
    ).join("\n");
    const blob = new Blob([BOM + header + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `users_${format(new Date(), "yyyyMMdd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSelectAll = () => {
    if (selected.size === paged.length) setSelected(new Set());
    else setSelected(new Set(paged.map((u) => u.user_id)));
  };

  const toggleSelect = (uid: string) => {
    const next = new Set(selected);
    if (next.has(uid)) next.delete(uid);
    else next.add(uid);
    setSelected(next);
  };

  if (!isAdmin) {
    return (
      <div>
        <h1 className="font-heading text-2xl font-bold mb-6">Пользователи</h1>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Shield className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">Доступ только для администраторов</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="font-heading text-2xl font-bold">Пользователи</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="h-4 w-4 mr-2" />CSV
          </Button>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-2" />Создать пользователя
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Поиск по ФИО, email, организации, телефону..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="pl-9" />
        </div>
        <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Все роли" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все роли</SelectItem>
            <SelectItem value="admin">Операторы</SelectItem>
            <SelectItem value="org_admin">Админы организаций</SelectItem>
            <SelectItem value="engineer">Инженеры</SelectItem>
            <SelectItem value="customer">Пользователи</SelectItem>
            <SelectItem value="none">Нет роли</SelectItem>
          </SelectContent>
        </Select>
        <Select value={orgFilter} onValueChange={(v) => { setOrgFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Все организации" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все организации</SelectItem>
            <SelectItem value="none">Без организации</SelectItem>
            {organizations.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardContent className="py-3 px-4 flex items-center gap-3">
          <Users className="h-5 w-5 text-primary" />
          <div><p className="text-2xl font-bold">{users.length}</p><p className="text-xs text-muted-foreground">Всего</p></div>
        </CardContent></Card>
        {(["admin", "org_admin", "customer"] as AppRole[]).map((role) => (
          <Card key={role}><CardContent className="py-3 px-4 flex items-center gap-3">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <div><p className="text-2xl font-bold">{users.filter((u) => u.roles.includes(role)).length}</p><p className="text-xs text-muted-foreground">{roleLabels[role]}</p></div>
          </CardContent></Card>
        ))}
        <Card><CardContent className="py-3 px-4 flex items-center gap-3">
          <Ban className="h-5 w-5 text-destructive" />
          <div><p className="text-2xl font-bold">{users.filter((u) => !u.is_active).length}</p><p className="text-xs text-muted-foreground">Заблокированы</p></div>
        </CardContent></Card>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-muted rounded-lg">
          <span className="text-sm font-medium">Выбрано: {selected.size}</span>
          <Button variant="destructive" size="sm" onClick={handleBulkBlock}>
            <Ban className="h-3 w-3 mr-1" />Заблокировать
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Отменить</Button>
        </div>
      )}

      {/* Table */}
      <Card>
        {isLoading ? (
          <CardContent className="py-12 text-center text-muted-foreground">
            <div className="flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
          </CardContent>
        ) : filtered.length === 0 ? (
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">Пользователи не найдены</p>
          </CardContent>
        ) : (
          <>
            <ScrollArea className="max-h-[calc(100vh-450px)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={selected.size === paged.length && paged.length > 0} onCheckedChange={toggleSelectAll} />
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("full_name")}>ФИО<SortIcon col="full_name" /></TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("organization")}>Организация<SortIcon col="organization" /></TableHead>
                    <TableHead className="hidden lg:table-cell">Телефон</TableHead>
                    <TableHead>Роли</TableHead>
                    <TableHead className="cursor-pointer select-none hidden md:table-cell" onClick={() => toggleSort("created_at")}>Регистрация<SortIcon col="created_at" /></TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead className="w-36">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map((u) => (
                    <TableRow key={u.user_id} className={!u.is_active ? "opacity-60" : ""}>
                      <TableCell><Checkbox checked={selected.has(u.user_id)} onCheckedChange={() => toggleSelect(u.user_id)} /></TableCell>
                      <TableCell className="font-medium">
                        <button className="text-primary hover:underline text-left" onClick={() => setEditUserId(u.user_id)}>
                          {u.full_name || "—"}
                        </button>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{u.organization || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">{u.phone || "—"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {u.roles.length === 0 && <Badge variant="outline" className="text-muted-foreground">Нет роли</Badge>}
                          {u.roles.map((r) => <Badge key={r} variant={roleBadgeVariant[r]}>{roleLabels[r]}</Badge>)}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{format(new Date(u.created_at), "dd.MM.yyyy")}</TableCell>
                      <TableCell>
                        {u.is_active
                          ? <Badge variant="success">Активен</Badge>
                          : <Badge variant="destructive">Заблокирован</Badge>}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setEditUserId(u.user_id)} title="Редактировать"><UserCog className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => setResetPwUser({ userId: u.user_id, userName: u.full_name || u.email })} title="Сброс пароля"><KeyRound className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => setConfirmAction({ type: u.is_active ? "block" : "unblock", userId: u.user_id, userName: u.full_name || u.email })} title={u.is_active ? "Заблокировать" : "Разблокировать"}>
                            <Ban className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setConfirmAction({ type: "delete", userId: u.user_id, userName: u.full_name || u.email })} title="Удалить">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Показано {page * pageSize + 1}–{Math.min((page + 1) * pageSize, filtered.length)} из {filtered.length}</span>
                <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
                  <SelectTrigger className="w-[80px] h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>{PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>←</Button>
                <span className="flex items-center px-3 text-sm">{page + 1} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>→</Button>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Dialogs */}
      <CreateUserDialog open={showCreate} onOpenChange={setShowCreate} organizations={organizations} />

      {editUserId && (
        <EditUserDialog
          userId={editUserId}
          users={users}
          organizations={organizations}
          onClose={() => setEditUserId(null)}
        />
      )}

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.type === "delete" ? "Удаление пользователя" : confirmAction?.type === "block" ? "Блокировка пользователя" : "Разблокировка пользователя"}
        description={
          confirmAction?.type === "delete"
            ? `Вы уверены, что хотите удалить пользователя "${confirmAction?.userName}"? Это действие необратимо.`
            : confirmAction?.type === "block"
              ? `Заблокировать пользователя "${confirmAction?.userName}"? Он не сможет войти в систему.`
              : `Разблокировать пользователя "${confirmAction?.userName}"?`
        }
        variant={confirmAction?.type === "delete" ? "destructive" : "default"}
        onConfirm={handleBlock}
        onCancel={() => setConfirmAction(null)}
        loading={manageMutation.isPending}
      />

      <ResetPasswordDialog
        open={!!resetPwUser}
        userName={resetPwUser?.userName ?? ""}
        newPassword={newPassword}
        loading={manageMutation.isPending}
        onConfirm={handleResetPassword}
        onClose={() => { setResetPwUser(null); setNewPassword(null); }}
      />
    </div>
  );
}
