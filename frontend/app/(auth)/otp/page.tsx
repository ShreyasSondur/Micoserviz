"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { HomeAutomationIcon } from "@/assets/icons";
import { apiVerifyOTP, apiResendOTP, API_BASE_URL } from "@/lib/api";

function OTPVerificationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [resendStatus, setResendStatus] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const paramEmail = searchParams.get("email");
    let currentEmail = "";
    if (paramEmail) {
      currentEmail = paramEmail;
      setEmail(paramEmail);
    } else if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem("auth_email");
      if (stored) {
        currentEmail = stored;
        setEmail(stored);
      }
    }

    if (!currentEmail && typeof window !== "undefined") {
      // If no email context, redirect back to login
      router.push("/login");
    }

    // Auto-focus the first input
    inputRefs.current[0]?.focus();
  }, [searchParams, router]);

  // Cooldown countdown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // If all 6 digits filled, trigger auto-verification
    if (value && index === 5) {
      const full = newOtp.join("");
      if (full.length === 6) {
        handleVerifyDirect(full);
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const newOtp = [...otp];
    for (let i = 0; i < pasted.length; i++) {
      newOtp[i] = pasted[i];
    }
    setOtp(newOtp);

    // Focus last filled box
    const focusIdx = Math.min(pasted.length, 5);
    inputRefs.current[focusIdx]?.focus();

    if (pasted.length === 6) {
      handleVerifyDirect(pasted);
    }
  };

  const handleVerifyDirect = async (code: string) => {
    if (code.length < 6) {
      setErrorMessage("Please enter the complete 6-digit code.");
      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      await apiVerifyOTP(email, code);
      router.push("/overview");
    } catch (err: any) {
      setErrorMessage(err?.message || "Invalid or expired verification code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    handleVerifyDirect(otp.join(""));
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || !email) return;

    try {
      setErrorMessage("");
      const res = await apiResendOTP(email);
      setResendStatus(res.message || "A new 6-digit code has been dispatched to your email.");
      setResendCooldown(45); // 45 seconds cooldown
      setTimeout(() => setResendStatus(""), 6000);
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to resend verification code");
    }
  };

  const isMockDomain = email.toLowerCase().endsWith("@microservice.io");

  return (
    <div className="min-h-screen w-full bg-[#f8fafc] text-slate-900 flex flex-col justify-between items-center py-10 px-4 sm:px-6 selection:bg-slate-900 selection:text-white">
      {/* Top Header */}
      <div className="w-full max-w-sm flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center shadow-xs">
            <HomeAutomationIcon className="w-4.5 h-4.5 text-white" />
          </div>
          <span className="text-sm font-bold tracking-tight text-slate-900">
            MicroService ERP
          </span>
        </div>
        <span className="text-xs text-slate-400 font-medium">Security Verification</span>
      </div>

      {/* Main Card */}
      <div className="w-full max-w-sm my-auto">
        <div className="bg-white border border-slate-200/90 rounded-2xl p-7 sm:p-8 shadow-xs">
          <div className="mb-6">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Enter Verification Code
            </h1>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              We sent a 6-digit verification code to{" "}
              <strong className="text-slate-800 font-semibold break-all">{email || "your email"}</strong>
              {isMockDomain && (
                <span className="block mt-1 text-[11px] text-indigo-600 font-medium bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                  (Dispatched to active recipient: servizwebsite@gmail.com)
                </span>
              )}
            </p>
          </div>

          {/* Backend Connection Indicator */}
          <div className="mb-4 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200/80 text-[11px] text-slate-500 truncate" title={API_BASE_URL}>
            API Endpoint: <span className="font-mono text-slate-700 font-medium">{API_BASE_URL}</span>
          </div>

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

          {resendStatus && (
            <div className="mb-4 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 animate-in fade-in duration-150">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>{resendStatus}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleVerify} className="space-y-5">
            {/* 6 Square Inputs */}
            <div className="flex items-center justify-between gap-2" onPaste={handlePaste}>
              {otp.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => {
                    inputRefs.current[idx] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  className="w-11 h-12 text-center text-lg font-bold font-mono rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 transition-colors shadow-2xs"
                />
              ))}
            </div>

            {/* Verify Button */}
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
                  <span>Verifying Code...</span>
                </>
              ) : (
                <span>Verify and Continue</span>
              )}
            </button>
          </form>

          {/* Helper Links */}
          <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col items-center gap-2.5 text-xs text-slate-500">
            <div>
              <span>Didn't receive a code? </span>
              <button
                type="button"
                onClick={handleResend}
                disabled={resendCooldown > 0}
                className="text-slate-900 font-semibold hover:underline cursor-pointer disabled:opacity-50 disabled:no-underline"
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Click to resend"}
              </button>
            </div>
            <Link
              href="/login"
              className="text-slate-500 hover:text-slate-800 transition-colors text-xs"
            >
              ← Back to sign in
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-[11px] text-slate-400">
        TechnoLOGI Smart Automation &bull; MicroService ERP
      </div>
    </div>
  );
}

export default function OTPPage() {
  return (
    <Suspense fallback={<div className="min-h-screen w-full bg-[#f8fafc]" />}>
      <OTPVerificationContent />
    </Suspense>
  );
}
