import { Outlet } from "react-router-dom";
import AppSidebar from "./AppSidebar";
import MobileNav from "./MobileNav";
import { useBrowserNotifications } from "@/hooks/useBrowserNotifications";
import ZabbixConnectionPicker from "@/components/ZabbixConnectionPicker";
import { DynamicIsland } from "@/components/layout/DynamicIsland";
import { PageTransition } from "@/components/PageTransition";
import StarfieldBackground from "@/components/StarfieldBackground";

export default function AppLayout() {
  // Activates realtime browser notifications when permission is granted.
  useBrowserNotifications();
  return (
    <div className="workspace-shell relative flex h-dvh min-h-0 overflow-hidden">
      <div className="workspace-aurora pointer-events-none absolute inset-0 z-0" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="pointer-events-none absolute inset-0 z-0">
        <StarfieldBackground />
      </div>
      <AppSidebar />
      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <MobileNav />
        <header className="shrink-0">
          <DynamicIsland />
          <div className="hidden lg:flex items-center justify-end gap-3 px-6 mt-2">
            <ZabbixConnectionPicker />
          </div>
        </header>
        <main className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          <div className="p-4 md:p-6 lg:p-8 pt-2">
            <PageTransition>
              <Outlet />
            </PageTransition>
          </div>
        </main>
      </div>
    </div>
  );
}
