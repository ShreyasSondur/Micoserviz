"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { HomeAutomationIcon } from "@/assets/icons";
import { apiLogin, API_BASE_URL, checkBackendHealth } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

  useEffect(() => {
    checkBackendHealth().then((res) => {
      setBackendOnline(res.ok);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage("");

    try {
      const trimmed = usernameOrEmail.trim();
      const res = await apiLogin(trimmed, password);

      if (res.requires_otp) {
        const destEmail = res.email || trimmed;
        if (typeof window !== "undefined") {
          sessionStorage.setItem("auth_email", destEmail);
        }
        router.push(`/otp?email=${encodeURIComponent(destEmail)}`);
      } else {
        router.push("/overview");
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Authentication failed. Check your credentials or backend connection.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="min-h-screen w-full bg-[#f8fafc] text-slate-900 flex flex-col justify-center items-center py-12 px-4 sm:px-6 selection:bg-slate-900 selection:text-white">
      {/* Main Authentication Card */}
      <div className="w-full max-w-sm">
        {/* Brand Header */}
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center shadow-xs">
            <HomeAutomationIcon className="w-4.5 h-4.5 text-white" />
          </div>
          <span className="text-sm font-bold tracking-tight text-slate-900">
            MicroService ERP
          </span>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-7 sm:p-8 shadow-xs">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Universal Sign In
            </h1>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Enter your admin or registered employee credentials. A secure 6-digit OTP will be dispatched to your email.
            </p>
          </div>

          {/* Backend Connection Indicator */}
          <div className="mb-4 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200/80 flex items-center justify-between text-[11px]">
            <span className="text-slate-500 truncate max-w-[200px]" title={API_BASE_URL}>
              API: <span className="font-mono text-slate-700 font-medium">{API_BASE_URL}</span>
            </span>
            <span
              className={`inline-flex items-center gap-1 font-medium ${backendOnline === true
                ? "text-emerald-600"
                : backendOnline === false
                  ? "text-rose-600"
                  : "text-slate-400"
                }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${backendOnline === true
                  ? "bg-emerald-500 animate-pulse"
                  : backendOnline === false
                    ? "bg-rose-500"
                    : "bg-slate-300"
                  }`}
              />
              {backendOnline === true ? "Online" : backendOnline === false ? "Offline" : "Checking..."}
            </span>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2 animate-in fade-in duration-150">
              <svg className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email or Username */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Email or Username
              </label>
              <input
                type="text"
                required
                autoComplete="username"
                value={usernameOrEmail}
                onChange={(e) => setUsernameOrEmail(e.target.value)}
                placeholder="e.g. name@company.com or username"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-colors"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-3.5 pr-10 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  {showPassword ? (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                      <line x1="2" y1="2" x2="22" y2="22" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium transition-colors shadow-xs cursor-pointer flex items-center justify-center gap-2 disabled:opacity-75"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin w-4 h-4 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>Sending 6-Digit OTP...</span>
                  </>
                ) : (
                  <span>Continue to Verification</span>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Access Notice */}
        <p className="text-center text-xs text-slate-400 mt-4">
          Strict Security: Only accounts created by the Administrator can log in.
        </p>
      </div>
    </div>
  );
}
