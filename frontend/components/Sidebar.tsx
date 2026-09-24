"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  OverviewIcon,
  ProjectsIcon,
  InventoryIcon,
  InvoiceIcon,
  CashFlowIcon,
  AnalysisIcon,
  UsersIcon,
  ManpowerIcon,
  LogsIcon,
  UserAvatarIcon,
  HomeAutomationIcon,
  LogOutIcon,
} from "@/assets/icons";
import { clearStoredToken, getStoredUser, apiGetMe } from "@/lib/api";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { label: "Overview", href: "/overview", icon: OverviewIcon },
  { label: "Projects", href: "/projects", icon: ProjectsIcon },
  { label: "Master Inventory", href: "/inventory", icon: InventoryIcon },
  { label: "Invoices", href: "/invoice", icon: InvoiceIcon },
  { label: "Cash Flow", href: "/cashflow", icon: CashFlowIcon },
  { label: "Analysis", href: "/analysis", icon: AnalysisIcon },
  { label: "Users", href: "/users", icon: UsersIcon },
  { label: "Manpower", href: "/manpower", icon: ManpowerIcon },
  { label: "Logs", href: "/logs", icon: LogsIcon },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showLogOutModal, setShowLogOutModal] = useState(false);
  const [loggedOutToast, setLoggedOutToast] = useState(false);
  
  // Initialize with cached user profile if present
  const [currentUser, setCurrentUser] = useState<any>(() => {
    if (typeof window !== "undefined") {
      return getStoredUser();
    }
    return null;
  });

  useEffect(() => {
    const syncUser = () => {
      const u = getStoredUser();
      if (u) {
        setCurrentUser(u);
      }
    };

    syncUser();
    window.addEventListener("auth_user_change", syncUser);
    window.addEventListener("storage", syncUser);
    return () => {
      window.removeEventListener("auth_user_change", syncUser);
      window.removeEventListener("storage", syncUser);
    };
  }, []);

  const displayName = currentUser?.name || currentUser?.username || "Admin";
  const displayRole =
    currentUser?.role === "Admin" || currentUser?.is_env_admin
      ? "Administrator"
      : currentUser?.role || "Team Member";
  const displayInitial = (displayName || "A").charAt(0).toUpperCase();

  const isSupervisor =
    currentUser?.role === "Site Supervisor" ||
    currentUser?.role === "SITE_SUPERVISOR";

  const visibleNavItems = isSupervisor
    ? navItems.filter((item) => item.href === "/overview" || item.href === "/projects")
    : navItems;

  const handleConfirmLogOut = () => {
    clearStoredToken();
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("auth_email");
      sessionStorage.removeItem("dev_otp");
    }
    setShowLogOutModal(false);
    setLoggedOutToast(true);
    if (mobileOpen) setMobileOpen(false);
    setTimeout(() => {
      setLoggedOutToast(false);
      router.push("/login");
    }, 600);
  };

  return (
    <>
      {/* Log Out Toast Notification */}
      {loggedOutToast && (
        <div className="fixed top-5 right-5 z-[100] flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-900 text-white border border-slate-700 shadow-2xl animate-in slide-in-from-top-3 duration-200">
          <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold">
            ✓
          </div>
          <div>
            <div className="text-xs font-bold text-slate-100">Logged Out</div>
            <div className="text-[11px] text-slate-400">
              {displayName} logged out successfully.
            </div>
          </div>
        </div>
      )}

      {/* Mobile Top Header / Hamburger Toggle */}
      <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-[#070720] text-white border-b border-[#18193f] sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-xs flex-shrink-0">
            <HomeAutomationIcon className="w-4.5 h-4.5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold leading-tight text-white">MicroService</span>
            <span className="text-xs text-slate-400">Home Automation Ops</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle navigation menu"
          className="p-2 rounded-lg bg-[#141538] text-white hover:bg-[#1f2152] transition-colors cursor-pointer"
        >
          {mobileOpen ? (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 xl:w-72 bg-[#070720] text-white flex flex-col justify-between p-5 xl:p-6 transition-transform duration-300 ease-in-out border-r border-[#15163a] lg:translate-x-0 ${
          mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        }`}
      >
        <div className="space-y-6">
          {/* Top Project Brand Badge */}
          <div className="flex items-center gap-3 pt-1">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-xs flex-shrink-0">
              <HomeAutomationIcon className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm xl:text-base font-semibold text-white tracking-tight truncate">
                MicroService
              </span>
              <span className="text-xs text-slate-400 truncate">
                Home Automation Ops
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href === "/overview" && pathname === "/");

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={true}
                  onClick={() => setMobileOpen(false)}
                  className={`group relative flex items-center gap-3.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer ${
                    isActive
                      ? "text-white border border-[#3b3e7f] bg-gradient-to-r from-[#171842] to-[#1d1f56] shadow-[0_0_15px_rgba(59,62,127,0.3)]"
                      : "text-slate-300 hover:text-white hover:bg-[#121338]/60"
                  }`}
                >
                  <Icon
                    className={`w-5 h-5 transition-transform duration-150 ${
                      isActive ? "text-white scale-105" : "text-slate-400 group-hover:text-white"
                    }`}
                  />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Bottom Section: Dynamic User Profile & Log Out Button */}
        <div className="pt-4 border-t border-[#16173a] space-y-2.5">
          {/* Dynamic Authenticated User Card */}
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-[#0e0f2f] border border-[#1f2150] shadow-xs">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-900 to-indigo-600 border border-indigo-500/30 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-xs">
              {displayInitial}
            </div>
            <div className="flex flex-col min-w-0">
              <span
                className="text-sm font-semibold text-white leading-tight truncate"
                title={displayName}
              >
                {displayName}
              </span>
              <span
                className="text-xs text-indigo-300 truncate mt-0.5 font-medium"
                title={displayRole}
              >
                {displayRole}
              </span>
            </div>
          </div>

          {/* Log Out Button */}
          <button
            type="button"
            onClick={() => setShowLogOutModal(true)}
            className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-rose-300 hover:text-white bg-rose-500/10 hover:bg-rose-600/25 border border-rose-500/20 hover:border-rose-500/40 transition-all duration-150 cursor-pointer shadow-2xs group"
          >
            <LogOutIcon className="w-4 h-4 text-rose-400 group-hover:-translate-x-0.5 transition-transform" />
            <span>Log Out</span>
          </button>
        </div>
      </aside>

      {/* Log Out Confirmation Modal */}
      {showLogOutModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-[#0b0c26] border border-[#232658] rounded-2xl p-5 max-w-sm w-full text-white shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 flex-shrink-0">
                <LogOutIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Log Out</h3>
                <p className="text-xs text-slate-400">Are you sure you want to log out?</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#181a42]">
              <button
                type="button"
                onClick={() => setShowLogOutModal(false)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmLogOut}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 transition-colors shadow-sm cursor-pointer"
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
