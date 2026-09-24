"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AdminPasswordModal } from "@/components";
import {
  API_BASE_URL,
  BackendCostingItem,
  apiGetProjectCosting,
  apiCreateProjectCosting,
  apiUpdateProjectCosting,
  apiDeleteProjectCosting,
  apiGetParts,
  apiGetInventory,
  BackendPartItem,
  BackendInventoryItem,
  getUserRole,
  isAdmin,
  isSiteSupervisor,
} from "@/lib/api";

export default function ProjectCostingPage() {
  const params = useParams();
  const router = useRouter();
  const rawId = (params?.id as string) || "p1";

  const [userRole, setUserRole] = useState<string>("");
  useEffect(() => {
    const syncRole = () => {
      const role = getUserRole();
      setUserRole(role);
      if (isSiteSupervisor()) {
        router.push("/projects");
      }
    };
    syncRole();
    window.addEventListener("auth_user_change", syncRole);
    return () => window.removeEventListener("auth_user_change", syncRole);
  }, [router]);

  const [projectInfo, setProjectInfo] = useState({
    name: "Loading project...",
    code: rawId,
    client: "",
    budget: "",
    po_number: "PO-101",
    start_date: "",
    current_stage: 1,
    total_stages: 7,
  });

  // Costing items state
  const [costingItems, setCostingItems] = useState<BackendCostingItem[]>([]);
  const [isLoadingCosting, setIsLoadingCosting] = useState(true);

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

  // Toast feedback state
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Costing Modal State (Add & Edit)
  const [isCostingModalOpen, setIsCostingModalOpen] = useState(false);
  const [editingCostingId, setEditingCostingId] = useState<number | null>(null);
  const [costingForm, setCostingForm] = useState<{
    part_no: string;
    description: string;
    qty: number;
    purchase_unit_price: number | string;
    margin: number | string;
    selling_unit_price: number;
    vendor: string;
    brand: string;
    invoice_number: string;
  }>({
    part_no: "",
    description: "",
    qty: 1,
    purchase_unit_price: "",
    margin: "",
    selling_unit_price: 0,
    vendor: "",
    brand: "",
    invoice_number: "",
  });

  // Master Parts & Inventory state for dynamic allocation
  const [masterParts, setMasterParts] = useState<BackendPartItem[]>([]);
  const [masterInventory, setMasterInventory] = useState<BackendInventoryItem[]>([]);
  const [isLoadingParts, setIsLoadingParts] = useState(false);

  // Custom Searchable Dropdown state for Part Selection
  const [isPartDropdownOpen, setIsPartDropdownOpen] = useState(false);
  const partDropdownRef = useRef<HTMLDivElement>(null);

  // Close part dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (partDropdownRef.current && !partDropdownRef.current.contains(event.target as Node)) {
        setIsPartDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch Project Meta
  useEffect(() => {
    const fetchProject = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/projects/${rawId}`);
        if (res.ok) {
          const data = await res.json();
          const poNum = data.commercial_stages?.[0]?.po_number || data.code || "PO-101";
          setProjectInfo({
            name: data.name || "Project Details",
            code: data.code || rawId,
            client: data.client || "",
            budget: data.budget || "",
            po_number: poNum,
            start_date: data.start_date || "",
            current_stage: data.current_stage || 1,
            total_stages: data.total_stages || 7,
          });
        }
      } catch (err) {
        console.warn("Could not load project meta for Costing", err);
      }
    };
    fetchProject();
  }, [rawId]);

  // Load Costing Line Items from FastAPI backend
  const loadCostingData = async () => {
    setIsLoadingCosting(true);
    try {
      const data = await apiGetProjectCosting(rawId);
      if (Array.isArray(data)) {
        setCostingItems(data);
      }
    } catch (err) {
      console.warn("Could not load costing data from backend", err);
    } finally {
      setIsLoadingCosting(false);
    }
  };

  // Load Master Parts & Inventory for selection
  const loadMasterInventoryAndParts = async () => {
    setIsLoadingParts(true);
    try {
      const [partsRes, invRes] = await Promise.all([apiGetParts(), apiGetInventory()]);
      setMasterParts(partsRes.items || []);
      setMasterInventory(invRes.items || []);
    } catch (err) {
      console.warn("Could not load master inventory / parts", err);
    } finally {
      setIsLoadingParts(false);
    }
  };

  useEffect(() => {
    if (rawId) {
      loadCostingData();
      loadMasterInventoryAndParts();
    }
  }, [rawId]);

  // Combined registered part list for search & autofill
  const allRegisteredParts = useMemo(() => {
    const map = new Map<
      string,
      {
        part_number: string;
        product_name: string;
        description: string;
        brand?: string;
        vendor?: string;
        unit_price?: number;
      }
    >();

    // 1. Add MasterParts
    for (const p of masterParts) {
      if (p.part_number && p.is_active !== false) {
        const prod = (p.product_name || p.description || "").trim();
        map.set(p.part_number.trim().toUpperCase(), {
          part_number: p.part_number.trim(),
          product_name: prod,
          description: prod,
        });
      }
    }

    // 2. Enhance with brand/vendor/price from inventory or add inventory items with product_name
    for (const inv of masterInventory) {
      if (inv.part_number && inv.is_active !== false) {
        const key = inv.part_number.trim().toUpperCase();
        const existing = map.get(key);
        if (existing) {
          if (!existing.product_name && inv.product_name) {
            existing.product_name = inv.product_name.trim();
            existing.description = inv.product_name.trim();
          }
          if (inv.brand && !existing.brand) existing.brand = inv.brand.trim();
          if (inv.vendor && !existing.vendor) existing.vendor = inv.vendor.trim();
          if ((inv as any).unit_price !== undefined && existing.unit_price === undefined) {
            existing.unit_price = Number((inv as any).unit_price);
          }
        } else if (inv.product_name && inv.product_name.trim()) {
          map.set(key, {
            part_number: inv.part_number.trim(),
            product_name: inv.product_name.trim(),
            description: inv.product_name.trim(),
            brand: inv.brand || "",
            vendor: inv.vendor || "",
            unit_price: (inv as any).unit_price !== undefined ? Number((inv as any).unit_price) : undefined,
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.part_number.localeCompare(b.part_number));
  }, [masterParts, masterInventory]);

  // Filtered parts for custom combobox dropdown
  const filteredParts = useMemo(() => {
    const q = (costingForm.part_no || "").trim().toLowerCase();
    if (!q) return allRegisteredParts;
    return allRegisteredParts.filter(
      (p) =>
        p.part_number.toLowerCase().includes(q) ||
        (p.product_name && p.product_name.toLowerCase().includes(q)) ||
        (p.brand && p.brand.toLowerCase().includes(q)) ||
        (p.vendor && p.vendor.toLowerCase().includes(q))
    );
  }, [allRegisteredParts, costingForm.part_no]);

  // Stock lookup
  const getPartStockInfo = (partNumber: string) => {
    if (!partNumber) return { available: 0, total: 0, product_name: "", brand: "", vendor: "" };
    const norm = partNumber.trim().toUpperCase();
    const matchedItems = masterInventory.filter(
      (inv) => (inv.part_number || "").trim().toUpperCase() === norm
    );
    const p = masterParts.find((pt) => pt.part_number.trim().toUpperCase() === norm);
    const prodName = (p?.product_name || p?.description || matchedItems[0]?.product_name || "").trim();

    if (matchedItems.length === 0) {
      return {
        available: 0,
        total: 0,
        product_name: prodName,
        brand: p?.brand || "",
        vendor: p?.vendor || "",
      };
    }
    const total = matchedItems.reduce((acc, it) => acc + (it.quantity || 0), 0);
    const availVal = matchedItems[0]?.available_quantity;
    const available = availVal !== undefined && availVal !== null ? Number(availVal) : total;
    const first = matchedItems[0];
    return {
      available,
      total,
      product_name: prodName || first.product_name || "",
      brand: first.brand || p?.brand || "",
      vendor: first.vendor || p?.vendor || "",
    };
  };

  // Computed summary for Costing
  const costingSummary = useMemo(() => {
    const totalPurchase = costingItems.reduce((acc, item) => acc + (item.purchase_total || 0), 0);
    const totalSelling = costingItems.reduce((acc, item) => acc + (item.selling_total || 0), 0);
    const totalProfit = totalSelling - totalPurchase;
    const profitMarginPct = totalSelling > 0 ? (totalProfit / totalSelling) * 100 : 0;

    return {
      totalPurchase,
      totalSelling,
      totalProfit,
      profitMarginPct,
    };
  }, [costingItems]);

  // Costing Form calculation helpers: Selling Unit = Purchase Unit * (1 + margin_percentage / 100)
  const handleCostingInputChange = (field: string, value: any) => {
    setCostingForm((prev) => {
      const updated = { ...prev, [field]: value };
      if (field === "purchase_unit_price" || field === "margin") {
        const cost = Number(field === "purchase_unit_price" ? value : updated.purchase_unit_price) || 0;
        const marginPct = Number(field === "margin" ? value : updated.margin) || 0;
        const calculatedSelling = cost * (1 + marginPct / 100);
        updated.selling_unit_price = Number(calculatedSelling.toFixed(2));
      }
      return updated;
    });
  };

  // Auto-fill product, brand, vendor upon part selection / search
  const handlePartSelect = (partNoOrSearch: string) => {
    const norm = partNoOrSearch.trim().toUpperCase();
    const matched = allRegisteredParts.find(
      (p) => p.part_number.trim().toUpperCase() === norm
    );

    setCostingForm((prev) => {
      const updated = {
        ...prev,
        part_no: partNoOrSearch,
      };
      if (matched) {
        updated.part_no = matched.part_number;
        const prod = (matched.product_name || matched.description || "").trim();
        if (prod) updated.description = prod;
        if (matched.brand) updated.brand = matched.brand;
        if (matched.vendor) updated.vendor = matched.vendor;
        if (matched.unit_price !== undefined && (!prev.purchase_unit_price || Number(prev.purchase_unit_price) === 0)) {
          updated.purchase_unit_price = matched.unit_price;
        }
      } else {
        const direct = masterParts.find((pt) => pt.part_number.trim().toUpperCase() === norm);
        if (direct) {
          updated.part_no = direct.part_number;
          const prod = (direct.product_name || direct.description || "").trim();
          if (prod) updated.description = prod;
        }
      }
      const cost = Number(updated.purchase_unit_price) || 0;
      const marginPct = Number(updated.margin) || 0;
      const calculatedSelling = cost * (1 + marginPct / 100);
      updated.selling_unit_price = Number(calculatedSelling.toFixed(2));
      return updated;
    });
  };

  // Open Add Costing Item Modal
  const handleOpenAddCosting = () => {
    setEditingCostingId(null);
    setCostingForm({
      part_no: "",
      description: "",
      qty: 1,
      purchase_unit_price: "",
      margin: "",
      selling_unit_price: 0,
      vendor: "",
      brand: "",
      invoice_number: "",
    });
    setIsCostingModalOpen(true);
  };

  // Open Edit Costing Item Modal (Requires Admin Password)
  const handleOpenEditCosting = (item: BackendCostingItem) => {
    setAdminAuthModal({
      isOpen: true,
      title: "Authorize Costing Edit",
      description: `Enter Admin password to edit line item "${item.description || item.part_no}".`,
      actionLabel: "Edit Item",
      actionType: "warning",
      onSuccess: () => {
        setEditingCostingId(item.id);
        const rawMargin = Number(item.margin) || 0;
        // Backward-compatibility: if legacy factor was < 1 (e.g. 0.25 -> 25), convert to percentage
        const marginPct =
          rawMargin > 0 && rawMargin < 1
            ? (item.selling_margin_percent || Math.round((1 - rawMargin) * 100))
            : rawMargin;
        setCostingForm({
          part_no: item.part_no,
          description: item.description,
          qty: item.qty,
          purchase_unit_price: item.purchase_unit_price,
          margin: marginPct > 0 ? marginPct : "",
          selling_unit_price: item.selling_unit_price,
          vendor: item.vendor || "",
          brand: item.brand || "",
          invoice_number: item.invoice_number || "",
        });
        setIsCostingModalOpen(true);
      },
    });
  };

  // Save / Update Costing Item (Decoupled from Inventory Allocation)
  const handleSaveCostingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(costingForm.qty) || 1;
    const purchaseUnit = Number(costingForm.purchase_unit_price) || 0;
    const marginFactor = Number(costingForm.margin) || 0;
    const purchaseTotal = Number((qty * purchaseUnit).toFixed(2));
    const sellingUnit = Number((purchaseUnit * (1 + marginFactor / 100)).toFixed(2));
    const sellingTotal = Number((qty * sellingUnit).toFixed(2));

    try {
      if (editingCostingId) {
        const updated = await apiUpdateProjectCosting(rawId, editingCostingId, {
          part_no: costingForm.part_no,
          description: costingForm.description,
          qty,
          purchase_unit_price: purchaseUnit,
          purchase_total: purchaseTotal,
          margin: marginFactor,
          selling_margin_percent: marginFactor,
          selling_unit_price: sellingUnit,
          selling_total: sellingTotal,
          vendor: costingForm.vendor,
          brand: costingForm.brand,
          invoice_number: "",
        });
        setCostingItems((prev) => prev.map((item) => (item.id === editingCostingId ? updated : item)));
        showToast("Costing item updated successfully!");
      } else {
        const created = await apiCreateProjectCosting(rawId, {
          sl_no: costingItems.length + 1,
          part_no: costingForm.part_no,
          description: costingForm.description,
          qty,
          purchase_unit_price: purchaseUnit,
          purchase_total: purchaseTotal,
          margin: marginFactor,
          selling_margin_percent: marginFactor,
          selling_unit_price: sellingUnit,
          selling_total: sellingTotal,
          vendor: costingForm.vendor,
          brand: costingForm.brand,
          invoice_number: "",
          procurement_status: "Yet To Order",
          allocated_qty: 0,
          remaining_qty: qty,
        });
        setCostingItems((prev) => [...prev, created]);
        showToast("New costing item added successfully!");
      }
      setIsCostingModalOpen(false);
      window.dispatchEvent(new CustomEvent("inventory_store_update"));
    } catch (err: any) {
      console.error("Failed to save costing item", err);
      showToast(err?.message || "Failed to save costing item");
    }
  };

  // Delete Costing Item (Requires Admin Password)
  const handleDeleteCostingItem = (id: number, desc: string) => {
    setAdminAuthModal({
      isOpen: true,
      title: "Authorize Item Deletion",
      description: `Enter Admin password to permanently delete item "${desc || id}".`,
      actionLabel: "Delete Item",
      actionType: "danger",
      onSuccess: async () => {
        try {
          await apiDeleteProjectCosting(rawId, id);
          setCostingItems((prev) => prev.filter((item) => item.id !== id));
          showToast("Costing item deleted successfully!");
          window.dispatchEvent(new CustomEvent("inventory_store_update"));
        } catch (err: any) {
          console.error("Failed to delete costing item", err);
          showToast(err?.message || "Failed to delete costing item");
        }
      },
    });
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Toast Feedback */}
      {toastMsg && (
        <div className="fixed top-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-xl border border-slate-700 animate-in fade-in slide-in-from-top-3 duration-200">
          {toastMsg}
        </div>
      )}

      {/* Header with Project Details & Action Button */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-1">
            <Link href="/projects" className="hover:text-indigo-600 transition-colors">
              Projects
            </Link>
            <span>/</span>
            <Link href={`/projects/${rawId}`} className="hover:text-indigo-600 transition-colors">
              {projectInfo.name}
            </Link>
            <span>/</span>
            <span className="text-slate-900 font-bold">Costing & Margin Analysis</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Project Costing & Margin Analysis
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
              {projectInfo.code}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Client: <strong className="text-slate-700">{projectInfo.client || "Client"}</strong> • PO:{" "}
            <strong className="text-slate-700 font-mono">{projectInfo.po_number}</strong>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/projects/${rawId}`}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span>Back to Project</span>
          </Link>

          <button
            type="button"
            onClick={handleOpenAddCosting}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all cursor-pointer active:scale-98"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Add Costing Item</span>
          </button>
        </div>
      </div>

      {/* Executive KPI Summary Cards with Rich Gradients */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="relative overflow-hidden p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-white via-slate-50 to-slate-100/70 border border-slate-200/90 shadow-2xs hover:shadow-md transition-all duration-200 group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
              Total Purchase Cost
            </span>
            <span className="p-2 rounded-xl bg-slate-100 text-slate-700 group-hover:scale-110 transition-transform">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <path d="M16 10a4 4 0 0 1-8 0"></path>
              </svg>
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-black text-slate-900 font-mono tracking-tight">
              {costingSummary.totalPurchase.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
            <span className="text-xs font-bold text-slate-400">AED</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">BOM procurement cost</p>
        </div>

        <div className="relative overflow-hidden p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-white via-indigo-50/40 to-indigo-100/60 border border-indigo-100/90 shadow-2xs hover:shadow-md transition-all duration-200 group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-indigo-700 uppercase tracking-wider">
              Total Selling Value
            </span>
            <span className="p-2 rounded-xl bg-indigo-100/80 text-indigo-700 group-hover:scale-110 transition-transform">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="1" x2="12" y2="23"></line>
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
              </svg>
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-black text-indigo-900 font-mono tracking-tight">
              {costingSummary.totalSelling.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
            <span className="text-xs font-bold text-indigo-500">AED</span>
          </div>
          <p className="text-[11px] text-indigo-600/80 mt-1 font-medium">Contract selling quotation</p>
        </div>

        <div className="relative overflow-hidden p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-emerald-50/60 via-teal-50/40 to-emerald-100/70 border border-emerald-200/90 shadow-2xs hover:shadow-md transition-all duration-200 group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-emerald-800 uppercase tracking-wider">
              Net Profit
            </span>
            <span className="p-2 rounded-xl bg-emerald-500 text-white shadow-xs group-hover:scale-110 transition-transform">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
                <polyline points="17 6 23 6 23 12"></polyline>
              </svg>
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-black text-emerald-700 font-mono tracking-tight">
              +{costingSummary.totalProfit.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
            <span className="text-xs font-bold text-emerald-600">AED</span>
          </div>
          <p className="text-[11px] text-emerald-700 mt-1 font-semibold">Net margin after procurement</p>
        </div>

        <div className="relative overflow-hidden p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-white via-violet-50/40 to-purple-100/60 border border-purple-100/90 shadow-2xs hover:shadow-md transition-all duration-200 group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-purple-700 uppercase tracking-wider">
              Profit Margin
            </span>
            <span className="p-2 rounded-xl bg-purple-100 text-purple-700 group-hover:scale-110 transition-transform">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M16 8l-8 8"></path>
                <circle cx="9" cy="9" r="1" fill="currentColor"></circle>
                <circle cx="15" cy="15" r="1" fill="currentColor"></circle>
              </svg>
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="text-2xl sm:text-3xl font-black text-purple-900 font-mono tracking-tight">
              {costingSummary.profitMarginPct.toFixed(1)}%
            </span>
          </div>
          <p className="text-[11px] text-purple-600/80 mt-1 font-medium">Overall calculated margin</p>
        </div>
      </div>

      {/* Excel-Style Costing Spreadsheet Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
            <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
              Detailed Bill of Materials & Internal Costing
            </h3>
            <span className="text-xs text-slate-400">
              (Purchase Total = Qty × Unit Price, Selling Unit Price = Purchase Unit × (1 + Margin %))
            </span>
          </div>
          <button
            type="button"
            onClick={loadCostingData}
            className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer font-medium"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            <span>Refresh</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm border-collapse min-w-[1100px]">
            <thead>
              <tr className="bg-[#0f172a] text-white font-bold border-b border-slate-700 text-center">
                <th className="py-3 px-2 border-r border-slate-700 w-12" rowSpan={2}>
                  Sl No
                </th>
                <th className="py-3 px-3 border-r border-slate-700 w-28 text-left" rowSpan={2}>
                  Part No
                </th>
                <th className="py-3 px-4 border-r border-slate-700 text-left min-w-[200px]" rowSpan={2}>
                  Product
                </th>
                <th className="py-2 px-3 border-r border-slate-700 bg-slate-800" colSpan={3}>
                  PURCHASE COST
                </th>
                <th className="py-3 px-3 border-r border-slate-700 w-24" rowSpan={2}>
                  Margin %
                </th>
                <th className="py-2 px-3 border-r border-slate-700 bg-indigo-950" colSpan={2}>
                  SELLING COST (QUOTATION)
                </th>
                <th className="py-3 px-3 border-r border-slate-700 w-28" rowSpan={2}>
                  Profit (AED)
                </th>
                <th className="py-3 px-3 w-20 text-center" rowSpan={2}>
                  Actions
                </th>
              </tr>
              <tr className="bg-slate-800 text-white font-semibold text-xs border-b border-slate-700 text-right">
                <th className="py-2 px-3 border-r border-slate-700">Unit Price</th>
                <th className="py-2 px-2 border-r border-slate-700 w-16 text-center">Qty</th>
                <th className="py-2 px-3 border-r border-slate-700 bg-slate-700/60 font-bold">Total (AED)</th>
                <th className="py-2 px-3 border-r border-slate-700 bg-indigo-900/60">Unit Price</th>
                <th className="py-2 px-3 border-r border-slate-700 bg-indigo-900/80 font-bold">Total (AED)</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {isLoadingCosting ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-slate-400">
                    Loading costing sheet...
                  </td>
                </tr>
              ) : costingItems.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-slate-400">
                    No items in costing sheet. Click <strong>Add Costing Item</strong> above.
                  </td>
                </tr>
              ) : (
                costingItems.map((item, idx) => {
                  const profit = (item.selling_total || 0) - (item.purchase_total || 0);
                  const rawMargin = Number(item.margin) || 0;
                  const marginPct =
                    rawMargin > 0 && rawMargin < 1
                      ? (item.selling_margin_percent || (1 - rawMargin) * 100)
                      : rawMargin;
                  return (
                    <tr key={item.id} className="hover:bg-indigo-50/30 transition-colors">
                      <td className="py-3 px-2 text-center font-mono font-medium text-slate-500 border-r border-slate-200">
                        {item.sl_no || idx + 1}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-900 border-r border-slate-200">
                        {item.part_no}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800 border-r border-slate-200">
                        <div>{item.description}</div>
                        {(item.brand || item.vendor) && (
                          <div className="text-[11px] text-slate-400 font-normal">
                            {item.brand && `Brand: ${item.brand}`}
                            {item.brand && item.vendor && " • "}
                            {item.vendor && `Supplier: ${item.vendor}`}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-700 border-r border-slate-200">
                        {item.purchase_unit_price.toFixed(2)}
                      </td>
                      <td className="py-3 px-2 text-center font-mono font-black text-slate-900 border-r border-slate-200">
                        {item.qty}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 bg-slate-50/50 border-r border-slate-200">
                        {item.purchase_total.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-center border-r border-slate-200">
                        <span className="px-2 py-0.5 rounded-md text-xs font-bold font-mono bg-purple-100 text-purple-800 border border-purple-200">
                          {marginPct > 0 ? `${marginPct.toFixed(1)}%` : "0.0%"}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-indigo-700 border-r border-slate-200">
                        {item.selling_unit_price.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-black text-indigo-900 bg-indigo-50/40 border-r border-slate-200">
                        {item.selling_total.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-emerald-600 border-r border-slate-200">
                        +{profit.toFixed(2)}
                      </td>
                      <td className="py-3 px-2 text-center">
                        {isAdmin() ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEditCosting(item)}
                              title="Edit item"
                              className="p-1 rounded-md text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCostingItem(item.id, item.description || item.part_no)}
                              title="Delete item"
                              className="p-1 rounded-md text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer"
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                  );
                })
              )}
            </tbody>

            {/* Footer Totals Row */}
            {costingItems.length > 0 && (
              <tfoot>
                <tr className="bg-slate-100 font-extrabold text-slate-900 border-t-2 border-slate-300">
                  <td colSpan={5} className="py-3.5 px-4 text-right uppercase tracking-wider text-xs font-bold text-slate-600">
                    BOM Summary Totals:
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono font-black text-slate-900 bg-slate-200/70 border-r border-slate-300">
                    {costingSummary.totalPurchase.toLocaleString(undefined, { minimumFractionDigits: 2 })} AED
                  </td>
                  <td className="py-3.5 px-3 text-center text-xs font-semibold text-purple-700 border-r border-slate-300">
                    Avg: {costingSummary.profitMarginPct.toFixed(1)}%
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono text-slate-500 border-r border-slate-300"></td>
                  <td className="py-3.5 px-3 text-right font-mono font-black text-indigo-900 bg-indigo-100/70 border-r border-slate-300">
                    {costingSummary.totalSelling.toLocaleString(undefined, { minimumFractionDigits: 2 })} AED
                  </td>
                  <td className="py-3.5 px-2 text-center bg-emerald-50/60 border-t border-emerald-200">
                    <span className="inline-block px-2 py-1 rounded-md bg-emerald-600 text-white font-mono text-xs font-bold whitespace-nowrap shadow-2xs">
                      +{costingSummary.totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* MODAL: ADD / EDIT COSTING ITEM */}
      {isCostingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-gradient-to-r from-[#0c1033] to-[#1a2063] text-white flex items-center justify-between">
              <h3 className="font-extrabold text-base sm:text-lg">
                {editingCostingId ? "Edit Costing Item" : "Add Costing Item"}
              </h3>
              <button
                type="button"
                onClick={() => setIsCostingModalOpen(false)}
                className="text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCostingSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="relative" ref={partDropdownRef}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700">
                      Master Inventory Part <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[11px] text-slate-400 font-medium">
                      {allRegisteredParts.length} registered
                    </span>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={costingForm.part_no}
                      onFocus={() => setIsPartDropdownOpen(true)}
                      onChange={(e) => {
                        handlePartSelect(e.target.value);
                        setIsPartDropdownOpen(true);
                      }}
                      placeholder="Search or enter part number..."
                      className="w-full pl-8 pr-12 py-2 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono bg-white font-medium uppercase tracking-wide"
                    />

                    {/* Left Search Icon */}
                    <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                    </div>

                    {/* Right Controls: Clear + Dropdown Chevron */}
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      {costingForm.part_no ? (
                        <button
                          type="button"
                          onClick={() => {
                            handlePartSelect("");
                            setIsPartDropdownOpen(true);
                          }}
                          title="Clear part"
                          className="text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setIsPartDropdownOpen((prev) => !prev)}
                        className="text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                        title="Toggle dropdown"
                      >
                        <svg
                          className={`w-3.5 h-3.5 transition-transform duration-150 ${isPartDropdownOpen ? "rotate-180" : ""}`}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Custom Styled Dropdown Panel matching Website UI */}
                  {isPartDropdownOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                      <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                        {filteredParts.length === 0 ? (
                          <div className="p-4 text-center">
                            <p className="text-xs text-slate-500 font-medium">No matching registered parts</p>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              You can keep &quot;{costingForm.part_no}&quot; as a custom part number
                            </p>
                          </div>
                        ) : (
                          filteredParts.map((p) => {
                            const isSelected = costingForm.part_no.toUpperCase() === p.part_number.toUpperCase();
                            return (
                              <div
                                key={p.part_number}
                                onClick={() => {
                                  handlePartSelect(p.part_number);
                                  setIsPartDropdownOpen(false);
                                }}
                                className={`p-2.5 hover:bg-indigo-50/70 cursor-pointer transition-colors flex items-center justify-between group ${
                                  isSelected ? "bg-indigo-50/90" : ""
                                }`}
                              >
                                <div className="min-w-0 pr-2">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-xs text-slate-900 group-hover:text-indigo-600">
                                      {p.part_number}
                                    </span>
                                    {p.brand && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                                        {p.brand}
                                      </span>
                                    )}
                                  </div>
                                  {p.product_name && (
                                    <p className="text-xs text-slate-500 truncate mt-0.5 group-hover:text-slate-700">
                                      {p.product_name}
                                    </p>
                                  )}
                                </div>

                                <div className="text-right flex-shrink-0">
                                  {isSelected ? (
                                    <span className="inline-flex items-center text-xs font-bold text-indigo-600">
                                      ✓
                                    </span>
                                  ) : (
                                    <span className="text-[11px] text-slate-400 group-hover:text-indigo-600 font-medium">
                                      Select →
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Brand (Optional)</label>
                  <input
                    type="text"
                    value={costingForm.brand}
                    onChange={(e) => handleCostingInputChange("brand", e.target.value)}
                    placeholder="e.g. Schneider"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Product <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={costingForm.description}
                    onChange={(e) => handleCostingInputChange("description", e.target.value)}
                    placeholder="e.g. Smart Relay Module 8-Channel DIN"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Vendor / Supplier (Optional)</label>
                  <input
                    type="text"
                    value={costingForm.vendor}
                    onChange={(e) => handleCostingInputChange("vendor", e.target.value)}
                    placeholder="e.g. Schneider Electric UAE"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Purchase Unit (AED) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    placeholder="0.00"
                    value={costingForm.purchase_unit_price !== undefined && costingForm.purchase_unit_price !== null ? costingForm.purchase_unit_price : ""}
                    onChange={(e) => handleCostingInputChange("purchase_unit_price", e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Quantity <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    required
                    value={costingForm.qty}
                    onChange={(e) => handleCostingInputChange("qty", e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Margin Factor (%)</label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="e.g. 25"
                      value={costingForm.margin !== undefined && costingForm.margin !== null ? costingForm.margin : ""}
                      onChange={(e) => handleCostingInputChange("margin", e.target.value)}
                      className="w-full pl-3 pr-7 py-2 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
                      %
                    </span>
                  </div>
                </div>
              </div>

              {/* Live Formula Preview Box */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Purchase Total (Unit Price × Qty):</span>
                  <span className="font-mono font-bold text-slate-900">
                    {((Number(costingForm.qty) || 1) * (Number(costingForm.purchase_unit_price) || 0)).toFixed(2)} AED
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Margin Factor:</span>
                  <span className="font-mono font-bold text-indigo-600">
                    {Number(costingForm.margin) > 0 ? `+${Number(costingForm.margin)}%` : "0%"}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Selling Unit Price ({Number(costingForm.purchase_unit_price) || 0} AED + {Number(costingForm.margin) || 0}%):</span>
                  <span className="font-mono font-bold text-slate-900">
                    {Number(costingForm.selling_unit_price || 0).toFixed(2)} AED
                  </span>
                </div>
                <div className="flex justify-between text-slate-900 font-bold border-t border-slate-200 pt-1.5">
                  <span>Computed Selling Total (Qty × Selling Unit):</span>
                  <span className="font-mono text-indigo-700 text-sm">
                    {((Number(costingForm.qty) || 1) * (Number(costingForm.selling_unit_price) || 0)).toFixed(2)} AED
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCostingModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  {editingCostingId ? "Update Item" : "Save Item"}
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
