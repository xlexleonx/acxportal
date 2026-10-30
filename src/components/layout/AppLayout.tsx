import { Outlet } from "react-router-dom";
import AppSidebar from "./AppSidebar";
import MobileNav from "./MobileNav";
import { useBrowserNotifications } from "@/hooks/useBrowserNotifications";
import ZabbixConnectionPicker from "@/components/ZabbixConnectionPicker";
import { DynamicIsland } from "@/components/layout/DynamicIsland";
import { PageTransition } from "@/components/PageTransition";

export default function AppLayout() {
  // Activates realtime browser notifications when permission is granted.
  useBrowserNotifications();
  return (
    <div className="flex h-dvh min-h-0 overflow-hidden">
      <AppSidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <MobileNav />
        <main className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          <DynamicIsland />
          <div className="hidden lg:flex items-center justify-end gap-3 px-6 mt-2">
            <ZabbixConnectionPicker />
          </div>
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
