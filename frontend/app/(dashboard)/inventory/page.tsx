"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import { AdminPasswordModal } from "@/components";
import {
  InventoryItem,
  getStoredInventory,
  fetchInventoryFromBackend,
  createInventoryItemInBackend,
  updateInventoryItemInBackend,
  deleteInventoryItemFromBackend,
  BackendPartItem,
  getStoredParts,
  fetchPartsFromBackend,
  createPartInBackend,
  deletePartInBackend,
  apiGetPartDetails,
  PartDrillDownDetails,
} from "@/lib/inventoryStore";
import {
  InvoiceItem,
  getStoredInvoices,
  fetchInvoicesFromBackend,
} from "@/lib/invoicesStore";
import {
  getUserRole,
  isAdmin,
  apiDownloadInvoiceByNumber,
} from "@/lib/api";
import { addActivityLog } from "@/lib/logsStore";

function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query || !query.trim() || !text) return <>{text || ""}</>;

  const tokens = query
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  if (tokens.length === 0) return <>{text}</>;

  try {
    const regex = new RegExp(`(${tokens.join("|")})`, "gi");
    const parts = text.split(regex);

    return (
      <>
        {parts.map((part, i) =>
          tokens.includes(part.toLowerCase()) ? (
            <mark
              key={i}
              className="bg-amber-200/90 text-amber-950 font-bold px-0.5 rounded"
            >
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </>
    );
  } catch {
    return <>{text}</>;
  }
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [parts, setParts] = useState<BackendPartItem[]>([]);
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

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"latest" | "oldest" | "name_asc" | "name_desc">("latest");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Role checking
  const [userRole, setUserRole] = useState<string>("");
  useEffect(() => {
    const syncRole = () => setUserRole(getUserRole());
    syncRole();
    window.addEventListener("auth_user_change", syncRole);
    return () => window.removeEventListener("auth_user_change", syncRole);
  }, []);

  // Add Item Modal State (Stock Inflow into Master Inventory)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const [newPart, setNewPart] = useState("");
  const [partSearchText, setPartSearchText] = useState("");
  const [partDropdownOpen, setPartDropdownOpen] = useState(false);
  const partDropdownRef = useRef<HTMLDivElement>(null);

  const [newBrand, setNewBrand] = useState("");
  const [newProduct, setNewProduct] = useState("");
  const [newQuantity, setNewQuantity] = useState("1");
  const [newVendor, setNewVendor] = useState("");

  // Invoice Selection State (Compulsory)
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceItem | null>(null);
  const [invoiceDropdownOpen, setInvoiceDropdownOpen] = useState(false);
  const [invoiceSearchText, setInvoiceSearchText] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Add Part Modal State
  const [isAddPartModalOpen, setIsAddPartModalOpen] = useState(false);
  const [newProductNameInput, setNewProductNameInput] = useState("");
  const [newPartNumberInput, setNewPartNumberInput] = useState("");
  const [newPartDescInput, setNewPartDescInput] = useState("");
  const [addPartSubmitting, setAddPartSubmitting] = useState(false);
  const [addPartError, setAddPartError] = useState("");

  // Part Drill-Down Modal State (Clicking on Part Number)
  const [selectedPartNumber, setSelectedPartNumber] = useState<string | null>(null);
  const [partDetails, setPartDetails] = useState<PartDrillDownDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [activeDrillTab, setActiveDrillTab] = useState<"allocations" | "project_invoices" | "invoices">("allocations");

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3500);
  };

  // Pure Backend Fetching
  const loadData = useCallback(async (isManual = false) => {
    if (isManual) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const [invRes, invoiceRes, partsRes] = await Promise.all([
        fetchInventoryFromBackend(),
        fetchInvoicesFromBackend(),
        fetchPartsFromBackend(),
      ]);
      setItems(invRes.items);
      const sortedInvoices = [...invoiceRes.items].sort((a, b) => {
        const timeA = new Date(a.created_at || a.date).getTime() || 0;
        const timeB = new Date(b.created_at || b.date).getTime() || 0;
        return timeB - timeA;
      });
      setInvoices(sortedInvoices);
      setParts(partsRes.items);
      if (isManual) {
        showToast("Master inventory & registered parts refreshed!");
      }
    } catch (err: any) {
      console.error("Backend fetch error in Master Inventory:", err);
      const msg = err?.message || "Failed to connect to backend server.";
      setError(msg);
      const cachedParts = getStoredParts();
      if (cachedParts.length > 0) setParts(cachedParts);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    const handleStorageUpdate = () => {
      setItems(getStoredInventory());
      setInvoices(getStoredInvoices());
      setParts(getStoredParts());
    };

    window.addEventListener("inventory_store_update", handleStorageUpdate);
    window.addEventListener("parts_store_update", handleStorageUpdate);
    return () => {
      window.removeEventListener("inventory_store_update", handleStorageUpdate);
      window.removeEventListener("parts_store_update", handleStorageUpdate);
    };
  }, [loadData]);

  // Click outside combobox dropdowns
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setInvoiceDropdownOpen(false);
      }
      if (partDropdownRef.current && !partDropdownRef.current.contains(event.target as Node)) {
        setPartDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keyboard shortcut Ctrl+K / /
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isAddModalOpen || isAddPartModalOpen) return;
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT") {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAddModalOpen, isAddPartModalOpen]);

  // Filtered & Sorted Master Parts
  const { processedParts, searchExecutionTime } = useMemo(() => {
    const t0 = performance.now();
    const q = searchQuery.toLowerCase().trim();

    let list = parts.filter((p) => {
      if (!q) return true;
      return (
        p.part_number.toLowerCase().includes(q) ||
        (p.product_name && p.product_name.toLowerCase().includes(q)) ||
        (p.description && p.description.toLowerCase().includes(q))
      );
    });

    if (sortBy === "name_asc") {
      list.sort((a, b) => (a.product_name || a.part_number).localeCompare(b.product_name || b.part_number));
    } else if (sortBy === "name_desc") {
      list.sort((a, b) => (b.product_name || b.part_number).localeCompare(a.product_name || a.part_number));
    } else if (sortBy === "oldest") {
      list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    } else {
      // latest
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    const t1 = performance.now();
    return {
      processedParts: list,
      searchExecutionTime: Math.round((t1 - t0) * 100) / 100,
    };
  }, [parts, searchQuery, sortBy]);

  const hasActiveFilters = searchQuery.trim().length > 0 || sortBy !== "latest";

  const resetAllFilters = () => {
    setSearchQuery("");
    setSortBy("latest");
  };

  // Open Part Details Drill-down Modal
  const handleOpenPartDetails = async (partNumber: string) => {
    if (!partNumber) return;
    setSelectedPartNumber(partNumber);
    setPartDetails(null);
    setIsLoadingDetails(true);
    setActiveDrillTab("allocations");

    try {
      const details = await apiGetPartDetails(partNumber);
      setPartDetails(details);
    } catch (err: any) {
      console.error("Failed to load part details:", err);
      showToast(err?.message || "Failed to load part details.");
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // Open Add Part Modal
  const handleOpenAddPartModal = () => {
    setNewProductNameInput("");
    setNewPartNumberInput("");
    setNewPartDescInput("");
    setAddPartError("");
    setIsAddPartModalOpen(true);
  };

  // Handle Add Part Submit
  const handleAddPartSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddPartError("");

    const prodName = newProductNameInput.trim();
    const pn = newPartNumberInput.trim().toUpperCase();

    if (!prodName) {
      setAddPartError("Product name is required.");
      return;
    }
    if (!pn) {
      setAddPartError("Part number is required.");
      return;
    }

    setAddPartSubmitting(true);
    try {
      const created = await createPartInBackend(prodName, pn, newPartDescInput);
      showToast(`Part "${created.part_number}" registered successfully!`);
      addActivityLog({
        module: "Inventory",
        projectName: "—",
        action: `Registered new catalog part: ${created.part_number} (${created.product_name})`,
      });
      setIsAddPartModalOpen(false);

      if (isAddModalOpen) {
        setNewPart(created.part_number);
        setPartSearchText(created.part_number);
        setNewProduct(created.product_name || created.description || created.part_number);
        setPartDropdownOpen(false);
        setFormError("");
      }

      await loadData();
    } catch (err: any) {
      console.error("Add part error:", err);
      setAddPartError(err?.message || "Failed to register part in backend.");
    } finally {
      setAddPartSubmitting(false);
    }
  };

  // Delete Part
  const handleDeletePart = (part: BackendPartItem) => {
    if (!isAdmin()) {
      showToast("Access restricted: Only administrators can delete master parts.");
      return;
    }
    setAdminAuthModal({
      isOpen: true,
      title: "Confirm Master Part Deletion",
      description: `Deleting part "${part.part_number}" (${part.product_name || "Hardware SKU"}) will deactivate it from the catalog.`,
      actionLabel: "Deactivate Part",
      actionType: "danger",
      onSuccess: async () => {
        try {
          await deletePartInBackend(part.id || part.part_number);
          showToast(`Part "${part.part_number}" deactivated.`);
          addActivityLog({
            module: "Inventory",
            projectName: "—",
            action: `Deactivated catalog part: ${part.part_number} (${part.product_name || "Hardware SKU"})`,
          });
          await loadData();
        } catch (err: any) {
          showToast(err?.message || "Failed to delete part.");
        }
      },
    });
  };

  // Open Add Item Modal (Stock Inflow)
  const handleOpenAddModal = () => {
    setNewPart("");
    setPartSearchText("");
    setNewBrand("");
    setNewProduct("");
    setNewQuantity("1");
    setNewVendor("");
    setSelectedInvoice(null);
    setInvoiceSearchText("");
    setFormError("");
    setIsAddModalOpen(true);
  };

  // Add Item Submit (Stock arrival under invoice)
  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!newPart.trim()) {
      setFormError("Part Number is required. Please select a registered part.");
      return;
    }

    const matchedPart = parts.find(
      (p) => p.part_number.toUpperCase() === newPart.trim().toUpperCase()
    );
    if (!matchedPart) {
      setFormError(
        `Part number "${newPart.trim().toUpperCase()}" is not registered. Please select from the registered parts list or click "Add Part" to register it.`
      );
      return;
    }

    const prodName = newProduct.trim() || matchedPart.product_name || matchedPart.description || matchedPart.part_number;

    const qty = parseInt(newQuantity, 10);
    if (isNaN(qty) || qty <= 0) {
      setFormError("Quantity must be a positive number.");
      return;
    }

    // Compulsory Invoice Selection
    if (!selectedInvoice || !selectedInvoice.invoiceNumber) {
      setFormError("Please select an Invoice Number. Selecting an invoice is compulsory for warranty claims.");
      return;
    }

    const finalSupplier = newVendor.trim() || selectedInvoice?.vendor?.trim() || "";

    setSubmitting(true);
    try {
      await createInventoryItemInBackend({
        product_name: prodName,
        vendor: finalSupplier,
        brand: newBrand.trim(),
        part_number: matchedPart.part_number,
        quantity: qty,
        invoice_number: selectedInvoice.invoiceNumber,
        invoice_id: selectedInvoice.id,
        availability: "Available",
      });
      showToast(`Added ${qty} units of "${matchedPart.part_number}" under Invoice ${selectedInvoice.invoiceNumber}!`);
      addActivityLog({
        module: "Inventory",
        projectName: "—",
        action: `Added stock arrival: ${qty} units of ${matchedPart.part_number} under Invoice ${selectedInvoice.invoiceNumber}`,
      });

      setIsAddModalOpen(false);
      await loadData();
    } catch (err: any) {
      console.error("Submit inventory item error:", err);
      setFormError(err?.message || "Failed to save inventory item.");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredPartOptions = useMemo(() => {
    const q = partSearchText.toLowerCase().trim();
    if (!q) return parts;
    return parts.filter(
      (p) =>
        p.part_number.toLowerCase().includes(q) ||
        (p.product_name && p.product_name.toLowerCase().includes(q)) ||
        (p.description && p.description.toLowerCase().includes(q))
    );
  }, [parts, partSearchText]);

  const filteredInvoiceOptions = useMemo(() => {
    const q = invoiceSearchText.toLowerCase().trim();
    if (!q) return invoices;
    return invoices.filter(
      (inv) =>
        inv.invoiceNumber.toLowerCase().includes(q) ||
        (inv.vendor && inv.vendor.toLowerCase().includes(q))
    );
  }, [invoices, invoiceSearchText]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-2xl shadow-xl border border-slate-700 text-xs sm:text-sm font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Master Inventory
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Backend
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Central hardware parts catalog and warehouse stock linked to warranty-verified supplier invoices.
          </p>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={loading || isRefreshing}
            title="Refresh master inventory from backend"
            className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-semibold rounded-xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all cursor-pointer disabled:opacity-60"
          >
            <svg
              className={`w-4 h-4 text-slate-500 ${isRefreshing ? "animate-spin text-indigo-600" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 21h5v-5" />
            </svg>
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {/* Add Part Button */}
          <button
            type="button"
            onClick={handleOpenAddPartModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-800 text-xs sm:text-sm font-semibold rounded-xl border border-slate-300 shadow-2xs hover:shadow-xs transition-all cursor-pointer active:scale-98"
          >
            <svg
              className="w-4 h-4 text-indigo-600"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Add Part</span>
          </button>

          {/* Add Item Button (Stock Inflow) */}
          <button
            type="button"
            onClick={handleOpenAddModal}
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
            <span>Add Item</span>
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
            onClick={() => loadData(true)}
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-lg text-xs cursor-pointer flex-shrink-0 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-xs p-6 sm:p-7 space-y-5 overflow-hidden">
        {/* Search Command Bar */}
        <div className="space-y-4 pb-2 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
                Master Inventory Registry
              </h2>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                <span>
                  Showing <strong className="text-slate-800">{processedParts.length}</strong> of{" "}
                  <strong>{parts.length}</strong> registered parts
                </span>
                {searchQuery.trim() && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                    <span>⚡ Filtered in</span>
                    <span>{searchExecutionTime}ms</span>
                  </span>
                )}
              </div>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="self-start sm:self-auto text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100/80 px-2.5 py-1.5 rounded-lg border border-rose-200/60 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
                <span>Reset search</span>
              </button>
            )}
          </div>

          {/* Search Input & Sort Controls */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-8 relative">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search by part number, product name, or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-20 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50/60 font-medium transition-all"
              />
              <svg
                className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>

              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    title="Clear search"
                    className="w-5 h-5 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 flex items-center justify-center cursor-pointer transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            <div className="md:col-span-4 relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full px-3 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 text-slate-800 bg-slate-50/60 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
              >
                <option value="latest">Sort: Newest Added</option>
                <option value="oldest">Sort: Oldest Added</option>
                <option value="name_asc">Sort: Product Name (A → Z)</option>
                <option value="name_desc">Sort: Product Name (Z → A)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Master Inventory Table: SN | Part Number | Product Name | Description | Action */}
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[700px]">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3.5 pl-4 pr-2 w-16 text-center">SN</th>
                <th className="py-3.5 px-3 w-56">Part Number</th>
                <th className="py-3.5 px-3 w-64">Product Name</th>
                <th className="py-3.5 px-3">Description</th>
                <th className="py-3.5 pr-4 pl-2 text-right w-24">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/80 text-xs sm:text-sm">
              {loading && parts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    <div className="inline-flex items-center gap-2.5 text-slate-600 font-medium">
                      <svg className="w-5 h-5 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" />
                        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" />
                      </svg>
                      <span>Loading master parts catalog...</span>
                    </div>
                  </td>
                </tr>
              ) : processedParts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    {hasActiveFilters ? (
                      <div className="space-y-2">
                        <p className="font-semibold text-slate-700">No parts match your search query</p>
                        <p className="text-xs text-slate-400">
                          Try adjusting search terms or clearing your search.
                        </p>
                        <button
                          type="button"
                          onClick={resetAllFilters}
                          className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-xl text-xs cursor-pointer transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M18 6 6 18M6 6l12 12" />
                          </svg>
                          <span>Reset Search</span>
                        </button>
                      </div>
                    ) : (
                      <div>
                        <p className="font-semibold text-slate-700">No parts registered yet</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Click &ldquo;+ Add Part&rdquo; to register your first hardware SKU with Product Name, Part Number & Description
                        </p>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                processedParts.map((part, index) => {
                  return (
                    <tr key={part.id} className="hover:bg-slate-50/70 transition-colors group">
                      {/* SN */}
                      <td className="py-4 pl-4 pr-2 font-mono text-slate-400 font-bold text-center text-xs">
                        #{index + 1}
                      </td>

                      {/* Part Number (Clickable badge to view complete stock, allocations & linked invoices) */}
                      <td className="py-4 px-3">
                        <button
                          type="button"
                          onClick={() => handleOpenPartDetails(part.part_number)}
                          title="Click to view total stock, project allocations & linked invoices"
                          className="group/part inline-flex items-center gap-1.5 font-mono font-bold text-indigo-700 bg-indigo-50/90 hover:bg-indigo-100/90 px-3 py-1.5 rounded-xl border border-indigo-200/80 text-xs sm:text-sm transition-all cursor-pointer text-left shadow-2xs hover:shadow-xs active:scale-98"
                        >
                          <HighlightMatch text={part.part_number} query={searchQuery} />
                          <svg className="w-3.5 h-3.5 text-indigo-500 group-hover/part:translate-x-0.5 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M5 12h14M12 5l7 7-7 7" />
                          </svg>
                        </button>
                        <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          <span>Click for stock &amp; allocations</span>
                        </div>
                      </td>

                      {/* Product Name */}
                      <td className="py-4 px-3">
                        <span className="font-bold text-slate-900 block text-xs sm:text-sm">
                          <HighlightMatch text={part.product_name || part.description || "—"} query={searchQuery} />
                        </span>
                      </td>

                      {/* Description */}
                      <td className="py-4 px-3 text-slate-600 text-xs sm:text-sm">
                        <span className="line-clamp-2">
                          <HighlightMatch text={part.description || "No description provided"} query={searchQuery} />
                        </span>
                      </td>

                      {/* Action */}
                      <td className="py-4 pr-4 pl-2 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenPartDetails(part.part_number)}
                            title="View Part Details & Invoices"
                            className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="11" cy="11" r="8" />
                              <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                          </button>
                          {isAdmin() && (
                            <button
                              type="button"
                              onClick={() => handleDeletePart(part)}
                              title="Delete / Deactivate Part"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            >
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =========================================================================
          MODAL 1: Add Part Modal (Product Name, Part Number, Description)
          ========================================================================= */}
      {isAddPartModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setIsAddPartModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md p-6 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Add New Part</h3>
                  <p className="text-xs text-slate-400">Register hardware SKU to master parts catalog</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddPartModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {addPartError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
                <svg className="w-4 h-4 text-rose-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{addPartError}</span>
              </div>
            )}

            <form onSubmit={handleAddPartSubmit} className="space-y-4">
              {/* Product Name */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Product Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 8-Channel Relay Module 16A"
                  value={newProductNameInput}
                  onChange={(e) => setNewProductNameInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50/50"
                />
              </div>

              {/* Part Number */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Part Number <span className="text-rose-500">* (Unique)</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ABB-DIM-04 or SE-RELAY-08"
                  value={newPartNumberInput}
                  onChange={(e) => setNewPartNumberInput(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 text-slate-800 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 uppercase tracking-wide bg-slate-50/50"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Unique SKU identifier normalized to uppercase.
                </p>
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Description <span className="text-slate-400 font-normal text-[11px]">(Optional)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. 4-Fold 250W KNX Universal Dimming Actuator with manual override"
                  value={newPartDescInput}
                  onChange={(e) => setNewPartDescInput(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none bg-slate-50/50"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  disabled={addPartSubmitting}
                  onClick={() => setIsAddPartModalOpen(false)}
                  className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addPartSubmitting || !newPartNumberInput.trim() || !newProductNameInput.trim()}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2 active:scale-98"
                >
                  {addPartSubmitting ? (
                    <>
                      <svg className="w-4 h-4 animate-spin text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Add Part</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: Add Item Modal (Stock Inflow into Master Inventory with Invoice)
          ========================================================================= */}
      {isAddModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setIsAddModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  +
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Add Stock to Inventory</h3>
                  <p className="text-xs text-slate-400">Receive hardware and link compulsory invoice for warranty</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
                <svg className="w-4 h-4 text-rose-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleAddItem} className="space-y-4">
              {/* Step 1: Select Part Number */}
              <div className="relative" ref={partDropdownRef}>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold flex items-center justify-center">1</span>
                    <span>Select Part Number <span className="text-rose-500">*</span></span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddModalOpen(false);
                      handleOpenAddPartModal();
                    }}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <span>+ New Part?</span>
                  </button>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="Search registered part number..."
                    value={partSearchText}
                    onFocus={() => setPartDropdownOpen(true)}
                    onChange={(e) => {
                      setPartSearchText(e.target.value);
                      setNewPart(e.target.value.toUpperCase());
                      setPartDropdownOpen(true);
                      setFormError("");
                    }}
                    className="w-full px-3.5 py-2.5 pr-10 text-xs sm:text-sm rounded-xl border border-slate-200 text-slate-900 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 uppercase bg-slate-50/50"
                  />
                  <button
                    type="button"
                    onClick={() => setPartDropdownOpen((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer p-1"
                  >
                    <svg className={`w-4 h-4 transition-transform ${partDropdownOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                </div>

                {partDropdownOpen && (
                  <div className="absolute z-50 left-0 right-0 mt-1 max-h-52 overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-xl p-1.5 space-y-1 animate-in fade-in-50 zoom-in-95 duration-150">
                    <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between border-b border-slate-100">
                      <span>Registered Master Parts</span>
                      <span>{filteredPartOptions.length} available</span>
                    </div>

                    {filteredPartOptions.length === 0 ? (
                      <div className="p-3 text-center text-xs text-slate-400">
                        No registered parts match &ldquo;{partSearchText}&rdquo;
                      </div>
                    ) : (
                      filteredPartOptions.map((p) => {
                        const isSelected = newPart.toUpperCase() === p.part_number.toUpperCase();
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setNewPart(p.part_number);
                              setPartSearchText(p.part_number);
                              setNewProduct(p.product_name || p.description || p.part_number);
                              setPartDropdownOpen(false);
                              setFormError("");
                            }}
                            className={`w-full px-3.5 py-2 text-left flex items-center justify-between hover:bg-indigo-50/60 transition-colors cursor-pointer rounded-lg ${isSelected ? "bg-indigo-50 text-indigo-900 font-semibold" : "text-slate-800"}`}
                          >
                            <div className="min-w-0 pr-2">
                              <span className="font-mono font-bold text-indigo-700">{p.part_number}</span>
                              <span className="block text-[11px] text-slate-500 truncate">
                                {p.product_name || p.description || "No description"}
                              </span>
                            </div>
                            {isSelected && (
                              <svg className="w-4 h-4 text-indigo-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              {/* Step 2: Product Name (Auto-populated from Part Number) */}
              <div>
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1">
                  <span className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold flex items-center justify-center">2</span>
                  <span>Product Name <span className="text-emerald-600 text-[11px] font-normal">(Auto-populated from part)</span></span>
                </label>
                <input
                  type="text"
                  readOnly
                  placeholder="Select part number above to auto-populate..."
                  value={newProduct}
                  className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 text-slate-800 font-semibold bg-slate-100 cursor-not-allowed"
                />
              </div>

              {/* Step 3: Supplier / Vendor (Optional) */}
              <div>
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1">
                  <span className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold flex items-center justify-center">3</span>
                  <span>Supplier / Vendor <span className="text-slate-400 font-normal text-[11px]">(Optional)</span></span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Siemens AG, ABB, Schneider Electric (optional)"
                  value={newVendor}
                  onChange={(e) => setNewVendor(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50/50"
                />
              </div>

              {/* Step 4: Select Invoice (Compulsory for Warranty) */}
              <div className="relative" ref={dropdownRef}>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold flex items-center justify-center">4</span>
                    <span>Invoice Selection <span className="text-rose-500 font-bold">* (Compulsory for Warranty Claim)</span></span>
                  </label>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="Search and select invoice #..."
                    value={invoiceSearchText}
                    onFocus={() => setInvoiceDropdownOpen(true)}
                    onChange={(e) => {
                      setInvoiceSearchText(e.target.value);
                      setInvoiceDropdownOpen(true);
                      setFormError("");
                    }}
                    className="w-full px-3.5 py-2.5 pr-10 text-xs sm:text-sm rounded-xl border border-slate-200 text-slate-900 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 uppercase bg-slate-50/50"
                  />
                  <button
                    type="button"
                    onClick={() => setInvoiceDropdownOpen((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer p-1"
                  >
                    <svg className={`w-4 h-4 transition-transform ${invoiceDropdownOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                </div>

                {invoiceDropdownOpen && (
                  <div className="absolute z-50 left-0 right-0 mt-1 max-h-52 overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-xl p-1.5 space-y-1 animate-in fade-in-50 zoom-in-95 duration-150">
                    <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between border-b border-slate-100">
                      <span>Available Verified Invoices</span>
                      <span>{filteredInvoiceOptions.length} found</span>
                    </div>

                    {filteredInvoiceOptions.length === 0 ? (
                      <div className="p-3 text-center text-xs text-slate-400">
                        No matching invoices found. Upload in Invoices tab first.
                      </div>
                    ) : (
                      filteredInvoiceOptions.map((inv) => {
                        const isSelected = selectedInvoice?.id === inv.id;
                        return (
                          <button
                            key={inv.id}
                            type="button"
                            onClick={() => {
                              setSelectedInvoice(inv);
                              setInvoiceSearchText(inv.invoiceNumber);
                              if (inv.vendor && !newVendor.trim()) {
                                setNewVendor(inv.vendor);
                              }
                              setInvoiceDropdownOpen(false);
                              setFormError("");
                            }}
                            className={`w-full px-3.5 py-2.5 text-left flex items-center justify-between hover:bg-indigo-50/60 transition-colors cursor-pointer rounded-lg ${isSelected ? "bg-indigo-50 text-indigo-900 font-semibold" : "text-slate-800"}`}
                          >
                            <div>
                              <div className="font-mono font-bold text-slate-900 text-xs sm:text-sm">
                                {inv.invoiceNumber}
                              </div>
                              <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                                <span>Vendor: {inv.vendor || "Standard"}</span>
                                <span>•</span>
                                <span>{inv.date || "Verified"}</span>
                              </div>
                            </div>
                            {isSelected && (
                              <svg className="w-4 h-4 text-indigo-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              {/* Step 5: Quantity */}
              <div>
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1">
                  <span className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold flex items-center justify-center">5</span>
                  <span>Quantity (Stock Units) <span className="text-rose-500">*</span></span>
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  placeholder="e.g. 25"
                  value={newQuantity}
                  onChange={(e) => setNewQuantity(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 text-slate-800 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50/50"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !newPart.trim() || !selectedInvoice}
                  className="px-5 py-2.5 bg-[#0c1033] hover:bg-[#151b54] text-white text-xs sm:text-sm font-semibold rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2 active:scale-98"
                >
                  {submitting ? (
                    <>
                      <svg className="w-4 h-4 animate-spin text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                      <span>Saving Stock...</span>
                    </>
                  ) : (
                    <span>Add to Inventory</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: Part Details Drill-Down Modal (Stock, Projects & Invoices)
          ========================================================================= */}
      {selectedPartNumber && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => {
            setSelectedPartNumber(null);
            setPartDetails(null);
          }}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden animate-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-[#0c1033] via-[#121748] to-[#1a2063] text-white flex items-center justify-between flex-shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs px-2.5 py-0.5 rounded-lg bg-white/20 font-bold tracking-wide">
                    {selectedPartNumber}
                  </span>
                  <span className="text-xs text-indigo-200 font-medium">
                    Part Stock &amp; Allocation Breakdown
                  </span>
                </div>
                <h3 className="font-extrabold text-lg sm:text-xl mt-1">
                  {partDetails?.product_name || selectedPartNumber}
                </h3>
                {partDetails?.description && (
                  <p className="text-xs text-slate-300 mt-0.5 line-clamp-1">
                    {partDetails.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedPartNumber(null);
                  setPartDetails(null);
                }}
                className="text-slate-300 hover:text-white transition-colors cursor-pointer w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-sm"
              >
                ✕
              </button>
            </div>

            {/* Summary Metrics Banner: 3 Clear Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-5 bg-slate-50 border-b border-slate-200/80 flex-shrink-0">
              {/* Card 1: Total in Warehouse */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total in Warehouse</div>
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-mono mt-1">
                  {partDetails?.total_in_warehouse ?? Math.max(0, (partDetails?.total_inventory ?? 0) - (partDetails?.total_consumed ?? 0))}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Total physical units in warehouse (excluding completed projects)
                </div>
              </div>

              {/* Card 2: Total Allocated */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Allocated</div>
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold text-indigo-700 font-mono mt-1">
                  {partDetails?.total_allocated ?? 0}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Assigned across active projects
                </div>
              </div>

              {/* Card 3: Remaining */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Remaining</div>
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${(partDetails?.remaining_in_warehouse ?? partDetails?.available_in_warehouse ?? 0) > 0 ? "bg-emerald-500" : "bg-rose-500"}`}
                  />
                </div>
                <div
                  className={`text-2xl sm:text-3xl font-extrabold font-mono mt-1 ${(partDetails?.remaining_in_warehouse ?? partDetails?.available_in_warehouse ?? 0) > 0 ? "text-emerald-700" : "text-rose-600"}`}
                >
                  {partDetails?.remaining_in_warehouse ?? partDetails?.available_in_warehouse ?? 0}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Free unassigned stock ready for allocation
                </div>
              </div>
            </div>

            {/* Drilldown Navigation Tabs */}
            <div className="flex items-center gap-2 px-6 pt-4 border-b border-slate-100 flex-shrink-0 bg-white">
              <button
                type="button"
                onClick={() => setActiveDrillTab("allocations")}
                className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${activeDrillTab === "allocations"
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-slate-400 hover:text-slate-700"}`}
              >
                <span>Active Project Allocations</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700 font-mono font-bold">
                  {partDetails?.active_projects?.length ?? 0}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveDrillTab("project_invoices")}
                className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${activeDrillTab === "project_invoices"
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-slate-400 hover:text-slate-700"}`}
              >
                <span>Project Invoice Mapping</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700 font-mono font-bold">
                  {partDetails?.project_invoice_allocations?.length ?? 0}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveDrillTab("invoices")}
                className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${activeDrillTab === "invoices"
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-slate-400 hover:text-slate-700"}`}
              >
                <span>Linked Invoices (Warranty Ledger)</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700 font-mono font-bold">
                  {partDetails?.linked_invoices?.length ?? 0}
                </span>
              </button>
            </div>

            {/* Modal Body Content */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {isLoadingDetails ? (
                <div className="py-16 text-center text-slate-400">
                  <div className="inline-flex items-center gap-2.5 text-slate-600 text-xs font-semibold">
                    <svg className="w-5 h-5 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" />
                    </svg>
                    <span>Loading real-time stock, allocations &amp; invoice history...</span>
                  </div>
                </div>
              ) : activeDrillTab === "allocations" ? (
                /* Tab 1: Project Allocations */
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Active Projects Breakdown
                    </h4>
                    <span className="text-xs text-slate-500 font-medium bg-slate-100 px-2.5 py-0.5 rounded-full">
                      Excludes completed projects
                    </span>
                  </div>

                  {!partDetails?.active_projects || partDetails.active_projects.length === 0 ? (
                    <div className="py-12 text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6">
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-2 text-slate-400 font-bold">
                        ✓
                      </div>
                      <p className="font-bold text-slate-700 text-sm">No Active Project Allocations</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Part {selectedPartNumber} is not currently allocated to any project.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-slate-200/80 rounded-2xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                          <tr>
                            <th className="py-3 px-4">Project</th>
                            <th className="py-3 px-3 text-center">Required</th>
                            <th className="py-3 px-3 text-center">Allocated</th>
                            <th className="py-3 px-3 text-center">Remaining</th>
                            <th className="py-3 px-4 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {partDetails.active_projects.map((proj) => (
                            <tr key={proj.project_key} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-3 px-4">
                                <Link
                                  href={`/projects/${proj.project_key}`}
                                  className="font-bold text-slate-900 hover:text-indigo-600 transition-colors block"
                                >
                                  {proj.project_name}
                                </Link>
                                <span className="font-mono text-[11px] text-slate-400">
                                  {proj.project_code}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-center font-mono font-semibold text-slate-700">
                                {proj.required_qty}
                              </td>
                              <td className="py-3 px-3 text-center font-mono font-bold text-indigo-700">
                                {proj.allocated_qty}
                              </td>
                              <td className="py-3 px-3 text-center font-mono font-semibold text-rose-600">
                                {proj.remaining_qty > 0 ? `+${proj.remaining_qty}` : "0"}
                              </td>
                              <td className="py-3 px-4 text-right">
                                {proj.status === "Added" ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                                    <span>Added</span>
                                  </span>
                                ) : proj.status === "Partially Added" ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
                                    <span>Partially Added</span>
                                  </span>
                                ) : proj.status === "Yet To Deliver" ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                                    <span>Yet To Deliver</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                                    <span>Yet To Order</span>
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : activeDrillTab === "project_invoices" ? (
                /* Tab 2: Project Invoice Traceability Mapping */
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Project-to-Invoice Allocation Mapping
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Track which supplier invoice fulfilled each project allocation and download the invoice
                      </p>
                    </div>
                    <span className="text-xs text-slate-500 font-medium bg-slate-100 px-2.5 py-0.5 rounded-full">
                      {partDetails?.project_invoice_allocations?.length ?? 0} allocations
                    </span>
                  </div>

                  {!partDetails?.project_invoice_allocations || partDetails.project_invoice_allocations.length === 0 ? (
                    <div className="py-12 text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6">
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-2 text-slate-400 font-bold">
                        🔗
                      </div>
                      <p className="font-bold text-slate-700 text-sm">No Project Invoice Allocations</p>
                      <p className="text-xs text-slate-400 mt-1">
                        No quantities of part {selectedPartNumber} are currently assigned to active projects from invoices.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-slate-200/80 rounded-2xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                          <tr>
                            <th className="py-3 px-4">Project</th>
                            <th className="py-3 px-3">Supplier / Vendor</th>
                            <th className="py-3 px-3 text-center">Quantity Assigned</th>
                            <th className="py-3 px-3">Invoice Number</th>
                            <th className="py-3 px-3">Date</th>
                            <th className="py-3 px-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {partDetails.project_invoice_allocations.map((alloc, idx) => (
                            <tr key={`${alloc.project_key}-${alloc.invoice_number}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-3 px-4">
                                <Link
                                  href={`/projects/${alloc.project_key}`}
                                  className="font-bold text-slate-900 hover:text-indigo-600 transition-colors block"
                                >
                                  {alloc.project_name}
                                </Link>
                                <span className="font-mono text-[11px] text-slate-400">
                                  {alloc.project_code}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-slate-800 font-medium">
                                {alloc.vendor || "—"}
                              </td>
                              <td className="py-3 px-3 text-center font-mono font-bold text-indigo-700">
                                +{alloc.quantity}
                              </td>
                              <td className="py-3 px-3">
                                {alloc.invoice_number && alloc.invoice_number !== "Unassigned Batch" ? (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        await apiDownloadInvoiceByNumber(alloc.invoice_number);
                                        showToast(`Downloading invoice ${alloc.invoice_number}...`);
                                      } catch (err: any) {
                                        showToast(err?.message || "Invoice document not found");
                                      }
                                    }}
                                    className="inline-flex items-center gap-1.5 font-mono font-bold text-indigo-700 hover:text-indigo-900 underline decoration-indigo-300 hover:decoration-indigo-700 cursor-pointer"
                                    title="Click to download invoice"
                                  >
                                    <svg className="w-3.5 h-3.5 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                      <polyline points="14 2 14 8 20 8" />
                                      <line x1="16" y1="13" x2="8" y2="13" />
                                      <line x1="16" y1="17" x2="8" y2="17" />
                                      <polyline points="10 9 9 9 8 9" />
                                    </svg>
                                    <span>{alloc.invoice_number}</span>
                                  </button>
                                ) : (
                                  <span className="font-mono text-slate-400">{alloc.invoice_number || "—"}</span>
                                )}
                              </td>
                              <td className="py-3 px-3 text-slate-500 font-mono">
                                {alloc.invoice_date || "—"}
                              </td>
                              <td className="py-3 px-4 text-right">
                                {alloc.invoice_number && alloc.invoice_number !== "Unassigned Batch" ? (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        await apiDownloadInvoiceByNumber(alloc.invoice_number);
                                        showToast(`Downloading invoice ${alloc.invoice_number}...`);
                                      } catch (err: any) {
                                        showToast(err?.message || "Invoice document not found");
                                      }
                                    }}
                                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-lg text-xs cursor-pointer transition-colors"
                                  >
                                    <svg className="w-3.5 h-3.5 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                      <polyline points="7 10 12 15 17 10" />
                                      <line x1="12" y1="15" x2="12" y2="3" />
                                    </svg>
                                    <span>Download</span>
                                  </button>
                                ) : (
                                  <span className="text-xs text-slate-400">No file</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                /* Tab 3: Linked Invoices & Warranty History */
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Purchase Invoices &amp; Warranty Tracking
                    </h4>
                    <span className="text-xs text-slate-400">Use invoice codes for warranty claims</span>
                  </div>

                  {!partDetails?.linked_invoices || partDetails.linked_invoices.length === 0 ? (
                    <div className="py-12 text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6">
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-2 text-slate-400 font-bold">
                        📄
                      </div>
                      <p className="font-bold text-slate-700 text-sm">No Invoices Linked Yet</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Stock has not yet been received under an invoice for part {selectedPartNumber}. Click &ldquo;+ Add Item&rdquo; to add stock.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-slate-200/80 rounded-2xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                          <tr>
                            <th className="py-3 px-4">Invoice #</th>
                            <th className="py-3 px-3">Supplier / Vendor</th>
                            <th className="py-3 px-3">Invoice Date</th>
                            <th className="py-3 px-3 text-center">Quantity In</th>
                            <th className="py-3 px-4 text-right">Warranty Document</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {partDetails.linked_invoices.map((inv, idx) => (
                            <tr key={`${inv.invoice_number}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-3 px-4 font-mono font-bold text-indigo-700">
                                {inv.invoice_number}
                              </td>
                              <td className="py-3 px-3 text-slate-800 font-medium">
                                {inv.vendor || "—"}
                              </td>
                              <td className="py-3 px-3 text-slate-500 font-mono">
                                {inv.invoice_date || "—"}
                              </td>
                              <td className="py-3 px-3 text-center font-mono font-bold text-slate-900">
                                +{inv.quantity}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await apiDownloadInvoiceByNumber(inv.invoice_number);
                                      showToast(`Downloading invoice ${inv.invoice_number}...`);
                                    } catch (err: any) {
                                      showToast(err?.message || "Invoice document not found");
                                    }
                                  }}
                                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-lg text-xs cursor-pointer transition-colors"
                                >
                                  <svg className="w-3.5 h-3.5 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                  </svg>
                                  <span>View / Download</span>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between flex-shrink-0">
              <span className="text-xs text-slate-400">
                Use the linked invoice document code to file warranty claims with suppliers.
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedPartNumber(null);
                  setPartDetails(null);
                }}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
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