"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import * as XLSX from "xlsx";
import { getUserRole, isAdmin, apiGetManpowerAttendance } from "@/lib/api";
import { AdminPasswordModal, ThemeDatePicker } from "@/components";
import {
  ManpowerItem,
  ManpowerType,
  BackendManpowerMetrics,
  getStoredManpower,
  fetchManpowerFromBackend,
  createManpowerInBackend,
  updateManpowerInBackend,
  deleteManpowerFromBackend,
} from "@/lib/manpowerStore";
import { addActivityLog } from "@/lib/logsStore";

type ViewTab = "attendance" | "directory";
type TimelinePreset = "last7" | "month" | "year" | "custom";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function ManpowerPage() {
  // Navigation & View State
  const [activeTab, setActiveTab] = useState<ViewTab>("attendance");

  // Personnel Directory State
  const [personnel, setPersonnel] = useState<ManpowerItem[]>([]);
  const [metrics, setMetrics] = useState<BackendManpowerMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState("");

  // Attendance Matrix State
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, Record<string, number>>>({});
  const [attendanceWorkers, setAttendanceWorkers] = useState<
    { id: string; name: string; type: ManpowerType; created_at?: string | null }[]
  >([]);

  // Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "Internal" | "External">("ALL");

  // Timeline / Date Filters for Attendance
  const [timelinePreset, setTimelinePreset] = useState<TimelinePreset>("month");
  const today = useMemo(() => new Date(), []);
  const [selectedYear, setSelectedYear] = useState<number>(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(today.getMonth() + 1); // 1-12
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toISOString().split("T")[0];
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });

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

  // Modal State
  const [userRole, setUserRole] = useState<string>("");
  useEffect(() => {
    const syncRole = () => setUserRole(getUserRole());
    syncRole();
    window.addEventListener("auth_user_change", syncRole);
    return () => window.removeEventListener("auth_user_change", syncRole);
  }, []);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ManpowerItem | null>(null);

  // Form State (Name and Type)
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<ManpowerType>("Internal");

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3500);
  };

  // 1. Calculate Date Range based on Preset
  const { dateRangeStart, dateRangeEnd, dateColumns } = useMemo(() => {
    const dates: string[] = [];

    if (timelinePreset === "last7") {
      const now = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().split("T")[0]);
      }
      return {
        dateRangeStart: dates[0],
        dateRangeEnd: dates[dates.length - 1],
        dateColumns: dates,
      };
    }

    if (timelinePreset === "month") {
      const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const dayStr = String(day).padStart(2, "0");
        const monthStr = String(selectedMonth).padStart(2, "0");
        dates.push(`${selectedYear}-${monthStr}-${dayStr}`);
      }
      return {
        dateRangeStart: dates[0],
        dateRangeEnd: dates[dates.length - 1],
        dateColumns: dates,
      };
    }

    if (timelinePreset === "year") {
      // Whole year range
      const start = `${selectedYear}-01-01`;
      const end = `${selectedYear}-12-31`;
      // Generate days for the year
      const isLeap = (selectedYear % 4 === 0 && selectedYear % 100 !== 0) || selectedYear % 400 === 0;
      const totalDays = isLeap ? 366 : 365;
      const cur = new Date(selectedYear, 0, 1);
      for (let i = 0; i < totalDays; i++) {
        dates.push(cur.toISOString().split("T")[0]);
        cur.setDate(cur.getDate() + 1);
      }
      return {
        dateRangeStart: start,
        dateRangeEnd: end,
        dateColumns: dates,
      };
    }

    // Custom range
    const start = customStartDate || new Date().toISOString().split("T")[0];
    const end = customEndDate || new Date().toISOString().split("T")[0];
    const startDateObj = new Date(start);
    const endDateObj = new Date(end);

    if (startDateObj <= endDateObj) {
      const cur = new Date(startDateObj);
      while (cur <= endDateObj) {
        dates.push(cur.toISOString().split("T")[0]);
        cur.setDate(cur.getDate() + 1);
      }
    } else {
      dates.push(start);
    }

    return {
      dateRangeStart: start,
      dateRangeEnd: end,
      dateColumns: dates,
    };
  }, [timelinePreset, selectedYear, selectedMonth, customStartDate, customEndDate]);

  // Pure Backend Fetching: Directory
  const loadBackendData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const res = await fetchManpowerFromBackend();
      setPersonnel(res.items);
      setMetrics(res.metrics);
      if (isManualRefresh) {
        showToast("Manpower personnel refreshed from backend!");
      }
    } catch (err: any) {
      console.error("Backend fetch error:", err);
      const msg = err?.message || "Failed to reach backend API. Ensure backend is running.";
      setError(msg);
      const cached = getStoredManpower();
      if (cached.length > 0) {
        setPersonnel(cached);
      }
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Fetch Attendance Matrix from Backend
  const loadAttendanceData = useCallback(async () => {
    setAttendanceLoading(true);
    try {
      const res = await apiGetManpowerAttendance({
        start_date: dateRangeStart,
        end_date: dateRangeEnd,
        type: typeFilter !== "ALL" ? typeFilter : undefined,
        search: searchQuery.trim() || undefined,
      });

      setAttendanceWorkers(res.workers as any);
      setAttendanceMap(res.attendance_map || {});
    } catch (err) {
      console.error("Attendance fetch error:", err);
    } finally {
      setAttendanceLoading(false);
    }
  }, [dateRangeStart, dateRangeEnd, typeFilter, searchQuery]);

  useEffect(() => {
    loadBackendData();
    const handleStorageUpdate = () => {
      setPersonnel(getStoredManpower());
    };
    window.addEventListener("manpower_store_update", handleStorageUpdate);
    return () => {
      window.removeEventListener("manpower_store_update", handleStorageUpdate);
    };
  }, [loadBackendData]);

  useEffect(() => {
    loadAttendanceData();
  }, [loadAttendanceData]);

  // Compute Dynamic Metrics
  const displayTotal = metrics ? metrics.total : personnel.length;
  const displayInternal = metrics
    ? metrics.internal
    : personnel.filter((p) => p.type === "Internal").length;
  const displayExternal = metrics
    ? metrics.external
    : personnel.filter((p) => p.type === "External").length;

  // Filtered List for Directory View
  const filteredPersonnel = useMemo(() => {
    return personnel.filter((item) => {
      const matchesSearch = item.name
        .toLowerCase()
        .includes(searchQuery.toLowerCase().trim());
      const matchesType = typeFilter === "ALL" || item.type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [personnel, searchQuery, typeFilter]);

  // Filtered Workers for Attendance Matrix
  const displayedAttendanceWorkers = useMemo(() => {
    return attendanceWorkers.filter((item) => {
      const matchesSearch = item.name
        .toLowerCase()
        .includes(searchQuery.toLowerCase().trim());
      const matchesType = typeFilter === "ALL" || item.type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [attendanceWorkers, searchQuery, typeFilter]);

  // Worker Attendance Statistics
  const getWorkerStats = useCallback(
    (workerName: string) => {
      const workerRecords = attendanceMap[workerName.trim().toLowerCase()] || {};
      let totalDays = 0;
      let totalHours = 0;

      dateColumns.forEach((d) => {
        const hrs = workerRecords[d] || 0;
        if (hrs > 0) {
          totalDays += 1;
          totalHours += hrs;
        }
      });

      return { totalDays, totalHours };
    },
    [attendanceMap, dateColumns]
  );

  // Overall Attendance Summary Statistics
  const overallStats = useMemo(() => {
    let totalManDays = 0;
    let totalManHours = 0;
    const activeWorkersSet = new Set<string>();

    displayedAttendanceWorkers.forEach((w) => {
      const { totalDays, totalHours } = getWorkerStats(w.name);
      if (totalDays > 0) {
        totalManDays += totalDays;
        totalManHours += totalHours;
        activeWorkersSet.add(w.name);
      }
    });

    return {
      activeWorkersCount: activeWorkersSet.size,
      totalManDays,
      totalManHours,
      avgHoursPerDay: totalManDays > 0 ? (totalManHours / totalManDays).toFixed(1) : "0",
    };
  }, [displayedAttendanceWorkers, getWorkerStats]);

  // Export Attendance to Excel (.xlsx)
  const handleExportAttendanceExcel = () => {
    if (displayedAttendanceWorkers.length === 0) {
      showToast("No manpower records to export.");
      return;
    }

    const rows = displayedAttendanceWorkers.map((w) => {
      const { totalDays, totalHours } = getWorkerStats(w.name);
      const rowData: Record<string, any> = {
        "Worker Name": w.name,
        "Classification": w.type,
        "Total Days Worked": totalDays,
        "Total Hours Worked": totalHours,
      };

      dateColumns.forEach((d) => {
        const hrs = attendanceMap[w.name.trim().toLowerCase()]?.[d] || 0;
        rowData[d] = hrs > 0 ? `${hrs} hrs` : "-";
      });

      return rowData;
    });

    // Add Summary Row
    const summaryRow: Record<string, any> = {
      "Worker Name": "TOTAL MAN-HOURS",
      "Classification": "-",
      "Total Days Worked": overallStats.totalManDays,
      "Total Hours Worked": overallStats.totalManHours,
    };
    dateColumns.forEach((d) => {
      let dayHrs = 0;
      displayedAttendanceWorkers.forEach((w) => {
        dayHrs += attendanceMap[w.name.trim().toLowerCase()]?.[d] || 0;
      });
      summaryRow[d] = dayHrs > 0 ? `${dayHrs} hrs` : "-";
    });
    rows.push(summaryRow);

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance Grid");
    
    const fileName = `Manpower_Attendance_${timelinePreset}_${dateRangeStart}_to_${dateRangeEnd}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    showToast(`Exported ${fileName} successfully!`);
  };

  // Open modal for new user/worker
  const handleOpenCreateModal = () => {
    setEditingItem(null);
    setFormName("");
    setFormType("Internal");
    setFormError("");
    setIsModalOpen(true);
  };

  // Open modal for editing user/worker (Requires Admin Password)
  const handleOpenEditModal = (item: ManpowerItem) => {
    setAdminAuthModal({
      isOpen: true,
      title: "Authorize Personnel Edit",
      description: `Enter Admin password to edit personnel "${item.name}".`,
      actionLabel: "Unlock & Edit",
      actionType: "warning",
      onSuccess: () => {
        setEditingItem(item);
        setFormName(item.name);
        setFormType(item.type);
        setFormError("");
        setIsModalOpen(true);
      },
    });
  };

  // Handle Save (Create or Edit) via Backend
  const handleSavePersonnel = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!formName.trim()) {
      setFormError("Please enter the User Name.");
      return;
    }

    setSubmitting(true);

    try {
      if (editingItem) {
        await updateManpowerInBackend(editingItem.id, {
          name: formName.trim(),
          type: formType,
        });
        showToast(`User "${formName.trim()}" updated successfully!`);
        addActivityLog({
          module: "Manpower",
          projectName: "—",
          action: `Updated manpower worker: ${formName.trim()} (${formType})`,
        });
      } else {
        await createManpowerInBackend({
          name: formName.trim(),
          type: formType,
        });
        showToast(`User "${formName.trim()}" created in backend!`);
        addActivityLog({
          module: "Manpower",
          projectName: "—",
          action: `Registered new manpower worker: ${formName.trim()} (${formType})`,
        });
      }

      setIsModalOpen(false);
      await loadBackendData();
      await loadAttendanceData();
    } catch (err: any) {
      console.error("Save error:", err);
      setFormError(err?.message || "Failed to save user in backend.");
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Delete Personnel via Backend (Requires Admin Password)
  const handleDeletePersonnel = (id: string, name: string) => {
    setAdminAuthModal({
      isOpen: true,
      title: "Authorize Personnel Deletion",
      description: `Enter Admin password to permanently delete personnel "${name}".`,
      actionLabel: "Delete Personnel",
      actionType: "danger",
      onSuccess: async () => {
        try {
          await deleteManpowerFromBackend(id);
          showToast(`User "${name}" removed from backend.`);
          addActivityLog({
            module: "Manpower",
            projectName: "—",
            action: `Deleted manpower worker: ${name}`,
          });
          await loadBackendData();
          await loadAttendanceData();
        } catch (err: any) {
          alert(err?.message || "Failed to delete user from backend.");
        }
      },
    });
  };

  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);

  return (
    <div className="space-y-6 sm:space-y-7 animate-in fade-in duration-200 pb-20 max-w-7xl mx-auto">
      {/* Toast Notification Alert */}
      {toastMsg && (
        <div className="fixed top-5 right-5 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-2xl text-xs sm:text-sm font-medium border border-slate-800 flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <span className="text-emerald-400 font-bold">✓</span>
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Page Header with Tab Switcher */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Manpower & Attendance
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Backend
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Track daily manpower attendance across projects and manage internal/external personnel.
          </p>
        </div>

        {/* Action Buttons & Tabs */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* View Tab Buttons */}
          <div className="flex items-center bg-slate-200/80 p-1 rounded-xl shadow-inner text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab("attendance")}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all cursor-pointer ${
                activeTab === "attendance"
                  ? "bg-white text-indigo-700 font-bold shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                <line x1="16" x2="16" y1="2" y2="6" />
                <line x1="8" x2="8" y1="2" y2="6" />
                <line x1="3" x2="21" y1="10" y2="10" />
                <path d="m9 16 2 2 4-4" />
              </svg>
              <span>Attendance Timesheet</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("directory")}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all cursor-pointer ${
                activeTab === "directory"
                  ? "bg-white text-indigo-700 font-bold shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span>Worker Directory</span>
            </button>
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => {
              loadBackendData(true);
              loadAttendanceData();
            }}
            disabled={loading || isRefreshing || attendanceLoading}
            title="Refresh pure backend data"
            className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-semibold rounded-xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all cursor-pointer disabled:opacity-60"
          >
            <svg
              className={`w-4 h-4 text-slate-500 ${isRefreshing || attendanceLoading ? "animate-spin text-indigo-600" : ""}`}
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

          {/* Create New User Button */}
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0c1033] hover:bg-[#151b54] text-white text-xs sm:text-sm font-semibold rounded-xl shadow-xs hover:shadow-md transition-all cursor-pointer active:scale-98"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Add Member</span>
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
            onClick={() => {
              loadBackendData(true);
              loadAttendanceData();
            }}
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-lg text-xs cursor-pointer flex-shrink-0 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* =========================================================================
          TAB 1: ATTENDANCE TIMESHEET MATRIX
          ========================================================================= */}
      {activeTab === "attendance" && (
        <div className="space-y-6">
          {/* Filter Control Bar */}
          <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-xs p-5 sm:p-6 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              {/* Type Filter Buttons */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setTypeFilter("ALL")}
                    className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                      typeFilter === "ALL"
                        ? "bg-white text-slate-900 shadow-2xs font-bold"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    All Types
                  </button>
                  <button
                    type="button"
                    onClick={() => setTypeFilter("Internal")}
                    className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                      typeFilter === "Internal"
                        ? "bg-white text-indigo-700 shadow-2xs font-bold"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Internal
                  </button>
                  <button
                    type="button"
                    onClick={() => setTypeFilter("External")}
                    className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                      typeFilter === "External"
                        ? "bg-white text-amber-700 shadow-2xs font-bold"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    External
                  </button>
                </div>

                {/* Timeline Scope Selector */}
                <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setTimelinePreset("last7")}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      timelinePreset === "last7"
                        ? "bg-white text-indigo-700 shadow-2xs font-bold"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Last 7 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimelinePreset("month")}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      timelinePreset === "month"
                        ? "bg-white text-indigo-700 shadow-2xs font-bold"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Month View
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimelinePreset("year")}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      timelinePreset === "year"
                        ? "bg-white text-indigo-700 shadow-2xs font-bold"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Whole Year
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimelinePreset("custom")}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      timelinePreset === "custom"
                        ? "bg-white text-indigo-700 shadow-2xs font-bold"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Custom
                  </button>
                </div>
              </div>

              {/* Right Side: Search + Excel Export */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Search Worker */}
                <div className="relative w-full sm:w-56">
                  <input
                    type="text"
                    placeholder="Search personnel..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
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

                {/* Export Attendance Excel Button */}
                <button
                  type="button"
                  onClick={handleExportAttendanceExcel}
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-2xs transition-colors cursor-pointer"
                  title="Export Attendance Timesheet as Excel (.xlsx)"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" x2="12" y1="15" y2="3" />
                  </svg>
                  <span>Export Excel</span>
                </button>
              </div>
            </div>

            {/* Secondary Controls for Month / Year / Custom Date Selectors */}
            {timelinePreset === "month" && (
              <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100">
                <span className="text-xs font-bold text-slate-600">Select Month:</span>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="px-3 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                >
                  {MONTH_NAMES.map((m, idx) => (
                    <option key={m} value={idx + 1}>
                      {m}
                    </option>
                  ))}
                </select>

                <span className="text-xs font-bold text-slate-600 ml-2">Year:</span>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="px-3 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                >
                  {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-slate-400">
                  Showing {dateColumns.length} days for {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
                </span>
              </div>
            )}

            {timelinePreset === "year" && (
              <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100">
                <span className="text-xs font-bold text-slate-600">Select Year:</span>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="px-3 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                >
                  {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-slate-400">
                  Showing entire year of {selectedYear} ({dateColumns.length} days)
                </span>
              </div>
            )}

            {timelinePreset === "custom" && (
              <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700">From:</span>
                  <div className="w-48 sm:w-52">
                    <ThemeDatePicker
                      value={customStartDate}
                      onChange={(val) => setCustomStartDate(val)}
                      placeholder="Start date"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700">To:</span>
                  <div className="w-48 sm:w-52">
                    <ThemeDatePicker
                      value={customEndDate}
                      onChange={(val) => setCustomEndDate(val)}
                      placeholder="End date"
                    />
                  </div>
                </div>
                <span className="text-xs text-slate-500 font-medium">
                  Showing {dateColumns.length} days in custom range
                </span>
              </div>
            )}
          </div>

          {/* =========================================================================
              THE ATTENDANCE GRID MATRIX
              Sticky Worker Column + Horizontally Scrollable Dates
              ========================================================================= */}
          <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="overflow-x-auto max-h-[620px] scrollbar-thin">
              <table className="w-full text-left border-collapse border-spacing-0">
                {/* Header Row */}
                <thead className="sticky top-0 z-20 bg-slate-900 text-white shadow-xs">
                  <tr>
                    {/* Sticky Left: Worker Column */}
                    <th className="sticky left-0 z-30 bg-slate-900 py-3.5 px-4 min-w-[220px] sm:min-w-[260px] text-xs font-bold tracking-wider uppercase border-r border-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.2)]">
                      <div className="flex items-center justify-between">
                        <span>Worker / Personnel</span>
                        <span className="text-[10px] text-slate-400 font-normal">
                          {displayedAttendanceWorkers.length} workers
                        </span>
                      </div>
                    </th>

                    {/* Summary Totals Header */}
                    <th className="py-3.5 px-3 min-w-[90px] text-center text-[11px] font-bold tracking-wider uppercase bg-slate-800/90 border-r border-slate-700">
                      Days
                    </th>
                    <th className="py-3.5 px-3 min-w-[90px] text-center text-[11px] font-bold tracking-wider uppercase bg-slate-800/90 border-r border-slate-700">
                      Hours
                    </th>

                    {/* Date Columns */}
                    {dateColumns.map((dateStr) => {
                      const dObj = new Date(dateStr);
                      const dayName = DAYS_SHORT[dObj.getDay()];
                      const dayNum = dObj.getDate();
                      const monthAbbr = MONTH_NAMES[dObj.getMonth()]?.slice(0, 3);
                      const isToday = dateStr === todayStr;

                      return (
                        <th
                          key={dateStr}
                          className={`py-2 px-2 min-w-[70px] text-center text-xs font-semibold border-r border-slate-800 select-none ${
                            isToday ? "bg-indigo-950 text-indigo-200 ring-1 ring-indigo-500" : ""
                          }`}
                        >
                          <span className={`block text-[10px] uppercase font-bold tracking-wider ${
                            isToday ? "text-indigo-400 font-extrabold" : "text-slate-400"
                          }`}>
                            {dayName}
                          </span>
                          <span className={`block text-xs font-extrabold ${isToday ? "text-white" : "text-slate-200"}`}>
                            {dayNum} {monthAbbr}
                          </span>
                          {isToday && (
                            <span className="inline-block px-1 py-0.2 text-[8px] uppercase font-bold bg-indigo-500 text-white rounded">
                              Today
                            </span>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                {/* Table Body Rows */}
                <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                  {attendanceLoading ? (
                    <tr>
                      <td
                        colSpan={dateColumns.length + 3}
                        className="py-16 text-center text-slate-400"
                      >
                        <div className="inline-flex items-center gap-2.5 text-slate-600 font-medium">
                          <svg className="w-5 h-5 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" />
                            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" />
                          </svg>
                          <span>Loading attendance timesheet matrix...</span>
                        </div>
                      </td>
                    </tr>
                  ) : displayedAttendanceWorkers.length === 0 ? (
                    <tr>
                      <td
                        colSpan={dateColumns.length + 3}
                        className="py-16 text-center text-slate-400"
                      >
                        <p className="font-semibold text-slate-700">No personnel records found</p>
                        <p className="text-xs text-slate-400 mt-1">
                          Add personnel to projects or create members from the Directory tab
                        </p>
                      </td>
                    </tr>
                  ) : (
                    displayedAttendanceWorkers.map((worker) => {
                      const { totalDays, totalHours } = getWorkerStats(worker.name);
                      const workerRecords = attendanceMap[worker.name.trim().toLowerCase()] || {};

                      return (
                        <tr
                          key={worker.id}
                          className="hover:bg-indigo-50/30 transition-colors group"
                        >
                          {/* Sticky Worker Column */}
                          <td className="sticky left-0 z-10 bg-white group-hover:bg-indigo-50/40 py-3 px-4 border-r border-slate-200/80 shadow-[2px_0_5px_rgba(0,0,0,0.04)]">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-[#0c1033] text-white flex items-center justify-center flex-shrink-0 text-xs font-bold uppercase shadow-2xs">
                                {worker.name.charAt(0)}
                              </div>
                              <div className="min-w-0 pr-2">
                                <span className="font-bold text-slate-900 text-xs sm:text-sm truncate block">
                                  {worker.name}
                                </span>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  {worker.type === "Internal" ? (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/70">
                                      <span className="w-1 h-1 rounded-full bg-indigo-600" />
                                      Internal
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200/70">
                                      <span className="w-1 h-1 rounded-full bg-amber-600" />
                                      External
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Summary: Total Days */}
                          <td className="py-3 px-3 text-center border-r border-slate-100 bg-slate-50/50">
                            <span className={`inline-block font-extrabold text-xs px-2 py-0.5 rounded-md ${
                              totalDays > 0 ? "text-indigo-800 bg-indigo-50" : "text-slate-400"
                            }`}>
                              {totalDays}d
                            </span>
                          </td>

                          {/* Summary: Total Hours */}
                          <td className="py-3 px-3 text-center border-r border-slate-100 bg-slate-50/50">
                            <span className={`inline-block font-extrabold text-xs px-2 py-0.5 rounded-md ${
                              totalHours > 0 ? "text-emerald-800 bg-emerald-50" : "text-slate-400"
                            }`}>
                              {totalHours}h
                            </span>
                          </td>

                          {/* Date Cells */}
                          {dateColumns.map((dateStr) => {
                            const hours = workerRecords[dateStr] || 0;
                            const isToday = dateStr === todayStr;

                            return (
                              <td
                                key={dateStr}
                                className={`py-2 px-1.5 text-center border-r border-slate-100 transition-colors ${
                                  isToday ? "bg-indigo-50/40" : ""
                                }`}
                              >
                                {hours > 0 ? (
                                  <div
                                    title={`${worker.name}: ${hours} hrs worked on ${dateStr}`}
                                    className={`inline-flex items-center justify-center min-w-[48px] px-1.5 py-1 rounded-lg text-xs font-bold transition-transform hover:scale-105 shadow-2xs ${
                                      hours >= 10
                                        ? "bg-purple-100 text-purple-900 border border-purple-200"
                                        : "bg-emerald-100 text-emerald-900 border border-emerald-200"
                                    }`}
                                  >
                                    <span>{hours}h</span>
                                  </div>
                                ) : (
                                  <span className="text-slate-300 font-mono text-xs select-none">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
                  )}
                </tbody>

                {/* Footer Totals Row */}
                {displayedAttendanceWorkers.length > 0 && !attendanceLoading && (
                  <tfoot className="sticky bottom-0 z-20 bg-slate-900 text-white font-bold shadow-lg">
                    <tr>
                      {/* Sticky Footer Left Label */}
                      <td className="sticky left-0 z-30 bg-slate-900 py-3 px-4 text-xs tracking-wider uppercase border-r border-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.2)]">
                        <div className="flex items-center justify-between">
                          <span>Daily Summary</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            Site On-Duty
                          </span>
                        </div>
                      </td>

                      {/* Period Total Days */}
                      <td className="py-3 px-3 text-center border-r border-slate-800 text-xs bg-slate-800 text-indigo-300">
                        {overallStats.totalManDays}d
                      </td>

                      {/* Period Total Hours */}
                      <td className="py-3 px-3 text-center border-r border-slate-800 text-xs bg-slate-800 text-emerald-300">
                        {overallStats.totalManHours}h
                      </td>

                      {/* Daily Column Sums */}
                      {dateColumns.map((dateStr) => {
                        let dayPersonnel = 0;
                        let dayHours = 0;

                        displayedAttendanceWorkers.forEach((w) => {
                          const hrs = attendanceMap[w.name.trim().toLowerCase()]?.[dateStr] || 0;
                          if (hrs > 0) {
                            dayPersonnel += 1;
                            dayHours += hrs;
                          }
                        });

                        const isToday = dateStr === todayStr;

                        return (
                          <td
                            key={`foot-${dateStr}`}
                            className={`py-2 px-1 text-center border-r border-slate-800 text-[11px] ${
                              isToday ? "bg-indigo-950 text-indigo-200" : ""
                            }`}
                          >
                            {dayPersonnel > 0 ? (
                              <div>
                                <span className="block text-white font-extrabold text-xs">
                                  {dayHours}h
                                </span>
                                <span className="block text-[9px] text-slate-400 font-semibold">
                                  {dayPersonnel}p
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-600 font-mono text-xs select-none">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: WORKER DIRECTORY VIEW (Pure Database Table with CRUD)
          ========================================================================= */}
      {activeTab === "directory" && (
        <div className="space-y-6">
          {/* Top 3 KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
            {/* Card 1: Total Manpower */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 sm:p-6 flex items-center gap-4 hover:border-slate-300 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100/70 flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-6 h-6"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <div>
                <span className="text-xs font-bold text-slate-500 block mb-0.5">
                  Total Registered
                </span>
                <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                  {loading && !metrics ? "..." : displayTotal}
                </span>
              </div>
            </div>

            {/* Card 2: Internal Team */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 sm:p-6 flex items-center gap-4 hover:border-slate-300 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 border border-blue-100/70 flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-6 h-6"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <div>
                <span className="text-xs font-bold text-slate-500 block mb-0.5">
                  Internal Team
                </span>
                <span className="text-3xl font-extrabold text-blue-700 tracking-tight">
                  {loading && !metrics ? "..." : displayInternal}
                </span>
              </div>
            </div>

            {/* Card 3: External Contractors */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 sm:p-6 flex items-center gap-4 hover:border-slate-300 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 border border-amber-100/70 flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-6 h-6"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <rect width="20" height="14" x="2" y="5" rx="2" />
                  <line x1="2" x2="22" y1="10" y2="10" />
                </svg>
              </div>
              <div>
                <span className="text-xs font-bold text-slate-500 block mb-0.5">
                  External Contractors
                </span>
                <span className="text-3xl font-extrabold text-amber-700 tracking-tight">
                  {loading && !metrics ? "..." : displayExternal}
                </span>
              </div>
            </div>
          </div>

          {/* Main Table Card */}
          <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-xs p-6 sm:p-7 space-y-5 overflow-hidden">
            {/* Table Controls (Search & Filter Tabs) */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-slate-100">
              <div>
                <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
                  All Registered Personnel
                </h2>
                <p className="text-xs text-slate-500">
                  Showing {filteredPersonnel.length} of {personnel.length} entries (live database)
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {/* Search Input */}
                <div className="relative w-full sm:w-60">
                  <input
                    type="text"
                    placeholder="Search personnel..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
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

                {/* Type Filter Buttons */}
                <div className="flex items-center bg-slate-100 p-0.5 rounded-xl text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setTypeFilter("ALL")}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      typeFilter === "ALL"
                        ? "bg-white text-slate-900 shadow-2xs font-bold"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setTypeFilter("Internal")}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      typeFilter === "Internal"
                        ? "bg-white text-indigo-700 shadow-2xs font-bold"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Internal
                  </button>
                  <button
                    type="button"
                    onClick={() => setTypeFilter("External")}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      typeFilter === "External"
                        ? "bg-white text-amber-700 shadow-2xs font-bold"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    External
                  </button>
                </div>
              </div>
            </div>

            {/* 3-Column Table: UserName, Type, Action */}
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[500px]">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="py-3.5 pl-2 pr-3">Personnel Name</th>
                    <th className="py-3.5 px-3 w-48">Classification</th>
                    <th className="py-3.5 pr-2 pl-3 text-right w-24">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/80 text-xs sm:text-sm">
                  {loading && personnel.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-12 text-center text-slate-400">
                        <div className="inline-flex items-center gap-2.5 text-slate-600 font-medium">
                          <svg className="w-5 h-5 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" />
                            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" />
                          </svg>
                          <span>Loading manpower from backend...</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredPersonnel.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-12 text-center text-slate-400">
                        <p className="font-semibold text-slate-700">No personnel found</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Click "+ Add Member" to register internal or external personnel
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredPersonnel.map((item) => (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-50/70 transition-colors group"
                      >
                        {/* UserName with Avatar */}
                        <td className="py-4 pl-2 pr-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-[#0c1033] text-white flex items-center justify-center flex-shrink-0 shadow-2xs font-bold text-xs uppercase">
                              {item.name.charAt(0)}
                            </div>
                            <div>
                              <span className="font-semibold text-xs sm:text-sm text-slate-900 block">
                                {item.name}
                              </span>
                              <span className="text-[11px] text-slate-400 block font-mono">
                                Registered: {item.dateAdded}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Type Badge (Internal vs External) */}
                        <td className="py-4 px-3">
                          {item.type === "Internal" ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                              Internal
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200/80">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
                              External
                            </span>
                          )}
                        </td>

                        {/* Action: Edit & Delete Buttons (Admin Only) */}
                        <td className="py-4 pr-2 pl-3 text-right">
                          {isAdmin() ? (
                            <div className="inline-flex items-center justify-end gap-1">
                              {/* Edit Button */}
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(item)}
                                title={`Edit ${item.name}`}
                                className="w-7 h-7 rounded-lg text-amber-500 hover:text-amber-700 hover:bg-amber-50 flex items-center justify-center transition-colors cursor-pointer"
                              >
                                <svg
                                  className="w-4 h-4"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                              </button>

                              {/* Delete Button */}
                              <button
                                type="button"
                                onClick={() => handleDeletePersonnel(item.id, item.name)}
                                title={`Delete ${item.name}`}
                                className="w-7 h-7 rounded-lg text-rose-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors cursor-pointer"
                              >
                                <svg
                                  className="w-4 h-4"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
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

      {/* =========================================================================
          MODAL: Create New User / Edit User (UserName and Type)
          ========================================================================= */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => !submitting && setIsModalOpen(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full p-6 sm:p-7 space-y-5 animate-in zoom-in-95 duration-200 overflow-visible"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {editingItem ? "Edit Personnel" : "Add New Personnel Member"}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {editingItem
                    ? "Modify name or change classification (Internal / External)"
                    : "Enter member name and select Internal or External"}
                </p>
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center cursor-pointer disabled:opacity-50"
              >
                <svg
                  className="w-5 h-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Form Error */}
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

            {/* Modal Form */}
            <form onSubmit={handleSavePersonnel} className="space-y-4">
              {/* Personnel Name */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Personnel Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ahmed Al-Mansoor"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {/* Type Dropdown: Internal or External */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Classification <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as ManpowerType)}
                  className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer bg-white"
                >
                  <option value="Internal">Internal</option>
                  <option value="External">External</option>
                </select>
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
                  <span>{editingItem ? "Save Changes" : "Save Member"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
