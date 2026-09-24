"use client";

import React, { useState, useEffect, useRef } from "react";
import { apiVerifyAdminPassword } from "@/lib/api";

export interface AdminPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
  title?: string;
  description?: string;
  actionLabel?: string;
  actionType?: "danger" | "warning" | "primary";
  itemName?: string;
}

export function AdminPasswordModal({
  isOpen,
  onClose,
  onSuccess,
  title = "Admin Verification Required",
  description,
  actionLabel = "Confirm",
  actionType = "danger",
  itemName,
}: AdminPasswordModalProps) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPassword("");
      setError(null);
      setShowPassword(false);
      setIsVerifying(false);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!password.trim()) {
      setError("Please enter the admin password.");
      inputRef.current?.focus();
      return;
    }

    try {
      setIsVerifying(true);
      setError(null);
      await apiVerifyAdminPassword(password);
      onClose();
      await onSuccess();
    } catch (err: any) {
      setError(err?.message || "Incorrect admin password. Action denied.");
      setIsVerifying(false);
      inputRef.current?.focus();
    }
  };

  const isDanger = actionType === "danger";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={() => !isVerifying && onClose()}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full p-6 sm:p-7 space-y-5 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Icon */}
        <div className="flex items-start gap-3.5">
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${
              isDanger
                ? "bg-rose-100 text-rose-600 border border-rose-200/70"
                : actionType === "warning"
                ? "bg-amber-100 text-amber-700 border border-amber-200/70"
                : "bg-indigo-100 text-indigo-700 border border-indigo-200/70"
            }`}
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
              {title}
            </h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              {description ||
                (itemName
                  ? `Enter the Admin password to authorize modifying or deleting "${itemName}".`
                  : "Enter the Admin password to proceed with this privileged action.")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isVerifying}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">
              Admin Password <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                disabled={isVerifying}
                placeholder="Enter password configured in .env"
                className={`w-full px-3.5 py-2.5 pr-11 text-xs sm:text-sm rounded-xl border font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-all ${
                  error
                    ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20 bg-rose-50/20"
                    : "border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20"
                }`}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded transition-colors"
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
            {error && (
              <p className="text-[11px] font-semibold text-rose-600 mt-1.5 flex items-center gap-1 animate-in fade-in duration-150">
                <svg
                  className="w-3.5 h-3.5 flex-shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{error}</span>
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isVerifying}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isVerifying}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50 active:scale-98 ${
                isDanger
                  ? "bg-rose-600 hover:bg-rose-700"
                  : actionType === "warning"
                  ? "bg-amber-600 hover:bg-amber-700"
                  : "bg-indigo-600 hover:bg-indigo-700"
              }`}
            >
              {isVerifying ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <span>{actionLabel}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
