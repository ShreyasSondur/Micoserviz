"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  SystemLogItem,
  getStoredSystemLogs,
  fetchActivityLogsFromBackend,
  exportAllLogsToCSV,
} from "@/lib/logsStore";
import {
  TaskItem,
  getStoredTasks,
  fetchTasksFromBackend,
  isTaskAssignedToYou,
} from "@/lib/taskStore";

export default function LogsPage() {
  const [systemLogs, setSystemLogs] = useState<SystemLogItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [systemSearch, setSystemSearch] = useState("");
  const [taskSearch, setTaskSearch] = useState("");
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [toastMsg, setToastMsg] = useState("");

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3000);
  };

  const loadLogs = useCallback(async () => {
    setSystemLogs(getStoredSystemLogs());
    try {
      const [backendLogs, res] = await Promise.all([
        fetchActivityLogsFromBackend(),
        fetchTasksFromBackend("all").catch(() => ({ items: getStoredTasks() })),
      ]);
      setSystemLogs(backendLogs);
      setTasks(res.items);
    } catch {
      setSystemLogs(getStoredSystemLogs());
      setTasks(getStoredTasks());
    }
  }, []);

  // Load from store & subscribe to cross-page updates
  useEffect(() => {
    loadLogs();

    const handleSystemLogsUpdate = () => {
      setSystemLogs(getStoredSystemLogs());
    };

    const handleTaskUpdate = () => {
      setTasks(getStoredTasks());
    };

    window.addEventListener("logs_store_update", handleSystemLogsUpdate);
    window.addEventListener("task_store_update", handleTaskUpdate);

    return () => {
      window.removeEventListener("logs_store_update", handleSystemLogsUpdate);
      window.removeEventListener("task_store_update", handleTaskUpdate);
    };
  }, [loadLogs]);

  // Filter System Logs
  const filteredSystemLogs = useMemo(() => {
    const q = systemSearch.toLowerCase().trim();
    if (!q) return systemLogs;
    return systemLogs.filter(
      (log) =>
        log.user.toLowerCase().includes(q) ||
        log.projectName.toLowerCase().includes(q) ||
        log.module.toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q) ||
        log.time.toLowerCase().includes(q)
    );
  }, [systemLogs, systemSearch]);

  // Filter Tasks (showing ONLY completed tasks as Action & Task Execution Logs)
  const filteredTasks = useMemo(() => {
    // ONLY completed tasks belong in the Execution Logs
    let list = tasks.filter((task) => task.status === "completed");
    const q = taskSearch.toLowerCase().trim();
    if (q) {
      list = list.filter(
        (task) =>
          task.taskName.toLowerCase().includes(q) ||
          task.raisedBy.toLowerCase().includes(q) ||
          task.raisedTo.toLowerCase().includes(q) ||
          task.taskRaisedDate.toLowerCase().includes(q) ||
          (task.taskCompletedDate && task.taskCompletedDate.toLowerCase().includes(q)) ||
          (task.projectName && task.projectName.toLowerCase().includes(q)) ||
          task.status.toLowerCase().includes(q) ||
          (task.priority && task.priority.toLowerCase().includes(q))
      );
    }
    return [...list].sort((a, b) => b.id - a.id);
  }, [tasks, taskSearch]);

  // Handle Export Logs to CSV (only export completed task logs)
  const handleExport = () => {
    try {
      const completedTasks = tasks.filter((t) => t.status === "completed");
      exportAllLogsToCSV(systemLogs, completedTasks);
      showToast("Completed logs exported successfully as CSV!");
    } catch {
      showToast("Failed to export logs.");
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-emerald-600 text-white text-xs font-semibold rounded-2xl shadow-xl animate-in fade-in slide-in-from-top-4 duration-200">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Header: Title & Export Logs Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Logs
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium">
            View all system activities and task execution records.
          </p>
        </div>

        {/* Export Logs Button */}
        <button
          type="button"
          onClick={handleExport}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0c1033] hover:bg-[#161d52] active:scale-95 text-white text-xs sm:text-sm font-semibold shadow-xs transition-all cursor-pointer w-fit"
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>Export Logs</span>
        </button>
      </div>

      {/* =========================================================================
          TOP CARD: System & User Action Logs (All Logs)
          ========================================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              All Activity Logs
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              System access, financial adjustments, and operational events
            </p>
          </div>

          {/* Search Input */}
          <div className="relative max-w-sm w-full sm:w-64">
            <svg
              className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Search by user, action..."
              value={systemSearch}
              onChange={(e) => setSystemSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm rounded-full border border-slate-200 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
          </div>
        </div>

        {/* System Logs Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[700px]">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-semibold text-slate-400 tracking-wider">
                <th className="pb-3.5 pl-2 font-semibold">User</th>
                <th className="pb-3.5 px-3 font-semibold text-center">Project Name</th>
                <th className="pb-3.5 px-3 font-semibold text-center">Module</th>
                <th className="pb-3.5 px-3 font-semibold text-center">Action</th>
                <th className="pb-3.5 pr-3 pl-3 font-semibold text-right">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
              {filteredSystemLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    No matching activity logs found.
                  </td>
                </tr>
              ) : (
                filteredSystemLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-slate-50/70 transition-colors group"
                  >
                    {/* User: Avatar + Name */}
                    <td className="py-4 pl-2 pr-3">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-[#1b1f48] text-white flex items-center justify-center flex-shrink-0 shadow-2xs">
                          <svg
                            className="w-3.5 h-3.5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                        </div>
                        <span className="font-bold text-xs sm:text-sm text-slate-900 tracking-tight">
                          {log.user}
                        </span>
                      </div>
                    </td>

                    {/* Project Name */}
                    <td className="py-4 px-3 text-center text-xs sm:text-sm">
                      {log.projectName && log.projectName !== "—" && log.projectName !== "-" ? (
                        <span className="font-semibold text-slate-900 bg-slate-100/90 px-2.5 py-1 rounded-lg border border-slate-200/70 inline-block max-w-[220px] truncate" title={log.projectName}>
                          {log.projectName}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-bold text-sm select-none">—</span>
                      )}
                    </td>

                    {/* Module */}
                    <td className="py-4 px-3 text-center text-xs sm:text-sm font-medium">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                        {log.module}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="py-4 px-3 text-center text-xs sm:text-sm font-medium text-slate-800">
                      {log.action}
                    </td>

                    {/* Time */}
                    <td className="py-4 pr-3 pl-3 text-right text-xs sm:text-sm font-normal text-slate-700 whitespace-nowrap">
                      {log.time}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =========================================================================
          BOTTOM CARD: Task Logs (Action / Active Task List Execution Records)
          Columns: Task | Raised By | Raised To | Task Raised Date | Task Completed Date | Status
          ========================================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Action & Task Execution Logs
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live records of operational task assignments and completed resolutions
            </p>
          </div>

          {/* Search Input */}
          <div className="relative max-w-sm w-full sm:w-64">
            <svg
              className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Search tasks, assignees..."
              value={taskSearch}
              onChange={(e) => setTaskSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm rounded-full border border-slate-200 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
          </div>
        </div>

        {/* Task Logs Table */}
        <div className="overflow-x-auto overflow-y-auto max-h-[460px] border border-slate-200/80 rounded-2xl scrollbar-thin scrollbar-thumb-slate-200 hover:scrollbar-thumb-slate-300 scrollbar-track-transparent">
          <table className="w-full text-left min-w-[820px] border-collapse">
            <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur-md shadow-2xs border-b border-slate-200/80">
              <tr className="text-[11px] font-semibold text-slate-500 tracking-wider">
                <th className="py-3 pl-3 font-semibold w-32">Task</th>
                <th className="py-3 px-3 font-semibold text-center w-28">Priority</th>
                <th className="py-3 px-3 font-semibold text-center">Raised By</th>
                <th className="py-3 px-3 font-semibold text-center">Raised To</th>
                <th className="py-3 px-3 font-semibold text-center">Task Raised Date</th>
                <th className="py-3 px-3 font-semibold text-center">Task Completed Date</th>
                <th className="py-3 pr-4 pl-3 font-semibold text-right w-28">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
              {filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No completed task execution logs found.
                  </td>
                </tr>
              ) : (
                filteredTasks.map((task) => {
                  const isYourTask = isTaskAssignedToYou(task);

                  return (
                    <tr
                      key={task.id}
                      className="bg-emerald-50/20 hover:bg-emerald-50/40 transition-all group relative"
                    >
                      {/* Task - Click here link button */}
                      <td className="py-4 pl-3 pr-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedTask(task)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-all cursor-pointer shadow-2xs hover:shadow-xs active:scale-95 whitespace-nowrap text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100"
                          >
                            <span>{task.taskLabel || "Click here"}</span>
                            <svg
                              className="w-3 h-3 group-hover:translate-x-0.5 transition-transform flex-shrink-0"
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
                              title="Assigned to You"
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-950 text-indigo-100 text-[9.5px] font-bold shadow-2xs tracking-wide"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              You
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Priority Column */}
                      <td className="py-4 px-3 text-center text-xs whitespace-nowrap">
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
                      <td className="py-4 px-3 text-center text-xs sm:text-sm font-semibold whitespace-nowrap">
                        <span className="text-slate-800">{task.raisedBy}</span>
                      </td>

                      {/* Raised To */}
                      <td className="py-4 px-3 text-center text-xs sm:text-sm font-medium whitespace-nowrap">
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
                      <td className="py-4 px-3 text-center text-xs font-medium text-slate-600 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-slate-50 border border-slate-200/70 font-medium text-slate-600 shadow-2xs">
                          <svg
                            className="w-3 h-3 text-indigo-500 flex-shrink-0"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                          </svg>
                          <span>{task.taskRaisedDate}</span>
                        </span>
                      </td>

                      {/* Task Completed Date */}
                      <td className="py-4 px-3 text-center text-xs font-medium text-slate-600 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-slate-50 border border-slate-200/70 font-medium text-slate-600 shadow-2xs">
                          <svg
                            className="w-3 h-3 text-emerald-600 flex-shrink-0"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          <span>{task.taskCompletedDate || task.taskRaisedDate}</span>
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-4 pr-3 pl-3 text-right whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg border bg-emerald-50 text-emerald-700 border-emerald-200/80 shadow-2xs">
                          <svg className="w-3 h-3 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          <span>Completed</span>
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Task Details Pop-up Modal */}
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
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200/80 text-[11px] font-mono font-bold text-slate-600">
                    Task #{selectedTask.id}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      selectedTask.status === "completed"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200/80"
                        : "bg-slate-100 text-slate-700 border border-slate-200"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        selectedTask.status === "completed" ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
                      }`}
                    />
                    {selectedTask.status === "completed" ? "Completed" : "In Progress"}
                  </span>
                  {isTaskAssignedToYou(selectedTask) && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-600 text-white shadow-2xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                      Assigned to You
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-slate-900 leading-snug tracking-tight">
                  Task Execution Details
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
                    Linked Project
                  </span>
                  <span className="text-xs sm:text-sm font-semibold text-slate-900 truncate block">
                    {selectedTask.projectName}
                  </span>
                </div>
              </div>
            )}

            {/* Operational Notice */}
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

            {/* 2x2 Metadata Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50/70 border border-slate-100">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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

              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50/70 border border-slate-100">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <span className="text-[11px] font-medium text-slate-400 block">Completed Date</span>
                  <span className="text-xs sm:text-sm font-semibold text-slate-800 truncate block">
                    {selectedTask.taskCompletedDate || (selectedTask.status === "completed" ? selectedTask.taskRaisedDate : "— In Progress")}
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedTask(null)}
                className="px-5 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
