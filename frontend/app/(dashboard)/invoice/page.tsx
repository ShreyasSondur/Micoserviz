"use client";

import { getUserRole, isAdmin } from "@/lib/api";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  InvoiceItem,
  getStoredInvoices,
  fetchInvoicesFromBackend,
  createInvoiceInBackend,
  updateInvoiceInBackend,
  deleteInvoiceFromBackend,
  getInvoiceDownloadUrl,
  getInvoicePreviewUrl,
  apiDownloadInvoiceFile,
} from "@/lib/invoicesStore";
import { ThemeDatePicker, AdminPasswordModal } from "@/components";
import { addActivityLog } from "@/lib/logsStore";

export default function InvoicePage() {
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");

  // Modal State: Upload & Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<InvoiceItem | null>(null);

  // Modal State: Document Preview
  const [previewInvoice, setPreviewInvoice] = useState<InvoiceItem | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Modal State: Delete Confirmation
  const [invoiceToDelete, setInvoiceToDelete] = useState<InvoiceItem | null>(null);

  // Form State
  const [formInvoiceNo, setFormInvoiceNo] = useState("");
  const [formVendor, setFormVendor] = useState("");
  const [formDate, setFormDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [formAmount, setFormAmount] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelection = (file: File) => {
    if (file.size > 25 * 1024 * 1024) {
      setFormError("File size exceeds 25MB limit. Please select a smaller document.");
      showToast("File size exceeds 25MB limit.");
      return;
    }
    setFormError("");
    setSelectedFile(file);
    showToast(`Selected: ${file.name}`);
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3500);
  };

  // Pure Backend Fetching
  const loadBackendData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const res = await fetchInvoicesFromBackend();
      setInvoices(res.items);
      if (isManualRefresh) {
        showToast("Invoices refreshed from backend!");
      }
    } catch (err: any) {
      console.error("Backend fetch error:", err);
      const msg = err?.message || "Failed to reach backend API. Ensure backend is running.";
      setError(msg);
      // Fallback to cached items
      const cached = getStoredInvoices();
      if (cached.length > 0) {
        setInvoices(cached);
      }
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadBackendData();

    const handleStorageUpdate = () => {
      setInvoices(getStoredInvoices());
    };

    window.addEventListener("invoices_store_update", handleStorageUpdate);
    return () => {
      window.removeEventListener("invoices_store_update", handleStorageUpdate);
    };
  }, [loadBackendData]);

  // Load preview blob when previewInvoice changes
  useEffect(() => {
    if (!previewInvoice) {
      if (previewBlobUrl) {
        URL.revokeObjectURL(previewBlobUrl);
        setPreviewBlobUrl(null);
      }
      setPreviewLoading(false);
      setPreviewError(null);
      return;
    }

    let active = true;
    setPreviewLoading(true);
    setPreviewError(null);

    const loadBlob = async () => {
      try {
        const token = typeof window !== "undefined"
          ? localStorage.getItem("microservice_auth_token_v2") || sessionStorage.getItem("microservice_auth_token_v2")
          : null;
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const url = getInvoicePreviewUrl(previewInvoice.id);
        const res = await fetch(url, { headers });
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.detail || `Failed to load document (${res.status})`);
        }
        const blob = await res.blob();
        if (active) {
          const objUrl = URL.createObjectURL(blob);
          setPreviewBlobUrl(objUrl);
          setPreviewLoading(false);
        }
      } catch (err: any) {
        if (active) {
          console.error("Preview load error:", err);
          setPreviewError(err?.message || "Could not load document preview");
          setPreviewLoading(false);
        }
      }
    };

    loadBlob();

    return () => {
      active = false;
      if (previewBlobUrl) {
        URL.revokeObjectURL(previewBlobUrl);
      }
    };
  }, [previewInvoice]);

  const handleDownloadInvoice = async (inv: InvoiceItem) => {
    try {
      showToast(`Downloading ${inv.fileName || inv.invoiceNumber}...`);
      await apiDownloadInvoiceFile(inv.id, inv.fileName);
    } catch (err: any) {
      console.error("Download invoice error:", err);
      showToast(`Download failed: ${err?.message || "Error fetching file"}`);
    }
  };

  // Filtered List
  const filteredInvoices = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return invoices;
    return invoices.filter(
      (inv) =>
        inv.invoiceNumber.toLowerCase().includes(q) ||
        (inv.vendor && inv.vendor.toLowerCase().includes(q))
    );
  }, [invoices, searchQuery]);

  // Open modal to Upload new invoice (Defaults to today's date)
  const handleOpenUploadModal = () => {
    setEditingInvoice(null);
    setFormInvoiceNo(`INV-${new Date().getFullYear()}-${String(invoices.length + 101).padStart(3, "0")}`);
    setFormVendor("");
    setFormDate(new Date().toISOString().split("T")[0]);
    setFormAmount("");
    setSelectedFile(null);
    setFormError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    setIsModalOpen(true);
  };

  // Open modal to Edit existing invoice (Requires Admin Password)
  const handleOpenEditModal = (inv: InvoiceItem) => {
    setAdminAuthModal({
      isOpen: true,
      title: "Authorize Invoice Edit",
      description: `Enter Admin password to edit invoice "${inv.invoiceNumber}".`,
      actionLabel: "Unlock & Edit",
      actionType: "warning",
      onSuccess: () => {
        setEditingInvoice(inv);
        setFormInvoiceNo(inv.invoiceNumber);
        setFormVendor(inv.vendor || "");
        setFormDate(inv.date || new Date().toISOString().split("T")[0]);
        setFormAmount(inv.amount ? String(inv.amount) : "");
        setSelectedFile(null);
        setFormError("");
        if (fileInputRef.current) fileInputRef.current.value = "";
        setIsModalOpen(true);
      },
    });
  };

  // Handle Save (Create or Edit) with backend FormData
  const handleSaveInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!formInvoiceNo.trim()) {
      setFormError("Please enter an Invoice Number.");
      return;
    }

    setSubmitting(true);
    const cleanedAmount = parseFloat(formAmount.replace(/[^0-9.]/g, "")) || 0;

    const formData = new FormData();
    formData.append("invoice_number", formInvoiceNo.trim().toUpperCase());
    formData.append("vendor", formVendor.trim());
    formData.append("invoice_date", formDate || new Date().toISOString().split("T")[0]);
    formData.append("total_amount", String(cleanedAmount));
    if (selectedFile) {
      formData.append("file", selectedFile);
    }

    try {
      if (editingInvoice) {
        // Backend Update
        await updateInvoiceInBackend(editingInvoice.id, formData);
        showToast(`Invoice "${formInvoiceNo.trim().toUpperCase()}" updated successfully!`);
        addActivityLog({
          projectName: "—",
          module: "Invoices",
          action: `Updated invoice #${formInvoiceNo.trim().toUpperCase()} (${formVendor.trim()})`,
        });
      } else {
        // Backend Create
        await createInvoiceInBackend(formData);
        showToast(`Invoice "${formInvoiceNo.trim().toUpperCase()}" uploaded to backend!`);
        addActivityLog({
          projectName: "—",
          module: "Invoices",
          action: `Created invoice #${formInvoiceNo.trim().toUpperCase()} (${formVendor.trim()}) for AED ${parseFloat(formAmount || "0").toLocaleString()}`,
        });
      }

      setIsModalOpen(false);
      await loadBackendData();
    } catch (err: any) {
      console.error("Save invoice error:", err);
      setFormError(err?.message || "Failed to save invoice in backend.");
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Delete Invoice (Directly Requires Admin Password)
  const handleDeleteInvoice = (inv: InvoiceItem) => {
    setAdminAuthModal({
      isOpen: true,
      title: "Authorize Invoice Deletion",
      description: `Enter Admin password to permanently delete invoice "${inv.invoiceNumber}".`,
      actionLabel: "Delete Invoice",
      actionType: "danger",
      onSuccess: async () => {
        try {
          await deleteInvoiceFromBackend(inv.id);
          showToast(`Invoice "${inv.invoiceNumber}" deleted.`);
          addActivityLog({
            projectName: "—",
            module: "Invoices",
            action: `Deleted invoice #${inv.invoiceNumber} (${inv.vendor})`,
          });
          await loadBackendData();
        } catch (err: any) {
          alert(err?.message || "Failed to delete invoice from backend.");
        }
      },
    });
  };

  // Format date helper
  const formatDisplayDate = (dStr: string) => {
    if (!dStr) return "—";
    try {
      const d = new Date(dStr + "T00:00:00");
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
      }
    } catch {
      // ignore
    }
    return dStr;
  };

  return (
    <div className="space-y-6 sm:space-y-7 animate-in fade-in duration-200 pb-20 max-w-7xl mx-auto">
      {/* Toast Notification Alert */}
      {toastMsg && (
        <div className="fixed top-5 right-5 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-2xl text-xs sm:text-sm font-medium border border-slate-800 flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <span className="text-emerald-400 font-bold">✓</span>
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Invoices
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Backend
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Supplier invoice tracking, document storage, and master procurement billing.
          </p>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => loadBackendData(true)}
            disabled={loading || isRefreshing}
            title="Refresh pure backend data"
            className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-semibold rounded-xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all cursor-pointer disabled:opacity-60"
          >
            <svg
              className={`w-4 h-4 text-slate-500 ${isRefreshing ? "animate-spin text-indigo-600" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 21h5v-5" />
            </svg>
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {/* Upload Invoice Button */}
          <button
            type="button"
            onClick={handleOpenUploadModal}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0c1033] hover:bg-[#151b54] text-white text-xs sm:text-sm font-semibold rounded-xl shadow-xs hover:shadow-md transition-all cursor-pointer active:scale-98"
          >
            <svg
              className="w-4 h-4 text-emerald-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Upload Invoice</span>
          </button>
        </div>
      </div>

      {/* Backend Error Banner */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-start justify-between gap-3 text-rose-800 text-xs sm:text-sm">
          <div className="flex items-center gap-2.5">
            <svg className="w-5 h-5 text-rose-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div>
              <p className="font-semibold">Backend Connection Issue</p>
              <p className="text-xs text-rose-600 mt-0.5">{error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => loadBackendData(true)}
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-lg text-xs cursor-pointer flex-shrink-0 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-xs p-6 sm:p-7 space-y-5 overflow-hidden">
        {/* Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-slate-100">
          <div>
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
              All Invoices
            </h2>
            <p className="text-xs text-slate-500">
              Showing {filteredInvoices.length} of {invoices.length} entries (live database)
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <input
              type="text"
              placeholder="Search invoice # or vendor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            <svg
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
        </div>

        {/* Table View */}
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[750px]">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3.5 pl-3 pr-3 w-44">Invoice Number</th>
                <th className="py-3.5 px-3">Vendor / Supplier</th>
                <th className="py-3.5 px-3 w-36 text-center">Invoice Date</th>
                <th className="py-3.5 px-3 text-right w-40">Total Amount</th>
                <th className="py-3.5 px-3 text-center">Uploaded Document</th>
                <th className="py-3.5 pr-3 pl-3 text-right w-28">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/80 text-xs sm:text-sm">
              {loading && invoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <div className="inline-flex items-center gap-2.5 text-slate-600 font-medium">
                      <svg className="w-5 h-5 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" />
                        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" />
                      </svg>
                      <span>Loading invoices from backend...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <p className="font-semibold text-slate-700">No invoices found in database</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Click "+ Upload Invoice" to add a supplier billing record
                    </p>
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/70 transition-colors group">
                    {/* Invoice Number */}
                    <td className="py-4 pl-3 pr-3">
                      <span className="font-mono font-bold text-xs text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200/80">
                        {inv.invoiceNumber}
                      </span>
                    </td>

                    {/* Vendor */}
                    <td className="py-4 px-3">
                      {inv.vendor ? (
                        <span className="font-semibold text-xs sm:text-sm text-slate-900 block">
                          {inv.vendor}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs italic">
                          —
                        </span>
                      )}
                    </td>

                    {/* Invoice Date */}
                    <td className="py-4 px-3 text-center">
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 font-medium">
                        <svg className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                          <line x1="16" y1="2" x2="16" y2="6" />
                          <line x1="8" y1="2" x2="8" y2="6" />
                          <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                        <span>{formatDisplayDate(inv.date)}</span>
                      </span>
                    </td>

                    {/* Total Amount AED */}
                    <td className="py-4 px-3 text-right">
                      <span className="font-mono font-bold text-xs sm:text-sm text-slate-900 tabular-nums">
                        {inv.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <span className="ml-1 text-[11px] font-semibold text-slate-400">AED</span>
                    </td>

                    {/* Uploaded Document Interactive Chip */}
                    <td className="py-4 px-3 text-center">
                      {inv.hasFile || inv.fileName ? (
                        <div className="inline-flex items-center gap-1.5">
                          {/* Preview Button */}
                          <button
                            type="button"
                            onClick={() => setPreviewInvoice(inv)}
                            title={`Preview ${inv.fileName || "invoice document"}`}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-50/80 hover:bg-indigo-100/80 text-indigo-700 border border-indigo-200/70 transition-all cursor-pointer text-xs font-semibold shadow-2xs hover:shadow-xs"
                          >
                            <svg className="w-3.5 h-3.5 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                            <span className="truncate max-w-[150px]">{inv.fileName || "View Document"}</span>
                            {inv.fileSize && (
                              <span className="text-[10px] text-indigo-400 font-mono font-normal">({inv.fileSize})</span>
                            )}
                          </button>

                          {/* Direct Download Button */}
                          <button
                            type="button"
                            onClick={() => handleDownloadInvoice(inv)}
                            title="Download invoice file"
                            className="w-7 h-7 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 flex items-center justify-center transition-colors cursor-pointer"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="7 10 12 15 17 10" />
                              <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic text-xs">No file attached</span>
                      )}
                    </td>

                    {/* Actions: Edit & Delete (Admin Only) */}
                    <td className="py-4 pr-3 pl-3 text-right">
                      {isAdmin() ? (
                        <div className="inline-flex items-center justify-end gap-1">
                          {/* Edit Button */}
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(inv)}
                            title={`Edit Invoice ${inv.invoiceNumber}`}
                            className="w-7 h-7 rounded-lg text-amber-500 hover:text-amber-700 hover:bg-amber-50 flex items-center justify-center transition-colors cursor-pointer"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>

                          {/* Delete Button */}
                          <button
                            type="button"
                            onClick={() => handleDeleteInvoice(inv)}
                            title={`Delete Invoice ${inv.invoiceNumber}`}
                            className="w-7 h-7 rounded-lg text-rose-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors cursor-pointer"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

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

      {/* =========================================================================
          MODAL: Upload / Edit Invoice
          ========================================================================= */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => !submitting && setIsModalOpen(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 sm:p-7 space-y-5 animate-in zoom-in-95 duration-200 overflow-visible"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {editingInvoice ? "Edit Invoice in Backend" : "Upload Supplier Invoice"}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {editingInvoice
                    ? "Modify invoice details or replace attached document"
                    : "Record invoice details and attach billing document (PDF, Images, DOC/DOCX)"}
                </p>
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center cursor-pointer disabled:opacity-50"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Error */}
            {formError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                <svg className="w-4 h-4 text-rose-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveInvoice} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Invoice Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. INV-2026-085"
                    value={formInvoiceNo}
                    onChange={(e) => setFormInvoiceNo(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 uppercase font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Vendor / Supplier <span className="text-slate-400 font-normal text-[11px]">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Schneider Electric (Optional)"
                    value={formVendor}
                    onChange={(e) => setFormVendor(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <ThemeDatePicker
                    label="Invoice Date"
                    value={formDate}
                    onChange={setFormDate}
                    align="center"
                    placeholder="Select invoice date"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Total Amount (in AED) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      placeholder="e.g. 45000"
                      value={formAmount}
                      onChange={(e) => setFormAmount(e.target.value)}
                      className="w-full px-3.5 py-2 pr-12 text-xs sm:text-sm rounded-xl border border-slate-200 text-slate-800 font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      AED
                    </span>
                  </div>
                </div>
              </div>

              {/* Real File Upload Section */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Invoice Document (PDF, Images, DOC, DOCX)
                </label>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelection(file);
                  }}
                  accept=".pdf,image/png,image/jpeg,image/jpg,image/webp,.doc,.docx"
                  className="hidden"
                />

                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragging(true);
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragging(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragging(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleFileSelection(file);
                  }}
                  className={`p-5 border-2 border-dashed rounded-2xl text-center cursor-pointer transition-all group ${
                    isDragging
                      ? "border-indigo-500 bg-indigo-100/70 scale-[1.01]"
                      : "border-indigo-200 hover:border-indigo-400 bg-indigo-50/30 hover:bg-indigo-50/60"
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2 transition-transform ${
                    isDragging ? "bg-indigo-600 text-white scale-110" : "bg-indigo-100 text-indigo-600 group-hover:scale-110"
                  }`}>
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>
                  <span className="text-xs font-bold text-slate-800 block">
                    {selectedFile
                      ? `Selected: ${selectedFile.name} (${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)`
                      : editingInvoice?.fileName
                      ? `Current file: ${editingInvoice.fileName} (Click or drop to replace)`
                      : isDragging
                      ? "Drop invoice document here"
                      : "Click to browse or drop invoice document"}
                  </span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    Supported formats: PDF, PNG, JPG, JPEG, DOC, DOCX up to 25MB
                  </span>
                  {selectedFile && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-2.5 py-0.5 rounded-lg border border-rose-200 transition-colors"
                    >
                      <span>Remove selected file</span>
                      <span>×</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-6 py-2 text-xs font-semibold text-white bg-[#0c1033] hover:bg-[#151b54] rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {submitting && (
                    <svg className="w-3.5 h-3.5 animate-spin text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" />
                    </svg>
                  )}
                  <span>{editingInvoice ? "Save Changes" : "Upload Invoice"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: Document Preview Modal (In-Browser Viewer)
          ========================================================================= */}
      {previewInvoice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setPreviewInvoice(null)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-3xl w-full h-[85vh] flex flex-col p-6 animate-in zoom-in-95 duration-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900">
                    {previewInvoice.fileName || `Invoice_${previewInvoice.invoiceNumber}.pdf`}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    {previewInvoice.invoiceNumber}{previewInvoice.vendor ? ` • ${previewInvoice.vendor}` : ""} • AED {previewInvoice.amount.toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadInvoice(previewInvoice)}
                  className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs hover:shadow-xs"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>Download</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewInvoice(null)}
                  className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Document Preview Frame */}
            <div className="flex-1 w-full bg-slate-100 rounded-2xl mt-4 overflow-hidden border border-slate-200 flex items-center justify-center relative">
              {previewLoading ? (
                <div className="flex flex-col items-center gap-2.5 text-slate-500 text-xs font-medium">
                  <svg className="w-6 h-6 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" />
                  </svg>
                  <span>Loading preview...</span>
                </div>
              ) : previewError ? (
                <div className="text-center p-6 space-y-3 max-w-sm">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center mx-auto">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800">Unable to load preview</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{previewError}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDownloadInvoice(previewInvoice)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold cursor-pointer shadow-xs hover:bg-indigo-700"
                  >
                    Download File Instead
                  </button>
                </div>
              ) : previewBlobUrl ? (
                previewInvoice.fileType?.includes("image") ||
                previewInvoice.fileName?.match(/\.(png|jpg|jpeg|webp)$/i) ? (
                  <img
                    src={previewBlobUrl}
                    alt={previewInvoice.fileName || "Invoice Preview"}
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <iframe
                    src={previewBlobUrl}
                    className="w-full h-full border-0"
                    title="Invoice Document Preview"
                  />
                )
              ) : (
                <iframe
                  src={getInvoicePreviewUrl(previewInvoice.id)}
                  className="w-full h-full border-0"
                  title="Invoice Document Preview"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
