"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { getStoredToken, getStoredUser, clearStoredToken, apiGetMe } from "@/lib/api";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return !!getStoredToken();
    }
    return true; // Default to true on initial render to prevent layout flash; validated in useEffect
  });

  // Fast synchronous route guard for Site Supervisor using stored user
  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = getStoredToken();
    if (!token) {
      setAuthorized(false);
      window.location.replace("/login");
      return;
    }
    setAuthorized(true);

    const user = getStoredUser();
    const role = user?.role || "";
    if (role === "Site Supervisor" || role === "SITE_SUPERVISOR") {
      const isAllowed =
        pathname === "/" ||
        pathname === "/overview" ||
        pathname.startsWith("/projects");
      if (!isAllowed) {
        router.replace("/overview");
      }
    }
  }, [pathname, router]);

  // Background token verification once per session mount (does NOT block UI or re-trigger on route navigation)
  useEffect(() => {
    const token = getStoredToken();
    if (!token) return;

    let isMounted = true;
    apiGetMe()
      .then((me) => {
        if (!isMounted) return;
        setAuthorized(true);
        const role = me?.role || "";
        if (role === "Site Supervisor" || role === "SITE_SUPERVISOR") {
          const isAllowed =
            pathname === "/" ||
            pathname === "/overview" ||
            pathname.startsWith("/projects");
          if (!isAllowed) {
            router.replace("/overview");
          }
        }
      })
      .catch((err: any) => {
        if (!isMounted) return;
        const status = err?.status;
        const msg = (err?.message || "").toLowerCase();
        if (
          status === 401 ||
          status === 403 ||
          msg.includes("expired") ||
          msg.includes("401") ||
          msg.includes("403") ||
          msg.includes("not authenticated") ||
          msg.includes("unauthorized")
        ) {
          clearStoredToken();
          setAuthorized(false);
          window.location.replace("/login");
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (authorized === false) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-slate-900 border-t-transparent animate-spin" />
          <span className="text-xs text-slate-500 font-medium">Redirecting to login...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col lg:flex-row antialiased selection:bg-indigo-600 selection:text-white">
      {/* Sidebar Navigation */}
      <Sidebar />

      {/* Main Content Viewport */}
      <div className="flex-1 lg:pl-64 xl:pl-72 flex flex-col min-w-0 transition-all duration-300">
        <main className="flex-1 p-4 sm:p-6 md:p-8 lg:p-10 max-w-[1600px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
