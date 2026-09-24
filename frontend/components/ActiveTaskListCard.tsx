"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { AlertWarningIcon } from "@/assets/icons";
import {
  TaskItem,
  TaskStatus,
  getStoredTasks,
  fetchTasksFromBackend,
  createTaskInBackend,
  updateTaskStatusInBackend,
  isTaskAssignedToYou,
} from "@/lib/taskStore";
import { getStoredUsers, fetchUsersFromBackend, UserItem } from "@/lib/usersStore";
import { apiGetProjects, BackendProjectItem } from "@/lib/api";

type FilterTab = "all" | "assigned_to_me";

export function ActiveTaskListCard() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [projects, setProjects] = useState<BackendProjectItem[]>([]);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [loading, setLoading] = useState(true);

  // Add Task Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newRaisedTo, setNewRaisedTo] = useState("");
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);

  const [selectedProjectKey, setSelectedProjectKey] = useState("");
  const [projectSearchTerm, setProjectSearchTerm] = useState("");
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);

  const [newPriority, setNewPriority] = useState<"low" | "medium" | "high">("medium");
  const [newNotice, setNewNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [toastType, setToastType] = useState<"success" | "error">("success");

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToastMsg(msg);
    setToastType(type);
    setTimeout(() => setToastMsg(""), 3500);
  };

  // Load all tasks, users, and active projects dynamically from backend
  const loadData = useCallback(async () => {
    try {
      const [tasksRes, usersRes, projectsRes] = await Promise.allSettled([
        fetchTasksFromBackend("all"),
        fetchUsersFromBackend(),
        apiGetProjects(),
      ]);

      if (tasksRes.status === "fulfilled") {
        setTasks(tasksRes.value.items);
      } else {
        setTasks(getStoredTasks());
      }

      if (usersRes.status === "fulfilled" && usersRes.value?.users) {
        setUsers(usersRes.value.users);
      } else {
        setUsers(getStoredUsers());
      }

      if (projectsRes.status === "fulfilled" && Array.isArray(projectsRes.value)) {
        // ONLY ACTIVE PROJECTS as requested
        setProjects(projectsRes.value.filter((p) => !p.is_completed));
      }
    } catch (err) {
      console.error("Failed to load task list data:", err);
      setTasks(getStoredTasks());
      setUsers(getStoredUsers());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    const handleTaskUpdate = () => {
      setTasks(getStoredTasks());
    };

    const handleUsersUpdate = () => {
      setUsers(getStoredUsers());
    };

    window.addEventListener("task_store_update", handleTaskUpdate);
    window.addEventListener("users_store_update", handleUsersUpdate);

    return () => {
      window.removeEventListener("task_store_update", handleTaskUpdate);
      window.removeEventListener("users_store_update", handleUsersUpdate);
    };
  }, [loadData]);

  // Filtered users for searchable dropdown
  const filteredUsers = useMemo(() => {
    const defaultOptions = [{ id: "self", name: "Admin (You)", role: "Current User" }];
    const all = [
      ...defaultOptions,
      ...users.map((u) => ({ id: u.id, name: u.name, role: u.role })),
    ];
    if (!userSearchTerm.trim()) return all;
    const q = userSearchTerm.toLowerCase().trim();
    return all.filter(
      (u) => u.name.toLowerCase().includes(q) || u.role.toLowerCase().includes(q)
    );
  }, [users, userSearchTerm]);

  // Filtered active projects for searchable dropdown
  const filteredProjects = useMemo(() => {
    if (!projectSearchTerm.trim()) return projects;
    const q = projectSearchTerm.toLowerCase().trim();
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.code && p.code.toLowerCase().includes(q)) ||
        (p.client && p.client.toLowerCase().includes(q))
    );
  }, [projects, projectSearchTerm]);

  const selectedProjectObj = useMemo(() => {
    return projects.find((p) => p.project_key === selectedProjectKey);
  }, [projects, selectedProjectKey]);

  // Handle Status Update with strict permissions & rules
  const handleStatusChange = async (task: TaskItem, newStatusVal: TaskStatus) => {
    // 1. Permission rule
    if (!isTaskAssignedToYou(task)) {
      showToast("Only the assigned user can update this task's status", "error");
      return;
    }

    // 2. Non-reversibility rule
    if (task.status === "completed" && newStatusVal !== "completed") {
      showToast("Completed tasks cannot be reverted back to In Progress or Not Started", "error");
      return;
    }

    // 3. No-op if same status
    if (task.status === newStatusVal) return;

    try {
      const updated = await updateTaskStatusInBackend(task.id, newStatusVal);
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      if (selectedTask && selectedTask.id === task.id) {
        setSelectedTask(updated);
      }

      if (newStatusVal === "completed") {
        showToast(`Task completed! Logged under Task Execution Logs.`);
      } else {
        showToast(`Task status updated to ${newStatusVal.replace("_", " ")}`);
      }
    } catch (err: any) {
      console.error("Status update error:", err);
      showToast(err?.message || "Failed to update task status", "error");
    }
  };

  // Handle Create Task
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newTaskTitle.trim()) {
      showToast("Please enter a task title", "error");
      return;
    }

    const assignedUser = newRaisedTo.trim() || "Admin (You)";

    setIsSubmitting(true);
    try {
      const created = await createTaskInBackend({
        title: newTaskTitle.trim(),
        raised_to: assignedUser,
        project_key: selectedProjectKey || undefined,
        project_name: selectedProjectObj ? selectedProjectObj.name : undefined,
        priority: newPriority,
        note: newNotice.trim() || undefined,
      });

      setTasks((prev) => [created, ...prev.filter((t) => t.id !== created.id)]);

      // Reset form
      setNewTaskTitle("");
      setNewRaisedTo("");
      setUserSearchTerm("");
      setSelectedProjectKey("");
      setProjectSearchTerm("");
      setNewPriority("medium");
      setNewNotice("");
      setIsAddModalOpen(false);

      showToast("New task created and assigned successfully!");
    } catch (err: any) {
      console.error("Create task error:", err);
      showToast(err?.message || "Failed to create task", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Active Tasks Filter: ONLY Not Started & In Progress tasks appear in Overview
  const displayedTasks = useMemo(() => {
    let list = tasks.filter((task) => task.status !== "completed");
    if (filterTab === "assigned_to_me") {
      list = list.filter((task) => isTaskAssignedToYou(task));
    }
    return list;
  }, [tasks, filterTab]);

  return (
    <>
      {/* Floating Toast Notification */}
      {toastMsg && (
        <div
          className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 text-xs font-semibold rounded-2xl shadow-xl animate-in fade-in slide-in-from-top-4 duration-200 border ${
            toastType === "error"
              ? "bg-rose-950 text-rose-100 border-rose-800"
              : "bg-slate-900 text-white border-slate-800"
          }`}
        >
          <span className={toastType === "error" ? "text-rose-400 font-bold" : "text-emerald-400 font-bold"}>
            {toastType === "error" ? "✕" : "✓"}
          </span>
          <span>{toastMsg}</span>
        </div>
      )}

      <div className="flex flex-col h-full rounded-2xl bg-white border border-slate-200/80 p-5 sm:p-6 shadow-xs hover:shadow-md transition-all duration-300">
        {/* Card Header with Add Task Button */}
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-500 flex-shrink-0 border border-rose-100/80">
              <AlertWarningIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Active Task List
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Active tasks requiring resolution (Completed tasks move to Logs)
              </p>
            </div>
          </div>

          {/* Top Right Add Task Button */}
          <button
            type="button"
            onClick={() => {
              setNewRaisedTo("Admin (You)");
              setIsAddModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0c1033] hover:bg-[#151b54] active:scale-95 rounded-xl shadow-xs transition-all cursor-pointer whitespace-nowrap"
          >
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span>Add Task</span>
          </button>
        </div>

        {/* Filter Tabs Bar: All Active Tasks & Assigned to You */}
        <div className="flex items-center gap-2 mb-3.5 text-xs">
          {/* All Tasks */}
          <button
            type="button"
            onClick={() => setFilterTab("all")}
            className={`px-3.5 py-1.5 rounded-xl font-semibold transition-all cursor-pointer whitespace-nowrap ${
              filterTab === "all"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            All Active Tasks ({tasks.filter((t) => t.status !== "completed").length})
          </button>

          {/* Assigned to You */}
          <button
            type="button"
            onClick={() => setFilterTab("assigned_to_me")}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-semibold transition-all cursor-pointer whitespace-nowrap ${
              filterTab === "assigned_to_me"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-indigo-700 bg-indigo-50/80 hover:bg-indigo-100/90 border border-indigo-200/70"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                filterTab === "assigned_to_me" ? "bg-emerald-300" : "bg-indigo-500"
              } animate-pulse`}
            />
            <span>Assigned to You ({tasks.filter((t) => t.status !== "completed" && isTaskAssignedToYou(t)).length})</span>
          </button>
        </div>

        {/* 100% Scrollable Container with Sticky Thead */}
        <div className="w-full border border-slate-200/80 rounded-2xl overflow-hidden bg-white shadow-2xs">
          <div className="max-h-[460px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 hover:scrollbar-thumb-slate-300 scrollbar-track-transparent">
            <table className="w-full table-fixed border-collapse">
              <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur-md shadow-2xs border-b border-slate-200/80">
                <tr className="text-xs font-semibold text-slate-500 tracking-wider">
                  <th className="py-3 pl-3 pr-1 font-semibold w-[20%] text-left">Task</th>
                  <th className="py-3 px-1 font-semibold w-[14%] text-center">Priority</th>
                  <th className="py-3 px-1 font-semibold w-[14%] text-center">Raised By</th>
                  <th className="py-3 px-1 font-semibold w-[18%] text-center">Raised To</th>
                  <th className="py-3 px-1 font-semibold w-[14%] text-center">Raised Date</th>
                  <th className="py-3 pr-3 pl-1 font-semibold w-[20%] text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {displayedTasks.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-xs text-slate-400">
                      {loading ? "Loading tasks..." : "No active tasks found matching your filter."}
                    </td>
                  </tr>
                ) : (
                  displayedTasks.map((task) => {
                    const isYourTask = isTaskAssignedToYou(task);
                    const isCompleted = task.status === "completed";

                    return (
                      <tr
                        key={task.id}
                        className={`transition-all group relative ${
                          isYourTask
                            ? "bg-gradient-to-r from-indigo-50/70 via-indigo-50/30 to-white hover:from-indigo-100/80 hover:via-indigo-50/50 border-l-4 border-l-indigo-600"
                            : "hover:bg-slate-50/80 border-l-4 border-l-transparent"
                        }`}
                      >
                        {/* Task Action - "Click here" modal trigger */}
                        <td className="py-3.5 pl-3 pr-1 text-left">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedTask(task)}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-all duration-150 cursor-pointer shadow-2xs hover:shadow-xs active:scale-95 whitespace-nowrap ${
                                isYourTask
                                  ? "text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 border border-indigo-600"
                                  : "text-indigo-600 bg-indigo-50/80 hover:bg-indigo-100/90 active:bg-indigo-200/80 border border-indigo-200/70"
                              }`}
                            >
                              <span>{task.taskLabel || "Click here"}</span>
                              <svg
                                className={`w-3 h-3 group-hover:translate-x-0.5 transition-transform flex-shrink-0 ${
                                  isYourTask ? "text-indigo-200" : "text-indigo-400"
                                }`}
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                              >
                                <path d="M5 12h14M12 5l7 7-7 7" />
                              </svg>
                            </button>

                            {/* Distinct "Assigned to You" Badge */}
                            {isYourTask && (
                              <span
                                title="This task is assigned to you"
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-100 text-[10px] font-bold shadow-2xs tracking-wide whitespace-nowrap"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                You
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Priority Column: High, Medium, Low */}
                        <td className="py-3.5 px-1 text-xs text-center whitespace-nowrap">
                          {task.priority === "high" ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200/80 shadow-2xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
                              High
                            </span>
                          ) : task.priority === "low" ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200/80 shadow-2xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                              Low
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/80 shadow-2xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              Medium
                            </span>
                          )}
                        </td>

                        {/* Raised By */}
                        <td className="py-3.5 px-1 text-xs text-center whitespace-nowrap">
                          <span className="text-slate-600 font-medium">{task.raisedBy}</span>
                        </td>

                        {/* Raised To - Distinct Highlight if assigned to You */}
                        <td className="py-3.5 px-1 text-xs text-center whitespace-nowrap">
                          {isYourTask ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-indigo-100/90 text-indigo-950 font-bold border border-indigo-200/90 shadow-2xs">
                              <span className="w-2 h-2 rounded-full bg-indigo-600 ring-2 ring-indigo-200" />
                              {task.raisedTo}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                              {task.raisedTo}
                            </span>
                          )}
                        </td>

                        {/* Task Raised Date */}
                        <td className="py-3.5 px-1 text-xs text-center whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200/70 font-medium text-slate-600 shadow-2xs">
                            <svg className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                              <line x1="16" y1="2" x2="16" y2="6" />
                              <line x1="8" y1="2" x2="8" y2="6" />
                              <line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                            <span>{task.taskRaisedDate}</span>
                          </span>
                        </td>

                        {/* Status Controls with Permissions & Locked Completed State */}
                        <td className="py-3.5 pr-3 pl-1 text-center">
                          <div className="flex items-center justify-center">
                            {isCompleted ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-bold text-xs border border-emerald-200 shadow-2xs">
                                <svg className="w-3.5 h-3.5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                                <span>Completed</span>
                              </span>
                            ) : isYourTask ? (
                              <div className="inline-flex items-center gap-1 p-0.5 bg-slate-50 rounded-lg border border-slate-200/60 shadow-2xs">
                                {/* Not started */}
                                <button
                                  type="button"
                                  onClick={() => handleStatusChange(task, "not_started")}
                                  className={`px-2 py-0.5 text-[10.5px] rounded-md transition-all whitespace-nowrap cursor-pointer ${
                                    task.status === "not_started"
                                      ? "bg-white text-slate-800 font-semibold shadow-xs border border-slate-200/80"
                                      : "text-slate-400 hover:text-slate-700 font-medium hover:bg-white/60 border border-transparent"
                                  }`}
                                >
                                  Not started
                                </button>

                                {/* In progress */}
                                <button
                                  type="button"
                                  onClick={() => handleStatusChange(task, "in_progress")}
                                  className={`px-2 py-0.5 text-[10.5px] rounded-md transition-all whitespace-nowrap cursor-pointer ${
                                    task.status === "in_progress"
                                      ? "bg-sky-50 text-sky-700 font-semibold shadow-xs border border-sky-200"
                                      : "text-slate-400 hover:text-slate-700 font-medium hover:bg-white/60 border border-transparent"
                                  }`}
                                >
                                  In progress
                                </button>

                                {/* Completed */}
                                <button
                                  type="button"
                                  onClick={() => handleStatusChange(task, "completed")}
                                  className={`px-2 py-0.5 text-[10.5px] rounded-md transition-all whitespace-nowrap cursor-pointer ${
                                    task.status === "completed"
                                      ? "bg-emerald-50 text-emerald-700 font-semibold shadow-xs border border-emerald-200"
                                      : "text-slate-400 hover:text-slate-700 font-medium hover:bg-white/60 border border-transparent"
                                  }`}
                                >
                                  Completed
                                </button>
                              </div>
                            ) : (
                              /* Not Assigned to You: Read-Only Status Badge */
                              <span
                                title="Only the assigned user can update this task"
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 text-slate-600 font-semibold text-[11px] border border-slate-200"
                              >
                                <span>{task.status === "in_progress" ? "In Progress" : "Not Started"}</span>
                              </span>
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
      </div>

      {/* =========================================================================
          MODAL 1: TASK DETAILS POP-UP ("Click here")
          Displays all dynamic data: Title, Project, Priority, Raised/Started/Completed dates, Note
          ========================================================================= */}
      {selectedTask && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setSelectedTask(null)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 max-w-lg w-full overflow-hidden p-6 sm:p-7 space-y-5 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-100">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200/80 text-[11px] font-mono font-bold text-slate-600">
                    Task #{selectedTask.id}
                  </span>

                  {/* Priority Badge */}
                  <span
                    className={`px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider ${
                      selectedTask.priority === "high"
                        ? "bg-rose-50 text-rose-700 border border-rose-200"
                        : selectedTask.priority === "medium"
                        ? "bg-amber-50 text-amber-800 border border-amber-200"
                        : "bg-slate-100 text-slate-700 border border-slate-200"
                    }`}
                  >
                    {selectedTask.priority} Priority
                  </span>

                  {/* Status Badge */}
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      selectedTask.status === "completed"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200/80"
                        : selectedTask.status === "in_progress"
                        ? "bg-sky-50 text-sky-700 border border-sky-200/80"
                        : "bg-slate-100 text-slate-700 border border-slate-200"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        selectedTask.status === "completed"
                          ? "bg-emerald-500 animate-pulse"
                          : selectedTask.status === "in_progress"
                          ? "bg-sky-500"
                          : "bg-slate-400"
                      }`}
                    />
                    {selectedTask.status === "completed"
                      ? "Completed"
                      : selectedTask.status === "in_progress"
                      ? "In Progress"
                      : "Not Started"}
                  </span>

                  {/* Assigned to You Indicator Badge */}
                  {isTaskAssignedToYou(selectedTask) && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-600 text-white shadow-2xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                      Assigned to You
                    </span>
                  )}
                </div>

                <h3 className="text-base font-bold text-slate-900 leading-snug tracking-tight">
                  Task Details
                </h3>
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => setSelectedTask(null)}
                className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer flex-shrink-0"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Title Section */}
            <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-0.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Title
              </span>
              <p className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                {selectedTask.taskName}
              </p>
            </div>

            {/* Project Linked (if any) */}
            {selectedTask.projectName && (
              <div className="p-3 rounded-2xl bg-indigo-50/60 border border-indigo-100 flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center flex-shrink-0 shadow-2xs text-xs font-bold">
                  PRJ
                </span>
                <div className="min-w-0">
                  <span className="text-[10px] font-bold text-indigo-900 uppercase tracking-wider block">
                    Linked Active Project
                  </span>
                  <span className="text-xs sm:text-sm font-semibold text-slate-900 truncate block">
                    {selectedTask.projectName}
                  </span>
                </div>
              </div>
            )}

            {/* Operational Notice / Note */}
            {selectedTask.randomMessage && (
              <div className="p-4 rounded-2xl bg-slate-50/90 border border-slate-200/80 border-l-4 border-l-indigo-500 space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                  <svg className="w-4 h-4 text-indigo-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Operational Note
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed pl-6">
                  {selectedTask.randomMessage}
                </p>
              </div>
            )}

            {/* 2x2 Metadata Grid: Raised By, Raised To, Raised Date, Started/Completed Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Raised By */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50/70 border border-slate-100">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <span className="text-[11px] font-medium text-slate-400 block">Raised By</span>
                  <span className="text-xs sm:text-sm font-semibold text-slate-800 truncate block">
                    {selectedTask.raisedBy}
                  </span>
                </div>
              </div>

              {/* Raised To */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50/70 border border-slate-100">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 11l-3-3m0 0l-3 3m3-3v8" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <span className="text-[11px] font-medium text-slate-400 block">Raised To</span>
                  <span className="text-xs sm:text-sm font-semibold text-slate-800 truncate flex items-center gap-1.5">
                    {selectedTask.raisedTo}
                    {isTaskAssignedToYou(selectedTask) && (
                      <span className="text-[10px] font-bold text-indigo-600 bg-indigo-100/90 px-1.5 py-0.2 rounded border border-indigo-200">
                        You
                      </span>
                    )}
                  </span>
                </div>
              </div>

              {/* Raised Date */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50/70 border border-slate-100">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <span className="text-[11px] font-medium text-slate-400 block">Raised Date</span>
                  <span className="text-xs sm:text-sm font-semibold text-slate-800 truncate block">
                    {selectedTask.taskRaisedDate}
                  </span>
                </div>
              </div>

              {/* Completed / Started Date */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50/70 border border-slate-100">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <span className="text-[11px] font-medium text-slate-400 block">
                    {selectedTask.status === "completed" ? "Completed Date" : "Started Date"}
                  </span>
                  <span className="text-xs sm:text-sm font-semibold text-slate-800 truncate block">
                    {selectedTask.status === "completed"
                      ? selectedTask.taskCompletedDate || selectedTask.taskRaisedDate
                      : selectedTask.taskStartedDate || "— Not Started"}
                  </span>
                </div>
              </div>
            </div>

            {/* Change Status Controls inside Pop-up */}
            <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-xs font-medium text-slate-400">Update Status:</span>
              {selectedTask.status === "completed" ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-50 text-emerald-700 font-bold text-xs border border-emerald-200">
                  ✓ Task Completed & Locked
                </span>
              ) : isTaskAssignedToYou(selectedTask) ? (
                <div className="inline-flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-xl">
                  <button
                    type="button"
                    onClick={() => handleStatusChange(selectedTask, "not_started")}
                    className={`px-3 py-1 text-xs rounded-lg transition-all cursor-pointer ${
                      selectedTask.status === "not_started"
                        ? "bg-white text-slate-900 font-bold shadow-xs"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Not started
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStatusChange(selectedTask, "in_progress")}
                    className={`px-3 py-1 text-xs rounded-lg transition-all cursor-pointer ${
                      selectedTask.status === "in_progress"
                        ? "bg-sky-500 text-white font-bold shadow-xs"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    In progress
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStatusChange(selectedTask, "completed")}
                    className="px-3 py-1 text-xs rounded-lg transition-all cursor-pointer text-slate-500 hover:text-slate-800 hover:bg-emerald-50 hover:text-emerald-700"
                  >
                    Completed
                  </button>
                </div>
              ) : (
                <span className="text-xs text-slate-500 font-medium">
                  Assigned user can update status
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: ADD TASK POP-UP MODAL
          Fields: Title (*), Raised To (Searchable), Project (Searchable Active), Priority, Note
          ========================================================================= */}
      {isAddModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => {
            setIsUserDropdownOpen(false);
            setIsProjectDropdownOpen(false);
            setIsAddModalOpen(false);
          }}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 max-w-lg w-full overflow-visible p-6 sm:p-7 space-y-5 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-100">
              <div className="space-y-0.5">
                <span className="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-100 text-[11px] font-bold text-indigo-700">
                  New Operational Task
                </span>
                <h3 className="text-base font-bold text-slate-900 tracking-tight">
                  Add New Task
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateTask} className="space-y-4">
              {/* 1. Title (Required) */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Smart HVAC Controller Wiring & Relay Calibration"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {/* 2. Raised To (Searchable Dropdown of all users) */}
              <div className="relative">
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Raised To (Select Assignee) <span className="text-rose-500">*</span>
                </label>
                <div
                  onClick={() => {
                    setIsUserDropdownOpen(!isUserDropdownOpen);
                    setIsProjectDropdownOpen(false);
                  }}
                  className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 text-slate-800 font-medium bg-white flex items-center justify-between cursor-pointer hover:border-slate-300"
                >
                  <span className="truncate">{newRaisedTo || "Select assignee..."}</span>
                  <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>

                {/* Dropdown Menu with Search */}
                {isUserDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-2xl shadow-xl border border-slate-200 p-2 z-50 space-y-1.5 animate-in fade-in zoom-in-95 duration-150">
                    <div className="relative">
                      <input
                        type="text"
                        autoFocus
                        placeholder="Search team member..."
                        value={userSearchTerm}
                        onChange={(e) => setUserSearchTerm(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                      <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                    </div>

                    <div className="max-h-44 overflow-y-auto space-y-0.5 scrollbar-thin">
                      {filteredUsers.map((u) => (
                        <div
                          key={u.id}
                          onClick={() => {
                            setNewRaisedTo(u.name);
                            setIsUserDropdownOpen(false);
                            setUserSearchTerm("");
                          }}
                          className={`px-3 py-2 rounded-xl text-xs flex items-center justify-between cursor-pointer transition-colors ${
                            newRaisedTo === u.name
                              ? "bg-indigo-50 text-indigo-900 font-bold"
                              : "hover:bg-slate-50 text-slate-700 font-medium"
                          }`}
                        >
                          <span>{u.name}</span>
                          <span className="text-[10.5px] text-slate-400">{u.role}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Project Selection (Searchable Dropdown of ONLY ACTIVE projects) */}
              <div className="relative">
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Active Project (Optional)
                </label>
                <div
                  onClick={() => {
                    setIsProjectDropdownOpen(!isProjectDropdownOpen);
                    setIsUserDropdownOpen(false);
                  }}
                  className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 text-slate-800 font-medium bg-white flex items-center justify-between cursor-pointer hover:border-slate-300"
                >
                  <span className="truncate">
                    {selectedProjectObj ? selectedProjectObj.name : "-- No Project / General Operational Task --"}
                  </span>
                  <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>

                {/* Dropdown Menu with Search */}
                {isProjectDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-2xl shadow-xl border border-slate-200 p-2 z-50 space-y-1.5 animate-in fade-in zoom-in-95 duration-150">
                    <div className="relative">
                      <input
                        type="text"
                        autoFocus
                        placeholder="Search active project..."
                        value={projectSearchTerm}
                        onChange={(e) => setProjectSearchTerm(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                      <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                    </div>

                    <div className="max-h-44 overflow-y-auto space-y-0.5 scrollbar-thin">
                      <div
                        onClick={() => {
                          setSelectedProjectKey("");
                          setIsProjectDropdownOpen(false);
                          setProjectSearchTerm("");
                        }}
                        className="px-3 py-2 rounded-xl text-xs text-slate-500 hover:bg-slate-50 cursor-pointer font-medium"
                      >
                        -- None / General Operational --
                      </div>
                      {filteredProjects.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => {
                            setSelectedProjectKey(p.project_key || "");
                            setIsProjectDropdownOpen(false);
                            setProjectSearchTerm("");
                          }}
                          className={`px-3 py-2 rounded-xl text-xs flex items-center justify-between cursor-pointer transition-colors ${
                            selectedProjectKey === p.project_key
                              ? "bg-indigo-50 text-indigo-900 font-bold"
                              : "hover:bg-slate-50 text-slate-700 font-medium"
                          }`}
                        >
                          <span className="truncate">{p.name}</span>
                          <span className="text-[10px] font-mono text-slate-400 ml-2">{p.code || "Active"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 4. Priority Selection (Low, Medium, High) */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Priority <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewPriority("low")}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      newPriority === "low"
                        ? "bg-slate-800 text-white border-slate-800 shadow-xs"
                        : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200"
                    }`}
                  >
                    Low
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewPriority("medium")}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      newPriority === "medium"
                        ? "bg-amber-500 text-white border-amber-500 shadow-xs"
                        : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200"
                    }`}
                  >
                    Medium
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewPriority("high")}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      newPriority === "high"
                        ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                        : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200"
                    }`}
                  >
                    High
                  </button>
                </div>
              </div>

              {/* 5. Operational Note (Optional) */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Note / Operational Notice <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Enter specific instructions or operational scope for this task..."
                  value={newNotice}
                  onChange={(e) => setNewNotice(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 text-slate-800 font-normal focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2 text-xs font-semibold text-white bg-[#0c1033] hover:bg-[#151b54] rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-60"
                >
                  {isSubmitting ? "Creating..." : "Add Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
