"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { getStoredToken, clearStoredToken, apiGetMe } from "@/lib/api";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState<boolean | null>(() => {
    if (typeof window !== "undefined") {
      return !!getStoredToken();
    }
    return null;
  });

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setAuthorized(false);
      window.location.replace("/login");
      return;
    }

    let isMounted = true;
    const timeout = setTimeout(() => {
      if (isMounted) {
        // Fallback: if backend check takes too long, grant access if user data exists or token is present
        console.warn("Session verification timed out, continuing with session");
        setAuthorized(true);
      }
    }, 2500);

    // Verify token validity with backend
    apiGetMe()
      .then((me) => {
        clearTimeout(timeout);
        if (isMounted) {
          setAuthorized(true);
          // Route Guard for Site Supervisor: only Overview and Projects allowed
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
        }
      })
      .catch((err: any) => {
        clearTimeout(timeout);
        console.warn("Session verification error:", err?.message);
        const status = err?.status;
        const msg = (err?.message || "").toLowerCase();
        
        // If 401, 403, expired, or invalid account
        if (
          status === 401 ||
          status === 403 ||
          msg.includes("expired") ||
          msg.includes("401") ||
          msg.includes("403") ||
          msg.includes("missing") ||
          msg.includes("not authenticated") ||
          msg.includes("does not exist") ||
          msg.includes("unauthorized")
        ) {
          clearStoredToken();
          if (isMounted) {
            setAuthorized(false);
            window.location.replace("/login");
          }
        } else {
          // If backend connection issue (e.g. offline / network error), allow access to cached session
          if (isMounted) setAuthorized(true);
        }
      });

    return () => {
      isMounted = false;
      clearTimeout(timeout);
    };
  }, [pathname, router]);

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

  if (authorized === null) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-slate-900 border-t-transparent animate-spin" />
          <span className="text-xs text-slate-500 font-medium">Verifying session...</span>
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
