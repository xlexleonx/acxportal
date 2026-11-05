import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plug, Database, GitBranch, FolderArchive, DatabaseZap } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import ZabbixConnections from "@/pages/ZabbixConnections";
import Integrations from "@/pages/Integrations";
import BackupStorageManager from "@/components/connections/BackupStorageManager";
import CollectorConnections from "@/components/connections/CollectorConnections";

/**
 * Unified "Подключения" page.
 * Reuses the original Zabbix and Integrations pages as embedded panels.
 * Tab can be preselected via ?tab=zabbix|gitlab|seafile.
 */
export default function Connections() {
  const { hasRole } = useAuth();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab");
  const initial =
    tabParam === "collectors" ? "collectors"
    : tabParam === "backups" ? "backups"
    : tabParam === "gitlab" || tabParam === "seafile" ? "integrations"
    : "zabbix";

  if (!hasRole("admin")) {
    return (
      <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
        Доступ только для администраторов
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-2xl font-bold flex items-center gap-2">
          <Plug className="h-6 w-6 text-primary" /> Подключения
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Источники данных мониторинга и внешние сервисы для интеграции с порталом.
        </p>
      </div>
      <Tabs
        defaultValue={initial}
        onValueChange={(v) => {
          const next = new URLSearchParams(params);
          next.set("tab", v);
          setParams(next, { replace: true });
        }}
      >
        <TabsList>
          <TabsTrigger value="zabbix" className="gap-1.5">
            <Database className="h-3.5 w-3.5" /> Источники данных
          </TabsTrigger>
          <TabsTrigger value="collectors" className="gap-1.5">
            <DatabaseZap className="h-3.5 w-3.5" /> Коллекторы
          </TabsTrigger>
          <TabsTrigger value="integrations" className="gap-1.5">
            <GitBranch className="h-3.5 w-3.5" /> Внешние сервисы
          </TabsTrigger>
          <TabsTrigger value="backups" className="gap-1.5">
            <FolderArchive className="h-3.5 w-3.5" /> Хранилища бэкапов
          </TabsTrigger>
        </TabsList>
        <TabsContent value="zabbix" className="mt-4">
          <ZabbixConnections />
        </TabsContent>
        <TabsContent value="collectors" className="mt-4">
          <CollectorConnections />
        </TabsContent>
        <TabsContent value="integrations" className="mt-4">
          <Integrations />
        </TabsContent>
        <TabsContent value="backups" className="mt-4">
          <BackupStorageManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
