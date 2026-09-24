"use client";

import { TaskItem } from "./taskStore";
import { API_BASE_URL, getStoredUser } from "./api";

export interface SystemLogItem {
  id: string;
  user: string;
  projectName: string;
  module: string;
  action: string;
  time: string;
}

export const INITIAL_SYSTEM_LOGS: SystemLogItem[] = [];

const STORAGE_KEY = "microservice_system_logs_v1";

export function getStoredSystemLogs(): SystemLogItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as SystemLogItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveStoredSystemLogs(logs: SystemLogItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
    window.dispatchEvent(new Event("logs_store_update"));
  } catch {
    // ignore
  }
}

/**
 * Fetch all persistent activity logs from FastAPI backend
 */
export async function fetchActivityLogsFromBackend(): Promise<SystemLogItem[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/logs?limit=500`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        const mapped: SystemLogItem[] = data.map((d: any) => ({
          id: String(d.id),
          user: d.user || "Admin",
          projectName: d.projectName || d.project_name || "—",
          module: d.module || "General",
          action: d.action || "",
          time: d.time || "",
        }));
        saveStoredSystemLogs(mapped);
        return mapped;
      }
    }
  } catch (err) {
    console.warn("Could not fetch activity logs from backend:", err);
  }
  return getStoredSystemLogs();
}

/**
 * Helper to record user/system activity log across any module.
 * Optimistically saves to local storage and syncs to backend database.
 */
export async function addActivityLog(log: {
  user?: string;
  projectName?: string;
  module: string;
  action: string;
  projectKey?: string;
}): Promise<void> {
  const currentUser = getStoredUser();
  const userName =
    log.user || currentUser?.full_name || currentUser?.username || "Admin";
  const projName =
    log.projectName && log.projectName.trim() && log.projectName.trim() !== "-"
      ? log.projectName.trim()
      : "—";

  const now = new Date();
  const timeFormatted =
    now.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }) +
    ", " +
    now.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

  const localEntry: SystemLogItem = {
    id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    user: userName,
    projectName: projName,
    module: log.module,
    action: log.action,
    time: timeFormatted,
  };

  // Optimistically prepend to stored system logs
  const existing = getStoredSystemLogs();
  const updated = [localEntry, ...existing];
  saveStoredSystemLogs(updated);

  // Send to backend database for permanent storage
  try {
    const res = await fetch(`${API_BASE_URL}/logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user: userName,
        project_name: projName,
        project_key: log.projectKey,
        module: log.module,
        action: log.action,
      }),
    });
    if (res.ok) {
      const saved = await res.json();
      if (saved?.id) {
        localEntry.id = String(saved.id);
        localEntry.time = saved.time || timeFormatted;
        saveStoredSystemLogs([
          localEntry,
          ...existing.filter((e) => e.id !== localEntry.id),
        ]);
      }
    }
  } catch (err) {
    console.warn("Could not persist activity log to server:", err);
  }
}

/**
 * Downloads a combined CSV file containing both System Activity Logs and Task Execution Logs
 */
export function exportAllLogsToCSV(
  systemLogs: SystemLogItem[],
  tasks: TaskItem[]
) {
  let csv = "=== SYSTEM & USER ACTION LOGS ===\n";
  csv += "User,Project Name,Module,Action,Time\n";
  systemLogs.forEach((log) => {
    csv += `"${log.user}","${log.projectName}","${log.module}","${log.action}","${log.time}"\n`;
  });

  csv += "\n=== TASK EXECUTION LOGS ===\n";
  csv +=
    "Task,Raised By,Raised To,Task Raised Date,Task Completed Date,Status\n";
  tasks.forEach((task) => {
    csv += `"${task.taskName}","${task.raisedBy}","${task.raisedTo}","${task.taskRaisedDate}","${
      task.taskCompletedDate || "-"
    }","${task.status}"\n`;
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute(
    "download",
    `system_logs_${new Date().toISOString().slice(0, 10)}.csv`
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
