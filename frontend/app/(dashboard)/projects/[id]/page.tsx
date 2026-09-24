"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ThemeDatePicker, AdminPasswordModal } from "@/components";
import {
  API_BASE_URL,
  getStoredToken,
  getStoredUser,
  apiGetProjectCosting,
  apiCreateProjectCosting,
  apiUpdateProjectCosting,
  apiGetProjectSOA,
  BackendSOAItem,
  apiUpdateProjectSectionStatus,
  apiGetParts,
  apiGetInventory,
  apiGetManpower,
  apiGetProjectResources,
  apiCreateProjectResource,
  apiDeleteProjectResource,
  BackendPartItem,
  BackendInventoryItem,
  BackendProjectItem,
  BackendManpower,
  BackendResourceItem,
  SectionStatusType,
  getUserRole,
  isAdmin,
  isSiteSupervisor,
  apiGetSiteExecutionLogs,
  apiCreateSiteExecutionLog,
  apiUpdateSiteExecutionLog,
  apiDeleteSiteExecutionLog,
  apiUpdateSiteVerifiedProgress,
  BackendSiteExecutionLog,
  SiteExecutionImageItem,
  apiGetProjectProcurement,
  apiCreateProjectProcurement,
  apiUpdateProjectProcurement,
  apiDeleteProjectProcurement,
  apiShiftProjectProcurement,
  apiGetProjects,
  BackendProcurementItem,
} from "@/lib/api";
import {
  exportResourcesToExcel,
  exportSiteExecutionToPdf,
  exportProjectDossierToPdf,
} from "@/lib/exportUtils";
import {
  addActivityLog,
  fetchActivityLogsFromBackend,
  getStoredSystemLogs,
} from "@/lib/logsStore";

interface DocumentItem {
  id: string;
  name: string;
  size: string;
  date: string;
  fileUrl?: string;
  fileType?: string;
}

interface ProcurementItem extends Partial<BackendProcurementItem> {
  id?: number;
  sl: number;
  vendor: string;
  product: string;
  brand: string;
  part: string;
  qty: number;
  invoiceNumber: string;
  status: "Added" | "Partially Added" | "Yet To Order" | "Yet To Deliver" | string;
  allocated_qty?: number;
  remaining_qty?: number;
  available_stock?: number;
}


interface SiteProgressItem {
  sl: number;
  supervisor: string;
  date: string;
  percentage: number;
  percentageLabel: string;
  imageThumbnail: string;
  phaseName: string;
}

interface ProjectMeta {
  name: string;
  client: string;
  location: string;
  code: string;
  priority: string;
  priorityLevel: "high" | "medium" | "low";
  budget: string;
  contractValue: string;
  poNumber: string;
  poDate: string;
  startDate?: string;
  currentStage?: number;
  totalStages?: number;
  manager?: string;
  verified_progress_percentage?: number;
}

export interface CommercialBlock {
  id: string;
  stageNumber: number;
  status: "in_progress" | "completed";
  poNumber: string;
  poDate: string;
  contractValue: string;
  isSaved: boolean;
  documents: DocumentItem[];
}

export interface EngineeringBlock {
  id: string;
  stageNumber: number;
  status: "in_progress" | "completed";
  documents: DocumentItem[];
}

