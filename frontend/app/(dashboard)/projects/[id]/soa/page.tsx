"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ThemeDatePicker } from "@/components/ThemeDatePicker";
import { AdminPasswordModal } from "@/components";
import {
  API_BASE_URL,
  BackendSOAItem,
  apiGetProjectSOA,
  apiCreateProjectSOA,
  apiUpdateProjectSOA,
  apiDeleteProjectSOA,
  getUserRole,
  isAdmin,
  isSiteSupervisor,
} from "@/lib/api";

interface CommercialStageInfo {
  id: string;
  stageNumber: number;
  poNumber: string;
  poDate: string;
  contractValue: number;
}

export default function ProjectSOAPage() {
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

  // Commercial stages from project
  const [stages, setStages] = useState<CommercialStageInfo[]>([
    { id: "s1", stageNumber: 1, poNumber: "PO-101", poDate: "", contractValue: 0 }
  ]);

  // SOA items state
  const [soaItems, setSoaItems] = useState<BackendSOAItem[]>([]);
  const [isLoadingSOA, setIsLoadingSOA] = useState(true);

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

  // SOA Modal State (Add & Edit)
  const [isSOAModalOpen, setIsSOAModalOpen] = useState(false);
  const [editingSOAId, setEditingSOAId] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [soaForm, setSoaForm] = useState({
    stage_number: 1,
    date: new Date().toISOString().split("T")[0],
    po_no: "PO-101",
    document_no: "",
    doc_type: "Tax Invoice",
    amount: 0,
    remarks: "",
    mode: "Cheque",
    document_url: "",
    document_name: "",
    document_size: "",
  });

  // Fetch Project Meta and Commercial Stages
  const loadProjectAndStages = async () => {
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

        if (Array.isArray(data.commercial_stages) && data.commercial_stages.length > 0) {
          const parsedStages: CommercialStageInfo[] = data.commercial_stages.map((st: any) => {
            const rawVal = String(st.contract_value || "0").replace(/[^0-9.-]/g, "");
            return {
              id: String(st.id || `s${st.stage_number}`),
              stageNumber: st.stage_number || 1,
              poNumber: st.po_number || poNum,
              poDate: st.po_date || "",
              contractValue: parseFloat(rawVal) || 0,
            };
          });
          parsedStages.sort((a, b) => a.stageNumber - b.stageNumber);
          setStages(parsedStages);
        } else {
          // fallback single stage
          const numBudget = parseFloat(String(data.budget || "0").replace(/[^0-9.-]/g, "")) || 0;
          setStages([
            { id: "s1", stageNumber: 1, poNumber: poNum, poDate: "", contractValue: numBudget }
          ]);
        }
      }
    } catch (err) {
      console.warn("Could not load project meta for SOA", err);
    }
  };

  // Load SOA Line Items from FastAPI backend
  const loadSOAData = async () => {
    setIsLoadingSOA(true);
    try {
      const data = await apiGetProjectSOA(rawId);
      if (Array.isArray(data)) {
        setSoaItems(data);
      }
    } catch (err) {
      console.warn("Could not load SOA data from backend", err);
    } finally {
      setIsLoadingSOA(false);
    }
  };

  useEffect(() => {
    if (rawId) {
      loadProjectAndStages();
      loadSOAData();
    }
  }, [rawId]);

  // Total Contract Value calculated across all Commercial Stages
  const totalProjectContract = useMemo(() => {
    const total = stages.reduce((acc, st) => acc + (st.contractValue || 0), 0);
    if (total > 0) return total;
    return parseFloat(String(projectInfo.budget || "0").replace(/[^0-9.-]/g, "")) || 0;
  }, [stages, projectInfo.budget]);

  // Computed summary for overall SOA
  const overallSummary = useMemo(() => {
    const totalReceived = soaItems.reduce((acc, item) => acc + (Number(item.received) || 0), 0);
    const totalBalance = Math.max(0, totalProjectContract - totalReceived);
    const collectionRate = totalProjectContract > 0 ? (totalReceived / totalProjectContract) * 100 : 0;

    return {
      totalContract: totalProjectContract,
      totalReceived,
      totalBalance,
      collectionRate,
    };
  }, [soaItems, totalProjectContract]);

  // Stage-by-Stage grouped items and metrics
  const stageMetrics = useMemo(() => {
    return stages.map((stage) => {
      const stageEntries = soaItems.filter(
        (it) => (it.stage_number || 1) === stage.stageNumber
      );
      const stageReceived = stageEntries.reduce(
        (acc, it) => acc + (Number(it.received) || 0),
        0
      );
      const stageBalance = Math.max(0, stage.contractValue - stageReceived);
      const stageCollectionPct =
        stage.contractValue > 0 ? (stageReceived / stage.contractValue) * 100 : 0;

      return {
        ...stage,
        entries: stageEntries,
        received: stageReceived,
        balance: stageBalance,
        collectionPct: stageCollectionPct,
      };
    });
  }, [stages, soaItems]);

  // Handle File Upload for SOA Receipt / Invoice Document
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      showToast("File size limit is 15MB");
      return;
    }

    const sizeStr =
      file.size > 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.round(file.size / 1024)} KB`;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setSoaForm((prev) => ({
        ...prev,
        document_url: dataUrl,
        document_name: file.name,
        document_size: sizeStr,
      }));
      showToast(`Attached file: ${file.name}`);
    };
    reader.readAsDataURL(file);
  };

  // Open Add SOA Modal (optional specific stage pre-select)
  const handleOpenAddSOA = (targetStageNumber: number = 1) => {
    setEditingSOAId(null);
    const targetStage = stages.find((s) => s.stageNumber === targetStageNumber) || stages[0];
    setSoaForm({
      stage_number: targetStage ? targetStage.stageNumber : targetStageNumber,
      date: new Date().toISOString().split("T")[0],
      po_no: targetStage?.poNumber || projectInfo.po_number || "PO-101",
      document_no: `INV-${new Date().getFullYear()}-${String(soaItems.length + 1).padStart(3, "0")}`,
      doc_type: "Tax Invoice",
      amount: 0,
      remarks: "",
      mode: "Cheque",
      document_url: "",
      document_name: "",
      document_size: "",
    });
    setIsSOAModalOpen(true);
  };

  // Open Edit SOA Modal (Requires Admin Password)
  const handleOpenEditSOA = (item: BackendSOAItem) => {
    setAdminAuthModal({
      isOpen: true,
      title: "Authorize Statement Edit",
      description: `Enter Admin password to edit document "${item.document_no || item.id}".`,
      actionLabel: "Edit Entry",
      actionType: "warning",
      onSuccess: () => {
        setEditingSOAId(item.id);
        setSoaForm({
          stage_number: item.stage_number || 1,
          date: item.date || new Date().toISOString().split("T")[0],
          po_no: item.po_no || "PO-101",
          document_no: item.document_no || "",
          doc_type: item.doc_type || "Tax Invoice",
          amount: item.received || item.value || 0,
          remarks: item.remarks || "",
          mode: item.mode || "Cheque",
          document_url: item.document_url || "",
          document_name: item.document_name || "",
          document_size: item.document_size || "",
        });
        setIsSOAModalOpen(true);
      },
    });
  };

  // Save / Update SOA Entry
  const handleSaveSOASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetStage = stages.find((s) => s.stageNumber === Number(soaForm.stage_number));
    const stageContractVal = targetStage ? targetStage.contractValue : totalProjectContract;

    const enteredAmount = Number(soaForm.amount) || 0;
    // Calculate balance for this stage
    const otherEntriesReceived = soaItems
      .filter((it) => (it.stage_number || 1) === Number(soaForm.stage_number) && it.id !== editingSOAId)
      .reduce((acc, it) => acc + (Number(it.received) || 0), 0);

    const computedStageBalance = Math.max(0, stageContractVal - (otherEntriesReceived + enteredAmount));

    try {
      if (editingSOAId) {
        const updated = await apiUpdateProjectSOA(rawId, editingSOAId, {
          stage_number: Number(soaForm.stage_number) || 1,
          date: soaForm.date,
          po_no: soaForm.po_no,
          document_no: soaForm.document_no,
          doc_type: soaForm.doc_type,
          value: stageContractVal,
          received: enteredAmount,
          remarks: soaForm.remarks,
          mode: soaForm.mode,
          balance: computedStageBalance,
          document_url: soaForm.document_url,
          document_name: soaForm.document_name,
          document_size: soaForm.document_size,
        });
        setSoaItems((prev) => prev.map((item) => (item.id === editingSOAId ? updated : item)));
        showToast("SOA entry updated successfully!");
      } else {
        const created = await apiCreateProjectSOA(rawId, {
          stage_number: Number(soaForm.stage_number) || 1,
          date: soaForm.date,
          po_no: soaForm.po_no,
          document_no: soaForm.document_no,
          doc_type: soaForm.doc_type,
          value: stageContractVal,
          received: enteredAmount,
          remarks: soaForm.remarks,
          mode: soaForm.mode,
          balance: computedStageBalance,
          document_url: soaForm.document_url,
          document_name: soaForm.document_name,
          document_size: soaForm.document_size,
        });
        setSoaItems((prev) => [...prev, created]);
        showToast(`New SOA entry added for Stage ${soaForm.stage_number}!`);
      }
      setIsSOAModalOpen(false);
      window.dispatchEvent(new CustomEvent("soa_store_update"));
    } catch (err: any) {
      console.error("Failed to save SOA item", err);
      showToast(err?.message || "Failed to save SOA entry");
    }
  };

  // Delete SOA Item (Requires Admin Password)
  const handleDeleteSOAItem = (id: number, docNo: string) => {
    setAdminAuthModal({
      isOpen: true,
      title: "Authorize Statement Deletion",
      description: `Enter Admin password to permanently delete document "${docNo || id}".`,
      actionLabel: "Delete Entry",
      actionType: "danger",
      onSuccess: async () => {
        try {
          await apiDeleteProjectSOA(rawId, id);
          setSoaItems((prev) => prev.filter((item) => item.id !== id));
          showToast("SOA entry deleted successfully!");
          window.dispatchEvent(new CustomEvent("soa_store_update"));
        } catch (err: any) {
          console.error("Failed to delete SOA item", err);
          showToast(err?.message || "Failed to delete SOA entry");
        }
      },
    });
  };

  // Document Downloader / Viewer
  const handleDownloadDocument = (item: BackendSOAItem) => {
    try {
      if (item.document_url) {
        const a = document.createElement("a");
        a.href = item.document_url;
        a.download = item.document_name || `${item.document_no || "SOA_Document"}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast(`Downloading: ${item.document_name || item.document_no}`);
        return;
      }

      // Generate verified receipt blob if no physical attachment
      const sampleText = `%PDF-1.4
% TechnoLOGI ERP - Payment Receipt & Statement Proof
Project: ${projectInfo.name} (${projectInfo.code})
Stage: Stage ${item.stage_number || 1}
Document: ${item.document_no || "INV-RECEIPT"}
Type: ${item.doc_type}
Amount Received: AED ${item.received.toLocaleString(undefined, { minimumFractionDigits: 2 })}
Payment Mode: ${item.mode}
Date: ${item.date}
PO Number: ${item.po_no}
Status: Verified Received

[TechnoLOGI Statement of Account Official Record]`;
      const blob = new Blob([sampleText], { type: "application/pdf" });
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = `${item.document_no || "payment_receipt"}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      showToast(`Downloaded verified document: ${item.document_no}`);
    } catch (err) {
      console.error("Error downloading file", err);
      showToast("Failed to download document");
    }
  };

  // Selected Stage calculation preview in modal
  const selectedStageData = useMemo(() => {
    return stages.find((s) => s.stageNumber === Number(soaForm.stage_number)) || stages[0];
  }, [stages, soaForm.stage_number]);

  const selectedStageCurrentBalance = useMemo(() => {
    const stageVal = selectedStageData ? selectedStageData.contractValue : 0;
    const stageOtherRec = soaItems
      .filter((it) => (it.stage_number || 1) === Number(soaForm.stage_number) && it.id !== editingSOAId)
      .reduce((acc, it) => acc + (Number(it.received) || 0), 0);
    const entered = Number(soaForm.amount) || 0;
    return Math.max(0, stageVal - (stageOtherRec + entered));
  }, [selectedStageData, soaItems, soaForm.amount, soaForm.stage_number, editingSOAId]);

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
            <span className="text-slate-900 font-bold">Statement of Accounts (SOA)</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Statement of Accounts (SOA)
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
              {projectInfo.code}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Client: <strong className="text-slate-700">{projectInfo.client || "Client"}</strong> • Stages:{" "}
            <strong className="text-slate-700 font-bold">{stages.length} Stage{stages.length !== 1 ? "s" : ""}</strong>
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
            onClick={() => handleOpenAddSOA(1)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-all cursor-pointer active:scale-98"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Add SOA Entry</span>
          </button>
        </div>
      </div>

      {/* Executive Overall KPI Summary Cards with Rich Gradients */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="relative overflow-hidden p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-white via-slate-50 to-slate-100/70 border border-slate-200/90 shadow-2xs hover:shadow-md transition-all duration-200 group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
              Total Contract Value
            </span>
            <span className="p-2 rounded-xl bg-slate-100 text-slate-700 group-hover:scale-110 transition-transform">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
              </svg>
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-black text-slate-900 font-mono tracking-tight">
              {overallSummary.totalContract.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
            <span className="text-xs font-bold text-slate-400">AED</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">All commercial stages total</p>
        </div>

        <div className="relative overflow-hidden p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-emerald-50/60 via-teal-50/40 to-emerald-100/70 border border-emerald-200/90 shadow-2xs hover:shadow-md transition-all duration-200 group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-emerald-800 uppercase tracking-wider">
              Received Amount
            </span>
            <span className="p-2 rounded-xl bg-emerald-500 text-white shadow-xs group-hover:scale-110 transition-transform">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-black text-emerald-700 font-mono tracking-tight">
              {overallSummary.totalReceived.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
            <span className="text-xs font-bold text-emerald-600">AED</span>
          </div>
          <p className="text-[11px] text-emerald-700 mt-1 font-semibold">Total verified collections</p>
        </div>

        <div className="relative overflow-hidden p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-rose-50/60 via-amber-50/30 to-rose-100/70 border border-rose-200/90 shadow-2xs hover:shadow-md transition-all duration-200 group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-rose-800 uppercase tracking-wider">
              Remaining Balance
            </span>
            <span className="p-2 rounded-xl bg-rose-100 text-rose-700 group-hover:scale-110 transition-transform">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-black text-rose-700 font-mono tracking-tight">
              {overallSummary.totalBalance.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
            <span className="text-xs font-bold text-rose-500">AED</span>
          </div>
          <p className="text-[11px] text-rose-700 mt-1 font-semibold">Total pending client dues</p>
        </div>

        <div className="relative overflow-hidden p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-white via-indigo-50/40 to-indigo-100/60 border border-indigo-100/90 shadow-2xs hover:shadow-md transition-all duration-200 group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-indigo-700 uppercase tracking-wider">
              Collection Rate
            </span>
            <span className="p-2 rounded-xl bg-indigo-100 text-indigo-700 group-hover:scale-110 transition-transform">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="20" x2="18" y2="10"></line>
                <line x1="12" y1="20" x2="12" y2="4"></line>
                <line x1="6" y1="20" x2="6" y2="14"></line>
              </svg>
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="text-2xl sm:text-3xl font-black text-indigo-900 font-mono tracking-tight">
              {overallSummary.collectionRate.toFixed(1)}%
            </span>
          </div>
          <p className="text-[11px] text-indigo-600/80 mt-1 font-medium">Received vs Total Contract</p>
        </div>
      </div>

      {/* =========================================================================
          STAGE-BY-STAGE SOA SECTIONS & TABLES
          ========================================================================= */}
      <div className="space-y-6">
        {stageMetrics.map((stage) => (
          <div
            key={stage.id}
            className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden transition-all"
          >
            {/* Stage Header Banner */}
            <div className="p-5 bg-gradient-to-r from-[#0c1033] via-[#121748] to-[#1a2063] text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center font-bold text-sm">
                  {stage.stageNumber}
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
                    <span>Stage {stage.stageNumber}</span>
                    {stage.poNumber && (
                      <span className="px-2 py-0.5 rounded-md text-xs font-mono font-normal bg-white/10 text-slate-200">
                        PO: {stage.poNumber}
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-300">
                    Commercial Contract Value:{" "}
                    <strong className="text-white font-mono">
                      {stage.contractValue.toLocaleString(undefined, { minimumFractionDigits: 2 })} AED
                    </strong>
                  </p>
                </div>
              </div>

              {/* Stage Quick Financial Stats & Add Entry Button */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-3 bg-white/10 px-4 py-2 rounded-xl backdrop-blur-xs text-xs">
                  <div>
                    <span className="text-slate-300 block text-[10px] uppercase font-bold">Received:</span>
                    <span className="font-mono font-bold text-emerald-400">
                      {stage.received.toLocaleString(undefined, { minimumFractionDigits: 2 })} AED
                    </span>
                  </div>
                  <div className="h-6 w-px bg-white/20" />
                  <div>
                    <span className="text-slate-300 block text-[10px] uppercase font-bold">Balance:</span>
                    <span className="font-mono font-bold text-rose-300">
                      {stage.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })} AED
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenAddSOA(stage.stageNumber)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-emerald-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>Add Entry</span>
                </button>
              </div>
            </div>

            {/* Stage SOA Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm border-collapse min-w-[950px]">
                <thead>
                  <tr className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200 text-xs">
                    <th className="py-3 px-3 w-28">Date</th>
                    <th className="py-3 px-3 w-28 font-mono">PO No</th>
                    <th className="py-3 px-3 w-36 font-mono">Document No</th>
                    <th className="py-3 px-4 w-44">Type of Doc</th>
                    <th className="py-3 px-3 text-right w-36">Amount (AED)</th>
                    <th className="py-3 px-3 w-36 text-center">Payment Mode</th>
                    <th className="py-3 px-3 text-right w-36">Remaining Balance</th>
                    <th className="py-3 px-3 w-36 text-center">Attachment</th>
                    <th className="py-3 px-3 w-20 text-center">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {isLoadingSOA ? (
                    <tr>
                      <td colSpan={9} className="py-6 text-center text-slate-400">
                        Loading stage ledger...
                      </td>
                    </tr>
                  ) : stage.entries.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-6 text-center text-slate-400">
                        No SOA entries yet for Stage {stage.stageNumber}. Click <strong>Add Entry</strong> above.
                      </td>
                    </tr>
                  ) : (
                    stage.entries.map((item) => (
                      <tr key={item.id} className="hover:bg-emerald-50/20 transition-colors">
                        <td className="py-3 px-3 text-slate-600 font-mono text-xs">{item.date}</td>
                        <td className="py-3 px-3 font-semibold text-slate-800 font-mono">{item.po_no}</td>
                        <td className="py-3 px-3 font-mono font-bold text-indigo-700">{item.document_no || "-"}</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            {item.doc_type || "-"}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-emerald-700">
                          {Number(item.received || item.value || 0).toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="px-2.5 py-0.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200">
                            {item.mode || "-"}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-black text-rose-600">
                          {Number(item.balance || 0).toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {item.document_url || item.document_name ? (
                            <button
                              type="button"
                              onClick={() => handleDownloadDocument(item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-colors cursor-pointer"
                              title={item.document_name || "Download Document"}
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                              </svg>
                              <span className="max-w-[80px] truncate">{item.document_name || "Doc"}</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleDownloadDocument(item)}
                              className="text-xs text-slate-400 hover:text-indigo-600 font-medium inline-flex items-center gap-1 cursor-pointer"
                              title="Download Receipt Proof"
                            >
                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                              </svg>
                              <span>Receipt</span>
                            </button>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {isAdmin() ? (
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenEditSOA(item)}
                                title="Edit SOA entry"
                                className="p-1 rounded-md text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                              >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteSOAItem(item.id, item.document_no)}
                                title="Delete entry"
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
                    ))
                  )}
                </tbody>

                {/* Stage Totals Row */}
                {stage.entries.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-50 font-extrabold text-slate-900 border-t border-slate-200">
                      <td colSpan={4} className="py-3 px-4 text-right uppercase tracking-wider text-xs font-bold text-slate-600">
                        Stage {stage.stageNumber} Received:
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-emerald-700 bg-emerald-50/70 border-r border-slate-200">
                        {stage.received.toLocaleString(undefined, { minimumFractionDigits: 2 })} AED
                      </td>
                      <td className="py-3 px-3 text-center text-xs font-semibold text-slate-600 border-r border-slate-200">
                        Rate: {stage.collectionPct.toFixed(1)}%
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-black text-rose-700 bg-rose-50/70 border-r border-slate-200">
                        {stage.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })} AED
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        ))}
      </div>

      {/* =========================================================================
          MODAL: ADD / EDIT SOA ENTRY (WITH STAGE SELECTOR & FILE UPLOAD)
          ========================================================================= */}
      {isSOAModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-gradient-to-r from-[#0c1033] to-[#1a2063] text-white flex items-center justify-between">
              <h3 className="font-extrabold text-base sm:text-lg">
                {editingSOAId ? "Edit Statement Entry" : "Add SOA Entry"}
              </h3>
              <button
                type="button"
                onClick={() => setIsSOAModalOpen(false)}
                className="text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSOASubmit} className="p-6 space-y-4">
              {/* Stage Selection */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Commercial Stage</label>
                <select
                  value={soaForm.stage_number}
                  onChange={(e) => {
                    const stNum = Number(e.target.value) || 1;
                    const st = stages.find((s) => s.stageNumber === stNum);
                    setSoaForm((prev) => ({
                      ...prev,
                      stage_number: stNum,
                      po_no: st?.poNumber || prev.po_no,
                    }));
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-bold text-slate-800 bg-white cursor-pointer"
                >
                  {stages.map((st) => (
                    <option key={st.stageNumber} value={st.stageNumber}>
                      Stage {st.stageNumber} – Contract Value: {st.contractValue.toLocaleString(undefined, { minimumFractionDigits: 2 })} AED {st.poNumber ? `(PO: ${st.poNumber})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Date</label>
                  <ThemeDatePicker
                    value={soaForm.date}
                    onChange={(val) => setSoaForm((prev) => ({ ...prev, date: val }))}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">PO Number</label>
                  <input
                    type="text"
                    required
                    value={soaForm.po_no}
                    onChange={(e) => setSoaForm({ ...soaForm, po_no: e.target.value })}
                    placeholder="e.g. PO-101"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Document No</label>
                  <input
                    type="text"
                    required
                    value={soaForm.document_no}
                    onChange={(e) => setSoaForm({ ...soaForm, document_no: e.target.value })}
                    placeholder="e.g. INV-2024-001"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Type of Document</label>
                  <input
                    type="text"
                    value={soaForm.doc_type}
                    onChange={(e) => setSoaForm({ ...soaForm, doc_type: e.target.value })}
                    placeholder="e.g. Tax Invoice, Milestone 1, Delivery..."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Amount / Received (AED)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={soaForm.amount}
                    onChange={(e) => setSoaForm({ ...soaForm, amount: Number(e.target.value) || 0 })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-mono font-bold text-emerald-700"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Payment Mode</label>
                  <select
                    value={soaForm.mode}
                    onChange={(e) => setSoaForm({ ...soaForm, mode: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  >
                    <option value="Cheque">Cheque</option>
                    <option value="Cash">Cash</option>
                    <option value="Online / Bank Transfer">Online / Bank Transfer</option>
                    <option value="Card">Card</option>
                  </select>
                </div>
              </div>

              {/* Real-time Computed Stage Balance Preview */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Stage {soaForm.stage_number} Contract Value:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {selectedStageData?.contractValue.toLocaleString(undefined, { minimumFractionDigits: 2 }) || "0.00"} AED
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>This Received Entry:</span>
                  <span className="font-mono font-bold text-emerald-600">
                    +{(Number(soaForm.amount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} AED
                  </span>
                </div>
                <div className="flex justify-between text-slate-900 font-bold border-t border-slate-200 pt-1">
                  <span>Remaining Stage {soaForm.stage_number} Balance:</span>
                  <span className="font-mono text-rose-600 font-extrabold">
                    {selectedStageCurrentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} AED
                  </span>
                </div>
              </div>

              {/* Upload Document / Payment Receipt */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Upload Document / Payment Receipt (Optional)
                </label>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                />

                {soaForm.document_name ? (
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-indigo-50/60 border border-indigo-200 text-xs">
                    <div className="flex items-center gap-2 truncate">
                      <svg className="w-4 h-4 text-indigo-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      <span className="font-semibold text-indigo-900 truncate">{soaForm.document_name}</span>
                      {soaForm.document_size && (
                        <span className="text-[11px] text-indigo-500 shrink-0">({soaForm.document_size})</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSoaForm((prev) => ({ ...prev, document_url: "", document_name: "", document_size: "" }))}
                      className="text-slate-400 hover:text-rose-600 text-xs font-bold ml-2 cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 border border-dashed border-slate-300 rounded-xl transition-colors cursor-pointer"
                  >
                    <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <span>Click to attach invoice, receipt or proof (PDF/Image)</span>
                  </button>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsSOAModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  {editingSOAId ? "Update Entry" : "Save Entry"}
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
