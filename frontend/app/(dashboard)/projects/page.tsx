"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AdminPasswordModal } from "@/components";
import {
  API_BASE_URL,
  apiGetProjects,
  apiCreateProject,
  apiUpdateProject,
  BackendProjectItem,
  getUserRole,
  isAdmin,
  isSiteSupervisor,
} from "@/lib/api";

interface ProjectStage {
  step: number;
  name: string;
}

const STAGE_DEFINITIONS: ProjectStage[] = [
  { step: 1, name: "Site Survey & Planning" },
  { step: 2, name: "Conduit & Pre-wire" },
  { step: 3, name: "Panel Distribution" },
  { step: 4, name: "Device Installation" },
  { step: 5, name: "Automation Commissioning" },
  { step: 6, name: "Client Inspection & Tuning" },
  { step: 7, name: "Final Handover & Sign-off" },
];

export interface Project {
  id: string;
  name: string;
  client: string;
  location: string;
  code: string;
  priority: "High" | "Medium" | "Low";
  priorityLevel: "high" | "medium" | "low";
  currentStage: number; // 1 to 7
  totalStages: number;
  manager: string;
  supervisor: string;
  startDate: string;
  budget: string;
  isCompleted?: boolean;
  completedAt?: string;
}

const STORAGE_KEY = "microservice_projects_list_v3";

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<"active" | "archived">("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [hoveredStage, setHoveredStage] = useState<{ projectId: string; stage: number } | null>(null);
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

  const [userRole, setUserRole] = useState<string>("");
  useEffect(() => {
    const syncRole = () => setUserRole(getUserRole());
    syncRole();
    window.addEventListener("auth_user_change", syncRole);
    return () => window.removeEventListener("auth_user_change", syncRole);
  }, []);

  // Priority Dropdown State (In-place priority switcher)
  const [activePriorityMenuId, setActivePriorityMenuId] = useState<string | null>(null);


  // New Project modal state
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [newPriority, setNewPriority] = useState<"High" | "Medium" | "Low">("High");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3500);
  };

  const loadProjects = async () => {
    try {
      setIsLoading(true);
      const data = await apiGetProjects();
      if (Array.isArray(data) && data.length > 0) {
        const mapped: Project[] = data.map((item: BackendProjectItem) => ({
          id: item.project_key || `p${item.id}`,
          name: item.name,
          client: item.client,
          location: item.location || "United Arab Emirates",
          code: item.code,
          priority: (item.priority || "High") as "High" | "Medium" | "Low",
          priorityLevel: (item.priority_level || "high") as "high" | "medium" | "low",
          currentStage: item.current_stage || 1,
          totalStages: item.total_stages || 7,
          manager: item.manager || "Farhan Malik",
          supervisor: item.supervisor || "Site Supervisor",
          startDate: item.start_date || "15 Jan 2024",
          budget: item.budget || "",
          isCompleted: Boolean(item.is_completed),
          completedAt: item.completed_at,
        }));
        setProjects(mapped);
      }
    } catch (err) {
      console.warn("Backend fetch failed, checking cached state", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch live projects from FastAPI Backend on Mount
  useEffect(() => {
    loadProjects();
  }, []);

  // Close priority menu on click outside
  useEffect(() => {
    const handleGlobalClick = () => {
      setActivePriorityMenuId(null);
    };
    if (activePriorityMenuId) {
      window.addEventListener("click", handleGlobalClick);
    }
    return () => {
      window.removeEventListener("click", handleGlobalClick);
    };
  }, [activePriorityMenuId]);

  // Sync to local storage
  const saveProjects = (updated: Project[]) => {
    setProjects(updated);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {}
    }
  };

  // Update Priority in-place (Requires Admin Password)
  const handleUpdatePriority = (e: React.MouseEvent, projectId: string, priority: "High" | "Medium" | "Low") => {
    e.stopPropagation();
    setActivePriorityMenuId(null);
    setAdminAuthModal({
      isOpen: true,
      title: "Authorize Priority Change",
      description: `Enter Admin password to update project priority to ${priority}.`,
      actionLabel: "Update Priority",
      actionType: "warning",
      onSuccess: async () => {
        const updated = projects.map((p) => {
          if (p.id === projectId) {
            return {
              ...p,
              priority,
              priorityLevel: (priority === "High" ? "high" : priority === "Medium" ? "medium" : "low") as "high" | "medium" | "low",
            };
          }
          return p;
        });
        saveProjects(updated);
        showToast(`Priority updated to ${priority}`);

        try {
          await fetch(`${API_BASE_URL}/projects/${projectId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ priority }),
          });
        } catch {}
      },
    });
  };

  // Split Active vs Completed / Archived
  const activeProjectsList = useMemo(() => {
    return projects.filter((p) => !p.isCompleted);
  }, [projects]);

  const archivedProjectsList = useMemo(() => {
    return projects.filter((p) => Boolean(p.isCompleted));
  }, [projects]);

  // Filtered projects based on current tab, search query, and priority filter
  const displayedProjects = useMemo(() => {
    const list = activeTab === "active" ? activeProjectsList : archivedProjectsList;

    return list.filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.client.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.code.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesPriority =
        filterPriority === "all" ||
        (filterPriority === "high" && p.priorityLevel === "high") ||
        (filterPriority === "medium" && p.priorityLevel === "medium") ||
        (filterPriority === "low" && p.priorityLevel === "low");

      return matchesSearch && matchesPriority;
    });
  }, [activeTab, activeProjectsList, archivedProjectsList, searchQuery, filterPriority]);

  // Handle Create New Project
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    setIsSubmitting(true);
    const payload = {
      name: newProjectName.trim(),
      client: newClientName.trim() || "Al Reem Holdings Abu Dhabi",
      location: "United Arab Emirates",
      code: `PRJ-2024-00${projects.length + 1}`,
      priority: newPriority,
      priority_level: newPriority === "High" ? "high" : newPriority === "Medium" ? "medium" : "low",
      current_stage: 1,
      total_stages: 7,
      manager: "Admin",
      supervisor: "Site Supervisor",
      start_date: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
      budget: "",
      is_completed: false,
    };

    try {
      const created = await apiCreateProject(payload);
      const newProj: Project = {
        id: created.project_key || `p${created.id}`,
        name: created.name,
        client: created.client,
        location: created.location || "United Arab Emirates",
        code: created.code,
        priority: (created.priority || "High") as "High" | "Medium" | "Low",
        priorityLevel: (created.priority_level || "high") as "high" | "medium" | "low",
        currentStage: created.current_stage || 1,
        totalStages: created.total_stages || 7,
        manager: created.manager || "Admin",
        supervisor: created.supervisor || "Site Supervisor",
        startDate: created.start_date || payload.start_date,
        budget: created.budget || "",
        isCompleted: false,
      };

      setProjects((prev) => [newProj, ...prev]);
      setNewProjectName("");
      setNewClientName("");
      setNewPriority("High");
      setIsNewProjectOpen(false);
      setActiveTab("active");
      showToast(`Created new project "${newProj.name}" successfully!`);
    } catch (err: any) {
      console.error("Failed to create project in backend", err);
      showToast(err?.message || "Failed to create project");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Complete Project (Directly Requires Admin Password)
  const handleCompleteProject = (e: React.MouseEvent, proj: Project) => {
    e.stopPropagation();
    setAdminAuthModal({
      isOpen: true,
      title: "Authorize Project Archive",
      description: `Enter Admin password to mark "${proj.name}" as completed and move to archive.`,
      actionLabel: "Complete & Archive",
      actionType: "warning",
      onSuccess: async () => {
        const completedAtStr = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
        const updated = projects.map((p) => {
          if (p.id === proj.id) {
            return {
              ...p,
              isCompleted: true,
              currentStage: 7,
              completedAt: completedAtStr,
            };
          }
          return p;
        });
        saveProjects(updated);
        showToast(`Project "${proj.name}" marked as completed and moved to Archive!`);

        try {
          await fetch(`${API_BASE_URL}/projects/${proj.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_completed: true, completed_at: completedAtStr, current_stage: 7 }),
          });
          window.dispatchEvent(new CustomEvent("inventory_store_update"));
        } catch {}
      },
    });
  };

  // Restore Completed Project back to Active (Requires Admin Password)
  const handleRestoreProject = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    setAdminAuthModal({
      isOpen: true,
      title: "Authorize Project Reopening",
      description: "Enter Admin password to restore this project back to Active status.",
      actionLabel: "Reopen Project",
      actionType: "primary",
      onSuccess: async () => {
        const updated = projects.map((p) => {
          if (p.id === projectId) {
            return {
              ...p,
              isCompleted: false,
              currentStage: 6,
              completedAt: undefined,
            };
          }
          return p;
        });
        saveProjects(updated);
        showToast("Project restored to Active Projects!");

        try {
          await fetch(`${API_BASE_URL}/projects/${projectId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_completed: false, completed_at: null, current_stage: 6 }),
          });
          window.dispatchEvent(new CustomEvent("inventory_store_update"));
        } catch {}
      },
    });
  };

  return (
    <div className="space-y-6 sm:space-y-7 animate-in fade-in duration-200 pb-20 max-w-7xl mx-auto">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-5 right-5 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-2xl text-xs sm:text-sm font-medium border border-slate-800 flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <span className="text-emerald-400 font-bold">✓</span>
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Projects
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Fully track all your smart automation projects, lifecycle stages, and archive.
          </p>
        </div>

        {/* New Project Button (Admin, PM, Procurement) */}
        {!isSiteSupervisor() && (
          <button
            type="button"
            onClick={() => setIsNewProjectOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0c1033] hover:bg-[#151b54] text-white text-xs sm:text-sm font-semibold rounded-xl shadow-xs hover:shadow-md transition-all cursor-pointer self-start sm:self-auto active:scale-98"
          >
            <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>New Project</span>
          </button>
        )}
      </div>

      {/* Top 2 Interactive Cards: Active Projects & Archived / Completed Projects */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
        {/* Card 1: Active In-Progress Projects */}
        <div
          onClick={() => setActiveTab("active")}
          className={`rounded-2xl sm:rounded-3xl border p-5 sm:p-6 flex items-center justify-between cursor-pointer transition-all ${
            activeTab === "active"
              ? "bg-white border-indigo-600 shadow-md ring-2 ring-indigo-500/20"
              : "bg-white border-slate-200/90 shadow-xs hover:border-slate-300 hover:shadow-xs"
          }`}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100/70 flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <path d="M9 12h6M12 9v6" />
              </svg>
            </div>
            <div>
              <span className="text-xs font-bold text-slate-500 block mb-0.5 uppercase tracking-wider">
                Active Projects
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  {activeProjectsList.length}
                </span>
                <span className="text-xs text-slate-400 font-medium">in-progress</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold ${
                activeTab === "active"
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {activeTab === "active" ? "Viewing Active" : "View"}
            </span>
          </div>
        </div>

        {/* Card 2: Archive / Completed Projects */}
        <div
          onClick={() => setActiveTab("archived")}
          className={`rounded-2xl sm:rounded-3xl border p-5 sm:p-6 flex items-center justify-between cursor-pointer transition-all ${
            activeTab === "archived"
              ? "bg-white border-emerald-600 shadow-md ring-2 ring-emerald-500/20"
              : "bg-white border-slate-200/90 shadow-xs hover:border-slate-300 hover:shadow-xs"
          }`}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100/70 flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M21 8v13H3V8" />
                <path d="M1 3h22v5H1z" />
                <path d="M10 12h4" />
              </svg>
            </div>
            <div>
              <span className="text-xs font-bold text-slate-500 block mb-0.5 uppercase tracking-wider">
                Archive / Completed Projects
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold text-emerald-700 tracking-tight">
                  {archivedProjectsList.length}
                </span>
                <span className="text-xs text-slate-400 font-medium">completed sites</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold ${
                activeTab === "archived"
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {activeTab === "archived" ? "Viewing Archive" : "View Archive"}
            </span>
          </div>
        </div>
      </div>

      {/* Clean Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              activeTab === "active"
                ? "Search active projects, client, code..."
                : "Search archived / completed projects..."
            }
            className="w-full pl-11 pr-10 py-3 rounded-2xl bg-white border border-slate-200 text-xs sm:text-sm text-slate-800 placeholder-slate-400 shadow-2xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Priority Filter Pills: All, High, Medium, Low */}
        <div className="flex items-center gap-1.5 p-1 bg-white rounded-2xl border border-slate-200/80 shadow-2xs self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setFilterPriority("all")}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
              filterPriority === "all"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilterPriority("high")}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
              filterPriority === "high"
                ? "bg-rose-50 text-rose-700 border border-rose-200 shadow-xs"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            High
          </button>
          <button
            type="button"
            onClick={() => setFilterPriority("medium")}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
              filterPriority === "medium"
                ? "bg-amber-50 text-amber-700 border border-amber-200 shadow-xs"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Medium
          </button>
          <button
            type="button"
            onClick={() => setFilterPriority("low")}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
              filterPriority === "low"
                ? "bg-sky-50 text-sky-700 border border-sky-200 shadow-xs"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Low
          </button>
        </div>
      </div>

      {/* Projects List Section */}
      <div className="space-y-3">
        {/* Table Column Headings */}
        <div className="hidden md:grid grid-cols-12 px-5 py-2 text-xs font-semibold text-slate-400 tracking-wider">
          <div className="col-span-5 pl-1">Project Name</div>
          <div className="col-span-2 text-center">Priority (Click to Change)</div>
          <div className="col-span-3 text-center">Stages / Status</div>
          <div className="col-span-2 text-right pr-2">Action / State</div>
        </div>

        {/* Project Individual Cards */}
        {displayedProjects.length === 0 ? (
          <div className="rounded-2xl sm:rounded-3xl bg-white border border-slate-200/80 p-12 text-center shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400 text-xl">
              {activeTab === "active" ? "📁" : "📦"}
            </div>
            <div className="text-sm font-semibold text-slate-800">
              {activeTab === "active"
                ? "No active projects found"
                : "No archived / completed projects found"}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {activeTab === "active"
                ? "Click \"+ New Project\" at the top right to start a project."
                : "When projects reach completion (Stage 7), they will appear in this archive."}
            </div>
          </div>
        ) : (
          displayedProjects.map((proj) => (
            <div
              key={proj.id}
              onClick={() => router.push(`/projects/${proj.id}`)}
              className="rounded-2xl sm:rounded-3xl bg-white border border-slate-200/80 p-4 sm:p-5 shadow-xs hover:shadow-md hover:border-slate-300 transition-all cursor-pointer group flex flex-col md:grid md:grid-cols-12 md:items-center gap-4 md:gap-0 relative overflow-visible"
            >
              {/* Project Name & Client */}
              <div className="md:col-span-5 pl-1 pr-4">
                <div className="text-sm sm:text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors tracking-tight flex items-center gap-2">
                  <span>{proj.name}</span>
                  {proj.isCompleted && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      Completed
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-400 mt-0.5 font-medium flex items-center gap-2">
                  <span>{proj.client}</span>
                </div>
              </div>

              {/* In-Place Interactive Priority Dropdown Badge */}
              <div className="md:col-span-2 flex md:justify-center relative">
                <div className="relative inline-block text-left">
                  <button
                    type="button"
                    onClick={(e) => {
                      if (!isAdmin()) return;
                      e.stopPropagation();
                      setActivePriorityMenuId(activePriorityMenuId === proj.id ? null : proj.id);
                    }}
                    disabled={!isAdmin()}
                    title={isAdmin() ? "Click to change project priority" : `Priority: ${proj.priority}`}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition-all hover:shadow-xs ${
                      isAdmin() ? "cursor-pointer" : "cursor-default"
                    } ${
                      proj.priorityLevel === "high"
                        ? "text-red-700 bg-red-50/90 hover:bg-red-100 border-red-200/80"
                        : proj.priorityLevel === "medium"
                        ? "text-amber-700 bg-amber-50/90 hover:bg-amber-100 border-amber-200/80"
                        : "text-sky-700 bg-sky-50/90 hover:bg-sky-100 border-sky-200/80"
                    }`}
                  >
                    <span>{proj.priority}</span>
                    {isAdmin() && (
                      <svg
                        className={`w-3 h-3 opacity-60 transition-transform ${
                          activePriorityMenuId === proj.id ? "rotate-180" : ""
                        }`}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    )}
                  </button>

                  {/* Priority Dropdown Menu */}
                  {activePriorityMenuId === proj.id && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute z-50 left-1/2 -translate-x-1/2 top-full mt-1.5 w-32 bg-white rounded-xl shadow-xl border border-slate-200 p-1 space-y-0.5 animate-in fade-in-50 zoom-in-95 duration-150"
                    >
                      <button
                        type="button"
                        onClick={(e) => handleUpdatePriority(e, proj.id, "High")}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between cursor-pointer transition-colors ${
                          proj.priority === "High"
                            ? "bg-red-50 text-red-700 font-bold"
                            : "hover:bg-slate-50 text-slate-700"
                        }`}
                      >
                        <span>High</span>
                        {proj.priority === "High" && <span className="text-red-600 font-bold">✓</span>}
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleUpdatePriority(e, proj.id, "Medium")}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between cursor-pointer transition-colors ${
                          proj.priority === "Medium"
                            ? "bg-amber-50 text-amber-700 font-bold"
                            : "hover:bg-slate-50 text-slate-700"
                        }`}
                      >
                        <span>Medium</span>
                        {proj.priority === "Medium" && <span className="text-amber-600 font-bold">✓</span>}
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleUpdatePriority(e, proj.id, "Low")}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between cursor-pointer transition-colors ${
                          proj.priority === "Low"
                            ? "bg-sky-50 text-sky-700 font-bold"
                            : "hover:bg-slate-50 text-slate-700"
                        }`}
                      >
                        <span>Low</span>
                        {proj.priority === "Low" && <span className="text-sky-600 font-bold">✓</span>}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* 7-Step Connected Stage Stepper */}
              <div className="md:col-span-3 flex items-center justify-center">
                {proj.isCompleted ? (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-xs font-bold">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span>100% Handed Over & Signed Off</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center w-full max-w-[220px]">
                    {STAGE_DEFINITIONS.map((stage, idx) => {
                      const isCompleted = stage.step < proj.currentStage;
                      const isCurrent = stage.step === proj.currentStage;

                      return (
                        <React.Fragment key={stage.step}>
                          {/* Stage Circle Node */}
                          <div
                            className="relative group/dot cursor-pointer"
                            onMouseEnter={() => setHoveredStage({ projectId: proj.id, stage: stage.step })}
                            onMouseLeave={() => setHoveredStage(null)}
                          >
                            <div
                              className={`w-4 h-4 rounded-full flex items-center justify-center transition-all duration-200 ${
                                isCompleted
                                  ? "bg-emerald-500 text-white shadow-2xs"
                                  : isCurrent
                                  ? "bg-amber-400 text-white ring-3 ring-amber-100 shadow-2xs animate-pulse"
                                  : "bg-white border-2 border-slate-300"
                              }`}
                            />

                            {/* Hover Tooltip showing stage name */}
                            {hoveredStage?.projectId === proj.id && hoveredStage?.stage === stage.step && (
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 bg-slate-900 text-white text-[10px] font-medium rounded-lg shadow-lg whitespace-nowrap z-30 pointer-events-none">
                                Phase {stage.step}: {stage.name}
                                <span className="block text-[9px] text-slate-400">
                                  {isCompleted ? "Completed" : isCurrent ? "In Progress" : "Pending"}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Connecting Line between nodes */}
                          {idx < STAGE_DEFINITIONS.length - 1 && (
                            <div
                              className={`flex-1 h-0.5 mx-1 transition-colors duration-200 ${
                                stage.step < proj.currentStage ? "bg-emerald-400" : "bg-slate-300"
                              }`}
                            />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Action Column: Complete with Confirmation Popup / Reopen */}
              <div className="md:col-span-2 flex items-center justify-end gap-2 pr-2">
                {isAdmin() && (
                  !proj.isCompleted ? (
                    <button
                      type="button"
                      onClick={(e) => handleCompleteProject(e, proj)}
                      title="Mark project as completed and move to archive"
                      className="px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 rounded-lg transition-colors cursor-pointer"
                    >
                      Complete ✓
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => handleRestoreProject(e, proj.id)}
                      title="Restore project back to active"
                      className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                    >
                      Reopen ↺
                    </button>
                  )
                )}

                <div className="w-8 h-8 rounded-lg text-slate-400 group-hover:text-indigo-600 group-hover:bg-indigo-50 flex items-center justify-center transition-all">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* New Project Modal (No Target Handover Date, Clean High/Medium/Low Priority) */}
      {isNewProjectOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setIsNewProjectOpen(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full p-6 sm:p-7 space-y-5 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Create New Project</h3>
                <p className="text-xs text-slate-500 mt-0.5">Initialize a new smart automation site</p>
              </div>
              <button
                type="button"
                onClick={() => setIsNewProjectOpen(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Project Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="e.g. Marina Horizon Villa - Smart Automation"
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Client Name <span className="text-slate-400 font-normal text-[11px]">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder="e.g. Al Reem Holdings Abu Dhabi"
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Priority <span className="text-rose-500">*</span>
                </label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50/50 cursor-pointer"
                >
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNewProjectOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#0c1033] hover:bg-[#151b54] rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  Create Project
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