export default function ProjectDetailsPage() {
  const params = useParams();
  const rawId = (params?.id as string) || "p1";

  // State for project meta
  const [projectInfo, setProjectInfo] = useState<ProjectMeta>({
    name: "Loading project...",
    client: "",
    location: "",
    code: rawId,
    priority: "High",
    priorityLevel: "high",
    budget: "",
    contractValue: "",
    poNumber: "",
    poDate: "",
  });

  const [userRole, setUserRole] = useState<string>("");
  useEffect(() => {
    const syncRole = () => setUserRole(getUserRole());
    syncRole();
    window.addEventListener("auth_user_change", syncRole);
    return () => window.removeEventListener("auth_user_change", syncRole);
  }, []);

  const currentUser = getStoredUser();
  const userDisplayName = currentUser?.full_name || currentUser?.name || currentUser?.email || (isSiteSupervisor() ? "Site Supervisor" : "Manager");
  const isManagerOrAdmin = isAdmin() || userRole === "Admin" || userRole === "Administrator" || userRole === "Project Manager" || userRole === "project_manager";

  const [isPriorityMenuOpen, setIsPriorityMenuOpen] = useState(false);

  // Close priority menu on click outside
  useEffect(() => {
    const handleClick = () => setIsPriorityMenuOpen(false);
    if (isPriorityMenuOpen) window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [isPriorityMenuOpen]);

  const updateDetailPriority = (newPriority: "High" | "Medium" | "Low") => {
    setIsPriorityMenuOpen(false);
    setAdminAuthModal({
      isOpen: true,
      title: "Authorize Priority Change",
      description: `Enter Admin password to update project priority to ${newPriority}.`,
      actionLabel: "Update Priority",
      actionType: "warning",
      onSuccess: async () => {
        const newLevel = (newPriority === "High" ? "high" : newPriority === "Medium" ? "medium" : "low") as "high" | "medium" | "low";
        setProjectInfo((prev) => ({ ...prev, priority: newPriority, priorityLevel: newLevel }));
        try {
          await fetch(`${API_BASE_URL}/projects/${rawId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ priority: newPriority }),
          });
        } catch { }
        showToast(`Project priority set to ${newPriority}`);
      },
    });
  };

  // Section Accordion expanded states: ALL CLOSED BY DEFAULT as requested
  const [openSections, setOpenSections] = useState<{ [key: string]: boolean }>({
    commercial: false,
    engineering: false,
    budget: false,
    procurement: false,
    soa: false,
    resource: false,
    siteExecution: false,
    handover: false,
  });

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const expandAll = () => {
    setOpenSections({
      commercial: true,
      engineering: true,
      budget: true,
      procurement: true,
      soa: true,
      resource: true,
      siteExecution: true,
      handover: true,
    });
  };

  const collapseAll = () => {
    setOpenSections({
      commercial: false,
      engineering: false,
      budget: false,
      procurement: false,
      soa: false,
      resource: false,
      siteExecution: false,
      handover: false,
    });
  };

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
    onSuccess: () => { },
  });

  // Toast feedback state
  const [toastMsg, setToastMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToastMsg({ text: msg, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  // 7 Section Statuses (forward-only: not_started -> in_progress -> completed)
  const [commercialStatus, setCommercialStatus] = useState<SectionStatusType>("not_started");
  const [engineeringStatus, setEngineeringStatus] = useState<SectionStatusType>("not_started");
  const [budgetStatus, setBudgetStatus] = useState<SectionStatusType>("not_started");
  const [procurementStatus, setProcurementStatus] = useState<SectionStatusType>("not_started");
  const [soaStatus, setSoaStatus] = useState<SectionStatusType>("not_started");
  const [resourceStatus, setResourceStatus] = useState<SectionStatusType>("not_started");
  const [siteExecutionStatus, setSiteExecutionStatus] = useState<SectionStatusType>("not_started");
  const [handoverStatus, setHandoverStatus] = useState<SectionStatusType>("not_started");

  type SectionKey =
    | "commercial_status"
    | "engineering_status"
    | "budget_status"
    | "procurement_status"
    | "soa_status"
    | "resource_status"
    | "site_execution_status"
    | "handover_status";

  const STATUS_RANKS: Record<SectionStatusType, number> = {
    not_started: 0,
    in_progress: 1,
    completed: 2,
  };

  const getSectionStatus = (key: SectionKey): SectionStatusType => {
    switch (key) {
      case "commercial_status": return commercialStatus;
      case "engineering_status": return engineeringStatus;
      case "budget_status": return budgetStatus;
      case "procurement_status": return procurementStatus;
      case "soa_status": return soaStatus;
      case "resource_status": return resourceStatus;
      case "site_execution_status": return siteExecutionStatus;
      case "handover_status": return handoverStatus;
    }
  };

  const setLocalSectionStatus = (key: SectionKey, status: SectionStatusType) => {
    switch (key) {
      case "commercial_status": setCommercialStatus(status); break;
      case "engineering_status": setEngineeringStatus(status); break;
      case "budget_status": setBudgetStatus(status); break;
      case "procurement_status": setProcurementStatus(status); break;
      case "soa_status": setSoaStatus(status); break;
      case "resource_status": setResourceStatus(status); break;
      case "site_execution_status": setSiteExecutionStatus(status); break;
      case "handover_status": setHandoverStatus(status); break;
    }
  };

  const handleUpdateSectionStatus = async (
    sectionKey: SectionKey,
    newStatus: SectionStatusType
  ) => {
    const currentStatus = getSectionStatus(sectionKey);
    if (STATUS_RANKS[newStatus] < STATUS_RANKS[currentStatus]) {
      showToast("Cannot roll back status. Progression is forward-only.");
      return;
    }

    const previousStatus = currentStatus;
    setLocalSectionStatus(sectionKey, newStatus);

    try {
      await apiUpdateProjectSectionStatus(rawId, sectionKey, newStatus);
      const label = newStatus === "completed" ? "Completed" : newStatus === "in_progress" ? "In Progress" : "Not Started";
      showToast(`Status updated to ${label}`);
      window.dispatchEvent(new CustomEvent("inventory_store_update"));
      const sectionNames: Record<SectionKey, string> = {
        commercial_status: "Commercial Approval",
        engineering_status: "Engineering & Documentation",
        budget_status: "Budget & Costing",
        procurement_status: "Procurement",
        soa_status: "SOA",
        resource_status: "Resource Allocation",
        site_execution_status: "Site Execution",
        handover_status: "Handover",
      };
      const sectionTitle = sectionNames[sectionKey] || "Project Section";
      addActivityLog({
        projectName: projectInfo.name,
        module: sectionTitle,
        action: `Updated ${sectionTitle} status to ${label}`,
        projectKey: rawId,
      });
    } catch (err: any) {
      console.error("Failed to update section status:", err);
      setLocalSectionStatus(sectionKey, previousStatus);
      showToast(err?.message || "Failed to update status on server");
    }
  };

  // Section 1: Commercial Approval State (Loopable dynamic stages from backend)
  const [commercialBlocks, setCommercialBlocks] = useState<CommercialBlock[]>([]);
  const [isLoadingCommercial, setIsLoadingCommercial] = useState(true);

  // Section 2: Engineering & Documentation State (Synced with Commercial Approval Stages)
  const [engineeringBlocks, setEngineeringBlocks] = useState<EngineeringBlock[]>([]);

  // Section 3: Budget & Costing State
  const [internalCosting, setInternalCosting] = useState("");
  const [margin, setMargin] = useState("");
  const [budgetSaved, setBudgetSaved] = useState(false);

  // Budget & Costing items (for quick reference in procurement)
  const [costingItemsList, setCostingItemsList] = useState<any[]>([]);

  // Section 4: Procurement State (Decoupled from Budget & Costing)
  const [procurementItems, setProcurementItems] = useState<ProcurementItem[]>([]);

  const mapBackendToProcurementItem = (b: BackendProcurementItem, idx?: number): ProcurementItem => ({
    ...b,
    id: b.id,
    sl: b.sl_no || (idx !== undefined ? idx + 1 : 1),
    vendor: b.vendor || "",
    product: b.product_name || b.part_no,
    brand: b.brand || "",
    part: b.part_no,
    qty: b.qty || 1,
    invoiceNumber: b.invoice_number || "",
    status: b.status || "Yet To Order",
    allocated_qty: b.allocated_qty ?? 0,
    remaining_qty: b.remaining_qty ?? Math.max(0, (b.qty || 0) - (b.allocated_qty || 0)),
    available_stock: b.available_stock ?? 0,
    notes: b.notes || "",
  });

  // Section 5 (SOA): Statement of Accounts State
  const [soaItems, setSoaItems] = useState<BackendSOAItem[]>([]);

  // Master Parts & Inventory state for dynamic allocation & selection
  const [masterParts, setMasterParts] = useState<BackendPartItem[]>([]);
  const [masterInventory, setMasterInventory] = useState<BackendInventoryItem[]>([]);

  // Procurement Add Item Modal State
  const [isAddProcurementOpen, setIsAddProcurementOpen] = useState(false);
  const [newVendor, setNewVendor] = useState("");
  const [newProduct, setNewProduct] = useState("");
  const [newBrand, setNewBrand] = useState("");
  const [newPart, setNewPart] = useState("");
  const [newQty, setNewQty] = useState<number>(1);
  const [newAllocatedQty, setNewAllocatedQty] = useState<number>(0);
  const [newStatus, setNewStatus] = useState<string>("Yet To Order");
  const [newInvoiceNo, setNewInvoiceNo] = useState("");

  // Procurement Edit / Allocate Modal State
  const [isEditProcurementOpen, setIsEditProcurementOpen] = useState(false);
  const [editingProcItem, setEditingProcItem] = useState<ProcurementItem | null>(null);
  const [editAllocatedQty, setEditAllocatedQty] = useState<number>(0);
  const [editStatus, setEditStatus] = useState<string>("Yet To Order");
  const [editInvoiceNo, setEditInvoiceNo] = useState("");
  const [isSavingProcurement, setIsSavingProcurement] = useState(false);
  const [procurementModalError, setProcurementModalError] = useState<string | null>(null);

  // Procurement Shift Item Modal State
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [allActiveProjects, setAllActiveProjects] = useState<BackendProjectItem[]>([]);
  const [selectedSourceProjectKey, setSelectedSourceProjectKey] = useState<string>("");
  const [sourceProjectProcurement, setSourceProjectProcurement] = useState<BackendProcurementItem[]>([]);
  const [isLoadingSourceItems, setIsLoadingSourceItems] = useState(false);
  const [selectedShiftPart, setSelectedShiftPart] = useState<string>("");
  const [shiftQuantity, setShiftQuantity] = useState<number>(1);
  const [shiftNotes, setShiftNotes] = useState<string>("");
  const [isSubmittingShift, setIsSubmittingShift] = useState(false);
  const [projectSearchTerm, setProjectSearchTerm] = useState<string>("");

  const filteredActiveProjects = useMemo(() => {
    if (!projectSearchTerm.trim()) return allActiveProjects;
    const q = projectSearchTerm.toLowerCase();
    return allActiveProjects.filter((p) => {
      const name = (p.name || "").toLowerCase();
      const code = (p.code || "").toLowerCase();
      const client = (p.client || "").toLowerCase();
      const key = (p.project_key || "").toLowerCase();
      return name.includes(q) || code.includes(q) || client.includes(q) || key.includes(q);
    });
  }, [allActiveProjects, projectSearchTerm]);

  // Load registered master parts and inventory for part selection
  const loadPartsAndInventory = async () => {
    try {
      const [partsRes, invRes] = await Promise.all([apiGetParts(), apiGetInventory()]);
      setMasterParts(partsRes.items || []);
      setMasterInventory(invRes.items || []);
    } catch (err) {
      console.error("Failed to load parts or inventory", err);
    }
  };

  useEffect(() => {
    loadPartsAndInventory();

    const handleRefresh = () => {
      loadPartsAndInventory();
    };

    window.addEventListener("focus", handleRefresh);
    window.addEventListener("inventory_store_update", handleRefresh);
    window.addEventListener("parts_store_update", handleRefresh);

    return () => {
      window.removeEventListener("focus", handleRefresh);
      window.removeEventListener("inventory_store_update", handleRefresh);
      window.removeEventListener("parts_store_update", handleRefresh);
    };
  }, []);

  const allRegisteredParts = useMemo(() => {
    const map = new Map<string, { part_number: string; description?: string; brand?: string; vendor?: string }>();
    for (const p of masterParts) {
      if (p.part_number) {
        map.set(p.part_number.trim().toUpperCase(), {
          part_number: p.part_number.trim(),
          description: p.description || p.product_name || "",
        });
      }
    }
    for (const inv of masterInventory) {
      if (inv.part_number) {
        const key = inv.part_number.trim().toUpperCase();
        const existing = map.get(key) || { part_number: inv.part_number.trim() };
        map.set(key, {
          ...existing,
          description: existing.description || inv.product_name || "",
          brand: inv.brand || existing.brand,
          vendor: inv.vendor || existing.vendor,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.part_number.localeCompare(b.part_number));
  }, [masterParts, masterInventory]);

  const getPartStockInfo = (partNumber: string) => {
    if (!partNumber) return { available: 0, total: 0, product_name: "", brand: "", vendor: "" };
    const norm = partNumber.trim().toUpperCase();
    const matchedItems = masterInventory.filter(
      (inv) => (inv.part_number || "").trim().toUpperCase() === norm
    );
    if (matchedItems.length === 0) {
      const p = masterParts.find((pt) => pt.part_number.trim().toUpperCase() === norm);
      return {
        available: 0,
        total: 0,
        product_name: p?.product_name || p?.description || "",
        brand: "",
        vendor: "",
      };
    }
    const total = matchedItems.reduce((acc, it) => acc + (it.quantity || 0), 0);
    const availVal = matchedItems[0]?.available_quantity;
    const available = (availVal !== undefined && availVal !== null) ? Number(availVal) : total;
    const first = matchedItems[0];
    return {
      available,
      total,
      product_name: first.product_name || "",
      brand: first.brand || "",
      vendor: first.vendor || "",
    };
  };

  const handleSelectProcurementPart = (selectedPartNo: string, targetQty?: number) => {
    setNewPart(selectedPartNo);
    const stock = getPartStockInfo(selectedPartNo);
    if (stock.product_name) setNewProduct(stock.product_name);
    if (stock.brand) setNewBrand(stock.brand);
    if (stock.vendor) setNewVendor(stock.vendor);

    const qty = targetQty !== undefined ? targetQty : newQty;
    if (stock.available > 0) {
      const autoAlloc = Math.min(stock.available, qty);
      setNewAllocatedQty(autoAlloc);
      setNewStatus(autoAlloc >= qty ? "Added" : "Partially Added");
    } else {
      setNewAllocatedQty(0);
      setNewStatus("Yet To Order");
    }
  };

  const handleNewQtyChange = (qtyVal: number) => {
    setNewQty(qtyVal);
    if (newPart) {
      const stock = getPartStockInfo(newPart);
      if (stock.available > 0) {
        const autoAlloc = Math.min(stock.available, qtyVal);
        setNewAllocatedQty(autoAlloc);
        setNewStatus(autoAlloc >= qtyVal ? "Added" : "Partially Added");
      }
    }
  };

  const handleAddProcurementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProcurementModalError(null);
    if (!newPart.trim()) {
      setProcurementModalError("Please select or enter a Part Number.");
      return;
    }

    const normPart = newPart.trim().toUpperCase();
    const existingIndex = procurementItems.findIndex(
      (item) => (item.part || "").trim().toUpperCase() === normPart
    );
    if (existingIndex !== -1) {
      const existing = procurementItems[existingIndex];
      const err = `Part number "${normPart}" is already added to this project (Row #${existing.sl || existingIndex + 1}). To update its quantity or allocation, please edit row #${existing.sl || existingIndex + 1}.`;
      setProcurementModalError(err);
      showToast(err, "error");
      return;
    }

    const nextSl = procurementItems.length + 1;
    const qty = Number(newQty) || 1;
    const prodName = newProduct.trim() || newPart.trim();
    const vendorName = newVendor.trim();
    const brandName = newBrand.trim();

    try {
      setIsSavingProcurement(true);
      await apiCreateProjectProcurement(rawId, {
        sl_no: nextSl,
        part_no: normPart,
        product_name: prodName,
        vendor: vendorName,
        brand: brandName,
        qty: qty,
        allocated_qty: Number(newAllocatedQty) || 0,
        status: newStatus,
        invoice_number: newInvoiceNo.trim(),
      });

      // Reload dedicated procurement items
      const updatedProc = await apiGetProjectProcurement(rawId);
      setProcurementItems(updatedProc.map((p, idx) => mapBackendToProcurementItem(p, idx)));
      showToast(`Added procurement item: ${prodName}`);
      addActivityLog({
        projectName: projectInfo.name,
        module: "Procurement",
        action: `Added procurement item: ${normPart} (${prodName}) - Qty: ${qty}`,
        projectKey: rawId,
      });
      window.dispatchEvent(new CustomEvent("inventory_store_update"));
      setIsAddProcurementOpen(false);

      // Reset form
      setNewVendor("");
      setNewProduct("");
      setNewBrand("");
      setNewPart("");
      setNewQty(1);
      setNewAllocatedQty(0);
      setNewStatus("Yet To Order");
      setNewInvoiceNo("");
      setProcurementModalError(null);
    } catch (err: any) {
      console.error("Failed to add procurement item", err);
      const errMsg = err?.message || "Failed to add procurement item";
      setProcurementModalError(errMsg);
      showToast(errMsg, "error");
    } finally {
      setIsSavingProcurement(false);
    }
  };

  // Open Edit Procurement Modal (Requires Admin Password)
  const handleOpenEditProcurement = (item: ProcurementItem) => {
    const itemName = item.product || item.part || `Row #${item.sl}`;
    setAdminAuthModal({
      isOpen: true,
      title: "Authorize Procurement & Allocation Edit",
      description: `Enter Admin password to edit or reallocate material for "${itemName}".`,
      actionLabel: "Authorize Edit",
      actionType: "warning",
      onSuccess: () => {
        setEditingProcItem(item);
        setEditAllocatedQty(item.allocated_qty || 0);
        setEditStatus(item.status || "Yet To Order");
        setEditInvoiceNo(item.invoiceNumber || item.invoice_number || "");
        setProcurementModalError(null);
        setIsEditProcurementOpen(true);
      },
    });
  };

  const handleUpdateProcurementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProcItem?.id) return;
    setProcurementModalError(null);

    try {
      setIsSavingProcurement(true);
      await apiUpdateProjectProcurement(rawId, editingProcItem.id, {
        allocated_qty: Number(editAllocatedQty) || 0,
        status: editStatus,
        invoice_number: editInvoiceNo.trim(),
      });

      const updatedProc = await apiGetProjectProcurement(rawId);
      setProcurementItems(updatedProc.map((p, idx) => mapBackendToProcurementItem(p, idx)));
      showToast(`Updated allocation for ${editingProcItem.product || editingProcItem.part}`);
      addActivityLog({
        projectName: projectInfo.name,
        module: "Procurement",
        action: `Updated procurement item: ${editingProcItem.product || editingProcItem.part} (Allocated: ${editAllocatedQty}, Status: ${editStatus})`,
        projectKey: rawId,
      });
      window.dispatchEvent(new CustomEvent("inventory_store_update"));
      setIsEditProcurementOpen(false);
      setEditingProcItem(null);
      setProcurementModalError(null);
    } catch (err: any) {
      console.error("Failed to update procurement item", err);
      const errMsg = err?.message || "Failed to update procurement item";
      setProcurementModalError(errMsg);
      showToast(errMsg, "error");
    } finally {
      setIsSavingProcurement(false);
    }
  };

  // Delete Procurement Item (Requires Admin Password)
  const handleDeleteProcurementItem = (item: ProcurementItem) => {
    if (!item?.id) return;
    const itemName = item.product || item.part || `Row #${item.sl}`;
    setAdminAuthModal({
      isOpen: true,
      title: "Authorize Procurement Item Deletion",
      description: `Enter Admin password to remove "${itemName}" from project procurement. Any allocated warehouse stock will be released back to the free warehouse pool.`,
      actionLabel: "Delete Item",
      actionType: "danger",
      onSuccess: async () => {
        try {
          await apiDeleteProjectProcurement(rawId, item.id!);
          const updatedProc = await apiGetProjectProcurement(rawId);
          setProcurementItems(updatedProc.map((p, idx) => mapBackendToProcurementItem(p, idx)));
          showToast(`Procurement item "${itemName}" removed successfully`);
          addActivityLog({
            projectName: projectInfo.name,
            module: "Procurement",
            action: `Deleted procurement item: ${itemName}`,
            projectKey: rawId,
          });
          window.dispatchEvent(new CustomEvent("inventory_store_update"));
        } catch (err: any) {
          console.error("Failed to delete procurement item", err);
          showToast(err?.message || "Failed to delete procurement item", "error");
        }
      },
    });
  };

  const handleOpenShiftModal = async () => {
    setIsShiftModalOpen(true);
    setSelectedSourceProjectKey("");
    setSourceProjectProcurement([]);
    setSelectedShiftPart("");
    setShiftQuantity(1);
    setShiftNotes("");
    setProjectSearchTerm("");

    try {
      const allProjs = await apiGetProjects();
      // Strictly ACTIVE projects only: exclude current project and all completed projects
      const activeOnly = (allProjs || []).filter((p) => {
        if (!p) return false;
        const key = p.project_key || `p${p.id}`;
        if (key === rawId || p.code === rawId) return false;
        if (p.is_completed) return false;
        if (p.completed_at) return false;
        if (p.handover_status === "completed") return false;
        return true;
      });
      setAllActiveProjects(activeOnly);
    } catch (err) {
      console.error("Failed to load projects for shift", err);
    }
  };

  const handleSelectSourceProject = async (srcKey: string) => {
    setSelectedSourceProjectKey(srcKey);
    setSelectedShiftPart("");
    setShiftQuantity(1);
    if (!srcKey) {
      setSourceProjectProcurement([]);
      return;
    }

    try {
      setIsLoadingSourceItems(true);
      const items = await apiGetProjectProcurement(srcKey);
      const allocatedOnly = items.filter((it) => (it.allocated_qty || 0) > 0);
      setSourceProjectProcurement(allocatedOnly);
      if (allocatedOnly.length > 0) {
        setSelectedShiftPart(allocatedOnly[0].part_no);
        setShiftQuantity(Math.min(1, allocatedOnly[0].allocated_qty || 1));
      }
    } catch (err) {
      console.error("Failed to load source project items", err);
      showToast("Failed to load items from selected project");
    } finally {
      setIsLoadingSourceItems(false);
    }
  };

  const handleShiftSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSourceProjectKey) {
      showToast("Please select an active source project");
      return;
    }
    if (!selectedShiftPart) {
      showToast("Please select a material / part to shift");
      return;
    }
    const qty = Number(shiftQuantity);
    if (!qty || qty <= 0) {
      showToast("Quantity must be greater than zero");
      return;
    }

    const currentItem = sourceProjectProcurement.find((x) => x.part_no === selectedShiftPart);
    const maxShift = currentItem ? (currentItem.allocated_qty || 0) : 0;
    if (qty > maxShift) {
      showToast(`Cannot shift more than the available ${maxShift} units`);
      return;
    }

    const sourceProj = allActiveProjects.find((p) => p.project_key === selectedSourceProjectKey);
    const srcName = sourceProj?.name || sourceProj?.code || selectedSourceProjectKey;
    const destName = projectInfo?.name || projectInfo?.code || "this project";

    // Admin Password Security Prompt
    setAdminAuthModal({
      isOpen: true,
      title: "Authorize Material Transfer",
      description: `Enter Admin password to confirm shifting ${qty} unit(s) of "${selectedShiftPart}" from project "${srcName}" to "${destName}".`,
      actionLabel: "Authorize & Shift",
      actionType: "primary",
      onSuccess: async () => {
        await executeShiftTransfer(qty);
      },
    });
  };

  const executeShiftTransfer = async (qty: number) => {
    try {
      setIsSubmittingShift(true);
      const res = await apiShiftProjectProcurement(rawId, {
        source_project_key: selectedSourceProjectKey,
        part_no: selectedShiftPart,
        quantity: qty,
        notes: shiftNotes.trim(),
      });

      showToast(res.message || `Successfully shifted ${qty} units of ${selectedShiftPart}`);
      addActivityLog({
        projectName: projectInfo.name,
        module: "Procurement",
        action: `Shifted ${qty} units of ${selectedShiftPart} from project ${selectedSourceProjectKey || "another project"}`,
        projectKey: rawId,
      });

      // Reload dedicated procurement items
      const updatedProc = await apiGetProjectProcurement(rawId);
      setProcurementItems(updatedProc.map((p, idx) => mapBackendToProcurementItem(p, idx)));

      window.dispatchEvent(new CustomEvent("inventory_store_update"));
      setIsShiftModalOpen(false);
    } catch (err: any) {
      console.error("Shift item error", err);
      showToast(err?.message || "Failed to shift item between projects");
    } finally {
      setIsSubmittingShift(false);
    }
  };

  // Helper to get local date in YYYY-MM-DD
  const getTodayDateStr = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const formatResourceDateLabel = (dateStr: string) => {
    if (!dateStr) return "";
    const today = getTodayDateStr();
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      const formatted = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      if (dateStr === today) return `${formatted} (Today)`;

      const yest = new Date();
      yest.setDate(yest.getDate() - 1);
      const yestStr = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, "0")}-${String(yest.getDate()).padStart(2, "0")}`;
      if (dateStr === yestStr) return `${formatted} (Yesterday)`;

      return formatted;
    }
    return dateStr;
  };

  // Section 5: Resource Allocation State
  const [resourceItems, setResourceItems] = useState<BackendResourceItem[]>([]);
  const [manpowerList, setManpowerList] = useState<BackendManpower[]>([]);
  const [selectedResourceDate, setSelectedResourceDate] = useState<string>(getTodayDateStr());
  const [isLoadingResources, setIsLoadingResources] = useState<boolean>(false);

  // Add Resource Member Modal State (Single Select)
  const [isAddResourceOpen, setIsAddResourceOpen] = useState(false);
  const [selectedWorkerName, setSelectedWorkerName] = useState<string>("");
  const [selectedWorkerType, setSelectedWorkerType] = useState<string>("Internal");
  const [selectedHoursWorked, setSelectedHoursWorked] = useState<number>(8);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [isMemberDropdownOpen, setIsMemberDropdownOpen] = useState(false);
  const [isSubmittingResource, setIsSubmittingResource] = useState(false);
  const memberDropdownRef = useRef<HTMLDivElement>(null);

  // Filtered manpower based on search query
  const filteredManpower = useMemo(() => {
    if (!memberSearchQuery.trim()) return manpowerList;
    const q = memberSearchQuery.toLowerCase().trim();
    return manpowerList.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        (w.type && w.type.toLowerCase().includes(q))
    );
  }, [manpowerList, memberSearchQuery]);

  // Close member dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (memberDropdownRef.current && !memberDropdownRef.current.contains(e.target as Node)) {
        setIsMemberDropdownOpen(false);
      }
    };
    if (isMemberDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMemberDropdownOpen]);

  // Load Manpower personnel for the dropdown
  useEffect(() => {
    apiGetManpower()
      .then((res) => {
        if (res && Array.isArray(res.items)) {
          setManpowerList(res.items);
        }
      })
      .catch((err) => console.error("Failed to load manpower personnel", err));
  }, []);

  // Load resources for the currently selected date
  const loadProjectResourcesForDate = async (targetDate: string) => {
    setIsLoadingResources(true);
    try {
      const items = await apiGetProjectResources(rawId, targetDate);
      if (Array.isArray(items)) {
        setResourceItems(items);
      }
    } catch (err) {
      console.error("Failed to load resources for date", err);
    } finally {
      setIsLoadingResources(false);
    }
  };

  useEffect(() => {
    if (rawId && selectedResourceDate) {
      loadProjectResourcesForDate(selectedResourceDate);
    }
  }, [rawId, selectedResourceDate]);

  const handleOffsetDate = (days: number) => {
    const parts = (selectedResourceDate || getTodayDateStr()).split("-");
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      d.setDate(d.getDate() + days);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      setSelectedResourceDate(`${y}-${m}-${day}`);
    }
  };

  const handleSelectWorker = (worker: { name: string; type?: string }) => {
    setSelectedWorkerName(worker.name);
    setSelectedWorkerType(worker.type || "Internal");
    setMemberSearchQuery(worker.name);
    setIsMemberDropdownOpen(false);
  };

  const handleAddResourceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const workerName = (selectedWorkerName || memberSearchQuery).trim();
    if (!workerName) {
      showToast("Please select or enter a member name from Manpower");
      return;
    }

    setIsSubmittingResource(true);
    try {
      const targetDate = selectedResourceDate || getTodayDateStr();
      const matched = manpowerList.find((m) => m.name.toLowerCase() === workerName.toLowerCase());
      const workerType = matched?.type || selectedWorkerType || "Internal";

      const created = await apiCreateProjectResource(rawId, {
        name: workerName,
        type: workerType,
        hours_worked: Number(selectedHoursWorked) || 8,
        date: targetDate,
        sl_no: resourceItems.length + 1,
      });

      setResourceItems((prev) => [...prev, created]);
      setIsAddResourceOpen(false);
      setSelectedWorkerName("");
      setSelectedWorkerType("Internal");
      setMemberSearchQuery("");
      setIsMemberDropdownOpen(false);
      showToast(`Successfully added ${created.name} (${selectedHoursWorked} hrs) for ${formatResourceDateLabel(targetDate)}`);
      addActivityLog({
        projectName: projectInfo.name,
        module: "Costing",
        action: `Added resource member: ${created.name} (${selectedHoursWorked} hrs) for ${formatResourceDateLabel(targetDate)}`,
        projectKey: rawId,
      });
    } catch (err: any) {
      console.error("Failed to add resource member", err);
      showToast(err?.message || "Failed to add resource member");
    } finally {
      setIsSubmittingResource(false);
    }
  };

  // Delete Resource Member (Requires Admin Password)
  const handleDeleteResource = (itemId: number, name: string) => {
    setAdminAuthModal({
      isOpen: true,
      title: "Authorize Resource Deletion",
      description: `Enter Admin password to remove member "${name}" from this project.`,
      actionLabel: "Remove Member",
      actionType: "danger",
      onSuccess: async () => {
        try {
          await apiDeleteProjectResource(rawId, itemId);
          setResourceItems((prev) => prev.filter((r) => r.id !== itemId));
          showToast(`Removed member ${name}`);
          addActivityLog({
            projectName: projectInfo.name,
            module: "Costing",
            action: `Removed resource member: ${name}`,
            projectKey: rawId,
          });
        } catch (err: any) {
          console.error("Failed to remove member", err);
          showToast(err?.message || "Failed to remove member");
        }
      },
    });
  };

  // Export Resource Planning Allocation to Excel (.xlsx)
  const handleExportResourcesExcel = () => {
    try {
      const activeDate = selectedResourceDate || getTodayDateStr();
      exportResourcesToExcel({
        projectName: projectInfo.name || "Project",
        projectKey: String(projectInfo.code || rawId || "PROJECT"),
        dateStr: activeDate,
        formattedDateLabel: formatResourceDateLabel(activeDate),
        items: resourceItems,
      });
      showToast(`Excel export downloaded for ${formatResourceDateLabel(activeDate)}`);
    } catch (err: any) {
      console.error("Failed to export Excel report", err);
      showToast("Failed to generate Excel export");
    }
  };

  // Section 6: Site Execution State & Feed
  const [selectedExecutionDate, setSelectedExecutionDate] = useState<string>(getTodayDateStr());
  const [siteExecutionLogs, setSiteExecutionLogs] = useState<BackendSiteExecutionLog[]>([]);
  const [isLoadingSiteExecution, setIsLoadingSiteExecution] = useState<boolean>(false);
  const [verifiedProgressPercentage, setVerifiedProgressPercentage] = useState<number>(0);
  const [editingProgressValue, setEditingProgressValue] = useState<number>(0);
  const [isUpdatingProgress, setIsUpdatingProgress] = useState<boolean>(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);

  // Export Site Execution Daily Progress to PDF with Photos
  const handleExportSiteExecutionPdf = async () => {
    if (siteExecutionLogs.length === 0) {
      showToast("No site execution logs to export for this view");
      return;
    }
    setIsGeneratingPdf(true);
    try {
      const activeDate = selectedExecutionDate || getTodayDateStr();
      const dateLabel = selectedExecutionDate ? formatResourceDateLabel(selectedExecutionDate) : "All Timeline Records";
      await exportSiteExecutionToPdf({
        projectName: projectInfo.name || "Project",
        projectKey: String(projectInfo.code || rawId || "PROJECT"),
        dateStr: activeDate,
        formattedDateLabel: dateLabel,
        verifiedMilestone: verifiedProgressPercentage,
        logs: siteExecutionLogs,
      });
      showToast(`Site Execution PDF report downloaded`);
    } catch (err: any) {
      console.error("Failed to export PDF report", err);
      showToast("Failed to generate PDF report");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Edit Execution Modal State (Admin Only)
  const [editingExecutionLog, setEditingExecutionLog] = useState<BackendSiteExecutionLog | null>(null);
  const [editPhaseName, setEditPhaseName] = useState<string>("");
  const [editDescription, setEditDescription] = useState<string>("");
  const [editImages, setEditImages] = useState<SiteExecutionImageItem[]>([]);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState<boolean>(false);

  // Add Execution Modal State
  const [isAddExecutionOpen, setIsAddExecutionOpen] = useState<boolean>(false);
  const [executionSupervisorName, setExecutionSupervisorName] = useState<string>("");
  const [executionPhaseName, setExecutionPhaseName] = useState<string>("");
  const [executionDescription, setExecutionDescription] = useState<string>("");
  const [executionImages, setExecutionImages] = useState<SiteExecutionImageItem[]>([]);
  const [isSubmittingExecution, setIsSubmittingExecution] = useState<boolean>(false);

  // Fullscreen Lightbox Modal
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string; subtitle?: string } | null>(null);

  // Sync initial verified progress percentage from project
  useEffect(() => {
    if (projectInfo.verified_progress_percentage !== undefined && projectInfo.verified_progress_percentage !== null) {
      setVerifiedProgressPercentage(projectInfo.verified_progress_percentage);
      setEditingProgressValue(projectInfo.verified_progress_percentage);
    }
  }, [projectInfo.verified_progress_percentage]);

  // Load site execution logs for the selected date
  const loadSiteExecutionLogsForDate = async (targetDate: string) => {
    if (!rawId) return;
    setIsLoadingSiteExecution(true);
    try {
      const logs = await apiGetSiteExecutionLogs(rawId, targetDate);
      setSiteExecutionLogs(Array.isArray(logs) ? logs : []);
    } catch (err) {
      console.error("Failed to load site execution logs:", err);
      setSiteExecutionLogs([]);
    } finally {
      setIsLoadingSiteExecution(false);
    }
  };

  useEffect(() => {
    if (rawId) {
      loadSiteExecutionLogsForDate(selectedExecutionDate);
    }
  }, [rawId, selectedExecutionDate]);

  const handleOffsetExecutionDate = (days: number) => {
    const parts = (selectedExecutionDate || getTodayDateStr()).split("-");
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      d.setDate(d.getDate() + days);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      setSelectedExecutionDate(`${y}-${m}-${day}`);
    }
  };

  const handleImageFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    fileList.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const resultStr = event.target?.result as string;
        if (resultStr) {
          setExecutionImages((prev) => [
            ...prev,
            {
              url: resultStr,
              name: file.name,
              size: `${(file.size / 1024).toFixed(0)} KB`,
              uploaded_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ]);
        }
      };
      reader.readAsDataURL(file);
    });
    // Reset file input value so same files can be reselected if needed
    e.target.value = "";
  };

  const handleRemoveExecutionImage = (indexToRemove: number) => {
    setExecutionImages((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleCreateExecutionLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!executionDescription.trim()) {
      showToast("Please enter a detailed site description or inspection notes");
      return;
    }

    setIsSubmittingExecution(true);
    try {
      const supervisor = executionSupervisorName.trim() || userDisplayName || "Site Supervisor";
      const role = userRole || (isAdmin() ? "Admin" : isSiteSupervisor() ? "Site Supervisor" : "Project Manager");
      const created = await apiCreateSiteExecutionLog(rawId, {
        date: selectedExecutionDate || getTodayDateStr(),
        supervisor_name: supervisor,
        creator_role: role,
        phase_name: executionPhaseName.trim() || "Daily Site Execution & Inspection",
        description: executionDescription.trim(),
        images: executionImages,
      });

      setSiteExecutionLogs((prev) => [created, ...prev]);
      setIsAddExecutionOpen(false);
      setExecutionDescription("");
      setExecutionPhaseName("");
      setExecutionImages([]);
      showToast("Site execution entry logged successfully!");
      addActivityLog({
        user: supervisor,
        projectName: projectInfo.name,
        module: "Site Execution",
        action: `Logged daily site execution entry (${executionPhaseName.trim() || "Daily Site Progress"}) for ${selectedExecutionDate || getTodayDateStr()}`,
        projectKey: rawId,
      });
    } catch (err: any) {
      console.error("Failed to create site execution log:", err);
      showToast(err?.message || "Failed to create site execution log");
    } finally {
      setIsSubmittingExecution(false);
    }
  };

  const handleOpenEditLog = (log: BackendSiteExecutionLog) => {
    setEditingExecutionLog(log);
    setEditPhaseName(log.phase_name || "");
    setEditDescription(log.description || "");
    setEditImages(Array.isArray(log.images) ? [...log.images] : []);
  };

  const handleEditImageFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    fileList.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const resultStr = event.target?.result as string;
        if (resultStr) {
          setEditImages((prev) => [
            ...prev,
            {
              url: resultStr,
              name: file.name,
              size: `${(file.size / 1024).toFixed(0)} KB`,
              uploaded_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ]);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const handleUpdateExecutionLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExecutionLog) return;
    if (!editDescription.trim()) {
      showToast("Please enter a description or inspection notes");
      return;
    }

    setIsSubmittingEdit(true);
    try {
      const updated = await apiUpdateSiteExecutionLog(rawId, editingExecutionLog.id, {
        phase_name: editPhaseName.trim(),
        description: editDescription.trim(),
        images: editImages,
      });

      setSiteExecutionLogs((prev) =>
        prev.map((l) => (l.id === editingExecutionLog.id ? updated : l))
      );
      setEditingExecutionLog(null);
      showToast("Site execution entry updated successfully!");
    } catch (err: any) {
      console.error("Failed to update site log:", err);
      showToast(err?.message || "Failed to update site log");
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleDeleteLog = (log: BackendSiteExecutionLog) => {
    setAdminAuthModal({
      isOpen: true,
      title: "Authorize Log Deletion",
      description: `Enter Admin password to permanently delete site execution log #${log.id} (${log.supervisor_name} - ${log.date}).`,
      actionLabel: "Delete Log",
      actionType: "danger",
      onSuccess: async () => {
        try {
          await apiDeleteSiteExecutionLog(rawId, log.id);
          setSiteExecutionLogs((prev) => prev.filter((l) => l.id !== log.id));
          showToast(`Deleted site log #${log.id}`);
          addActivityLog({
            projectName: projectInfo.name,
            module: "Site Execution",
            action: `Deleted daily site execution log #${log.id} (${log.supervisor_name} - ${log.date})`,
            projectKey: rawId,
          });
        } catch (err: any) {
          console.error("Failed to delete site log:", err);
          showToast(err?.message || "Failed to delete site log");
        }
      },
    });
  };

  const handleSaveVerifiedProgress = async () => {
    if (editingProgressValue < verifiedProgressPercentage) {
      showToast(`Cannot decrease progress below current verified ${verifiedProgressPercentage}%`);
      return;
    }
    if (editingProgressValue === verifiedProgressPercentage) {
      showToast("Verified progress is already at this level");
      return;
    }

    setIsUpdatingProgress(true);
    try {
      const updatedProject = await apiUpdateSiteVerifiedProgress(rawId, editingProgressValue);
      setVerifiedProgressPercentage(updatedProject.verified_progress_percentage ?? editingProgressValue);
      setProjectInfo((prev) => ({
        ...prev,
        verified_progress_percentage: updatedProject.verified_progress_percentage ?? editingProgressValue,
      }));
      showToast(`Site verified milestone updated to ${editingProgressValue}%!`);
      addActivityLog({
        projectName: projectInfo.name,
        module: "Site Execution",
        action: `Updated site verified milestone to ${editingProgressValue}%`,
        projectKey: rawId,
      });
    } catch (err: any) {
      console.error("Failed to update verified progress:", err);
      showToast(err?.message || "Failed to update verified progress");
      setEditingProgressValue(verifiedProgressPercentage);
    } finally {
      setIsUpdatingProgress(false);
    }
  };

  // Computed summary for SOA Section with dynamic stage calculations
  const soaSummary = useMemo(() => {
    const commercialTotal = commercialBlocks.reduce((acc, b) => {
      const clean = (b.contractValue || "").replace(/[^0-9.-]/g, "");
      return acc + (parseFloat(clean) || 0);
    }, 0);
    const totalFromSOA = soaItems.reduce((acc, it) => acc + (Number(it.value) || 0), 0);
    const totalContract = commercialTotal > 0 ? commercialTotal : (totalFromSOA > 0 ? totalFromSOA : (parseFloat((projectInfo.budget || "").replace(/[^0-9.-]/g, "")) || 0));
    const received = soaItems.reduce((acc, it) => acc + (Number(it.received) || 0), 0);
    const balance = Math.max(0, totalContract - received);

    const stageBreakdowns = commercialBlocks.map((b) => {
      const stNum = b.stageNumber;
      const stageContract = parseFloat((b.contractValue || "").replace(/[^0-9.-]/g, "")) || 0;
      const stageRec = soaItems
        .filter((it) => (it.stage_number || 1) === stNum)
        .reduce((acc, it) => acc + (Number(it.received) || 0), 0);
      const stageBal = Math.max(0, stageContract - stageRec);
      return {
        stageNumber: stNum,
        contract: stageContract,
        received: stageRec,
        balance: stageBal,
        poNumber: b.poNumber,
      };
    });

    return {
      totalContract,
      received,
      balance,
      stageBreakdowns,
    };
  }, [soaItems, commercialBlocks, projectInfo.budget]);

  // Streamlined Document Upload Modal State (support both commercial stages & engineering stages)
  const [docModalTarget, setDocModalTarget] = useState<
    { type: "commercial" | "engineering"; blockId: string; stageNumber: number } | null
  >(null);
  const [uploadDocName, setUploadDocName] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [selectedFileDataUrl, setSelectedFileDataUrl] = useState<string>("");
  const [selectedFileSize, setSelectedFileSize] = useState<string>("");

  // Image Proof Modal State
  const [selectedProof, setSelectedProof] = useState<SiteProgressItem | null>(null);

  // Fetch live Project Details and Commercial Approval stages directly from FastAPI backend
  useEffect(() => {
    const fetchProjectAndStages = async () => {
      setIsLoadingCommercial(true);
      try {
        const resProject = await fetch(`${API_BASE_URL}/projects/${rawId}`);
        if (resProject.ok) {
          const p = await resProject.json();
          const verifiedPct = (p.verified_progress_percentage !== undefined && p.verified_progress_percentage !== null)
            ? Number(p.verified_progress_percentage)
            : 0;

          setProjectInfo({
            name: p.name || "Project",
            client: p.client || "",
            location: p.location || "United Arab Emirates",
            code: p.code || rawId,
            priority: p.priority || "High",
            priorityLevel: (p.priority_level || "high") as "high" | "medium" | "low",
            budget: p.budget || "",
            contractValue: "",
            poNumber: "",
            poDate: "",
            startDate: p.start_date || "",
            currentStage: p.current_stage || 1,
            totalStages: p.total_stages || 7,
            manager: p.manager || "",
            verified_progress_percentage: verifiedPct,
          });

          setVerifiedProgressPercentage(verifiedPct);
          setEditingProgressValue(verifiedPct);

          // Sync all 7 section statuses from backend database
          if (p.commercial_status) setCommercialStatus(p.commercial_status);
          if (p.engineering_status) setEngineeringStatus(p.engineering_status);
          if (p.budget_status) setBudgetStatus(p.budget_status);
          if (p.procurement_status) setProcurementStatus(p.procurement_status);
          if (p.soa_status) setSoaStatus(p.soa_status);
          if (p.resource_status) setResourceStatus(p.resource_status);
          if (p.site_execution_status) setSiteExecutionStatus(p.site_execution_status);
          if (p.handover_status) setHandoverStatus(p.handover_status);

          // Sync resource items from project or dedicated endpoint
          if (Array.isArray(p.resource_items) && p.resource_items.length > 0) {
            setResourceItems(p.resource_items);
          } else {
            try {
              const resList = await apiGetProjectResources(rawId);
              if (Array.isArray(resList)) {
                setResourceItems(resList);
              }
            } catch { }
          }

          let commMapped: CommercialBlock[] = [];
          if (Array.isArray(p.commercial_stages) && p.commercial_stages.length > 0) {
            commMapped = p.commercial_stages.map((item: any) => ({
              id: String(item.id),
              stageNumber: item.stage_number || 1,
              status: (item.status as "in_progress" | "completed") || "in_progress",
              poNumber: item.po_number || "",
              poDate: item.po_date || "",
              contractValue: item.contract_value || "",
              isSaved: Boolean(item.is_saved),
              documents: Array.isArray(item.documents) ? item.documents : [],
            }));
            setCommercialBlocks(commMapped);
          } else {
            // fallback fetch commercial stages
            const resStages = await fetch(`${API_BASE_URL}/projects/${rawId}/commercial`);
            if (resStages.ok) {
              const stages = await resStages.json();
              if (Array.isArray(stages) && stages.length > 0) {
                commMapped = stages.map((item: any) => ({
                  id: String(item.id),
                  stageNumber: item.stage_number || 1,
                  status: (item.status as "in_progress" | "completed") || "in_progress",
                  poNumber: item.po_number || "",
                  poDate: item.po_date || "",
                  contractValue: item.contract_value || "",
                  isSaved: Boolean(item.is_saved),
                  documents: Array.isArray(item.documents) ? item.documents : [],
                }));
                setCommercialBlocks(commMapped);
              }
            }
          }

          let engMapped: EngineeringBlock[] = [];
          if (Array.isArray(p.engineering_stages) && p.engineering_stages.length > 0) {
            engMapped = p.engineering_stages.map((item: any) => ({
              id: String(item.id),
              stageNumber: item.stage_number || 1,
              status: (item.status as "in_progress" | "completed") || "in_progress",
              documents: Array.isArray(item.documents) ? item.documents : [],
            }));
          } else {
            try {
              const resEng = await fetch(`${API_BASE_URL}/projects/${rawId}/engineering`);
              if (resEng.ok) {
                const engStages = await resEng.json();
                if (Array.isArray(engStages) && engStages.length > 0) {
                  engMapped = engStages.map((item: any) => ({
                    id: String(item.id),
                    stageNumber: item.stage_number || 1,
                    status: (item.status as "in_progress" | "completed") || "in_progress",
                    documents: Array.isArray(item.documents) ? item.documents : [],
                  }));
                }
              }
            } catch { }
          }

          // Ensure 1-to-1 sync: each commercial stage has an engineering stage card
          const currentCommList = commMapped.length > 0 ? commMapped : [{ id: "c1", stageNumber: 1, status: "in_progress", poNumber: "", poDate: "", contractValue: "", isSaved: false, documents: [] }];
          for (const c of currentCommList) {
            if (!engMapped.some((e) => e.stageNumber === c.stageNumber)) {
              engMapped.push({
                id: c.id,
                stageNumber: c.stageNumber,
                status: "in_progress",
                documents: [],
              });
            }
          }
          engMapped.sort((a, b) => a.stageNumber - b.stageNumber);
          setEngineeringBlocks(engMapped);

          // Sync Budget & Costing (financial estimations only)
          try {
            const costingData = await apiGetProjectCosting(rawId);
            if (Array.isArray(costingData) && costingData.length > 0) {
              const totalPurchase = costingData.reduce((acc, c) => acc + (c.purchase_total || 0), 0);
              const totalSelling = costingData.reduce((acc, c) => acc + (c.selling_total || 0), 0);
              const totalProfit = totalSelling - totalPurchase;
              const profitMargin = totalSelling > 0 ? ((totalProfit / totalSelling) * 100).toFixed(1) : "35.0";

              setInternalCosting(totalPurchase.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
              setMargin(profitMargin);
              setCostingItemsList(costingData);
            } else {
              setCostingItemsList([]);
            }
          } catch (costErr) {
            console.warn("Could not sync costing sheet to project page", costErr);
          }

          // Dedicated Procurement line items (strictly decoupled from Costing)
          try {
            const procData = await apiGetProjectProcurement(rawId);
            if (Array.isArray(procData)) {
              setProcurementItems(procData.map((p, idx) => mapBackendToProcurementItem(p, idx)));
            }
          } catch (procErr) {
            console.warn("Could not sync procurement items to project page", procErr);
          }

          // Automatically sync Statement of Accounts (SOA) line items
          try {
            const soaData = await apiGetProjectSOA(rawId);
            if (Array.isArray(soaData)) {
              setSoaItems(soaData);
            }
          } catch (soaErr) {
            console.warn("Could not sync SOA items to project page", soaErr);
          }
        }
      } catch (err) {
        console.warn("Could not load project details from backend", err);
      } finally {
        setIsLoadingCommercial(false);
      }
    };
    fetchProjectAndStages();
  }, [rawId]);

  // Universal Document Downloader
  const handleDownloadDoc = (doc: DocumentItem) => {
    try {
      let downloadUrl = doc.fileUrl;
      let isTempBlob = false;

      if (!downloadUrl) {
        const sampleText = `%PDF-1.4\n% TechnoLOGI ERP Document\nProject: ${projectInfo.name} (${projectInfo.code})\nDocument: ${doc.name}\nDate: ${doc.date}\nSize: ${doc.size}\nStatus: Verified Document\n\n[Content stored securely in TechnoLOGI Project System]`;
        const blob = new Blob([sampleText], { type: "application/pdf" });
        downloadUrl = URL.createObjectURL(blob);
        isTempBlob = true;
      }

      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = doc.name || "document.pdf";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);

      if (isTempBlob) {
        setTimeout(() => URL.revokeObjectURL(downloadUrl!), 1000);
      }

      showToast(`Downloading: ${doc.name}`);
    } catch (err) {
      console.error("Error downloading file", err);
      showToast(`Failed to download: ${doc.name}`);
    }
  };

  // Full Project Dossier PDF Generator State & Action
  const [isGeneratingDossierPdf, setIsGeneratingDossierPdf] = useState(false);

  const handleDownloadProjectDossier = async () => {
    setIsGeneratingDossierPdf(true);
    try {
      showToast("Generating comprehensive project PDF dossier...");

      // 1. Fetch live activity logs
      let allLogs: any[] = [];
      try {
        allLogs = await fetchActivityLogsFromBackend();
      } catch {
        allLogs = getStoredSystemLogs();
      }

      // 2. Filter strictly for this project
      const projectKeyLower = (rawId || "").toLowerCase();
      const projectCodeLower = (projectInfo.code || "").toLowerCase();
      const projectNameLower = (projectInfo.name || "").toLowerCase().trim();

      const filteredLogs = allLogs.filter((log: any) => {
        if (log.projectKey) {
          const pk = String(log.projectKey).toLowerCase();
          if (pk === projectKeyLower || pk === projectCodeLower) return true;
        }
        if (log.projectName) {
          const pn = String(log.projectName).toLowerCase().trim();
          if (pn && pn !== "—" && pn !== "-" && pn === projectNameLower) return true;
        }
        return false;
      });

      // Build comprehensive chronological timeline combining logs + all recorded project artifacts
      const combinedTimeline: Array<{
        user: string;
        module: string;
        action: string;
        time: string;
        timestamp: number;
      }> = [];

      filteredLogs.forEach((l) => {
        combinedTimeline.push({
          user: l.user || "Admin",
          module: l.module || "Projects",
          action: l.action || "",
          time: l.time || "",
          timestamp: l.created_at ? new Date(l.created_at).getTime() : 100,
        });
      });

      // Initial Project Creation milestone
      if (!combinedTimeline.some((e) => e.action.toLowerCase().includes("project created") || e.action.toLowerCase().includes("project initiated"))) {
        combinedTimeline.unshift({
          user: projectInfo.manager || "Admin",
          module: "Projects",
          action: `Project created & initialized: ${projectInfo.name} (#${projectInfo.code || rawId}) - Client: ${projectInfo.client || "Not Specified"}, Budget: ${projectInfo.budget || primaryContractValue || "AED 0.00"}`,
          time: projectInfo.startDate || "Project Inception",
          timestamp: 1,
        });
      }

      // Ensure every commercial stage detail is reflected in timeline
      commercialBlocks.forEach((b) => {
        const stageNum = b.stageNumber;
        const exists = combinedTimeline.some((e) => e.module === "Commercial Approval" && e.action.includes(`Stage ${stageNum}`));
        if (!exists) {
          const poDetails = [
            b.poNumber ? `PO #${b.poNumber}` : null,
            b.poDate ? `Date: ${b.poDate}` : null,
            b.contractValue ? `Value: ${b.contractValue}` : null,
          ].filter(Boolean).join(", ");
          combinedTimeline.push({
            user: projectInfo.manager || "Admin",
            module: "Commercial Approval",
            action: `Commercial Stage ${stageNum} recorded${poDetails ? ` (${poDetails})` : ""} - Status: ${b.status}`,
            time: b.poDate || projectInfo.startDate || "Recorded",
            timestamp: 10 + stageNum,
          });
        }

        if (Array.isArray(b.documents)) {
          b.documents.forEach((d) => {
            const docExists = combinedTimeline.some((e) => e.action.includes(d.name));
            if (!docExists) {
              combinedTimeline.push({
                user: projectInfo.manager || "Admin",
                module: "Commercial Approval",
                action: `Attached document '${d.name}' (${d.size || "Standard"}) to Commercial Stage ${stageNum}`,
                time: d.date || b.poDate || "Recorded",
                timestamp: 12 + stageNum,
              });
            }
          });
        }
      });

      // Ensure every engineering drawing / document submission is reflected in timeline
      engineeringBlocks.forEach((b) => {
        if (Array.isArray(b.documents)) {
          b.documents.forEach((d) => {
            const docExists = combinedTimeline.some((e) => e.action.includes(d.name));
            if (!docExists) {
              combinedTimeline.push({
                user: "Engineering Team",
                module: "Engineering",
                action: `Submitted engineering drawing '${d.name}' (${d.size || "Drawing"}) for Stage ${b.stageNumber}`,
                time: d.date || projectInfo.startDate || "Recorded",
                timestamp: 20 + b.stageNumber,
              });
            }
          });
        }
      });

      // Ensure every daily site execution field inspection is reflected in timeline
      siteExecutionLogs.forEach((log) => {
        const logExists = combinedTimeline.some((e) => e.module === "Site Execution" && e.action.includes(log.date) && e.action.includes(log.phase_name));
        if (!logExists) {
          const imgCount = Array.isArray(log.images) ? log.images.length : 0;
          combinedTimeline.push({
            user: log.supervisor_name || "Site Supervisor",
            module: "Site Execution",
            action: `Field inspection logged for ${log.date} (${log.phase_name}) with ${imgCount} photos. Notes: "${(log.description || "").slice(0, 80)}${(log.description || "").length > 70 ? "..." : ""}"`,
            time: log.date || "Field Inspection",
            timestamp: log.created_at ? new Date(log.created_at).getTime() : 30,
          });
        }
      });

      // Ensure manpower allocations are in timeline
      resourceItems.forEach((r) => {
        const rExists = combinedTimeline.some((e) => e.module === "Costing" && e.action.includes(r.name) && (r.date ? e.action.includes(r.date) : true));
        if (!rExists) {
          combinedTimeline.push({
            user: projectInfo.manager || "Admin",
            module: "Costing",
            action: `Manpower allocated: ${r.name} (${r.type || "Internal"}) for ${r.hours_worked || 8} hrs on ${r.date || "Scheduled Date"}`,
            time: r.date || "Allocation",
            timestamp: 40,
          });
        }
      });

      // Ensure procurement items are in timeline
      procurementItems.forEach((p) => {
        const pExists = combinedTimeline.some((e) => e.module === "Procurement" && e.action.includes(p.part || ""));
        if (!pExists) {
          combinedTimeline.push({
            user: "Procurement Officer",
            module: "Procurement",
            action: `Material allocated: ${p.part || ""} (${p.product || ""}) - Required: ${p.qty || 0}, Allocated: ${p.allocated_qty || 0}, Status: ${p.status || "Added"}${p.invoiceNumber ? ` under Invoice ${p.invoiceNumber}` : ""}`,
            time: "Allocated",
            timestamp: 50,
          });
        }
      });

      // Sort timeline chronologically (oldest to newest: project inception to latest event)
      combinedTimeline.sort((a, b) => a.timestamp - b.timestamp);

      await exportProjectDossierToPdf({
        projectInfo: {
          name: projectInfo.name || "Project",
          client: projectInfo.client || "Client Not Specified",
          location: projectInfo.location || "United Arab Emirates",
          code: String(projectInfo.code || rawId),
          priority: projectInfo.priority || "High",
          priorityLevel: projectInfo.priorityLevel || "high",
          budget: projectInfo.budget || primaryContractValue || "AED 0.00",
          startDate: projectInfo.startDate || "N/A",
          manager: projectInfo.manager || "Admin",
          supervisor: "Site Supervisor",
          currentStage: projectInfo.currentStage || 1,
          totalStages: projectInfo.totalStages || 7,
          verifiedProgressPercentage: verifiedProgressPercentage || 0,
        },
        sectionStatuses: {
          commercial: commercialStatus,
          engineering: engineeringStatus,
          budget: budgetStatus,
          procurement: procurementStatus,
          soa: soaStatus,
          resource: resourceStatus,
          site_execution: siteExecutionStatus,
          handover: handoverStatus,
        },
        activityLogs: combinedTimeline,
        commercialStages: commercialBlocks.map((b) => ({
          stageNumber: b.stageNumber,
          status: b.status,
          poNumber: b.poNumber,
          poDate: b.poDate,
          contractValue: b.contractValue,
          documents: b.documents,
        })),
        engineeringStages: engineeringBlocks.map((b) => ({
          stageNumber: b.stageNumber,
          status: b.status,
          documents: b.documents,
        })),
        costingResources: resourceItems,
        procurementItems: procurementItems,
        soaSummary: soaSummary,
        siteExecutionLogs: siteExecutionLogs,
      });

      showToast("Project Dossier PDF downloaded successfully!");
    } catch (err: any) {
      console.error("PDF generation error:", err);
      showToast(err?.message || "Failed to generate project PDF", "error");
    } finally {
      setIsGeneratingDossierPdf(false);
    }
  };


  // Update input fields before saving
  const handleUpdateCommercialField = (
    blockId: string,
    field: "poNumber" | "poDate" | "contractValue",
    val: string
  ) => {
    setCommercialBlocks((prev) => {
      const updated = prev.map((block) => {
        if (block.id === blockId && !block.isSaved) {
          return { ...block, [field]: val };
        }
        return block;
      });
      if (field === "contractValue") {
        const sum = updated.reduce((acc, b) => {
          const clean = (b.contractValue || "").replace(/[^0-9.-]/g, "");
          const num = parseFloat(clean);
          return acc + (isNaN(num) ? 0 : num);
        }, 0);
        if (sum > 0) {
          setProjectInfo((p) => ({
            ...p,
            budget: `${sum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} AED`,
          }));
        }
      }
      return updated;
    });
  };

  // Save commercial block (persists to backend and locks inputs permanently)
  const handleSaveCommercialBlock = async (blockId: string) => {
    const targetBlock = commercialBlocks.find((b) => b.id === blockId);
    if (!targetBlock) return;

    try {
      const res = await fetch(`${API_BASE_URL}/projects/${rawId}/commercial/${blockId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_saved: true,
          po_number: targetBlock.poNumber || "",
          po_date: targetBlock.poDate || "",
          contract_value: targetBlock.contractValue || "",
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        const savedContractVal = updated.contract_value || targetBlock.contractValue || "";
        setCommercialBlocks((prev) => {
          const updatedBlocks = prev.map((block) => {
            if (block.id === blockId) {
              return {
                ...block,
                isSaved: true,
                poNumber: updated.po_number || block.poNumber,
                poDate: updated.po_date || block.poDate,
                contractValue: savedContractVal,
              };
            }
            return block;
          });
          const sum = updatedBlocks.reduce((acc, b) => {
            const clean = (b.contractValue || "").replace(/[^0-9.-]/g, "");
            const num = parseFloat(clean);
            return acc + (isNaN(num) ? 0 : num);
          }, 0);
          if (sum > 0) {
            setProjectInfo((p) => ({
              ...p,
              budget: `${sum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} AED`,
            }));
          }
          return updatedBlocks;
        });
        showToast("Commercial approval details saved and locked!");
        const poPart = targetBlock.poNumber ? `PO #${targetBlock.poNumber}` : "No PO";
        const datePart = targetBlock.poDate ? `Date: ${targetBlock.poDate}` : "";
        const valPart = targetBlock.contractValue ? `Contract Value: ${targetBlock.contractValue}` : "";
        const detailsArr = [poPart, datePart, valPart].filter(Boolean).join(", ");
        addActivityLog({
          projectName: projectInfo.name,
          module: "Commercial Approval",
          action: `Saved Commercial Stage ${targetBlock.stageNumber || 1} Details: ${detailsArr}`,
          projectKey: rawId,
        });
      } else {
        showToast("Failed to save commercial approval to server");
      }
    } catch (err) {
      console.error("Save failed", err);
      showToast("Network error while saving details");
    }
  };

  // Unlock Commercial block for editing (Requires Admin Password)
  const handleUnlockCommercialBlock = (blockId: string, stageNum: number) => {
    setAdminAuthModal({
      isOpen: true,
      title: "Authorize Stage Editing",
      description: `Enter Admin password to unlock and edit Stage ${stageNum} details.`,
      actionLabel: "Unlock & Edit",
      actionType: "warning",
      onSuccess: async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/projects/${rawId}/commercial/${blockId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_saved: false }),
          });
          if (res.ok) {
            setCommercialBlocks((prev) =>
              prev.map((block) => (block.id === blockId ? { ...block, isSaved: false } : block))
            );
            showToast(`Stage ${stageNum} unlocked for editing!`);
          } else {
            showToast("Failed to unlock stage on server");
          }
        } catch (err) {
          console.error("Unlock failed", err);
          showToast("Network error unlocking stage");
        }
      },
    });
  };

  // Add another Commercial stage block (loopable repeating step created on backend)
  const handleAddCommercialBlock = async () => {
    const nextNum = commercialBlocks.length + 1;

    try {
      const res = await fetch(`${API_BASE_URL}/projects/${rawId}/commercial`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage_number: nextNum,
          status: "in_progress",
          po_number: "",
          po_date: "",
          contract_value: "",
          is_saved: false,
          documents: [],
        }),
      });

      if (res.ok) {
        const created = await res.json();
        const newBlock: CommercialBlock = {
          id: String(created.id),
          stageNumber: created.stage_number || nextNum,
          status: (created.status as "in_progress" | "completed") || "in_progress",
          poNumber: created.po_number || "",
          poDate: created.po_date || "",
          contractValue: created.contract_value || "",
          isSaved: Boolean(created.is_saved),
          documents: Array.isArray(created.documents) ? created.documents : [],
        };
        setCommercialBlocks((prev) => [...prev, newBlock]);

        // Also add stage card in Engineering & Documentation
        const newEngBlock: EngineeringBlock = {
          id: String(created.id),
          stageNumber: created.stage_number || nextNum,
          status: "in_progress",
          documents: [],
        };
        setEngineeringBlocks((prev) => {
          if (prev.some((e) => e.stageNumber === newEngBlock.stageNumber)) return prev;
          return [...prev, newEngBlock];
        });

        showToast(`Added Commercial & Engineering Stage ${newBlock.stageNumber}`);
        addActivityLog({
          projectName: projectInfo.name,
          module: "Commercial Approval",
          action: `Added Stage ${newBlock.stageNumber} to Commercial & Engineering Approval`,
          projectKey: rawId,
        });
      } else {
        showToast("Failed to create new stage on server");
      }
    } catch (err) {
      console.error("Failed to add stage", err);
      showToast("Network error creating stage");
    }
  };

  // Delete a stage block (if not the only one, Requires Admin Password)
  const handleDeleteCommercialBlock = (blockId: string, stageNum: number) => {
    if (commercialBlocks.length <= 1) {
      showToast("At least one Commercial stage is required");
      return;
    }

    setAdminAuthModal({
      isOpen: true,
      title: "Authorize Stage Deletion",
      description: `Enter Admin password to permanently delete Stage ${stageNum} from Commercial & Engineering.`,
      actionLabel: "Delete Stage",
      actionType: "danger",
      onSuccess: async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/projects/${rawId}/commercial/${blockId}`, {
            method: "DELETE",
          });
          if (res.ok) {
            setCommercialBlocks((prev) => {
              const remaining = prev.filter((b) => b.id !== blockId);
              const sum = remaining.reduce((acc, b) => {
                const clean = (b.contractValue || "").replace(/[^0-9.-]/g, "");
                const num = parseFloat(clean);
                return acc + (isNaN(num) ? 0 : num);
              }, 0);
              setProjectInfo((p) => ({
                ...p,
                budget: sum > 0 ? `${sum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} AED` : "",
              }));
              return remaining;
            });
            setEngineeringBlocks((prev) => prev.filter((b) => b.stageNumber !== stageNum && b.id !== blockId));
            showToast(`Removed Stage ${stageNum}`);
            addActivityLog({
              projectName: projectInfo.name,
              module: "Commercial Approval",
              action: `Deleted Stage ${stageNum} from Commercial & Engineering`,
              projectKey: rawId,
            });
          } else {
            showToast("Failed to delete stage from server");
          }
        } catch (err) {
          console.error("Failed to delete stage", err);
          showToast("Network error deleting stage");
        }
      },
    });
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadDocName.trim() || !docModalTarget) return;

    const trimmed = uploadDocName.trim();
    const finalDocName = trimmed.includes(".") ? trimmed : `${trimmed}.pdf`;
    const newDoc: DocumentItem = {
      id: `doc-${Date.now()}`,
      name: finalDocName,
      size: selectedFileSize || (selectedFileName ? "1.8 MB" : "1.2 MB"),
      date: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
      fileUrl: selectedFileDataUrl || undefined,
    };

    const token = getStoredToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    if (docModalTarget.type === "commercial") {
      const blockId = docModalTarget.blockId;
      const targetStageNum = docModalTarget.stageNumber || 1;
      try {
        const res = await fetch(`${API_BASE_URL}/projects/${rawId}/commercial/${blockId}/documents`, {
          method: "POST",
          headers,
          body: JSON.stringify(newDoc),
        });
        if (res.ok) {
          const updatedStage = await res.json();
          setCommercialBlocks((prev) =>
            prev.map((block) =>
              block.id === blockId
                ? { ...block, documents: Array.isArray(updatedStage.documents) ? updatedStage.documents : [...block.documents, newDoc] }
                : block
            )
          );
          showToast(`Successfully uploaded: ${newDoc.name}`);
          addActivityLog({
            projectName: projectInfo.name,
            module: "Commercial Approval",
            action: `Uploaded document '${newDoc.name}' (${newDoc.size}) to Stage ${targetStageNum}`,
            projectKey: rawId,
          });
        } else {
          showToast("Failed to upload document to server");
        }
      } catch (err) {
        console.error("Upload failed", err);
        showToast("Network error uploading document");
      }
    } else {
      const blockId = docModalTarget.blockId;
      const targetStageNum = docModalTarget.stageNumber || 1;
      try {
        const res = await fetch(`${API_BASE_URL}/projects/${rawId}/engineering/${blockId}/documents`, {
          method: "POST",
          headers,
          body: JSON.stringify(newDoc),
        });
        if (res.ok) {
          const updatedStage = await res.json();
          setEngineeringBlocks((prev) =>
            prev.map((block) =>
              block.id === blockId || block.stageNumber === docModalTarget.stageNumber
                ? { ...block, documents: Array.isArray(updatedStage.documents) ? updatedStage.documents : [...block.documents, newDoc] }
                : block
            )
          );
          showToast(`Successfully uploaded: ${newDoc.name}`);
          addActivityLog({
            projectName: projectInfo.name,
            module: "Engineering",
            action: `Uploaded engineering document '${newDoc.name}' (${newDoc.size}) to Stage ${targetStageNum}`,
            projectKey: rawId,
          });
        } else {
          showToast("Failed to upload document to server");
        }
      } catch (err) {
        console.error("Engineering upload failed", err);
        showToast("Network error uploading document");
      }
    }

    setUploadDocName("");
    setSelectedFileName("");
    setSelectedFileDataUrl("");
    setSelectedFileSize("");
    setDocModalTarget(null);
  };

  const handleDeleteCommercialBlockDoc = (blockId: string, docId: string, name: string) => {
    setAdminAuthModal({
      isOpen: true,
      title: "Authorize Document Deletion",
      description: `Enter Admin password to delete "${name}".`,
      actionLabel: "Delete Document",
      actionType: "danger",
      onSuccess: async () => {
        try {
          const token = getStoredToken();
          const headers: Record<string, string> = {};
          if (token) headers["Authorization"] = `Bearer ${token}`;

          const res = await fetch(`${API_BASE_URL}/projects/${rawId}/commercial/${blockId}/documents/${docId}`, {
            method: "DELETE",
            headers,
          });
          if (res.ok) {
            setCommercialBlocks((prev) =>
              prev.map((block) => {
                if (block.id === blockId) {
                  return { ...block, documents: block.documents.filter((d) => d.id !== docId) };
                }
                return block;
              })
            );
            showToast(`Deleted document: ${name}`);
            addActivityLog({
              projectName: projectInfo.name,
              module: "Commercial Approval",
              action: `Deleted document '${name}' from Commercial stage`,
              projectKey: rawId,
            });
          } else {
            showToast("Failed to delete document from server");
          }
        } catch (err) {
          console.error("Delete doc failed", err);
          showToast("Network error deleting document");
        }
      },
    });
  };

  const handleDeleteEngineeringStageDoc = (blockId: string, docId: string, name: string) => {
    setAdminAuthModal({
      isOpen: true,
      title: "Authorize Engineering Doc Deletion",
      description: `Enter Admin password to delete "${name}".`,
      actionLabel: "Delete Document",
      actionType: "danger",
      onSuccess: async () => {
        try {
          const token = getStoredToken();
          const headers: Record<string, string> = {};
          if (token) headers["Authorization"] = `Bearer ${token}`;

          const res = await fetch(`${API_BASE_URL}/projects/${rawId}/engineering/${blockId}/documents/${docId}`, {
            method: "DELETE",
            headers,
          });
          if (res.ok) {
            setEngineeringBlocks((prev) =>
              prev.map((block) => {
                if (block.id === blockId) {
                  return { ...block, documents: block.documents.filter((d) => d.id !== docId) };
                }
                return block;
              })
            );
            showToast(`Deleted document: ${name}`);
            addActivityLog({
              projectName: projectInfo.name,
              module: "Engineering",
              action: `Deleted engineering document '${name}' from Engineering stage`,
              projectKey: rawId,
            });
          } else {
            showToast("Failed to delete document from server");
          }
        } catch (err) {
          console.error("Delete doc failed", err);
          showToast("Network error deleting document");
        }
      },
    });
  };

  const handleSaveBudget = () => {
    setBudgetSaved(true);
    showToast("Budget & Costing values updated successfully!");
    setTimeout(() => setBudgetSaved(false), 2000);
  };

  // Helper for Header status badge
  const renderHeaderBadge = (status: "completed" | "in_progress" | "not_started" | "blocked") => {
    switch (status) {
      case "completed":
        return (
          <span className="px-3 py-1 text-xs font-semibold rounded-md bg-[#22c55e] text-white shadow-2xs">
            Completed
          </span>
        );
      case "in_progress":
        return (
          <span className="px-3 py-1 text-xs font-semibold rounded-md bg-amber-500 text-white shadow-2xs">
            In Progress
          </span>
        );
      case "blocked":
        return (
          <span className="px-3 py-1 text-xs font-semibold rounded-md bg-rose-500 text-white shadow-2xs">
            Blocked
          </span>
        );
      case "not_started":
      default:
        return (
          <span className="px-3 py-1 text-xs font-semibold rounded-md bg-slate-600 text-white shadow-2xs">
            Not Started
          </span>
        );
    }
  };

  // Currency formatter helper
  const formatAed = (val?: string) => {
    if (!val || !val.trim()) return "";
    const trimmed = val.trim();
    return trimmed.toUpperCase().includes("AED") ? trimmed : `${trimmed} AED`;
  };

  // Total dynamic contract value calculated across all Commercial Stages (fallback to project budget)
  const primaryContractValue = useMemo(() => {
    let hasValue = false;
    const total = commercialBlocks.reduce((acc, b) => {
      if (b.contractValue && b.contractValue.trim()) {
        const clean = b.contractValue.replace(/[^0-9.-]/g, "");
        const num = parseFloat(clean);
        if (!isNaN(num)) {
          hasValue = true;
          return acc + num;
        }
      }
      return acc;
    }, 0);

    if (hasValue) {
      return `${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} AED`;
    }
    return projectInfo.budget || "";
  }, [commercialBlocks, projectInfo.budget]);

  // Overall milestone calculations
  const allSectionStatuses = useMemo(() => [
    commercialStatus,
    engineeringStatus,
    budgetStatus,
    procurementStatus,
    resourceStatus,
    siteExecutionStatus,
    handoverStatus,
  ], [commercialStatus, engineeringStatus, budgetStatus, procurementStatus, resourceStatus, siteExecutionStatus, handoverStatus]);

  const completedSectionsCount = useMemo(
    () => allSectionStatuses.filter((s) => s === "completed").length,
    [allSectionStatuses]
  );

  const inProgressSectionsCount = useMemo(
    () => allSectionStatuses.filter((s) => s === "in_progress").length,
    [allSectionStatuses]
  );

  const overallCompletionPercent = useMemo(() => {
    return Math.min(100, Math.max(0, verifiedProgressPercentage));
  }, [verifiedProgressPercentage]);

  return (
    <div className="space-y-6 sm:space-y-7 animate-in fade-in duration-200 pb-24 max-w-7xl mx-auto">
      {/* Toast Notification Alert - High z-index to always stay above modals */}
      {toastMsg && (
        <div
          className={`fixed top-5 right-5 z-[9999] px-4 py-2.5 rounded-xl shadow-2xl text-xs sm:text-sm font-semibold border flex items-center gap-2.5 animate-in fade-in slide-in-from-top-2 duration-200 ${
            toastMsg.type === "error"
              ? "bg-rose-950 text-rose-100 border-rose-800 shadow-rose-950/60"
              : "bg-slate-900 text-white border-slate-700 shadow-slate-950/60"
          }`}
        >
          {toastMsg.type === "error" ? (
            <span className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold text-xs">✕</span>
          ) : (
            <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">✓</span>
          )}
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* Top Breadcrumb & Project Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-slate-200">
        <div className="space-y-1">
          <Link
            href="/projects"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span>Back to Projects</span>
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {projectInfo.name}
            </h1>
            {/* In-Place Interactive Priority Dropdown Badge */}
            <div className="relative inline-block text-left">
              <button
                type="button"
                onClick={(e) => {
                  if (!isAdmin()) return;
                  e.stopPropagation();
                  setIsPriorityMenuOpen((prev) => !prev);
                }}
                disabled={!isAdmin()}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition-all select-none ${projectInfo.priorityLevel === "high"
                    ? "bg-red-50 text-red-700 border-red-200 shadow-2xs"
                    : projectInfo.priorityLevel === "medium"
                      ? "bg-amber-50 text-amber-700 border-amber-200 shadow-2xs"
                      : "bg-sky-50 text-sky-700 border-sky-200 shadow-2xs"
                  } ${isAdmin() ? "hover:opacity-85 cursor-pointer" : "cursor-default"}`}
                title={isAdmin() ? "Click to change project priority (Admin Only)" : "Priority"}
              >
                <span>{projectInfo.priority}</span>
                {isAdmin() && (
                  <svg className="w-3.5 h-3.5 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                )}
              </button>

              {isAdmin() && isPriorityMenuOpen && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute left-0 mt-1.5 w-32 bg-white rounded-xl shadow-xl border border-slate-200/80 p-1 z-30 animate-in fade-in zoom-in-95 duration-100"
                >
                  <button
                    type="button"
                    onClick={() => updateDetailPriority("High")}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between cursor-pointer transition-colors ${projectInfo.priority === "High"
                        ? "bg-red-50 text-red-700 font-bold"
                        : "hover:bg-slate-50 text-slate-700"
                      }`}
                  >
                    <span>High</span>
                    {projectInfo.priority === "High" && <span className="text-red-600 font-bold">✓</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateDetailPriority("Medium")}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between cursor-pointer transition-colors ${projectInfo.priority === "Medium"
                        ? "bg-amber-50 text-amber-700 font-bold"
                        : "hover:bg-slate-50 text-slate-700"
                      }`}
                  >
                    <span>Medium</span>
                    {projectInfo.priority === "Medium" && <span className="text-amber-600 font-bold">✓</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateDetailPriority("Low")}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between cursor-pointer transition-colors ${projectInfo.priority === "Low"
                        ? "bg-sky-50 text-sky-700 font-bold"
                        : "hover:bg-slate-50 text-slate-700"
                      }`}
                  >
                    <span>Low</span>
                    {projectInfo.priority === "Low" && <span className="text-sky-600 font-bold">✓</span>}
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-xs text-slate-500 pt-0.5">
            <span className="inline-flex items-center gap-1 font-mono font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-lg border border-indigo-200/70">
              #{projectInfo.code || rawId}
            </span>
            {!isSiteSupervisor() && primaryContractValue && (
              <span className="inline-flex items-center gap-1">
                <span className="text-slate-400">Budget:</span>
                <strong className="text-slate-800 font-semibold">{formatAed(primaryContractValue)}</strong>
              </span>
            )}
            {!isSiteSupervisor() && commercialBlocks[0]?.poNumber && (
              <span className="inline-flex items-center gap-1">
                <span className="text-slate-300">•</span>
                <span className="text-slate-400">PO:</span>
                <span className="font-mono font-semibold text-slate-800">{commercialBlocks[0].poNumber}</span>
              </span>
            )}
            {projectInfo.startDate && (
              <span className="inline-flex items-center gap-1">
                <span className="text-slate-300">•</span>
                <span className="text-slate-400">Started:</span>
                <span className="text-slate-700 font-medium">{projectInfo.startDate}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <span className="text-slate-300">•</span>
              <span className="text-slate-400">Progress:</span>
              <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                Stage {projectInfo.currentStage || 1} of {projectInfo.totalStages || 7}
              </span>
            </span>
          </div>
        </div>

        {/* Global Expand/Collapse, PDF Export & Quick Status */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {/* Main Download Project PDF Button */}
          <button
            type="button"
            onClick={handleDownloadProjectDossier}
            disabled={isGeneratingDossierPdf}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold text-white bg-[#0c1033] hover:bg-[#161d52] active:scale-95 rounded-xl shadow-xs hover:shadow-md transition-all cursor-pointer disabled:opacity-50"
            title="Download complete project dossier PDF including timeline, all stages, resources, procurement, and site execution photos"
          >
            {isGeneratingDossierPdf ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Generating PDF...</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>Download Project PDF</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={expandAll}
            className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-200 rounded-xl shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Expand All
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-200 rounded-xl shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* =========================================================================
          OVERALL MILESTONE COMPLETION SECTION (Hidden for Site Supervisor)
          ========================================================================= */}
      {!isSiteSupervisor() && (
        <div className="p-6 sm:p-7 rounded-3xl bg-white border border-slate-200/90 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
                Overall Project Milestone Completion
              </h3>
            </div>

            <div className="flex items-baseline gap-2 self-start sm:self-auto bg-slate-50 px-4 py-2 rounded-2xl border border-slate-200">
              <span className="text-3xl sm:text-4xl font-black text-emerald-600 font-mono tracking-tight">{overallCompletionPercent}%</span>
              <span className="text-xs font-bold text-slate-400">/ 100%</span>
            </div>
          </div>

          {/* Clean Vibrant Gradient Progress Track */}
          <div className="space-y-2">
            <div className="w-full h-4 rounded-full bg-slate-100 border border-slate-200 p-0.5 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 shadow-2xs transition-all duration-700"
                style={{ width: `${overallCompletionPercent}%` }}
              />
            </div>

            {/* Clean 0% and 100% labels */}
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400 pt-0.5">
              <span>0%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Quick Executive Status Chips with AED currency */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
            <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/60">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Milestones Completed</span>
              <span className="text-xs sm:text-sm font-bold text-slate-900 mt-0.5 block">{completedSectionsCount} of 7 Stages Signed</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/60">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Site Execution</span>
              <span className="text-xs sm:text-sm font-bold text-emerald-600 mt-0.5 block font-mono">
                {verifiedProgressPercentage}% Verified on Site
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/60">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Internal Costing</span>
              <span className="text-xs sm:text-sm font-bold text-slate-900 mt-0.5 block font-mono">—</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/60">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Contract Value</span>
              <span className="text-xs sm:text-sm font-bold text-slate-900 mt-0.5 block font-mono">
                {primaryContractValue ? formatAed(primaryContractValue) : "—"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          SECTION 1: Commercial Approval (Hidden for Site Supervisor)
          ========================================================================= */}
      {!isSiteSupervisor() && (
        <>
          <div className={`rounded-2xl border border-slate-200 bg-white shadow-xs transition-all ${openSections.commercial ? "relative z-30" : "relative z-10"}`}>
            {/* Navy Accordion Header */}
            <div
              onClick={() => toggleSection("commercial")}
              className={`flex items-center justify-between px-6 py-4 bg-gradient-to-r from-[#0c1033] via-[#121748] to-[#1a2063] text-white cursor-pointer select-none hover:from-[#111645] hover:to-[#222a7d] transition-all ${openSections.commercial ? "rounded-t-2xl" : "rounded-2xl"
                }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-base sm:text-lg font-bold tracking-tight">
                  Commercial Approval
                </span>
              </div>
              <div className="flex items-center gap-3">
                {renderHeaderBadge(commercialStatus)}
                <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
                  <svg
                    className={`w-4 h-4 text-white transition-transform duration-200 ${openSections.commercial ? "rotate-180" : ""
                      }`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Section Body */}
            {openSections.commercial && (
              <div className="p-6 space-y-6">
                {/* Section Level Status Toggle */}
                <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={commercialStatus === "in_progress" || commercialStatus === "completed"}
                      onClick={() => handleUpdateSectionStatus("commercial_status", "not_started")}
                      title={commercialStatus !== "not_started" ? "Cannot rollback to Not started" : "Not started"}
                      className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${commercialStatus === "not_started"
                        ? "bg-slate-700 text-white font-semibold shadow-2xs"
                        : "bg-slate-100 text-slate-400 border border-slate-200/70 cursor-not-allowed opacity-50"
                        }`}
                    >
                      Not started
                    </button>
                    <button
                      type="button"
                      disabled={commercialStatus === "completed"}
                      onClick={() => handleUpdateSectionStatus("commercial_status", "in_progress")}
                      title={commercialStatus === "completed" ? "Cannot rollback to In progress" : "Mark as In progress"}
                      className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${commercialStatus === "in_progress"
                        ? "bg-amber-50 text-amber-700 border border-amber-300 font-semibold shadow-2xs"
                        : commercialStatus === "completed"
                          ? "bg-slate-100 text-slate-400 border border-slate-200/70 cursor-not-allowed opacity-50"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200/70 cursor-pointer"
                        }`}
                    >
                      In progress
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateSectionStatus("commercial_status", "completed")}
                      className={`px-3 py-1 text-xs rounded-md font-medium transition-all cursor-pointer ${commercialStatus === "completed"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-300 font-semibold shadow-2xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200/70"
                        }`}
                    >
                      Completed
                    </button>
                  </div>
                </div>

                {/* Dynamic Commercial Stages (Loopable) */}
                <div className="space-y-6">
                  {commercialBlocks.map((block, index) => (
                    <div
                      key={block.id}
                      className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-5 transition-all"
                    >
                      {/* Stage Header: Stage Badge, Status Pills, Saved Lock Badge, and Remove Option */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-extrabold bg-[#0c1033] text-white tracking-wide shadow-2xs">
                            <span>Stage {block.stageNumber}</span>
                          </span>

                          {/* Locked on Save Badge */}
                          {block.isSaved && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <svg className="w-3 h-3 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                              </svg>
                              <span>Locked & Saved</span>
                            </span>
                          )}
                        </div>

                        {/* Optional remove stage button if more than 1 block */}
                        {isAdmin() && commercialBlocks.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteCommercialBlock(block.id, block.stageNumber)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer text-xs flex items-center gap-1"
                            title={`Remove Stage ${block.stageNumber}`}
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                            <span className="hidden sm:inline">Delete Stage</span>
                          </button>
                        )}
                      </div>

                      {/* Inputs: PO Number, PO Date, Contract Value (in AED), SAVE button */}
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
                        <div className="sm:col-span-3">
                          <label className="text-xs font-semibold text-slate-700 block mb-1">
                            PO Number {block.isSaved && <span className="text-[10px] text-slate-400">(Locked)</span>}
                          </label>
                          <input
                            type="text"
                            value={block.poNumber}
                            disabled={block.isSaved}
                            onChange={(e) => handleUpdateCommercialField(block.id, "poNumber", e.target.value)}
                            placeholder="e.g. PO-101"
                            className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium text-slate-800 disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors"
                          />
                        </div>

                        <div className="sm:col-span-3">
                          <ThemeDatePicker
                            label="PO Date"
                            value={block.poDate}
                            disabled={block.isSaved}
                            onChange={(val) => handleUpdateCommercialField(block.id, "poDate", val)}
                            placeholder="Select PO date"
                          />
                        </div>

                        <div className="sm:col-span-4">
                          <label className="text-xs font-semibold text-slate-700 block mb-1">
                            Contract Value (in AED) {block.isSaved && <span className="text-[10px] text-slate-400">(Locked)</span>}
                          </label>
                          <div className="relative">
                            <input
                              type="text"
                              value={block.contractValue}
                              disabled={block.isSaved}
                              onChange={(e) => handleUpdateCommercialField(block.id, "contractValue", e.target.value)}
                              placeholder="e.g. 185,000"
                              className="w-full px-3.5 py-2 pr-12 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium text-slate-800 disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                              AED
                            </span>
                          </div>
                        </div>

                        <div className="sm:col-span-2">
                          {block.isSaved ? (
                            <div className="flex items-center gap-1.5 w-full">
                              <div
                                title="Details completely saved and locked"
                                className="flex-1 py-2 px-2 text-xs font-bold text-emerald-700 bg-emerald-100 border border-emerald-300 rounded-xl flex items-center justify-center gap-1 cursor-default select-none shadow-2xs"
                              >
                                <svg className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                                <span>SAVED</span>
                              </div>
                              {isAdmin() && (
                                <button
                                  type="button"
                                  onClick={() => handleUnlockCommercialBlock(block.id, block.stageNumber)}
                                  className="py-2 px-2.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl shadow-2xs transition-colors cursor-pointer flex items-center justify-center gap-1 flex-shrink-0"
                                  title="Authorize with Admin Password to edit locked stage details"
                                >
                                  <svg className="w-3.5 h-3.5 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                  </svg>
                                  <span>Edit</span>
                                </button>
                              )}
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSaveCommercialBlock(block.id)}
                              className="w-full py-2 px-4 text-xs font-bold text-white bg-[#22c55e] hover:bg-emerald-600 rounded-xl shadow-xs transition-colors cursor-pointer active:scale-98"
                            >
                              SAVE
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Project Documents Sub-section for this Stage */}
                      <div className="space-y-3 pt-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800">
                            Project Document {block.documents.length > 0 && <span className="text-slate-400 font-normal">({block.documents.length})</span>}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setDocModalTarget({
                                type: "commercial",
                                blockId: block.id,
                                stageNumber: block.stageNumber,
                              })
                            }
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#1b1f63] hover:bg-[#262c8a] rounded-xl shadow-2xs transition-colors cursor-pointer"
                          >
                            <span>+ Add Document</span>
                          </button>
                        </div>

                        {block.documents.length === 0 ? (
                          <div className="p-4 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-400 bg-slate-50/50">
                            No documents attached to Stage {block.stageNumber} yet. Click <strong className="text-slate-600">+ Add Document</strong> to upload.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {block.documents.map((doc) => (
                              <div
                                key={doc.id}
                                className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50/70 transition-colors"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                      <polyline points="14 2 14 8 20 8" />
                                    </svg>
                                  </div>
                                  <div>
                                    <div className="text-xs sm:text-sm font-bold text-slate-900">{doc.name}</div>
                                    <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                                      <span>{doc.size}</span>
                                      <span>•</span>
                                      <span className="inline-flex items-center gap-1 text-slate-500 font-medium">
                                        <svg className="w-3 h-3 text-indigo-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                          <line x1="16" y1="2" x2="16" y2="6" />
                                          <line x1="8" y1="2" x2="8" y2="6" />
                                          <line x1="3" y1="10" x2="21" y2="10" />
                                        </svg>
                                        {doc.date}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  {isAdmin() && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteCommercialBlockDoc(block.id, doc.id, doc.name)}
                                      className="p-1.5 rounded-lg text-rose-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                      title="Delete document"
                                    >
                                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <polyline points="3 6 5 6 21 6" />
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                      </svg>
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleDownloadDoc(doc)}
                                    className="p-1.5 rounded-lg text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 transition-colors cursor-pointer"
                                    title="Download document"
                                  >
                                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                      <polyline points="7 10 12 15 17 10" />
                                      <line x1="12" y1="15" x2="12" y2="3" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Continuous Loop Repeating Button: + Add */}
                <div className="flex justify-end pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handleAddCommercialBlock}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-[#1b1f63] hover:bg-[#262c8a] rounded-xl shadow-xs hover:shadow-md transition-all cursor-pointer active:scale-98"
                  >
                    <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <span>Add</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* =========================================================================
          SECTION 2: Engineering & Documentation
          ========================================================================= */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs transition-all">
            <div
              onClick={() => toggleSection("engineering")}
              className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-[#0c1033] via-[#121748] to-[#1a2063] text-white cursor-pointer select-none hover:from-[#111645] hover:to-[#222a7d] transition-all"
            >
              <div className="flex items-center gap-3">
                <span className="text-base sm:text-lg font-bold tracking-tight">
                  Engineering & Documentation
                </span>
              </div>
              <div className="flex items-center gap-3">
                {renderHeaderBadge(engineeringStatus)}
                <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
                  <svg
                    className={`w-4 h-4 text-white transition-transform duration-200 ${openSections.engineering ? "rotate-180" : ""
                      }`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </div>
            </div>

            {openSections.engineering && (
              <div className="p-6 space-y-6">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={engineeringStatus === "in_progress" || engineeringStatus === "completed"}
                    onClick={() => handleUpdateSectionStatus("engineering_status", "not_started")}
                    title={engineeringStatus !== "not_started" ? "Cannot rollback to Not started" : "Not started"}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${engineeringStatus === "not_started"
                      ? "bg-slate-700 text-white font-semibold shadow-2xs"
                      : "bg-slate-100 text-slate-400 border border-slate-200/70 cursor-not-allowed opacity-50"
                      }`}
                  >
                    Not started
                  </button>
                  <button
                    type="button"
                    disabled={engineeringStatus === "completed"}
                    onClick={() => handleUpdateSectionStatus("engineering_status", "in_progress")}
                    title={engineeringStatus === "completed" ? "Cannot rollback to In progress" : "Mark as In progress"}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${engineeringStatus === "in_progress"
                      ? "bg-amber-50 text-amber-700 border border-amber-300 font-semibold shadow-2xs"
                      : engineeringStatus === "completed"
                        ? "bg-slate-100 text-slate-400 border border-slate-200/70 cursor-not-allowed opacity-50"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200/70 cursor-pointer"
                      }`}
                  >
                    In progress
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateSectionStatus("engineering_status", "completed")}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-all cursor-pointer ${engineeringStatus === "completed"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-300 font-semibold shadow-2xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200/70"
                      }`}
                  >
                    Completed
                  </button>
                </div>

                {/* Dynamic Engineering Stage Cards (Synced with Commercial Approval) */}
                <div className="space-y-6">
                  {engineeringBlocks.map((engBlock) => (
                    <div
                      key={engBlock.id || engBlock.stageNumber}
                      className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-4 transition-all"
                    >
                      {/* Stage Card Header */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-extrabold bg-[#0c1033] text-white tracking-wide shadow-2xs">
                            <span>Stage {engBlock.stageNumber} Documents</span>
                          </span>
                          {engBlock.documents.length > 0 && (
                            <span className="text-xs font-semibold text-slate-400">
                              ({engBlock.documents.length} {engBlock.documents.length === 1 ? "file" : "files"})
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setDocModalTarget({
                              type: "engineering",
                              blockId: engBlock.id,
                              stageNumber: engBlock.stageNumber,
                            })
                          }
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#1b1f63] hover:bg-[#262c8a] rounded-xl shadow-2xs transition-colors cursor-pointer"
                        >
                          <span>+ Add Document</span>
                        </button>
                      </div>

                      {/* Documents List for this Stage */}
                      {engBlock.documents.length === 0 ? (
                        <div className="p-4 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-400 bg-slate-50/50">
                          No engineering documents attached to Stage {engBlock.stageNumber} yet. Click <strong className="text-slate-600">+ Add Document</strong> to upload.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {engBlock.documents.map((doc) => (
                            <div
                              key={doc.id}
                              className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50/70 transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                  </svg>
                                </div>
                                <div>
                                  <div className="text-xs sm:text-sm font-bold text-slate-900">{doc.name}</div>
                                  <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                                    <span>{doc.size}</span>
                                    <span>•</span>
                                    <span className="inline-flex items-center gap-1 text-slate-500 font-medium">
                                      <svg className="w-3 h-3 text-indigo-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                        <line x1="16" y1="2" x2="16" y2="6" />
                                        <line x1="8" y1="2" x2="8" y2="6" />
                                        <line x1="3" y1="10" x2="21" y2="10" />
                                      </svg>
                                      {doc.date}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {isAdmin() && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteEngineeringStageDoc(engBlock.id, doc.id, doc.name)}
                                    className="p-1.5 rounded-lg text-rose-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                    title="Delete document"
                                  >
                                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <polyline points="3 6 5 6 21 6" />
                                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                    </svg>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleDownloadDoc(doc)}
                                  className="p-1.5 rounded-lg text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 transition-colors cursor-pointer"
                                  title="Download document"
                                >
                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* =========================================================================
          SECTION 3: Budget & Costing
          ========================================================================= */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs transition-all">
            <div
              onClick={() => toggleSection("budget")}
              className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-[#0c1033] via-[#121748] to-[#1a2063] text-white cursor-pointer select-none hover:from-[#111645] hover:to-[#222a7d] transition-all"
            >
              <div className="flex items-center gap-3">
                <span className="text-base sm:text-lg font-bold tracking-tight">
                  Budget & Costing
                </span>
              </div>
              <div className="flex items-center gap-3">
                {renderHeaderBadge(budgetStatus)}
                <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
                  <svg
                    className={`w-4 h-4 text-white transition-transform duration-200 ${openSections.budget ? "rotate-180" : ""
                      }`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </div>
            </div>

            {openSections.budget && (
              <div className="p-6 space-y-6">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={budgetStatus === "in_progress" || budgetStatus === "completed"}
                    onClick={() => handleUpdateSectionStatus("budget_status", "not_started")}
                    title={budgetStatus !== "not_started" ? "Cannot rollback to Not started" : "Not started"}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${budgetStatus === "not_started"
                      ? "bg-slate-700 text-white font-semibold shadow-2xs"
                      : "bg-slate-100 text-slate-400 border border-slate-200/70 cursor-not-allowed opacity-50"
                      }`}
                  >
                    Not started
                  </button>
                  <button
                    type="button"
                    disabled={budgetStatus === "completed"}
                    onClick={() => handleUpdateSectionStatus("budget_status", "in_progress")}
                    title={budgetStatus === "completed" ? "Cannot rollback to In progress" : "Mark as In progress"}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${budgetStatus === "in_progress"
                      ? "bg-amber-50 text-amber-700 border border-amber-300 font-semibold shadow-2xs"
                      : budgetStatus === "completed"
                        ? "bg-slate-100 text-slate-400 border border-slate-200/70 cursor-not-allowed opacity-50"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200/70 cursor-pointer"
                      }`}
                  >
                    In progress
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateSectionStatus("budget_status", "completed")}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-all cursor-pointer ${budgetStatus === "completed"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-300 font-semibold shadow-2xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200/70"
                      }`}
                  >
                    Completed
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                  <div className="flex flex-col sm:flex-row items-end gap-3 flex-1 max-w-xl">
                    <div className="w-full sm:w-1/2">
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        Internal Costing (in AED)
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={internalCosting}
                          onChange={(e) => setInternalCosting(e.target.value)}
                          className="w-full px-3.5 py-2 pr-12 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium text-slate-800"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                          AED
                        </span>
                      </div>
                    </div>

                    <div className="w-full sm:w-1/2">
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        Margin(%)
                      </label>
                      <input
                        type="text"
                        value={margin}
                        onChange={(e) => setMargin(e.target.value)}
                        className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium text-slate-800"
                      />
                    </div>
                  </div>

                  {/* Direct new tab link to dedicated costing view */}
                  <a
                    href={`/projects/${rawId}/costing`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2 px-4 text-xs font-semibold text-white bg-[#22c55e] hover:bg-emerald-600 rounded-xl shadow-xs transition-colors cursor-pointer self-start sm:self-auto flex items-center gap-1.5 text-center"
                  >
                    <span>Click here to open in new tab</span>
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* =========================================================================
          SECTION 4: Procurement & Inventory Allocation
          User Requested Columns:
          SN | Vendor | Product | Brand | Part | Quantity | Invoice Number | Status (Added, Partially Added, Yet To Order, Yet To Deliver)
          ========================================================================= */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs transition-all">
            <div
              onClick={() => toggleSection("procurement")}
              className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-[#0c1033] via-[#121748] to-[#1a2063] text-white cursor-pointer select-none hover:from-[#111645] hover:to-[#222a7d] transition-all"
            >
              <div className="flex items-center gap-3">
                <span className="text-base sm:text-lg font-bold tracking-tight">
                  Procurement & Inventory Allocation
                </span>
              </div>
              <div className="flex items-center gap-3">
                {renderHeaderBadge(procurementStatus)}
                <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
                  <svg
                    className={`w-4 h-4 text-white transition-transform duration-200 ${openSections.procurement ? "rotate-180" : ""
                      }`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </div>
            </div>

            {openSections.procurement && (
              <div className="p-6 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={procurementStatus === "in_progress" || procurementStatus === "completed"}
                      onClick={() => handleUpdateSectionStatus("procurement_status", "not_started")}
                      title={procurementStatus !== "not_started" ? "Cannot rollback to Not started" : "Not started"}
                      className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${procurementStatus === "not_started"
                        ? "bg-slate-700 text-white font-semibold shadow-2xs"
                        : "bg-slate-100 text-slate-400 border border-slate-200/70 cursor-not-allowed opacity-50"
                        }`}
                    >
                      Not started
                    </button>
                    <button
                      type="button"
                      disabled={procurementStatus === "completed"}
                      onClick={() => handleUpdateSectionStatus("procurement_status", "in_progress")}
                      title={procurementStatus === "completed" ? "Cannot rollback to In progress" : "Mark as In progress"}
                      className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${procurementStatus === "in_progress"
                        ? "bg-amber-50 text-amber-700 border border-amber-300 font-semibold shadow-2xs"
                        : procurementStatus === "completed"
                          ? "bg-slate-100 text-slate-400 border border-slate-200/70 cursor-not-allowed opacity-50"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200/70 cursor-pointer"
                        }`}
                    >
                      In progress
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateSectionStatus("procurement_status", "completed")}
                      className={`px-3 py-1 text-xs rounded-md font-medium transition-all cursor-pointer ${procurementStatus === "completed"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-300 font-semibold shadow-2xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200/70"
                        }`}
                    >
                      Completed
                    </button>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={handleOpenShiftModal}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 rounded-xl shadow-2xs transition-all cursor-pointer"
                      title="Shift material from another project to this project"
                    >
                      <svg className="w-3.5 h-3.5 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4" />
                      </svg>
                      <span>Shift Item</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        loadPartsAndInventory();
                        setIsAddProcurementOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#1b1f63] hover:bg-[#262c8a] rounded-xl shadow-2xs transition-colors cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      <span>Add Item</span>
                    </button>
                  </div>
                </div>

                {/* Table with columns:
                SN | Part Number | Product Name | Vendor | Brand | Quantity | Allocated | Invoice Number | Status | Actions */}
                <div className="overflow-x-auto pb-1">
                  <table className="w-full text-left min-w-[860px]">
                    <thead>
                      <tr className="border-b border-slate-200/80 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        <th className="pb-3 w-12 pl-3">SN</th>
                        <th className="pb-3 w-36">Part Number</th>
                        <th className="pb-3">Product Name</th>
                        <th className="pb-3 w-36">Vendor</th>
                        <th className="pb-3 w-28">Brand</th>
                        <th className="pb-3 w-20 text-center">Quantity</th>
                        <th className="pb-3 w-24 text-center">Allocated</th>
                        <th className="pb-3 w-32">Invoice Number</th>
                        <th className="pb-3 w-36 text-center">Status</th>
                        <th className="pb-3 w-20 text-right pr-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                      {procurementItems.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="py-12 text-center">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
                                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                  <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                </svg>
                              </div>
                              <p className="font-semibold text-slate-700 text-sm">No procurement items added yet</p>
                              <p className="text-slate-400 text-xs max-w-sm">
                                This project currently has no allocated materials. Click &ldquo;Add Item&rdquo; above to select parts and allocate stock from Master Inventory.
                              </p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        procurementItems.map((item, index) => {
                          const slNo = item.sl || item.sl_no || index + 1;
                          const partNo = item.part || item.part_no || "";
                          const prodName = item.product || item.product_name || partNo;
                          const allocQty = item.allocated_qty ?? 0;
                          const reqQty = item.qty || 1;
                          const invNum = item.invoiceNumber || item.invoice_number || "-";
                          const st = item.status || "Yet To Order";

                          return (
                            <tr key={item.id || slNo} className="hover:bg-slate-50/70 transition-colors">
                              <td className="py-3.5 pl-3 text-slate-500 font-mono font-medium">{slNo}</td>
                              <td className="py-3.5 font-mono font-bold text-slate-900 tracking-wide">{partNo}</td>
                              <td className="py-3.5 font-semibold text-slate-800">{prodName}</td>
                              <td className="py-3.5 text-slate-600 font-medium">{item.vendor || "-"}</td>
                              <td className="py-3.5 text-slate-600 font-medium">{item.brand || "-"}</td>
                              <td className="py-3.5 text-center text-slate-900 font-semibold font-mono">{reqQty}</td>
                              <td className="py-3.5 text-center font-mono font-semibold">
                                {allocQty >= reqQty ? (
                                  <span className="text-emerald-700">{allocQty}/{reqQty}</span>
                                ) : allocQty > 0 ? (
                                  <span className="text-amber-700">{allocQty}/{reqQty}</span>
                                ) : (
                                  <span className="text-rose-600">0/{reqQty}</span>
                                )}
                              </td>
                              <td className="py-3.5 font-mono text-xs text-slate-500">{invNum}</td>
                              <td className="py-3.5 text-center">
                                {st === "Added" ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                                    <span>Added</span>
                                  </span>
                                ) : st === "Partially Added" ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200" title={`Allocated: ${allocQty}/${reqQty} units`}>
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
                                    <span>Partially Added</span>
                                  </span>
                                ) : st === "Yet To Deliver" ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                                    <span>Yet To Deliver</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
                                    <span>Yet To Order</span>
                                  </span>
                                )}
                              </td>
                              <td className="py-3.5 text-right pr-3">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditProcurement(item)}
                                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                                    title="Allocate Stock / Edit Status (Admin Authorization Required)"
                                  >
                                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteProcurementItem(item)}
                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                    title="Remove item (Admin Authorization Required)"
                                  >
                                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <polyline points="3 6 5 6 21 6" />
                                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                    </svg>
                                  </button>
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
            )}
          </div>

          {/* =========================================================================
          SECTION: Statement of Accounts (SOA)
          User Requested Display:
          - Total Contract Value (in AED)
          - Received Amount (in AED)
          - Balance (in AED)
          - "Click here to open in new tab" -> /projects/[id]/costing?tab=soa
          ========================================================================= */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs transition-all">
            <div
              onClick={() => toggleSection("soa")}
              className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-[#0c1033] via-[#121748] to-[#1a2063] text-white cursor-pointer select-none hover:from-[#111645] hover:to-[#222a7d] transition-all"
            >
              <div className="flex items-center gap-3">
                <span className="text-base sm:text-lg font-bold tracking-tight">
                  SOA
                </span>
              </div>
              <div className="flex items-center gap-3">
                {renderHeaderBadge(soaStatus)}
                <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
                  <svg
                    className={`w-4 h-4 text-white transition-transform duration-200 ${openSections.soa ? "rotate-180" : ""
                      }`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </div>
            </div>

            {openSections.soa && (
              <div className="p-6 space-y-6">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={soaStatus === "in_progress" || soaStatus === "completed"}
                    onClick={() => handleUpdateSectionStatus("soa_status", "not_started")}
                    title={soaStatus !== "not_started" ? "Cannot rollback to Not started" : "Not started"}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${soaStatus === "not_started"
                        ? "bg-slate-700 text-white font-semibold shadow-2xs"
                        : "bg-slate-100 text-slate-400 border border-slate-200/70 cursor-not-allowed opacity-50"
                      }`}
                  >
                    Not started
                  </button>
                  <button
                    type="button"
                    disabled={soaStatus === "completed"}
                    onClick={() => handleUpdateSectionStatus("soa_status", "in_progress")}
                    title={soaStatus === "completed" ? "Cannot rollback to In progress" : "Mark as In progress"}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${soaStatus === "in_progress"
                        ? "bg-amber-50 text-amber-700 border border-amber-300 font-semibold shadow-2xs"
                        : soaStatus === "completed"
                          ? "bg-slate-100 text-slate-400 border border-slate-200/70 cursor-not-allowed opacity-50"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200/70 cursor-pointer"
                      }`}
                  >
                    In progress
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateSectionStatus("soa_status", "completed")}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-all cursor-pointer ${soaStatus === "completed"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-300 font-semibold shadow-2xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200/70"
                      }`}
                  >
                    Completed
                  </button>
                </div>

                <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1 max-w-3xl">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        Total Contract Value
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          readOnly
                          value={soaSummary.totalContract.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          className="w-full px-3.5 py-2 pr-12 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50/50 font-semibold text-slate-900 focus:outline-none"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                          AED
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        Received Amount
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          readOnly
                          value={soaSummary.received.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          className="w-full px-3.5 py-2 pr-12 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50/50 font-semibold text-emerald-700 focus:outline-none"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                          AED
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        Balance
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          readOnly
                          value={soaSummary.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          className="w-full px-3.5 py-2 pr-12 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50/50 font-semibold text-rose-700 focus:outline-none"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                          AED
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Direct new tab link to dedicated SOA view */}
                  <a
                    href={`/projects/${rawId}/soa`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2 px-4 text-xs font-semibold text-white bg-[#22c55e] hover:bg-emerald-600 rounded-xl shadow-xs transition-colors cursor-pointer self-start lg:self-auto flex items-center gap-1.5 text-center shrink-0"
                  >
                    <span>Click here to open in new tab</span>
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                </div>

                {/* Stage-by-Stage Commercial Breakdown Cards */}
                {soaSummary.stageBreakdowns.length > 0 && (
                  <div className="pt-3 border-t border-slate-100">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2.5">
                      Stage-by-Stage Commercial Breakdown
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {soaSummary.stageBreakdowns.map((st) => (
                        <div
                          key={st.stageNumber}
                          className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-1.5 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-extrabold text-slate-900">
                              Stage {st.stageNumber}
                            </span>
                            {st.poNumber && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-700">
                                {st.poNumber}
                              </span>
                            )}
                          </div>
                          <div className="flex justify-between text-slate-600 text-[11px]">
                            <span>Contract Value:</span>
                            <span className="font-mono font-bold text-slate-800">
                              {st.contract.toLocaleString(undefined, { minimumFractionDigits: 2 })} AED
                            </span>
                          </div>
                          <div className="flex justify-between text-[11px]">
                            <span className="text-slate-600">Received:</span>
                            <span className="font-mono font-bold text-emerald-700">
                              {st.received.toLocaleString(undefined, { minimumFractionDigits: 2 })} AED
                            </span>
                          </div>
                          <div className="flex justify-between text-[11px] pt-1.5 border-t border-slate-200">
                            <span className="text-slate-600 font-semibold">Remaining:</span>
                            <span className="font-mono font-extrabold text-rose-600">
                              {st.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })} AED
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* =========================================================================
          SECTION 5: Resource Planning (Visible to Site Supervisor)
          Features: "+ Add Member" Button, Calendar Selector, & Manpower linking
          ========================================================================= */}
      <div className={`rounded-2xl border border-slate-200 bg-white shadow-xs transition-all ${openSections.resource ? "relative z-30" : "relative z-10"}`}>
        <div
          onClick={() => toggleSection("resource")}
          className={`flex items-center justify-between px-6 py-4 bg-gradient-to-r from-[#0c1033] via-[#121748] to-[#1a2063] text-white cursor-pointer select-none hover:from-[#111645] hover:to-[#222a7d] transition-all ${openSections.resource ? "rounded-t-2xl" : "rounded-2xl"
            }`}
        >
          <div className="flex items-center gap-3">
            <span className="text-base sm:text-lg font-bold tracking-tight">
              Resource Planning
            </span>
          </div>
          <div className="flex items-center gap-3">
            {renderHeaderBadge(resourceStatus)}
            <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
              <svg
                className={`w-4 h-4 text-white transition-transform duration-200 ${openSections.resource ? "rotate-180" : ""
                  }`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>
        </div>

        {openSections.resource && (
          <div className="p-6 space-y-6">
            {/* Top Row: Section Status Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={resourceStatus === "in_progress" || resourceStatus === "completed"}
                  onClick={() => handleUpdateSectionStatus("resource_status", "not_started")}
                  title={resourceStatus !== "not_started" ? "Cannot rollback to Not started" : "Not started"}
                  className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${resourceStatus === "not_started"
                      ? "bg-slate-700 text-white font-semibold shadow-2xs"
                      : "bg-slate-100 text-slate-400 border border-slate-200/70 cursor-not-allowed opacity-50"
                    }`}
                >
                  Not started
                </button>
                <button
                  type="button"
                  disabled={resourceStatus === "completed"}
                  onClick={() => handleUpdateSectionStatus("resource_status", "in_progress")}
                  title={resourceStatus === "completed" ? "Cannot rollback to In progress" : "Mark as In progress"}
                  className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${resourceStatus === "in_progress"
                      ? "bg-amber-50 text-amber-700 border border-amber-300 font-semibold shadow-2xs"
                      : resourceStatus === "completed"
                        ? "bg-slate-100 text-slate-400 border border-slate-200/70 cursor-not-allowed opacity-50"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200/70 cursor-pointer"
                    }`}
                >
                  In progress
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdateSectionStatus("resource_status", "completed")}
                  className={`px-3 py-1 text-xs rounded-md font-medium transition-all cursor-pointer ${resourceStatus === "completed"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-300 font-semibold shadow-2xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200/70"
                    }`}
                >
                  Completed
                </button>
              </div>

              {/* Total Members Count Badge for Current Date */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">
                  Total Allocated: <span className="font-bold text-slate-900">{resourceItems.length} {resourceItems.length === 1 ? "member" : "members"}</span>
                </span>
              </div>
            </div>

            {/* Calendar & Date Navigation Toolbar (Top-Left Placed with clean padding and elevated z-index) */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/90 border border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-20">
              <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                {/* Calendar Date Picker */}
                <div className="w-56 sm:w-60 relative z-30">
                  <ThemeDatePicker
                    value={selectedResourceDate}
                    onChange={(val) => {
                      if (val) setSelectedResourceDate(val);
                    }}
                    placeholder="Select Date"
                  />
                </div>

                {/* Quick Nav: Prev, Today, Next */}
                <div className="inline-flex items-center rounded-xl bg-white border border-slate-200 p-1 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => handleOffsetDate(-1)}
                    title="Previous Day"
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                    <span>Prev</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedResourceDate(getTodayDateStr())}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${selectedResourceDate === getTodayDateStr()
                        ? "bg-indigo-600 text-white shadow-2xs"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                      }`}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOffsetDate(1)}
                    title="Next Day"
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <span>Next</span>
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </div>

                {/* Current Active Date Badge */}
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50/90 border border-indigo-100 text-indigo-900 text-xs font-semibold">
                  <svg className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <span className="truncate max-w-[200px] sm:max-w-none">{formatResourceDateLabel(selectedResourceDate)}</span>
                </div>
              </div>

              {/* Actions: Download Excel & Add Member */}
              <div className="flex items-center gap-2.5 self-stretch md:self-auto flex-wrap">
                {/* Download Excel Button for this Date */}
                <button
                  type="button"
                  onClick={handleExportResourcesExcel}
                  disabled={resourceItems.length === 0}
                  title={resourceItems.length === 0 ? "No records to export for this date" : "Download Excel spreadsheet for this date"}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100/90 border border-emerald-200/90 rounded-xl shadow-2xs hover:shadow-xs transition-all cursor-pointer active:scale-98 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  <svg className="w-4 h-4 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="8" y1="13" x2="16" y2="13" />
                    <line x1="8" y1="17" x2="16" y2="17" />
                    <line x1="10" y1="9" x2="14" y2="9" />
                  </svg>
                  <span>Download Excel</span>
                </button>

                {/* Add Member Button (Admin, Manager & Procurement only; Hidden for Site Supervisor) */}
                {!isSiteSupervisor() && (
                  <button
                    type="button"
                    onClick={() => {
                      setMemberSearchQuery("");
                      setSelectedWorkerName("");
                      setSelectedWorkerType("Internal");
                      setSelectedHoursWorked(8);
                      setIsMemberDropdownOpen(false);
                      setIsAddResourceOpen(true);
                    }}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-[#1b1f63] hover:bg-[#262c8a] rounded-xl shadow-xs hover:shadow-md transition-all cursor-pointer active:scale-98 flex-shrink-0 whitespace-nowrap"
                  >
                    <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <span>Add Member</span>
                  </button>
                )}
              </div>
            </div>

            {/* Table of Members for Selected Date */}
            <div className="overflow-x-auto pb-1 relative">
              {isLoadingResources && (
                <div className="absolute inset-0 bg-white/60 backdrop-blur-2xs flex items-center justify-center z-10">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-white shadow-md rounded-xl border border-slate-200 text-xs font-semibold text-indigo-600">
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" strokeDasharray="30" strokeDashoffset="10" />
                    </svg>
                    <span>Loading date allocations...</span>
                  </div>
                </div>
              )}

              <table className="w-full text-left min-w-[500px]">
                <thead>
                  <tr className="border-b border-slate-200/80 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    <th className="pb-3 w-16 pl-2">SN</th>
                    <th className="pb-3">Member Name</th>
                    <th className="pb-3 w-36 text-center">Type</th>
                    <th className="pb-3 w-36 text-center">Hours Worked</th>
                    <th className="pb-3 w-24 text-right pr-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                  {resourceItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-slate-400 text-xs sm:text-sm">
                        <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                          <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                              <line x1="16" y1="2" x2="16" y2="6" />
                              <line x1="8" y1="2" x2="8" y2="6" />
                              <line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                          </div>
                          <p className="font-medium text-slate-600">
                            No members allocated for {formatResourceDateLabel(selectedResourceDate)}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            Click &quot;Add Member&quot; above to allocate manpower for this specific date.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    resourceItems.map((r, idx) => (
                      <tr key={r.id || idx} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 pl-2 text-slate-500 font-mono">{r.sl_no || idx + 1}</td>
                        <td className="py-3.5 font-semibold text-slate-900">{r.name}</td>
                        <td className="py-3.5 text-center">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full border ${(r.type || "").toLowerCase() === "external"
                                ? "bg-amber-50 text-amber-700 border-amber-200"
                                : "bg-blue-50 text-blue-700 border-blue-200"
                              }`}
                          >
                            {r.type || "Internal"}
                          </span>
                        </td>
                        <td className="py-3.5 text-center">
                          <span className="inline-flex items-center px-2.5 py-1 text-xs font-bold rounded-lg bg-slate-100 text-slate-800 border border-slate-200/70 font-mono">
                            {r.hours_worked} {r.hours_worked === 1 ? "hr" : "hrs"}
                          </span>
                        </td>
                        <td className="py-3.5 text-right pr-2">
                          {isAdmin() ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteResource(r.id, r.name)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Remove Member"
                            >
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
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
        )}
      </div>

      {/* =========================================================================
          SECTION 6: Site Execution (with Calendar, Date-Feed, Multi-Image Upload & Forward-Only Progress)
          ========================================================================= */}
      <div className={`rounded-2xl border border-slate-200 bg-white shadow-xs transition-all ${openSections.siteExecution ? "relative z-30" : "relative z-10"}`}>
        <div
          onClick={() => toggleSection("siteExecution")}
          className={`flex items-center justify-between px-6 py-4 bg-gradient-to-r from-[#0c1033] via-[#121748] to-[#1a2063] text-white cursor-pointer select-none hover:from-[#111645] hover:to-[#222a7d] transition-all ${openSections.siteExecution ? "rounded-t-2xl" : "rounded-2xl"
            }`}
        >
          <div className="flex items-center gap-3">
            <span className="text-base sm:text-lg font-bold tracking-tight">
              Site Execution
            </span>
          </div>
          <div className="flex items-center gap-3">
            {renderHeaderBadge(siteExecutionStatus)}
            <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
              <svg
                className={`w-4 h-4 text-white transition-transform duration-200 ${openSections.siteExecution ? "rotate-180" : ""
                  }`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>
        </div>

        {openSections.siteExecution && (
          <div className="p-6 space-y-6">
            {/* Top Row: Section Status Controls & Report Count */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={siteExecutionStatus === "in_progress" || siteExecutionStatus === "completed"}
                  onClick={() => handleUpdateSectionStatus("site_execution_status", "not_started")}
                  title={siteExecutionStatus !== "not_started" ? "Cannot rollback to Not started" : "Not started"}
                  className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${siteExecutionStatus === "not_started"
                      ? "bg-slate-700 text-white font-semibold shadow-2xs"
                      : "bg-slate-100 text-slate-400 border border-slate-200/70 cursor-not-allowed opacity-50"
                    }`}
                >
                  Not started
                </button>
                <button
                  type="button"
                  disabled={siteExecutionStatus === "completed"}
                  onClick={() => handleUpdateSectionStatus("site_execution_status", "in_progress")}
                  title={siteExecutionStatus === "completed" ? "Cannot rollback to In progress" : "Mark as In progress"}
                  className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${siteExecutionStatus === "in_progress"
                      ? "bg-amber-50 text-amber-700 border border-amber-300 font-semibold shadow-2xs"
                      : siteExecutionStatus === "completed"
                        ? "bg-slate-100 text-slate-400 border border-slate-200/70 cursor-not-allowed opacity-50"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200/70 cursor-pointer"
                    }`}
                >
                  In progress
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdateSectionStatus("site_execution_status", "completed")}
                  className={`px-3 py-1 text-xs rounded-md font-medium transition-all cursor-pointer ${siteExecutionStatus === "completed"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-300 font-semibold shadow-2xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200/70"
                    }`}
                >
                  Completed
                </button>
              </div>

              {/* Total Reports Count for Current Date */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">
                  Total Reports: <span className="font-bold text-slate-900">{siteExecutionLogs.length} {siteExecutionLogs.length === 1 ? "entry" : "entries"}</span>
                </span>
              </div>
            </div>

            {/* DEDICATED SITE EXECUTION PERCENTAGE COMPLETION BAR WITH ROLE-BASED FORWARD-ONLY CONTROLS */}
            <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 via-[#10163a] to-[#161c4d] border border-slate-700/60 text-white space-y-4 shadow-lg">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                    </svg>
                  </div>
                  <div>
                    <span className="text-sm font-bold text-white tracking-tight block">
                      Site Execution Milestone Verification
                    </span>
                    <span className="text-[11px] text-slate-300">
                      {isManagerOrAdmin
                        ? "Official verified milestone level • Forward-only progression enforced"
                        : "Official verified execution milestone level"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-medium">Verified Level:</span>
                  <span className="text-base font-extrabold font-mono text-emerald-300 bg-emerald-950/70 px-3.5 py-1 rounded-xl border border-emerald-500/40 shadow-inner">
                    {verifiedProgressPercentage}% Verified
                  </span>
                </div>
              </div>

              {/* Progress Bar Display */}
              <div className="space-y-1.5">
                <div className="w-full h-3 rounded-full bg-slate-800/90 overflow-hidden p-0.5 border border-slate-700 shadow-inner">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-teal-400 to-indigo-400 transition-all duration-700 shadow-sm"
                    style={{ width: `${Math.min(100, Math.max(0, verifiedProgressPercentage))}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs font-semibold text-slate-400 px-0.5">
                  <span>0% Started</span>
                  <span className="font-mono text-emerald-400 font-bold">{verifiedProgressPercentage}%</span>
                  <span>100% Fully Built</span>
                </div>
              </div>

              {/* Forward-Only Progress Adjuster (Manager & Admin Exclusive - Clean Corporate Buttons & Custom Input) */}
              {isManagerOrAdmin ? (
                <div className="pt-3 border-t border-slate-700/70 flex flex-wrap items-center justify-between gap-4 bg-white/5 p-4 rounded-xl border border-white/10 backdrop-blur-xs">
                  <div className="flex flex-wrap items-center gap-4">
                    {/* Quick Increments */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-slate-300">Quick Increment:</span>
                      <div className="flex items-center gap-1.5">
                        {[5, 10, 15, 20].map((inc) => {
                          const target = Math.min(100, verifiedProgressPercentage + inc);
                          const isSelected = editingProgressValue === target;
                          return (
                            <button
                              key={inc}
                              type="button"
                              onClick={() => setEditingProgressValue(target)}
                              disabled={verifiedProgressPercentage >= 100}
                              className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${isSelected
                                  ? "bg-emerald-500 text-white border-emerald-400 shadow-sm"
                                  : "bg-white/10 hover:bg-white/20 text-emerald-300 border-emerald-500/30"
                                }`}
                            >
                              +{inc}%
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Custom Target Input */}
                    <div className="flex items-center gap-2 sm:pl-3 sm:border-l sm:border-slate-700/80">
                      <span className="text-xs font-bold text-slate-300">Custom Target:</span>
                      <div className="relative flex items-center">
                        <input
                          type="number"
                          min={verifiedProgressPercentage}
                          max={100}
                          value={editingProgressValue}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            if (val >= 0 && val <= 100) {
                              setEditingProgressValue(val);
                            }
                          }}
                          className="w-20 pl-3 pr-7 py-1.5 text-xs font-mono font-bold text-center text-emerald-300 bg-slate-800/90 border border-slate-600 rounded-lg focus:outline-emerald-400 focus:border-emerald-400"
                        />
                        <span className="absolute right-2 text-xs font-bold text-slate-400 pointer-events-none">%</span>
                      </div>
                    </div>
                  </div>

                  {/* Confirm & Save Button */}
                  <button
                    type="button"
                    onClick={handleSaveVerifiedProgress}
                    disabled={isUpdatingProgress || editingProgressValue <= verifiedProgressPercentage}
                    className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl shadow-md transition-all cursor-pointer whitespace-nowrap"
                  >
                    {isUpdatingProgress ? (
                      <span className="flex items-center gap-1.5">
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Saving...
                      </span>
                    ) : (
                      <>
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Confirm & Save ({editingProgressValue}%)
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    Milestone adjustments are restricted to Manager and Admin roles.
                  </span>
                  <span className="font-medium text-slate-300">Site Supervisor view (Read-only)</span>
                </div>
              )}
            </div>

            {/* Calendar & Date Navigation Toolbar (Admin & Manager Full History / Site Supervisor Locked to Today) */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/90 border border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-20">
              {isAdmin() || isManagerOrAdmin ? (
                <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                  {/* Calendar Date Picker */}
                  <div className="w-56 sm:w-60 relative z-30">
                    <ThemeDatePicker
                      value={selectedExecutionDate}
                      onChange={(val) => {
                        if (val) setSelectedExecutionDate(val);
                      }}
                      placeholder="Select Date"
                    />
                  </div>

                  {/* Quick Nav: Prev, Today, Next */}
                  <div className="inline-flex items-center rounded-xl bg-white border border-slate-200 p-1 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => handleOffsetExecutionDate(-1)}
                      title="Previous Day"
                      className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="15 18 9 12 15 6" />
                      </svg>
                      <span>Prev</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedExecutionDate(getTodayDateStr())}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${selectedExecutionDate === getTodayDateStr()
                          ? "bg-indigo-600 text-white shadow-2xs"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                        }`}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOffsetExecutionDate(1)}
                      title="Next Day"
                      className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <span>Next</span>
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  </div>

                  {/* Current Active Date Badge */}
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50/90 border border-indigo-100 text-indigo-900 text-xs font-semibold">
                    <svg className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    <span className="truncate max-w-[200px] sm:max-w-none">
                      {selectedExecutionDate
                        ? formatResourceDateLabel(selectedExecutionDate)
                        : "All Dates (Full Timeline)"}
                    </span>
                  </div>
                </div>
              ) : (
                /* Site Supervisor Locked Today Badge */
                <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-950 text-xs font-semibold">
                  <svg className="w-4 h-4 text-indigo-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <span>Site Report Date: {formatResourceDateLabel(getTodayDateStr())}</span>
                </div>
              )}

              {/* Actions: Download PDF & Add Log */}
              <div className="flex items-center gap-2.5 self-stretch md:self-auto flex-wrap">
                {/* Download PDF Button */}
                <button
                  type="button"
                  onClick={handleExportSiteExecutionPdf}
                  disabled={isGeneratingPdf || siteExecutionLogs.length === 0}
                  title={siteExecutionLogs.length === 0 ? "No records to export for this date" : "Download PDF report with photo proofs"}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100/90 text-rose-700 border border-rose-200/90 text-xs font-bold shadow-2xs hover:shadow-xs transition-all cursor-pointer active:scale-98 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {isGeneratingPdf ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-rose-600 border-t-transparent rounded-full animate-spin" />
                      <span>Generating PDF...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 text-rose-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="12" y1="18" x2="12" y2="12" />
                        <line x1="9" y1="15" x2="15" y2="15" />
                      </svg>
                      <span>Download PDF</span>
                    </>
                  )}
                </button>

                {/* Add Site Execution Log Button (Clean single plus icon, dark navy theme) */}
                <button
                  type="button"
                  onClick={() => {
                    setExecutionPhaseName("");
                    setExecutionDescription("");
                    setExecutionImages([]);
                    setIsAddExecutionOpen(true);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0c1033] hover:bg-[#151c55] text-white text-xs font-semibold shadow-xs hover:shadow-md transition-all cursor-pointer whitespace-nowrap"
                >
                  <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>Add Site Execution Log</span>
                </button>
              </div>
            </div>

            {/* DAILY SITE EXECUTION FEED & LOG CARDS */}
            {isLoadingSiteExecution ? (
              <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
                <span className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                <span>Loading site execution entries...</span>
              </div>
            ) : siteExecutionLogs.length === 0 ? (
              <div className="py-12 px-6 rounded-2xl border-2 border-dashed border-slate-200 text-center bg-slate-50/50 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 mx-auto flex items-center justify-center shadow-xs">
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">
                    No site execution entries logged for {selectedExecutionDate ? formatResourceDateLabel(selectedExecutionDate) : "this project"}
                  </h4>
                  <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                    Site Supervisors physically visiting the site can submit inspection logs, detailed descriptions, and upload multiple photo proofs.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setExecutionPhaseName("");
                    setExecutionDescription("");
                    setExecutionImages([]);
                    setIsAddExecutionOpen(true);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-indigo-600 bg-white hover:bg-indigo-50 border border-indigo-200 rounded-xl shadow-2xs transition-all cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>Log First Site Report</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {siteExecutionLogs.map((log, index) => {
                  const images = Array.isArray(log.images) ? log.images : [];
                  const roleLabel = log.creator_role || "Site Supervisor";
                  const isRoleAdmin = roleLabel.toLowerCase().includes("admin");
                  const isRoleManager = roleLabel.toLowerCase().includes("manager");

                  return (
                    <div
                      key={log.id || index}
                      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:border-indigo-200 transition-all space-y-4"
                    >
                      {/* Log Header */}
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3.5">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl font-bold flex items-center justify-center text-sm shadow-xs flex-shrink-0 text-white ${isRoleAdmin
                              ? "bg-gradient-to-tr from-purple-600 to-indigo-600"
                              : isRoleManager
                                ? "bg-gradient-to-tr from-blue-600 to-cyan-600"
                                : "bg-gradient-to-tr from-indigo-600 to-violet-600"
                            }`}>
                            {(log.supervisor_name || "S").slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-bold text-slate-900">
                                {log.supervisor_name}
                              </h4>
                              <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${isRoleAdmin
                                  ? "bg-purple-50 text-purple-700 border-purple-200"
                                  : isRoleManager
                                    ? "bg-blue-50 text-blue-700 border-blue-200"
                                    : "bg-indigo-50 text-indigo-700 border-indigo-200"
                                }`}>
                                {roleLabel}
                              </span>
                            </div>
                            <span className="text-xs font-medium text-slate-500">
                              {log.phase_name || "Site Inspection & Work Progress"}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700">
                            <svg className="w-3.5 h-3.5 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                              <line x1="16" y1="2" x2="16" y2="6" />
                              <line x1="8" y1="2" x2="8" y2="6" />
                              <line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                            {formatResourceDateLabel(log.date)}
                          </span>
                          {log.created_at && (
                            <span className="text-[11px] text-slate-400 font-mono">
                              {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}

                          {/* Admin Exclusive Edit & Delete Actions */}
                          {isAdmin() && (
                            <div className="flex items-center gap-1 pl-2 border-l border-slate-200">
                              <button
                                type="button"
                                onClick={() => handleOpenEditLog(log)}
                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                                title="Edit Site Execution Log (Admin Only)"
                              >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteLog(log)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="Delete Site Execution Log (Admin Only)"
                              >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Log Body / Description */}
                      <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                          Site Observations & Execution Notes
                        </span>
                        <p className="text-xs sm:text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                          {log.description}
                        </p>
                      </div>

                      {/* Log Images Gallery */}
                      {images.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                              <svg className="w-4 h-4 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                <circle cx="8.5" cy="8.5" r="1.5" />
                                <polyline points="21 15 16 10 5 21" />
                              </svg>
                              Attached Photos & Proof ({images.length})
                            </span>
                            <span className="text-[11px] text-slate-400">Click any image to view fullscreen</span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                            {images.map((img, imgIdx) => (
                              <div
                                key={imgIdx}
                                onClick={() =>
                                  setLightboxImage({
                                    url: img.url,
                                    title: img.name || `Site Photo ${imgIdx + 1}`,
                                    subtitle: `${log.supervisor_name} (${roleLabel}) • ${formatResourceDateLabel(log.date)}`,
                                  })
                                }
                                className="group relative aspect-square rounded-xl overflow-hidden bg-slate-100 border border-slate-200 cursor-pointer shadow-2xs hover:shadow-md transition-all"
                              >
                                <img
                                  src={img.url}
                                  alt={img.name || `Proof ${imgIdx + 1}`}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                                  <span className="text-[10px] text-white font-medium truncate">
                                    {img.name || "View Fullscreen"}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* =========================================================================
          MODAL 1: Upload Document / Invoice (Commercial Stages & Engineering)
          ========================================================================= */}
      {docModalTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setDocModalTarget(null)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 sm:p-7 space-y-5 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {docModalTarget.type === "commercial"
                    ? `Upload Commercial Document / Invoice (Stage ${docModalTarget.stageNumber})`
                    : `Upload Engineering Document (Stage ${docModalTarget.stageNumber})`}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Attach an invoice, agreement, PO, or engineering file to this project
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDocModalTarget(null)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Document / Invoice Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tax_Invoice_INV-2026-001 or PO_Advance_Billing"
                  value={uploadDocName}
                  onChange={(e) => setUploadDocName(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {/* File Dropzone */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Attach File (PDF, PNG, JPG, DOCX)
                </label>
                <input
                  type="file"
                  id="project-doc-file-input"
                  accept=".pdf,image/png,image/jpeg,image/jpg,image/webp,.doc,.docx"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 25 * 1024 * 1024) {
                        showToast("File size exceeds 25MB limit.");
                        return;
                      }
                      setSelectedFileName(file.name);
                      setSelectedFileSize(
                        file.size < 1024 * 1024
                          ? `${(file.size / 1024).toFixed(1)} KB`
                          : `${(file.size / (1024 * 1024)).toFixed(1)} MB`
                      );
                      if (!uploadDocName.trim()) {
                        setUploadDocName(file.name.replace(/\.[^/.]+$/, ""));
                      }
                      const reader = new FileReader();
                      reader.onload = () => {
                        setSelectedFileDataUrl(reader.result as string);
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  className="hidden"
                />
                <div
                  onClick={() => document.getElementById("project-doc-file-input")?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const file = e.dataTransfer.files?.[0];
                    if (file) {
                      if (file.size > 25 * 1024 * 1024) {
                        showToast("File size exceeds 25MB limit.");
                        return;
                      }
                      setSelectedFileName(file.name);
                      setSelectedFileSize(
                        file.size < 1024 * 1024
                          ? `${(file.size / 1024).toFixed(1)} KB`
                          : `${(file.size / (1024 * 1024)).toFixed(1)} MB`
                      );
                      if (!uploadDocName.trim()) {
                        setUploadDocName(file.name.replace(/\.[^/.]+$/, ""));
                      }
                      const reader = new FileReader();
                      reader.onload = () => {
                        setSelectedFileDataUrl(reader.result as string);
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  className="p-4 border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/30 hover:bg-indigo-50/60 rounded-2xl text-center cursor-pointer transition-colors group"
                >
                  <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>
                  <span className="text-xs font-bold text-slate-800 block">
                    {selectedFileName ? `Selected: ${selectedFileName} (${selectedFileSize})` : "Click or drop file to upload"}
                  </span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    PDF, DOC, DOCX, PNG, JPG up to 25MB
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDocModalTarget(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#0c1033] hover:bg-[#151b54] rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  Upload Document
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: Add Procurement Item (Material Sourcing & Master Inventory Allocation)
          ========================================================================= */}
      {isAddProcurementOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setIsAddProcurementOpen(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 sm:p-7 space-y-5 animate-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Add Procurement Item</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Allocate materials from Master Inventory or schedule procurement
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddProcurementOpen(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleAddProcurementSubmit} className="space-y-4">
              {/* Optional Quick-Pick from Budget & Costing */}
              {costingItemsList && costingItemsList.length > 0 && (
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 block mb-1.5">
                    Quick-pick from Project Costing Sheet:
                  </span>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1.5 bg-slate-50 rounded-xl border border-slate-200/70">
                    {costingItemsList.map((c, i) => (
                      <button
                        key={c.id || i}
                        type="button"
                        onClick={() => {
                          if (c.part_no) {
                            handleSelectProcurementPart(c.part_no.toUpperCase(), c.qty || 1);
                            if (c.description) setNewProduct(c.description);
                            if (c.vendor) setNewVendor(c.vendor);
                            if (c.brand) setNewBrand(c.brand);
                            if (c.qty) setNewQty(c.qty);
                          }
                        }}
                        className="px-2.5 py-1 text-[11px] font-mono font-medium rounded-lg bg-white border border-slate-200 hover:border-indigo-400 hover:text-indigo-600 transition-colors text-slate-700 cursor-pointer shadow-2xs"
                      >
                        +{c.part_no || `Item ${i + 1}`} (Qty: {c.qty || 1})
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Part Number Selection */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Part Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  list="procurement-parts-list"
                  placeholder="e.g. ABB-DIM-04 or SE-RELAY-08"
                  value={newPart}
                  onChange={(e) => handleSelectProcurementPart(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 text-slate-800 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 uppercase tracking-wide"
                />
                <datalist id="procurement-parts-list">
                  {allRegisteredParts.map((p) => {
                    const stock = getPartStockInfo(p.part_number);
                    const stockLabel = stock.total > 0
                      ? `(Stock: ${stock.total} in Warehouse | ${stock.available} Available)`
                      : `(0 in Stock)`;
                    return (
                      <option key={p.part_number} value={p.part_number}>
                        {p.description ? `${p.description} (${p.brand || ""}) ${stockLabel}` : `${p.part_number} ${stockLabel}`}
                      </option>
                    );
                  })}
                </datalist>

                {newPart && (
                  <div className="mt-2 flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-700">Master Inventory:</span>
                      {(() => {
                        const stock = getPartStockInfo(newPart);
                        const hasStock = stock.total > 0;
                        return (
                          <span
                            className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-md text-[11px] ${hasStock
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                : "bg-rose-100 text-rose-800 border border-rose-200"
                              }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${hasStock ? "bg-emerald-600" : "bg-rose-600"
                                }`}
                            />
                            {hasStock
                              ? `Total: ${stock.total} in Warehouse (${stock.available} Available)`
                              : "0 units in Master Inventory (Out of Stock)"}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* Instant Inline Warning if Part Already Exists in Project */}
                {(() => {
                  const norm = (newPart || "").trim().toUpperCase();
                  const existing = norm ? procurementItems.find((it) => (it.part || "").trim().toUpperCase() === norm) : null;
                  if (!existing) return null;
                  return (
                    <div className="mt-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between gap-2 animate-in fade-in duration-150">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-amber-600 font-bold text-sm">⚠️</span>
                        <div className="min-w-0">
                          <p className="font-bold truncate">Already added in Row #{existing.sl}</p>
                          <p className="text-[11px] text-amber-700 truncate">
                            {existing.product} • {existing.qty} req / {existing.allocated_qty || 0} allocated
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddProcurementOpen(false);
                          handleOpenEditProcurement(existing);
                        }}
                        className="px-2.5 py-1 text-[11px] font-bold text-amber-900 bg-amber-200 hover:bg-amber-300 rounded-lg whitespace-nowrap cursor-pointer transition-colors"
                      >
                        Edit Row #{existing.sl}
                      </button>
                    </div>
                  );
                })()}
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Product Description</label>
                <input
                  type="text"
                  placeholder="e.g. 4-Channel Actuator"
                  value={newProduct}
                  onChange={(e) => setNewProduct(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Brand</label>
                  <input
                    type="text"
                    placeholder="e.g. ABB, Schneider"
                    value={newBrand}
                    onChange={(e) => setNewBrand(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Supplier / Vendor</label>
                  <input
                    type="text"
                    placeholder="e.g. Al Ghandi Electronics"
                    value={newVendor}
                    onChange={(e) => setNewVendor(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Quantities & Allocation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-50/70 border border-slate-200/80 rounded-2xl">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Required Quantity <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newQty}
                    onChange={(e) => handleNewQtyChange(Number(e.target.value))}
                    className="w-full px-3.5 py-2 text-xs font-mono font-bold rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Allocate from Warehouse
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={newQty}
                    value={newAllocatedQty}
                    onChange={(e) => {
                      const val = Math.max(0, Number(e.target.value));
                      setNewAllocatedQty(val);
                      if (val >= newQty && newQty > 0) {
                        setNewStatus("Added");
                      } else if (val > 0) {
                        setNewStatus("Partially Added");
                      } else if (newStatus === "Added" || newStatus === "Partially Added") {
                        setNewStatus("Yet To Order");
                      }
                    }}
                    className="w-full px-3.5 py-2 text-xs font-mono font-bold rounded-xl border border-slate-200 text-emerald-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Available in warehouse: {newPart ? getPartStockInfo(newPart).available : 0} units
                  </span>
                </div>
              </div>

              {/* Procurement Status Selector (Full-size) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    Procurement Status
                  </label>
                  <span className="text-[11px] text-slate-400 font-medium">
                    Auto-updates with allocation or select manually
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {/* Added */}
                  <button
                    type="button"
                    onClick={() => setNewStatus("Added")}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      newStatus === "Added"
                        ? "bg-emerald-50 border-emerald-400 text-emerald-900 ring-2 ring-emerald-500/20 shadow-xs"
                        : "bg-slate-50/70 border-slate-200 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${newStatus === "Added" ? "bg-emerald-600" : "bg-slate-300"}`} />
                      <span className="text-xs font-bold">Added</span>
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1">In Stock (Fulfilled)</span>
                  </button>

                  {/* Partially Added */}
                  <button
                    type="button"
                    onClick={() => setNewStatus("Partially Added")}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      newStatus === "Partially Added"
                        ? "bg-amber-50 border-amber-400 text-amber-900 ring-2 ring-amber-500/20 shadow-xs"
                        : "bg-slate-50/70 border-slate-200 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${newStatus === "Partially Added" ? "bg-amber-600" : "bg-slate-300"}`} />
                      <span className="text-xs font-bold">Partially Added</span>
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1">Partial Stock</span>
                  </button>

                  {/* Yet To Deliver */}
                  <button
                    type="button"
                    onClick={() => setNewStatus("Yet To Deliver")}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      newStatus === "Yet To Deliver"
                        ? "bg-blue-50 border-blue-400 text-blue-900 ring-2 ring-blue-500/20 shadow-xs"
                        : "bg-slate-50/70 border-slate-200 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${newStatus === "Yet To Deliver" ? "bg-blue-600" : "bg-slate-300"}`} />
                      <span className="text-xs font-bold">Yet To Deliver</span>
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1">Ordered / In Transit</span>
                  </button>

                  {/* Yet To Order */}
                  <button
                    type="button"
                    onClick={() => setNewStatus("Yet To Order")}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      newStatus === "Yet To Order"
                        ? "bg-rose-50 border-rose-400 text-rose-900 ring-2 ring-rose-500/20 shadow-xs"
                        : "bg-slate-50/70 border-slate-200 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${newStatus === "Yet To Order" ? "bg-rose-600" : "bg-slate-300"}`} />
                      <span className="text-xs font-bold">Yet To Order</span>
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1">Needs Purchase</span>
                  </button>
                </div>
              </div>

              {/* Inline Error Alert if Any */}
              {procurementModalError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-start gap-2.5 animate-in fade-in duration-150">
                  <svg className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <div className="flex-1">
                    <span className="font-bold block text-rose-900">Unable to add item</span>
                    <span>{procurementModalError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setProcurementModalError(null)}
                    className="text-rose-400 hover:text-rose-600 text-sm font-bold cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddProcurementOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingProcurement}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#0c1033] hover:bg-[#151b54] rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSavingProcurement ? "Saving..." : "Add Procurement Item"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2B: Allocate Stock / Edit Procurement Item
          Allows updating allocated warehouse stock when items arrive
          ========================================================================= */}
      {isEditProcurementOpen && editingProcItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => {
            setIsEditProcurementOpen(false);
            setEditingProcItem(null);
          }}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 sm:p-7 space-y-5 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Allocate Warehouse Stock</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Update inventory allocation or delivery status for this project item
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsEditProcurementOpen(false);
                  setEditingProcItem(null);
                }}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleUpdateProcurementSubmit} className="space-y-4">
              {/* Part and Product Details summary */}
              <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-indigo-950 px-2 py-0.5 bg-indigo-100/60 rounded-md">
                    {editingProcItem.part || editingProcItem.part_no}
                  </span>
                  <span className="text-xs font-bold text-slate-600">
                    Required: {editingProcItem.qty} units
                  </span>
                </div>
                <p className="text-xs text-slate-800 font-semibold">
                  {editingProcItem.product || editingProcItem.product_name}
                </p>

                {(() => {
                  const partNo = editingProcItem.part || editingProcItem.part_no || "";
                  const stock = getPartStockInfo(partNo);
                  const effectiveAvail = stock.available + (editingProcItem.allocated_qty || 0);

                  return (
                    <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs">
                      <span className="text-slate-600">Warehouse Available Stock:</span>
                      <span className="font-mono font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md">
                        {effectiveAvail} units
                      </span>
                    </div>
                  );
                })()}
              </div>

              {/* Allocate quantity input */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Allocated Quantity (from Warehouse)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max={editingProcItem.qty}
                    required
                    value={editAllocatedQty}
                    onChange={(e) => {
                      const val = Math.max(0, Number(e.target.value));
                      setEditAllocatedQty(val);
                      const req = editingProcItem.qty || 1;
                      if (val >= req) {
                        setEditStatus("Added");
                      } else if (val > 0) {
                        setEditStatus("Partially Added");
                      } else if (editStatus === "Added" || editStatus === "Partially Added") {
                        setEditStatus("Yet To Order");
                      }
                    }}
                    className="w-full px-3.5 py-2 text-sm font-mono font-bold rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const partNo = editingProcItem.part || editingProcItem.part_no || "";
                      const stock = getPartStockInfo(partNo);
                      const effectiveAvail = stock.available + (editingProcItem.allocated_qty || 0);
                      const maxPossible = Math.min(editingProcItem.qty || 0, effectiveAvail);
                      setEditAllocatedQty(maxPossible);
                      if (maxPossible >= (editingProcItem.qty || 0) && (editingProcItem.qty || 0) > 0) {
                        setEditStatus("Added");
                      } else if (maxPossible > 0) {
                        setEditStatus("Partially Added");
                      }
                    }}
                    className="px-3 py-2 text-xs font-semibold rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 whitespace-nowrap cursor-pointer transition-colors"
                  >
                    Allocate Max
                  </button>
                </div>
              </div>

              {/* Procurement Status Selector (Full-size) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    Procurement Status
                  </label>
                  <span className="text-[11px] text-slate-400 font-medium">
                    Auto-updates with allocation or select manually
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {/* Added */}
                  <button
                    type="button"
                    onClick={() => setEditStatus("Added")}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      editStatus === "Added"
                        ? "bg-emerald-50 border-emerald-400 text-emerald-900 ring-2 ring-emerald-500/20 shadow-xs"
                        : "bg-slate-50/70 border-slate-200 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${editStatus === "Added" ? "bg-emerald-600" : "bg-slate-300"}`} />
                      <span className="text-xs font-bold">Added</span>
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1">In Stock (Fulfilled)</span>
                  </button>

                  {/* Partially Added */}
                  <button
                    type="button"
                    onClick={() => setEditStatus("Partially Added")}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      editStatus === "Partially Added"
                        ? "bg-amber-50 border-amber-400 text-amber-900 ring-2 ring-amber-500/20 shadow-xs"
                        : "bg-slate-50/70 border-slate-200 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${editStatus === "Partially Added" ? "bg-amber-600" : "bg-slate-300"}`} />
                      <span className="text-xs font-bold">Partially Added</span>
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1">Partial Stock</span>
                  </button>

                  {/* Yet To Deliver */}
                  <button
                    type="button"
                    onClick={() => setEditStatus("Yet To Deliver")}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      editStatus === "Yet To Deliver"
                        ? "bg-blue-50 border-blue-400 text-blue-900 ring-2 ring-blue-500/20 shadow-xs"
                        : "bg-slate-50/70 border-slate-200 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${editStatus === "Yet To Deliver" ? "bg-blue-600" : "bg-slate-300"}`} />
                      <span className="text-xs font-bold">Yet To Deliver</span>
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1">Ordered / In Transit</span>
                  </button>

                  {/* Yet To Order */}
                  <button
                    type="button"
                    onClick={() => setEditStatus("Yet To Order")}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      editStatus === "Yet To Order"
                        ? "bg-rose-50 border-rose-400 text-rose-900 ring-2 ring-rose-500/20 shadow-xs"
                        : "bg-slate-50/70 border-slate-200 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${editStatus === "Yet To Order" ? "bg-rose-600" : "bg-slate-300"}`} />
                      <span className="text-xs font-bold">Yet To Order</span>
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1">Needs Purchase</span>
                  </button>
                </div>
              </div>

              {/* Inline Error Alert if Any */}
              {procurementModalError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-start gap-2.5 animate-in fade-in duration-150">
                  <svg className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <div className="flex-1">
                    <span className="font-bold block text-rose-900">Unable to save allocation</span>
                    <span>{procurementModalError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setProcurementModalError(null)}
                    className="text-rose-400 hover:text-rose-600 text-sm font-bold cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditProcurementOpen(false);
                    setEditingProcItem(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingProcurement}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#0c1033] hover:bg-[#151b54] rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSavingProcurement ? "Saving..." : "Save Allocation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2C: Shift Material from Another Project
          Allows urgent material transfers between projects
          ========================================================================= */}
      {isShiftModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setIsShiftModalOpen(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 sm:p-7 space-y-5 animate-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80 mb-1">
                  <span>⚡ Urgent Inter-Project Transfer</span>
                </div>
                <h3 className="text-lg font-bold text-slate-900">Shift Item to This Project</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Transfer allocated inventory from another project directly to <strong className="text-slate-700">{projectInfo?.name || "this project"}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsShiftModalOpen(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleShiftSubmit} className="space-y-4">
              {/* Step 1: Select Source Project (Searchable Active Projects Only) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    1. Source Project (Transfer From) <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/70">
                    Active Projects Only ({filteredActiveProjects.length})
                  </span>
                </div>

                {/* Project Search Box */}
                <div className="relative mb-2">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.3-4.3" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    placeholder="Search active project by name, code, or client..."
                    value={projectSearchTerm}
                    onChange={(e) => setProjectSearchTerm(e.target.value)}
                    className="w-full pl-8.5 pr-8 py-2 text-xs rounded-xl border border-slate-200 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white transition-all"
                  />
                  {projectSearchTerm && (
                    <button
                      type="button"
                      onClick={() => setProjectSearchTerm("")}
                      className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Filtered Project Select Dropdown */}
                <select
                  required
                  value={selectedSourceProjectKey}
                  onChange={(e) => handleSelectSourceProject(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white font-medium"
                >
                  <option value="">
                    {filteredActiveProjects.length === 0
                      ? "-- No Active Projects Match Search --"
                      : `-- Select Active Source Project (${filteredActiveProjects.length} available) --`}
                  </option>
                  {filteredActiveProjects.map((p) => (
                    <option key={p.project_key} value={p.project_key}>
                      {p.code ? `[${p.code}] ` : ""}{p.name || p.project_key} {p.client ? `• Client: ${p.client}` : ""}
                    </option>
                  ))}
                </select>

                {/* Selected Project Summary Pill */}
                {selectedSourceProjectKey && (
                  <div className="mt-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0 animate-pulse" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate">
                          {allActiveProjects.find((p) => p.project_key === selectedSourceProjectKey)?.name || selectedSourceProjectKey}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">
                          Code: <span className="font-mono font-semibold text-slate-700">{allActiveProjects.find((p) => p.project_key === selectedSourceProjectKey)?.code || "N/A"}</span>
                          {allActiveProjects.find((p) => p.project_key === selectedSourceProjectKey)?.client && ` • ${allActiveProjects.find((p) => p.project_key === selectedSourceProjectKey)?.client}`}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSourceProjectKey("");
                        setSourceProjectProcurement([]);
                        setSelectedShiftPart("");
                      }}
                      className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors cursor-pointer flex-shrink-0"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {/* Step 2: Select Part Number / Material */}
              {selectedSourceProjectKey && (
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    2. Select Material to Shift <span className="text-rose-500">*</span>
                  </label>
                  {isLoadingSourceItems ? (
                    <div className="py-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                      <svg className="w-4 h-4 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" />
                        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" />
                      </svg>
                      <span>Loading allocated materials from source project...</span>
                    </div>
                  ) : sourceProjectProcurement.length === 0 ? (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                      No allocated materials currently available to shift from this project.
                    </div>
                  ) : (
                    <select
                      required
                      value={selectedShiftPart}
                      onChange={(e) => {
                        const part = e.target.value;
                        setSelectedShiftPart(part);
                        const it = sourceProjectProcurement.find((x) => x.part_no === part);
                        if (it) {
                          setShiftQuantity(Math.min(1, it.allocated_qty || 1));
                        }
                      }}
                      className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white font-mono font-medium"
                    >
                      {sourceProjectProcurement.map((it) => (
                        <option key={it.part_no} value={it.part_no}>
                          {it.part_no} — {it.product_name || it.part_no} ({it.allocated_qty} allocated in source)
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Step 3: Quantity to Shift */}
              {selectedShiftPart && (() => {
                const currentItem = sourceProjectProcurement.find((x) => x.part_no === selectedShiftPart);
                const maxShift = currentItem ? (currentItem.allocated_qty || 0) : 0;
                return (
                  <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-800">
                        3. Quantity to Shift <span className="text-rose-500">*</span>
                      </label>
                      <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-100/70 px-2 py-0.5 rounded-md">
                        Max Available: {maxShift} units
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max={maxShift}
                        required
                        value={shiftQuantity}
                        onChange={(e) => {
                          const val = Math.max(1, Math.min(maxShift, Number(e.target.value)));
                          setShiftQuantity(val);
                        }}
                        className="flex-1 px-3.5 py-2 text-sm font-mono font-bold rounded-xl border border-slate-300 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShiftQuantity(maxShift)}
                        className="px-3 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white whitespace-nowrap cursor-pointer transition-colors"
                      >
                        Shift All ({maxShift})
                      </button>
                    </div>

                    {/* Transfer Impact Visualizer */}
                    <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                      <div className="p-2 rounded-xl bg-white border border-slate-200">
                        <span className="text-slate-400 block font-medium">Source Project Retains:</span>
                        <span className="font-mono font-bold text-slate-800 text-xs">
                          {Math.max(0, maxShift - shiftQuantity)} units
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-white border border-emerald-200">
                        <span className="text-emerald-600 block font-medium">This Project Receives:</span>
                        <span className="font-mono font-bold text-emerald-700 text-xs">
                          +{shiftQuantity} units
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Step 4: Reason / Approval Note */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  4. Reason / Approval Note
                </label>
                <input
                  type="text"
                  placeholder="e.g. Urgent site requirement approved by PM"
                  value={shiftNotes}
                  onChange={(e) => setShiftNotes(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsShiftModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingShift || !selectedSourceProjectKey || !selectedShiftPart || shiftQuantity <= 0}
                  className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 active:scale-98"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <span>Confirm Shift (+{shiftQuantity} units)</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: Add Member (Multi-Select Manpower Selection & Hours Worked 1-12)
          ========================================================================= */}
      {isAddResourceOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setIsAddResourceOpen(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 sm:p-7 space-y-5 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Add Member to Project</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Allocating for: <strong className="text-indigo-600 font-semibold">{formatResourceDateLabel(selectedResourceDate)}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddResourceOpen(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleAddResourceSubmit} className="space-y-4">
              <div>
                <ThemeDatePicker
                  label="Allocation Date"
                  value={selectedResourceDate}
                  onChange={(val) => {
                    if (val) setSelectedResourceDate(val);
                  }}
                  placeholder="Select Date"
                />
              </div>

              {/* Single Member Selection with Inline Searchable List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 block">
                    Select Member from Manpower <span className="text-rose-500">*</span>
                  </label>
                  {selectedWorkerName && (
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      Selected: {selectedWorkerName}
                    </span>
                  )}
                </div>

                {/* Search Input */}
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="Type to filter or enter custom name..."
                    value={memberSearchQuery}
                    onChange={(e) => {
                      setMemberSearchQuery(e.target.value);
                      setSelectedWorkerName(e.target.value);
                    }}
                    className="w-full pl-9 pr-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
                  />
                </div>

                {/* Inline List of Manpower Personnel (Always clearly visible inside modal flow) */}
                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl bg-slate-50/50 divide-y divide-slate-100">
                  {filteredManpower.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-400">
                      {memberSearchQuery.trim() ? (
                        <span>Custom member: &quot;<strong>{memberSearchQuery.trim()}</strong>&quot; (ready to add)</span>
                      ) : (
                        "No manpower personnel registered yet."
                      )}
                    </div>
                  ) : (
                    filteredManpower.map((worker) => {
                      const isSelected = selectedWorkerName.toLowerCase() === worker.name.toLowerCase();
                      return (
                        <div
                          key={worker.id}
                          onClick={() => handleSelectWorker(worker)}
                          className={`flex items-center justify-between px-3.5 py-2 text-xs sm:text-sm cursor-pointer transition-colors ${
                            isSelected
                              ? "bg-indigo-100/90 text-indigo-950 font-bold border-l-4 border-indigo-600 pl-2.5"
                              : "hover:bg-white text-slate-700"
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] ${
                              isSelected ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-600"
                            }`}>
                              {worker.name.charAt(0)}
                            </div>
                            <span className="font-medium">{worker.name}</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${(worker.type || "").toLowerCase() === "external"
                                  ? "bg-amber-50 text-amber-700 border-amber-200"
                                  : "bg-blue-50 text-blue-700 border-blue-200"
                                }`}
                            >
                              {worker.type || "Internal"}
                            </span>
                            {isSelected && (
                              <svg className="w-4 h-4 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>



              {/* Hours Worked: 1 to 9 Normal Hours, 10, 11, 12 Extended Shifts */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Hours Worked <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={selectedHoursWorked}
                  onChange={(e) => setSelectedHoursWorked(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono cursor-pointer"
                >
                  <option value={1}>1 hr (Normal Hours)</option>
                  <option value={2}>2 hrs (Normal Hours)</option>
                  <option value={3}>3 hrs (Normal Hours)</option>
                  <option value={4}>4 hrs (Normal Hours)</option>
                  <option value={5}>5 hrs (Normal Hours)</option>
                  <option value={6}>6 hrs (Normal Hours)</option>
                  <option value={7}>7 hrs (Normal Hours)</option>
                  <option value={8}>8 hrs (Normal Hours - Standard Shift)</option>
                  <option value={9}>9 hrs (Normal Hours - Full Shift)</option>
                  <option value={10}>10 hrs (Extended Shift - 10 Hours)</option>
                  <option value={11}>11 hrs (Extended Shift - 11 Hours)</option>
                  <option value={12}>12 hrs (Extended Shift - 12 Hours)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddResourceOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingResource || (!selectedWorkerName.trim() && !memberSearchQuery.trim())}
                  className="px-5 py-2.5 text-xs font-bold text-white bg-[#0c1033] hover:bg-[#151b54] rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingResource ? "Adding Member..." : "Add Member"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 4: Site Progress Image Proof Modal
          ========================================================================= */}
      {selectedProof && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setSelectedProof(null)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">Verified Site Progress Proof</h3>
                <p className="text-xs text-slate-500">{selectedProof.phaseName} • {selectedProof.supervisor} • {selectedProof.date}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProof(null)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="aspect-video w-full rounded-2xl bg-slate-100 overflow-hidden border border-slate-200 flex items-center justify-center">
              {selectedProof.imageThumbnail ? (
                <img
                  src={selectedProof.imageThumbnail}
                  alt="Site proof"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-center p-6 text-slate-400 text-xs">
                  No image proof attached
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                Status: {selectedProof.percentageLabel}
              </span>
              <button
                type="button"
                onClick={() => setSelectedProof(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: Add Site Execution Log (Site Supervisor Multi-Image & Notes)
          ========================================================================= */}
      {isAddExecutionOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setIsAddExecutionOpen(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 sm:p-7 space-y-5 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-2xs">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    Log Daily Site Execution
                  </h3>
                  <p className="text-xs text-slate-500">
                    Record inspection findings, daily progress observations, and upload photo proofs.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddExecutionOpen(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreateExecutionLogSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Log Date <span className="text-slate-400 font-normal">(Fixed to Selected Date)</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      readOnly
                      disabled
                      value={formatResourceDateLabel(selectedExecutionDate || getTodayDateStr())}
                      className="w-full px-3.5 py-2.5 bg-slate-100/90 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 cursor-not-allowed select-none focus:outline-none"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                      <svg className="w-3 h-3 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                      <span>Fixed Date</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Site Supervisor Name <span className="text-slate-400 font-normal">(Verified Profile)</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      readOnly
                      disabled
                      value={userDisplayName || "Site Supervisor"}
                      className="w-full px-3.5 py-2.5 bg-slate-100/90 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 cursor-not-allowed select-none focus:outline-none"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      <svg className="w-3 h-3 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                      <span>Auto-Verified</span>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Phase / Work Item Title
                </label>
                <input
                  type="text"
                  value={executionPhaseName}
                  onChange={(e) => setExecutionPhaseName(e.target.value)}
                  placeholder="e.g. Brickwork & Conduit Installation - Block B"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-indigo-500"
                />
              </div>

              {/* Spacious Description / Notes Box */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Detailed Site Description & Progress Notes <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={5}
                  value={executionDescription}
                  onChange={(e) => setExecutionDescription(e.target.value)}
                  placeholder="Write comprehensive physical inspection details, completed items, workers present, materials verified, and any on-site hurdles..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-normal text-slate-800 focus:outline-indigo-500 leading-relaxed resize-y"
                />
              </div>

              {/* Multi-Image Upload Zone */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 block">
                    Upload Site Photos & Image Proof (As many as needed)
                  </label>
                  <span className="text-[11px] font-semibold text-indigo-600">
                    {executionImages.length} {executionImages.length === 1 ? "photo" : "photos"} selected
                  </span>
                </div>

                <label className="border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/40 hover:bg-indigo-50/70 transition-all rounded-2xl p-5 flex flex-col items-center justify-center gap-2 cursor-pointer group">
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleImageFilesSelected}
                    className="hidden"
                  />
                  <div className="w-10 h-10 rounded-xl bg-white text-indigo-600 flex items-center justify-center shadow-2xs group-hover:scale-110 transition-transform">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                  </div>
                  <div className="text-center">
                    <span className="text-xs font-bold text-indigo-700 block">
                      Click or drag photos here to upload
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Supports JPG, PNG, WebP (Multiple selections allowed)
                    </span>
                  </div>
                </label>

                {/* Thumbnails of selected images */}
                {executionImages.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 pt-2">
                    {executionImages.map((img, idx) => (
                      <div
                        key={idx}
                        className="relative group rounded-xl overflow-hidden aspect-square border border-slate-200 bg-slate-100 shadow-2xs"
                      >
                        <img
                          src={img.url}
                          alt={img.name || `Photo ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveExecutionImage(idx)}
                          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center shadow-md cursor-pointer group-hover:opacity-100 transition-opacity"
                          title="Remove photo"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                        <div className="absolute bottom-0 inset-x-0 bg-black/60 px-1.5 py-0.5 text-[9px] text-white truncate">
                          {img.name}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddExecutionOpen(false)}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingExecution}
                  className="px-5 py-2.5 text-xs font-semibold text-white bg-[#0c1033] hover:bg-[#151b54] rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-60"
                >
                  {isSubmittingExecution ? "Submitting Log..." : "Submit Site Log"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: Fullscreen Image Lightbox Viewer
          ========================================================================= */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center justify-center animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between text-white pb-3">
              <div>
                <h4 className="text-sm sm:text-base font-bold">{lightboxImage.title}</h4>
                {lightboxImage.subtitle && (
                  <p className="text-xs text-slate-300">{lightboxImage.subtitle}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="w-full max-h-[75vh] rounded-2xl overflow-hidden bg-black/50 border border-white/10 flex items-center justify-center shadow-2xl">
              <img
                src={lightboxImage.url}
                alt={lightboxImage.title}
                className="max-h-[75vh] w-auto max-w-full object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: Edit Site Execution Log (Admin Only)
          ========================================================================= */}
      {editingExecutionLog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setEditingExecutionLog(null)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 sm:p-7 space-y-5 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-2xs">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    Edit Site Execution Log #{editingExecutionLog.id}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Logged by {editingExecutionLog.supervisor_name} ({editingExecutionLog.creator_role || "Site Supervisor"}) on {editingExecutionLog.date}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingExecutionLog(null)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleUpdateExecutionLogSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Phase / Work Item Title
                </label>
                <input
                  type="text"
                  value={editPhaseName}
                  onChange={(e) => setEditPhaseName(e.target.value)}
                  placeholder="e.g. Brickwork & Conduit Installation"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Detailed Site Description & Progress Notes <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={5}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-normal text-slate-800 focus:outline-indigo-500 leading-relaxed resize-y"
                />
              </div>

              {/* Edit Image Upload Zone */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 block">
                    Site Photos ({editImages.length})
                  </label>
                  <span className="text-[11px] text-slate-400">Add or remove photos</span>
                </div>

                <label className="border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/40 hover:bg-indigo-50/70 transition-all rounded-2xl p-4 flex flex-col items-center justify-center gap-1 cursor-pointer group">
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleEditImageFilesSelected}
                    className="hidden"
                  />
                  <div className="text-center">
                    <span className="text-xs font-bold text-indigo-700 block">
                      + Add More Photos
                    </span>
                  </div>
                </label>

                {editImages.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 pt-1">
                    {editImages.map((img, idx) => (
                      <div
                        key={idx}
                        className="relative group rounded-xl overflow-hidden aspect-square border border-slate-200 bg-slate-100 shadow-2xs"
                      >
                        <img
                          src={img.url}
                          alt={img.name || `Photo ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setEditImages((prev) => prev.filter((_, i) => i !== idx))}
                          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center shadow-md cursor-pointer"
                          title="Remove photo"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                        <div className="absolute bottom-0 inset-x-0 bg-black/60 px-1.5 py-0.5 text-[9px] text-white truncate">
                          {img.name}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingExecutionLog(null)}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEdit}
                  className="px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:opacity-60 rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  {isSubmittingEdit ? "Saving..." : "Save Changes"}
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
