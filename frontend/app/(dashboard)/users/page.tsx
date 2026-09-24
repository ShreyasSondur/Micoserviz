"use client";

import { getUserRole, isAdmin } from "@/lib/api";
import { AdminPasswordModal } from "@/components";

import React, { useState, useEffect, useCallback } from "react";
import {
  UserItem,
  UserRole,
  BackendUserMetrics,
  getStoredUsers,
  fetchUsersFromBackend,
  createUserInBackend,
  updateUserInBackend,
  deleteUserFromBackend,
} from "@/lib/usersStore";
import { addActivityLog } from "@/lib/logsStore";

export default function UsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [metrics, setMetrics] = useState<BackendUserMetrics | null>(null);
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

  // Modal State
  const [userRole, setUserRole] = useState<string>("");
  useEffect(() => {
    const syncRole = () => setUserRole(getUserRole());
    syncRole();
    window.addEventListener("auth_user_change", syncRole);
    return () => window.removeEventListener("auth_user_change", syncRole);
  }, []);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);

  // Form State
  const [formName, setFormName] = useState("");
  const [formRole, setFormRole] = useState<UserRole>("Project Manager");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

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
      const res = await fetchUsersFromBackend();
      setUsers(res.users);
      setMetrics(res.metrics);
      if (isManualRefresh) {
        showToast("Users and metrics refreshed from backend!");
      }
    } catch (err: any) {
      console.error("Backend fetch error:", err);
      const msg = err?.message || "Failed to reach backend API. Ensure backend is running.";
      setError(msg);
      // Fallback to cached users if available
      const cached = getStoredUsers();
      if (cached.length > 0) {
        setUsers(cached);
      }
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadBackendData();

    const handleStorageUpdate = () => {
      setUsers(getStoredUsers());
    };

    window.addEventListener("users_store_update", handleStorageUpdate);
    return () => {
      window.removeEventListener("users_store_update", handleStorageUpdate);
    };
  }, [loadBackendData]);

  // Open modal for new user
  const handleOpenCreateModal = () => {
    setEditingUser(null);
    setFormName("");
    setFormRole("Project Manager");
    setFormEmail("");
    setFormPassword("");
    setShowPassword(false);
    setFormError("");
    setIsModalOpen(true);
  };

  // Open modal for editing user (Requires Admin Password)
  const handleOpenEditModal = (user: UserItem) => {
    setAdminAuthModal({
      isOpen: true,
      title: "Authorize User Edit",
      description: `Enter Admin password to edit account "${user.name || user.username}".`,
      actionLabel: "Unlock & Edit",
      actionType: "warning",
      onSuccess: () => {
        setEditingUser(user);
        setFormName(user.name || user.username);
        setFormRole(user.role);
        setFormEmail(user.email);
        setFormPassword("");
        setShowPassword(false);
        setFormError("");
        setIsModalOpen(true);
      },
    });
  };

  // Handle Save (Create or Edit) directly with Backend
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!formName.trim() || !formEmail.trim()) {
      setFormError("Please enter both User Name and Email.");
      return;
    }

    if (!editingUser && !formPassword.trim()) {
      setFormError("Password is required for new users.");
      return;
    }

    setSubmitting(true);

    try {
      if (editingUser) {
        // Backend Update
        await updateUserInBackend(editingUser.id, {
          name: formName.trim(),
          role: formRole,
          email: formEmail.trim(),
          password: formPassword.trim() || undefined,
        });
        showToast(`User ${formName.trim()} updated successfully!`);
        addActivityLog({
          module: "Users",
          projectName: "—",
          action: `Updated user account: ${formName.trim()} (${formRole})`,
        });
      } else {
        // Backend Create
        await createUserInBackend({
          name: formName.trim(),
          role: formRole,
          email: formEmail.trim(),
          password: formPassword.trim(),
        });
        showToast(`User ${formName.trim()} created successfully!`);
        addActivityLog({
          module: "Users",
          projectName: "—",
          action: `Created new user account: ${formName.trim()} (${formRole})`,
        });
      }

      setIsModalOpen(false);
      // Re-fetch fresh list & metrics from backend
      await loadBackendData();
    } catch (err: any) {
      console.error("Save error:", err);
      setFormError(err?.message || "Failed to save user in backend.");
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Delete User directly from Backend (Requires Admin Password)
  const handleDeleteUser = (id: string, name: string, isEnvAdmin?: boolean) => {
    if (isEnvAdmin) {
      alert("The root Administrator account is protected and cannot be deleted.");
      return;
    }

    setAdminAuthModal({
      isOpen: true,
      title: "Authorize User Deletion",
      description: `Enter Admin password to permanently delete user account "${name}".`,
      actionLabel: "Delete User",
      actionType: "danger",
      onSuccess: async () => {
        try {
          await deleteUserFromBackend(id);
          showToast(`User ${name} removed from backend.`);
          addActivityLog({
            module: "Users",
            projectName: "—",
            action: `Deleted user account: ${name}`,
          });
          await loadBackendData();
        } catch (err: any) {
          alert(err?.message || "Failed to delete user from backend.");
        }
      },
    });
  };

  // Metric counts directly from backend
  const displayTotal = metrics ? metrics.total : users.length;
  const displayProjectManagers = metrics
    ? metrics.project_managers ?? metrics.projectManagers ?? 0
    : users.filter((u) => u.role === "Project Manager").length;
  const displayProcurement = metrics
    ? metrics.procurement
    : users.filter((u) => u.role === "Procurement").length;
  const displaySiteSupervisors = metrics
    ? metrics.site_supervisors ?? metrics.siteSupervisors ?? 0
    : users.filter((u) => u.role === "Site Supervisor").length;

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
              Users
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Backend
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Pure backend user management, role assignments, and live database metrics.
          </p>
        </div>

        {/* Header Action Buttons */}
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

          {/* Create New User Button */}
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0c1033] hover:bg-[#151b54] text-white text-xs sm:text-sm font-semibold rounded-xl shadow-xs hover:shadow-md transition-all cursor-pointer active:scale-98"
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
            <span>Create New User</span>
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

      {/* Top 4 KPI Summary Cards (Live Pure Backend Metrics) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Card 1: Total Users */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 sm:p-6 flex items-center gap-4 hover:border-slate-300 transition-colors">
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 border border-purple-100/70 flex items-center justify-center flex-shrink-0">
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
              Total Users
            </span>
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {loading && !metrics ? "..." : displayTotal}
            </span>
          </div>
        </div>

        {/* Card 2: Project Manager */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 sm:p-6 flex items-center gap-4 hover:border-slate-300 transition-colors">
          <div className="w-12 h-12 rounded-xl bg-sky-50 text-sky-600 border border-sky-100/70 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-6 h-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
              <path d="M16 11l2 2 4-4" />
            </svg>
          </div>
          <div>
            <span className="text-xs font-bold text-slate-500 block mb-0.5">
              Project Manager
            </span>
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {loading && !metrics ? "..." : displayProjectManagers}
            </span>
          </div>
        </div>

        {/* Card 3: Procurement */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 sm:p-6 flex items-center gap-4 hover:border-slate-300 transition-colors">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 border border-amber-100/70 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-6 h-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div>
            <span className="text-xs font-bold text-slate-500 block mb-0.5">
              Procurement
            </span>
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {loading && !metrics ? "..." : displayProcurement}
            </span>
          </div>
        </div>

        {/* Card 4: Site Supervisor */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 sm:p-6 flex items-center gap-4 hover:border-slate-300 transition-colors">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100/70 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-6 h-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M9 11l3 3 7-7" />
            </svg>
          </div>
          <div>
            <span className="text-xs font-bold text-slate-500 block mb-0.5">
              Site Supervisor
            </span>
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {loading && !metrics ? "..." : displaySiteSupervisors}
            </span>
          </div>
        </div>
      </div>

      {/* All Users Card & Table */}
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-xs p-6 sm:p-7 space-y-4 overflow-hidden">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
              All Users
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Real-time user catalog fetched purely from backend database.
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600">
            {users.length} registered
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[650px]">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3.5 pl-2 pr-3 w-64">UserName</th>
                <th className="py-3.5 px-3 w-48">Role</th>
                <th className="py-3.5 px-3">Email</th>
                <th className="py-3.5 pr-2 pl-3 text-right w-28">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/80 text-xs sm:text-sm">
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-slate-400">
                    <div className="inline-flex items-center gap-2.5 text-slate-600 font-medium">
                      <svg className="w-5 h-5 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" />
                        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" />
                      </svg>
                      <span>Loading users purely from backend...</span>
                    </div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-slate-400">
                    <p className="font-semibold text-slate-700">No users found in database</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Click "+ Create New User" to add a team member to the backend
                    </p>
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr
                    key={user.id}
                    className="hover:bg-slate-50/70 transition-colors group"
                  >
                    {/* UserName with Avatar & Admin Badge */}
                    <td className="py-4 pl-2 pr-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#0c1033] text-white flex items-center justify-center flex-shrink-0 shadow-2xs font-bold text-xs uppercase">
                          {(user.name || user.username || "U").charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-xs sm:text-sm text-slate-900">
                              {user.name || user.username}
                            </span>
                            {user.is_env_admin && (
                              <span className="px-1.5 py-0.5 text-[9px] font-extrabold uppercase rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                                Root Admin
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400 block font-mono">
                            @{user.username}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="py-4 px-3 text-xs sm:text-sm font-medium">
                      <span
                        className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold ${
                          user.role === "Admin"
                            ? "bg-purple-50 text-purple-700 border border-purple-200/50"
                            : user.role === "Project Manager"
                            ? "bg-sky-50 text-sky-700 border border-sky-200/50"
                            : user.role === "Procurement"
                            ? "bg-amber-50 text-amber-700 border border-amber-200/50"
                            : "bg-emerald-50 text-emerald-700 border border-emerald-200/50"
                        }`}
                      >
                        {user.role}
                      </span>
                    </td>

                    {/* Email */}
                    <td className="py-4 px-3 text-xs sm:text-sm text-slate-600 font-normal">
                      {user.email}
                    </td>

                    {/* Action: Edit & Delete Buttons (Admin Only) */}
                    <td className="py-4 pr-2 pl-3 text-right">
                      {isAdmin() ? (
                        <div className="inline-flex items-center justify-end gap-1">
                          {/* Edit Button */}
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(user)}
                            title={`Edit ${user.name || user.username}`}
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
                            onClick={() =>
                              handleDeleteUser(user.id, user.name || user.username, user.is_env_admin)
                            }
                            disabled={user.is_env_admin}
                            title={
                              user.is_env_admin
                                ? "Root Admin cannot be deleted"
                                : `Delete ${user.name || user.username}`
                            }
                            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                              user.is_env_admin
                                ? "text-slate-300 cursor-not-allowed"
                                : "text-rose-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                            }`}
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
          MODAL: Create New User / Edit User (Direct Backend Integration)
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
                  {editingUser ? "Edit User in Backend" : "Create New User in Backend"}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {editingUser
                    ? "Modify user role, credentials and database permissions"
                    : "Add a new user directly into the backend database"}
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
            <form onSubmit={handleSaveUser} className="space-y-4">
              {/* UserName */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  UserName / Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. John Doe"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {/* Role */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Role <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as UserRole)}
                  className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
                >
                  <option value="Admin">Admin</option>
                  <option value="Project Manager">Project Manager</option>
                  <option value="Procurement">Procurement</option>
                  <option value="Site Supervisor">Site Supervisor</option>
                </select>
              </div>

              {/* Email */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Email <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. user@microservice.io"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {/* Password with Eye Visibility Toggle */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">
                    Password {editingUser ? "(Leave blank to keep current)" : <span className="text-rose-500">*</span>}
                  </label>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    {showPassword ? "Visible" : "Hidden"}
                  </span>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required={!editingUser}
                    placeholder={editingUser ? "••••••••" : "Enter password (e.g. Pass@2026)"}
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    className="w-full pl-3.5 pr-10 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 text-slate-800 font-mono tracking-tight focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    title={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    {showPassword ? (
                      <svg
                        className="w-4 h-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                        <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                        <line x1="2" y1="2" x2="22" y2="22" />
                      </svg>
                    ) : (
                      <svg
                        className="w-4 h-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
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
                  <span>{editingUser ? "Save to Backend" : "Create in Backend"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
