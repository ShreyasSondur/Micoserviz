"use client";

import { getUserRole, isAdmin } from "@/lib/api";
import { AdminPasswordModal } from "@/components";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  PettyCashTransaction,
  CreditLoanItem,
  PettyCashType,
  getStoredPettyCash,
  getStoredCreditLoans,
  fetchPettyCashFromBackend,
  createPettyCashInBackend,
  deletePettyCashFromBackend,
  fetchCreditLoansFromBackend,
  createCreditLoanInBackend,
  deleteCreditLoanFromBackend,
  apiDownloadInvoiceByNumber,
  apiDownloadPettyCashExcel,
  apiDownloadCreditLoansExcel,
  apiDownloadPettyDocument,
  apiDownloadLoanDocument,
  calculatePettyBalance,
  calculateTotalCreditLoans,
} from "@/lib/cashflowStore";
import { fetchInvoicesFromBackend, getStoredInvoices, InvoiceItem as Invoice } from "@/lib/invoicesStore";
import { addActivityLog } from "@/lib/logsStore";

export default function CashFlowPage() {
  const [pettyCash, setPettyCash] = useState<PettyCashTransaction[]>([]);
  const [creditLoans, setCreditLoans] = useState<CreditLoanItem[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  // Admin Security Verification Modal State
  const [adminAuthModal, setAdminAuthModal] = useState<{
    isOpen: boolean;
    title: string;
    description?: string;
    actionLabel?: string;
    actionType?: "danger" | "warning" | "primary";
    onSuccess: () => Promise<void> | void;
  }>({
    isOpen: false,
    title: "",
    onSuccess: () => {},
  });
  const [toastType, setToastType] = useState<"success" | "error">("success");

  // Filters
  const [pettyFilter, setPettyFilter] = useState<"ALL" | "Cash In" | "Cash Out">("ALL");
  const [pettySearch, setPettySearch] = useState("");
  const [loanSearch, setLoanSearch] = useState("");

  // Date Filters
  const [pettyDateFilter, setPettyDateFilter] = useState<string>("");
  const [loanDateFilter, setLoanDateFilter] = useState<string>("");

  // File Uploads
  const [pettyFile, setPettyFile] = useState<File | null>(null);
  const [loanFile, setLoanFile] = useState<File | null>(null);


  // Modals
  const [userRole, setUserRole] = useState<string>("");
  useEffect(() => {
    const syncRole = () => setUserRole(getUserRole());
    syncRole();
    window.addEventListener("auth_user_change", syncRole);
    return () => window.removeEventListener("auth_user_change", syncRole);
  }, []);

  const [isPettyModalOpen, setIsPettyModalOpen] = useState(false);
  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State: Petty Cash (Only Direction, Amount, Description, Invoice)
  const [pettyType, setPettyType] = useState<PettyCashType>("Cash In");
  const [pettyAmount, setPettyAmount] = useState("");
  const [pettyDescription, setPettyDescription] = useState("");
  const [pettyInvoice, setPettyInvoice] = useState("");

  // Form State: Credit & Loan (Only Short Description, Amount, Invoice)
  const [loanDescription, setLoanDescription] = useState("");
  const [loanAmount, setLoanAmount] = useState("");
  const [loanInvoice, setLoanInvoice] = useState("");

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToastMsg(msg);
    setToastType(type);
    setTimeout(() => setToastMsg(""), 3500);
  };

  // Load all data dynamically from backend API
  const loadData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [pettyRes, loansRes, invRes] = await Promise.allSettled([
        fetchPettyCashFromBackend(pettyFilter, pettySearch, pettyDateFilter),
        fetchCreditLoansFromBackend(loanSearch, loanDateFilter),
        fetchInvoicesFromBackend(),
      ]);

      if (pettyRes.status === "fulfilled") {
        setPettyCash(pettyRes.value.items);
      } else {
        console.warn("Could not fetch petty cash from backend, using local store:", pettyRes.reason);
        setPettyCash(getStoredPettyCash());
      }

      if (loansRes.status === "fulfilled") {
        setCreditLoans(loansRes.value.items);
      } else {
        console.warn("Could not fetch credit loans from backend, using local store:", loansRes.reason);
        setCreditLoans(getStoredCreditLoans());
      }

      if (invRes.status === "fulfilled") {
        setInvoices(invRes.value.items);
      } else {
        console.warn("Could not fetch invoices from backend, using local store:", invRes.reason);
        setInvoices(getStoredInvoices());
      }

      if (isManualRefresh) {
        showToast("Cash Flow data synchronized with backend!");
      }
    } catch (err: any) {
      console.error("Load cashflow data error:", err);
      setPettyCash(getStoredPettyCash());
      setCreditLoans(getStoredCreditLoans());
      setInvoices(getStoredInvoices());
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  
  useEffect(() => {
    loadData();
  }, [pettyFilter, pettySearch, pettyDateFilter, loanSearch, loanDateFilter, loadData]);
  useEffect(() => {
    loadData();

    const handleCashflowUpdate = () => {
      setPettyCash(getStoredPettyCash());
      setCreditLoans(getStoredCreditLoans());
    };

    const handleInvoicesUpdate = () => {
      setInvoices(getStoredInvoices());
    };

    window.addEventListener("cashflow_store_update", handleCashflowUpdate);
    window.addEventListener("invoices_store_update", handleInvoicesUpdate);

    return () => {
      window.removeEventListener("cashflow_store_update", handleCashflowUpdate);
      window.removeEventListener("invoices_store_update", handleInvoicesUpdate);
    };
  }, [loadData]);

  // Balances
  const currentPettyBalance = useMemo(() => calculatePettyBalance(pettyCash), [pettyCash]);
  const totalCashIn = useMemo(() => {
    return pettyCash.filter((t) => t.type === "Cash In").reduce((s, t) => s + t.amount, 0);
  }, [pettyCash]);
  const totalCashOut = useMemo(() => {
    return pettyCash.filter((t) => t.type === "Cash Out").reduce((s, t) => s + t.amount, 0);
  }, [pettyCash]);
  const totalCreditLoanAmount = useMemo(() => calculateTotalCreditLoans(creditLoans), [creditLoans]);

  // Real-time Negative Balance Validation for Cash Out
  const parsedPettyAmount = parseFloat(pettyAmount) || 0;
  const isCashOutExceeding = pettyType === "Cash Out" && parsedPettyAmount > currentPettyBalance;

  // Filtered Petty Cash - already filtered by backend
  const filteredPettyCash = pettyCash;

  // Filtered Credit Loans - already filtered by backend
  const filteredCreditLoans = creditLoans;

  // Download Invoice Handler - Pure Backend PDF generator
  const handleDownloadInvoice = async (invoiceNumber: string) => {
    try {
      showToast(`Downloading invoice ${invoiceNumber}...`);
      await apiDownloadInvoiceByNumber(invoiceNumber, `Invoice_${invoiceNumber}.pdf`);
      showToast(`Downloaded Invoice ${invoiceNumber}`);
    } catch (err: any) {
      console.error("Download invoice error:", err);
      showToast(`Download failed: ${err?.message || "Could not retrieve invoice document"}`, "error");
    }
  };

  // Submit Petty Cash
  const handleSavePettyCash = async (e: React.FormEvent) => {
    e.preventDefault();

    if (parsedPettyAmount <= 0) {
      showToast("Please enter a valid positive amount", "error");
      return;
    }

    if (!pettyDescription.trim()) {
      showToast("Please enter a description", "error");
      return;
    }

    // STRICT NEGATIVE BALANCE GUARDRAIL
    if (pettyType === "Cash Out" && parsedPettyAmount > currentPettyBalance) {
      showToast(
        `Not possible: Cash Out (AED ${parsedPettyAmount.toLocaleString()}) exceeds total balance (AED ${currentPettyBalance.toLocaleString()})`,
        "error"
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await createPettyCashInBackend({
        type: pettyType,
        amount: parsedPettyAmount,
        description: pettyDescription.trim(),
        invoiceNumber: pettyInvoice.trim() || undefined,
        file: pettyFile,
      });

      setPettyCash((prev) => [created, ...prev.filter((p) => p.id !== created.id)]);

      // Reset Form
      setPettyAmount("");
      setPettyDescription("");
      setPettyInvoice("");
      setPettyFile(null);
      setIsPettyModalOpen(false);

      showToast(`${pettyType} of AED ${parsedPettyAmount.toLocaleString()} recorded!`);
      addActivityLog({
        projectName: "—",
        module: "Cashflow",
        action: `Recorded ${pettyType} of AED ${parsedPettyAmount.toLocaleString()} (${pettyDescription.trim() || "Petty cash"})`,
      });
    } catch (err: any) {
      console.error("Create petty cash error:", err);
      showToast(`Error: ${err?.message || "Failed to record cash flow"}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Credit / Loan
  const handleSaveCreditLoan = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsedAmount = parseFloat(loanAmount) || 0;
    if (parsedAmount <= 0) {
      showToast("Please enter a valid loan/credit amount", "error");
      return;
    }

    if (!loanDescription.trim()) {
      showToast("Please enter a short description", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await createCreditLoanInBackend({
        description: loanDescription.trim(),
        amount: parsedAmount,
        invoiceNumber: loanInvoice.trim() || undefined,
        file: loanFile,
      });

      setCreditLoans((prev) => [created, ...prev.filter((l) => l.id !== created.id)]);

      // Reset Form
      setLoanDescription("");
      setLoanAmount("");
      setLoanInvoice("");
      setLoanFile(null);
      setIsLoanModalOpen(false);

      showToast(`Credit entry of AED ${parsedAmount.toLocaleString()} added!`);
      addActivityLog({
        projectName: "—",
        module: "Cashflow",
        action: `Added credit/loan entry of AED ${parsedAmount.toLocaleString()} (${loanDescription.trim()})`,
      });
    } catch (err: any) {
      console.error("Create credit loan error:", err);
      showToast(`Error: ${err?.message || "Failed to add credit entry"}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Petty Cash (Requires Admin Password)
  const handleDeletePettyCash = (id: string, desc: string) => {
    setAdminAuthModal({
      isOpen: true,
      title: "Authorize Petty Cash Deletion",
      description: `Enter Admin password to remove petty cash transaction "${desc || "transaction"}".`,
      actionLabel: "Delete Transaction",
      actionType: "danger",
      onSuccess: async () => {
        try {
          await deletePettyCashFromBackend(id);
          setPettyCash((prev) => prev.filter((t) => t.id !== id));
          showToast("Petty cash entry removed");
          addActivityLog({
            projectName: "—",
            module: "Cashflow",
            action: `Deleted petty cash transaction "${desc || "transaction"}"`,
          });
        } catch (err: any) {
          console.error("Delete petty cash error:", err);
          showToast(`Error removing entry: ${err?.message || "Failed"}`, "error");
        }
      },
    });
  };

  // Delete Loan (Requires Admin Password)
  const handleDeleteLoan = (id: string, desc: string) => {
    setAdminAuthModal({
      isOpen: true,
      title: "Authorize Credit / Loan Deletion",
      description: `Enter Admin password to remove credit entry "${desc || "entry"}".`,
      actionLabel: "Delete Entry",
      actionType: "danger",
      onSuccess: async () => {
        try {
          await deleteCreditLoanFromBackend(id);
          setCreditLoans((prev) => prev.filter((l) => l.id !== id));
          showToast("Credit entry removed");
          addActivityLog({
            projectName: "—",
            module: "Cashflow",
            action: `Deleted credit/loan entry "${desc || "entry"}"`,
          });
        } catch (err: any) {
          console.error("Delete credit loan error:", err);
          showToast(`Error removing entry: ${err?.message || "Failed"}`, "error");
        }
      },
    });
  };

  return (
    <div className="space-y-6 sm:space-y-7 animate-in fade-in duration-200 pb-20 max-w-7xl mx-auto">
      {/* Toast Alert */}
      {toastMsg && (
        <div
          className={`fixed top-5 right-5 z-50 px-4 py-2.5 rounded-xl shadow-2xl text-xs sm:text-sm font-medium border flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200 ${
            toastType === "error"
              ? "bg-rose-950 text-white border-rose-800"
              : "bg-slate-900 text-white border-slate-800"
          }`}
        >
          <span className={toastType === "error" ? "text-rose-400 font-bold" : "text-emerald-400 font-bold"}>
            {toastType === "error" ? "✕" : "✓"}
          </span>
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Cash Flow
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Track petty cash overflow and credit card transactions with verified invoice documents.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">


          <button
            type="button"
            onClick={() => {
              setPettyType("Cash In");
              setIsPettyModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-xs transition-all cursor-pointer active:scale-98"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Record Cash Flow</span>
          </button>

          <button
            type="button"
            onClick={() => setIsLoanModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0c1033] hover:bg-[#151b54] text-white text-xs sm:text-sm font-semibold rounded-xl shadow-xs transition-all cursor-pointer active:scale-98"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <rect width="20" height="14" x="2" y="5" rx="2" />
              <line x1="2" x2="22" y1="10" y2="10" />
            </svg>
            <span>Add Credit / Loan</span>
          </button>
        </div>
      </div>

      {/* EXACTLY 2 TOP CARDS AS REQUESTED:
          1) Available Petty Cash Total
          2) Credit Card Total */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        {/* Card 1: Available Petty Cash Total */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 flex items-center gap-5 hover:border-slate-300 transition-colors">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100/70 flex items-center justify-center flex-shrink-0 shadow-2xs">
            <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect width="20" height="12" x="2" y="6" rx="2" />
              <circle cx="12" cy="12" r="2" />
              <path d="M6 12h.01M18 12h.01" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Available Petty Cash Total
            </span>
            <span className="text-3xl sm:text-4xl font-extrabold text-emerald-600 tracking-tight block truncate">
              AED {currentPettyBalance.toLocaleString()}
            </span>
            <span className="text-xs text-slate-400 font-medium block mt-1">
              +{totalCashIn.toLocaleString()} Cash In &nbsp;•&nbsp; -{totalCashOut.toLocaleString()} Cash Out
            </span>
          </div>
        </div>

        {/* Card 2: Credit Card Total */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 flex items-center gap-5 hover:border-slate-300 transition-colors">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 border border-amber-100/70 flex items-center justify-center flex-shrink-0 shadow-2xs">
            <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect width="20" height="14" x="2" y="5" rx="2" />
              <line x1="2" x2="22" y1="10" y2="10" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Credit Card Total
            </span>
            <span className="text-3xl sm:text-4xl font-extrabold text-amber-600 tracking-tight block truncate">
              AED {totalCreditLoanAmount.toLocaleString()}
            </span>
            <span className="text-xs text-slate-400 font-medium block mt-1">
              {creditLoans.length} total active credit / loan facilities
            </span>
          </div>
        </div>
      </div>

      {/* =========================================================================
          TWO-SECTION CLEAN SPLIT: LEFT (Petty Cash) vs RIGHT (Credit Card / Loans)
          Both structured as clean tables with downloadable invoices
          ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* =======================================================================
            LEFT SECTION: PETTY CASH
            ======================================================================= */}
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-xs p-5 sm:p-6 space-y-5">
          {/* Section Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                  Petty Cash
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Cash in and out transactions with invoice downloads
              </p>
            </div>

            <div className="px-3 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold self-start sm:self-auto">
              Balance: AED {currentPettyBalance.toLocaleString()}
            </div>

          </div>

          {/* Search & Filter */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="relative flex-1 min-w-[150px]">
              <input
                type="text"
                placeholder="Search description, invoice..."
                value={pettySearch}
                onChange={(e) => setPettySearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
              <svg
                className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={pettyDateFilter}
                onChange={(e) => setPettyDateFilter(e.target.value)}
                className="text-xs bg-white border border-slate-200 rounded-xl px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-700"
              >
                <option value="">All Time</option>
                <option value="7d">Last 7 Days</option>
                <option value="1m">Last Month</option>
                <option value="1y">Last Year</option>
              </select>
              <button
                onClick={() => apiDownloadPettyCashExcel(pettyFilter, pettySearch, pettyDateFilter)}
                title="Export Filtered Data"
                className="text-xs flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 px-2.5 py-1.5 rounded-xl hover:bg-slate-50 transition-colors shadow-2xs font-semibold"
              >
                <svg className="w-3.5 h-3.5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                <span className="hidden sm:inline">Export</span>
              </button>
            </div>

            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl text-xs font-medium">
              <button
                type="button"
                onClick={() => setPettyFilter("ALL")}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  pettyFilter === "ALL" ? "bg-white text-slate-900 shadow-2xs font-bold" : "text-slate-600"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setPettyFilter("Cash In")}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  pettyFilter === "Cash In" ? "bg-white text-emerald-700 shadow-2xs font-bold" : "text-slate-600"
                }`}
              >
                Cash In
              </button>
              <button
                type="button"
                onClick={() => setPettyFilter("Cash Out")}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  pettyFilter === "Cash Out" ? "bg-white text-rose-700 shadow-2xs font-bold" : "text-slate-600"
                }`}
              >
                Cash Out
              </button>
            </div>
          </div>

          {/* Clean Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[500px]">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 pl-2 pr-2">Date & Type</th>
                  <th className="py-3 px-2">Description</th>
                  <th className="py-3 px-2">Invoice</th>
                  <th className="py-3 px-2 text-right">Amount</th>
                  <th className="py-3 pr-2 pl-2 text-right w-10">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/80 text-xs">
                {filteredPettyCash.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-slate-400">
                      <p className="font-semibold text-slate-700">No cash transactions</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Click "Record Cash Flow" to add an entry
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredPettyCash.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors group">
                      {/* Date & Type */}
                      <td className="py-3.5 pl-2 pr-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                              item.type === "Cash In"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-rose-100 text-rose-700"
                            }`}
                          >
                            {item.type === "Cash In" ? "↓" : "↑"}
                          </span>
                          <div>
                            <span
                              className={`font-semibold block ${
                                item.type === "Cash In" ? "text-emerald-700" : "text-slate-800"
                              }`}
                            >
                              {item.type}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">{item.date}</span>
                          </div>
                        </div>
                      </td>

                      {/* Description */}
                      <td className="py-3.5 px-2 font-medium text-slate-800">
                        {item.description}
                      </td>

                      {/* Downloadable Invoice */}
                      <td className="py-3.5 px-2">
                        {item.invoiceNumber ? (
                          <button
                            type="button"
                            onClick={() => handleDownloadInvoice(item.invoiceNumber!)}
                            title={`Click to download invoice ${item.invoiceNumber}`}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100/80 border border-indigo-200 text-indigo-800 font-mono text-[11px] font-semibold transition-all cursor-pointer shadow-2xs hover:shadow-xs group/inv"
                          >
                            <svg className="w-3.5 h-3.5 text-indigo-600 group-hover/inv:translate-y-0.5 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="7 10 12 15 17 10" />
                              <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            <span>{item.invoiceNumber}</span>
                          </button>
                        ) : (
                          <span className="text-slate-300 text-[11px]">—</span>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="py-3.5 px-2 text-right">
                        <span
                          className={`font-bold font-mono ${
                            item.type === "Cash In" ? "text-emerald-600" : "text-rose-600"
                          }`}
                        >
                          {item.type === "Cash In" ? "+" : "-"}AED {item.amount.toLocaleString()}
                        </span>
                      </td>

                      {/* Delete / Download */}
                      <td className="py-3.5 pr-2 pl-2 text-right flex items-center justify-end gap-1">
                        {item.fileName && (
                          <button
                            type="button"
                            onClick={() => apiDownloadPettyDocument(item.id, item.fileName)}
                            title={`Download ${item.fileName}`}
                            className="w-7 h-7 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 inline-flex items-center justify-center transition-colors cursor-pointer"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                          </button>
                        )}
                        {isAdmin() && (
                          <button
                            type="button"
                            onClick={() => handleDeletePettyCash(item.id, item.description)}
                            title="Delete transaction"
                            className="w-7 h-7 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 inline-flex items-center justify-center transition-colors cursor-pointer"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* =======================================================================
            RIGHT SECTION: CREDIT CARDS & LOANS
            (Minimal, Professional Icon - NO EMOJIS, Dynamic Backend Sync)
            ======================================================================= */}
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-xs p-5 sm:p-6 space-y-5">
          {/* Section Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                  Credit Card & Loans
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Credit card expenditures and loan entries with invoice downloads
              </p>
            </div>

            <div className="px-3 py-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold self-start sm:self-auto">
              Total: AED {totalCreditLoanAmount.toLocaleString()}
            </div>

          </div>

          {/* Search & Filter */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="relative flex-1 min-w-[150px]">
              <input
                type="text"
                placeholder="Search description, invoice..."
                value={loanSearch}
              onChange={(e) => setLoanSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
            <svg
              className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={loanDateFilter}
                onChange={(e) => setLoanDateFilter(e.target.value)}
                className="text-xs bg-white border border-slate-200 rounded-xl px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-slate-700"
              >
                <option value="">All Time</option>
                <option value="7d">Last 7 Days</option>
                <option value="1m">Last Month</option>
                <option value="1y">Last Year</option>
              </select>
              <button
                onClick={() => apiDownloadCreditLoansExcel(loanSearch, loanDateFilter)}
                title="Export Filtered Data"
                className="text-xs flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 px-2.5 py-1.5 rounded-xl hover:bg-slate-50 transition-colors shadow-2xs font-semibold"
              >
                <svg className="w-3.5 h-3.5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                <span className="hidden sm:inline">Export</span>
              </button>
            </div>
          </div>

          {/* Clean Table: Identical layout to Petty Cash */}
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[500px]">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 pl-2 pr-2">Date & Type</th>
                  <th className="py-3 px-2">Description</th>
                  <th className="py-3 px-2">Invoice</th>
                  <th className="py-3 px-2 text-right">Amount</th>
                  <th className="py-3 pr-2 pl-2 text-right w-10">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/80 text-xs">
                {filteredCreditLoans.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-slate-400">
                      <p className="font-semibold text-slate-700">No credit card or loan entries</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Click "Add Credit / Loan" to record an entry
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredCreditLoans.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors group">
                      {/* Date & Type (Decent Minimal SVG Icon) */}
                      <td className="py-3.5 pl-2 pr-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg bg-amber-100/80 text-amber-800 flex items-center justify-center flex-shrink-0">
                            <svg
                              className="w-3.5 h-3.5 text-amber-800"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <rect width="20" height="14" x="2" y="5" rx="2" />
                              <line x1="2" x2="22" y1="10" y2="10" />
                            </svg>
                          </span>
                          <div>
                            <span className="font-semibold text-amber-800 block">Credit</span>
                            <span className="text-[10px] text-slate-400 font-mono">{item.date}</span>
                          </div>
                        </div>
                      </td>

                      {/* Description */}
                      <td className="py-3.5 px-2 font-medium text-slate-800">
                        {item.description}
                      </td>

                      {/* Downloadable Invoice */}
                      <td className="py-3.5 px-2">
                        {item.invoiceNumber ? (
                          <button
                            type="button"
                            onClick={() => handleDownloadInvoice(item.invoiceNumber!)}
                            title={`Click to download invoice ${item.invoiceNumber}`}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100/80 border border-indigo-200 text-indigo-800 font-mono text-[11px] font-semibold transition-all cursor-pointer shadow-2xs hover:shadow-xs group/inv"
                          >
                            <svg className="w-3.5 h-3.5 text-indigo-600 group-hover/inv:translate-y-0.5 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="7 10 12 15 17 10" />
                              <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            <span>{item.invoiceNumber}</span>
                          </button>
                        ) : (
                          <span className="text-slate-300 text-[11px]">—</span>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="py-3.5 px-2 text-right">
                        <span className="font-bold font-mono text-amber-700">
                          AED {item.amount.toLocaleString()}
                        </span>
                      </td>

                      {/* Delete / Download */}
                      <td className="py-3.5 pr-2 pl-2 text-right flex items-center justify-end gap-1">
                        {item.fileName && (
                          <button
                            type="button"
                            onClick={() => apiDownloadLoanDocument(item.id, item.fileName)}
                            title={`Download ${item.fileName}`}
                            className="w-7 h-7 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 inline-flex items-center justify-center transition-colors cursor-pointer"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                          </button>
                        )}
                        {isAdmin() && (
                          <button
                            type="button"
                            onClick={() => handleDeleteLoan(item.id, item.description)}
                            title="Delete credit entry"
                            className="w-7 h-7 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 inline-flex items-center justify-center transition-colors cursor-pointer"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* =========================================================================
          MODAL 1: RECORD PETTY CASH (Direction, Amount, Invoice Dropdown, Description)
          ========================================================================= */}
      {isPettyModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setIsPettyModalOpen(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full p-6 sm:p-7 space-y-5 animate-in zoom-in-95 duration-200 overflow-visible"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Record Cash Flow
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Deposit Cash In or disburse Cash Out with invoice link
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPettyModalOpen(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSavePettyCash} className="space-y-4">
              {/* Type Switcher: Cash In vs Cash Out */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Direction <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPettyType("Cash In")}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      pettyType === "Cash In"
                        ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                        : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                    }`}
                  >
                    <span>↓</span>
                    <span>Cash In</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPettyType("Cash Out")}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      pettyType === "Cash Out"
                        ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                        : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                    }`}
                  >
                    <span>↑</span>
                    <span>Cash Out</span>
                  </button>
                </div>
              </div>

              {/* Current Available Balance Reference */}
              <div className="px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                <span className="text-slate-600 font-medium">Available Petty Cash:</span>
                <span className="font-extrabold text-slate-900 font-mono">
                  AED {currentPettyBalance.toLocaleString()}
                </span>
              </div>

              {/* Amount Input */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Amount (AED) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  placeholder="e.g. 5000"
                  value={pettyAmount}
                  onChange={(e) => setPettyAmount(e.target.value)}
                  className={`w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border font-mono font-bold focus:outline-none focus:ring-2 ${
                    isCashOutExceeding
                      ? "border-rose-400 bg-rose-50/50 text-rose-800 focus:ring-rose-500/20 focus:border-rose-500"
                      : "border-slate-200 text-slate-800 focus:ring-emerald-500/20 focus:border-emerald-500"
                  }`}
                />

                {/* STRICT USER RULE: NOT POSSIBLE IF CASH OUT EXCEEDS BALANCE */}
                {isCashOutExceeding && (
                  <div className="mt-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2.5 animate-in fade-in slide-in-from-top-1 duration-150">
                    <span className="text-base leading-none">⚠️</span>
                    <div>
                      <div className="font-bold text-rose-800">Not Possible</div>
                      <div className="text-[11px] text-rose-600 mt-0.5">
                        Cash Out amount exceeds the available petty cash balance of AED {currentPettyBalance.toLocaleString()}. Balance cannot go negative.
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Description <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Emergency electrical conduits"
                  value={pettyDescription}
                  onChange={(e) => setPettyDescription(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              {/* Link Invoice - Clean Select Dropdown ONLY */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Link Invoice (Optional)
                </label>
                <select
                  value={pettyInvoice}
                  onChange={(e) => setPettyInvoice(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white cursor-pointer"
                >
                  <option value="">-- None / Select Invoice --</option>
                  {invoices.map((inv) => (
                    <option key={inv.id} value={inv.invoiceNumber}>
                      {inv.invoiceNumber} - {inv.vendor || "Supplier"} (AED {inv.amount.toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>

              {/* Upload File (Optional for Cash In & Cash Out) */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Upload Receipt / Document (Optional)
                </label>
                <div className="relative">
                  <input
                    type="file"
                    onChange={(e) => setPettyFile(e.target.files?.[0] || null)}
                    className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3.5 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer border border-slate-200 rounded-xl p-1 bg-slate-50/50"
                  />
                </div>
                {pettyFile && (
                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                    <span className="truncate font-medium">📄 {pettyFile.name} ({(pettyFile.size / 1024).toFixed(1)} KB)</span>
                    <button
                      type="button"
                      onClick={() => setPettyFile(null)}
                      className="text-rose-600 hover:text-rose-800 font-bold ml-2 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsPettyModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCashOutExceeding || isSubmitting}
                  className={`px-6 py-2 text-xs font-semibold text-white rounded-xl shadow-xs transition-colors cursor-pointer ${
                    isCashOutExceeding || isSubmitting
                      ? "bg-slate-400 cursor-not-allowed opacity-60"
                      : "bg-[#0c1033] hover:bg-[#151b54]"
                  }`}
                >
                  {isSubmitting ? "Saving..." : isCashOutExceeding ? "Not Possible" : "Save Transaction"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: ADD CREDIT / LOAN (Short Description, Total Amount, Invoice Dropdown)
          ========================================================================= */}
      {isLoanModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setIsLoanModalOpen(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full p-6 sm:p-7 space-y-5 animate-in zoom-in-95 duration-200 overflow-visible"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Add Credit / Loan
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Record credit card or loan with linked invoice
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsLoanModalOpen(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSaveCreditLoan} className="space-y-4">
              {/* Short Description */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Short Description <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Corporate Visa - Hardware Procurement"
                  value={loanDescription}
                  onChange={(e) => setLoanDescription(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              {/* Total Number / Amount */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Total Number / Amount (AED) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  placeholder="e.g. 25000"
                  value={loanAmount}
                  onChange={(e) => setLoanAmount(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 text-slate-800 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              {/* Add Invoices - Clean Select Dropdown ONLY */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Add Invoices (Optional)
                </label>
                <select
                  value={loanInvoice}
                  onChange={(e) => setLoanInvoice(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white cursor-pointer"
                >
                  <option value="">-- None / Select Invoice --</option>
                  {invoices.map((inv) => (
                    <option key={inv.id} value={inv.invoiceNumber}>
                      {inv.invoiceNumber} - {inv.vendor || "Supplier"} (AED {inv.amount.toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>

              {/* Upload File (Optional for Credit / Loan) */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Upload Receipt / Statement (Optional)
                </label>
                <div className="relative">
                  <input
                    type="file"
                    onChange={(e) => setLoanFile(e.target.files?.[0] || null)}
                    className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3.5 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer border border-slate-200 rounded-xl p-1 bg-slate-50/50"
                  />
                </div>
                {loanFile && (
                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                    <span className="truncate font-medium">📄 {loanFile.name} ({(loanFile.size / 1024).toFixed(1)} KB)</span>
                    <button
                      type="button"
                      onClick={() => setLoanFile(null)}
                      className="text-rose-600 hover:text-rose-800 font-bold ml-2 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsLoanModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2 text-xs font-semibold text-white bg-[#0c1033] hover:bg-[#151b54] rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-60"
                >
                  {isSubmitting ? "Saving..." : "Save Credit / Loan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Password Security Modal */}
      <AdminPasswordModal
        isOpen={adminAuthModal.isOpen}
        onClose={() => setAdminAuthModal((prev) => ({ ...prev, isOpen: false }))}
        onSuccess={adminAuthModal.onSuccess}
        title={adminAuthModal.title}
        description={adminAuthModal.description}
        actionLabel={adminAuthModal.actionLabel}
        actionType={adminAuthModal.actionType}
      />
    </div>
  );
}


