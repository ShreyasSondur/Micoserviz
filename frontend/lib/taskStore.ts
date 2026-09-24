"use client";

import {
  apiGetTasks,
  apiCreateTask,
  apiUpdateTaskStatus,
  apiDeleteTask,
  BackendTaskItem,
  TaskCreatePayload,
  getStoredUser,
} from "./api";

export type TaskStatus = "not_started" | "in_progress" | "completed";

export interface TaskItem {
  id: number;
  taskLabel: string;
  taskName: string;
  raisedBy: string;
  raisedTo: string;
  projectKey?: string | null;
  projectName?: string | null;
  priority: "low" | "medium" | "high";
  note?: string | null;
  taskRaisedDate: string;
  taskStartedDate?: string | null;
  taskCompletedDate?: string | null;
  status: TaskStatus;
  randomMessage: string; // for backward compatibility with existing components
  isUserCreated?: boolean;
  isAssignedToYou?: boolean;
}

export const INITIAL_TASKS: TaskItem[] = [];

const STORAGE_KEY = "microservice_tasks_store_v3";

export function mapBackendTaskToItem(b: BackendTaskItem): TaskItem {
  const currentUser = getStoredUser();
  const assignedToMe = isTaskAssignedToYou({
    id: b.id,
    taskLabel: "Click here",
    taskName: b.title,
    raisedBy: b.raised_by,
    raisedTo: b.raised_to,
    priority: b.priority,
    status: b.status,
    taskRaisedDate: b.raised_date,
    randomMessage: b.note || "",
  });

  return {
    id: b.id,
    taskLabel: "Click here",
    taskName: b.title,
    raisedBy: b.raised_by,
    raisedTo: b.raised_to,
    projectKey: b.project_key,
    projectName: b.project_name,
    priority: b.priority,
    note: b.note,
    taskRaisedDate: b.raised_date,
    taskStartedDate: b.started_date,
    taskCompletedDate: b.completed_date,
    status: b.status,
    randomMessage: b.note || "Operational task initiated. Follow standard workflow and safety protocols.",
    isUserCreated: true,
    isAssignedToYou: assignedToMe,
  };
}

export function isTaskAssignedToYou(task: Partial<TaskItem>): boolean {
  if (task.isAssignedToYou) return true;
  if (!task.raisedTo) return false;
  
  const currentUser = getStoredUser();
  const currentUsername = currentUser?.username?.toLowerCase() || "";
  const currentEmail = currentUser?.email?.toLowerCase() || "";
  const role = currentUser?.role?.toLowerCase() || "";
  const target = task.raisedTo.toLowerCase();

  if (target.includes("(you)") || target === "you") return true;
  if (currentUsername && (target.includes(currentUsername) || currentUsername.includes(target))) return true;
  if (currentEmail && target.includes(currentEmail)) return true;
  if (role === "admin" && (target.includes("admin") || target.includes("isfaque"))) return true;

  return false;
}

export function getStoredTasks(): TaskItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TaskItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((t) => ({
      ...t,
      isAssignedToYou: isTaskAssignedToYou(t),
    }));
  } catch {
    return [];
  }
}

export function saveStoredTasks(tasks: TaskItem[], notify: boolean = true) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    if (notify) {
      window.dispatchEvent(new Event("task_store_update"));
    }
  } catch {
    // ignore
  }
}

/**
 * Fetch tasks from FastAPI Backend
 */
export async function fetchTasksFromBackend(
  statusFilter?: string,
  assignedTo?: string,
  search?: string
): Promise<{ items: TaskItem[]; totalCount: number; activeCount: number; completedCount: number }> {
  try {
    const data = await apiGetTasks(statusFilter, assignedTo, search);
    const mapped = (data.items || []).map(mapBackendTaskToItem);
    saveStoredTasks(mapped, false); // DO NOT DISPATCH ON READ TO PREVENT EVENT LOOP
    return {
      items: mapped,
      totalCount: data.total_count,
      activeCount: data.active_count,
      completedCount: data.completed_count,
    };
  } catch (err) {
    console.warn("fetchTasksFromBackend error, using local fallback:", err);
    const local = getStoredTasks();
    return {
      items: local,
      totalCount: local.length,
      activeCount: local.filter((t) => t.status !== "completed").length,
      completedCount: local.filter((t) => t.status === "completed").length,
    };
  }
}

/**
 * Create task in FastAPI Backend
 */
export async function createTaskInBackend(payload: TaskCreatePayload): Promise<TaskItem> {
  const data = await apiCreateTask(payload);
  const mapped = mapBackendTaskToItem(data);
  const current = getStoredTasks();
  saveStoredTasks([mapped, ...current.filter((t) => t.id !== mapped.id)]);
  return mapped;
}

/**
 * Update task status in FastAPI Backend
 */
export async function updateTaskStatusInBackend(
  taskId: number,
  status: TaskStatus
): Promise<TaskItem> {
  const data = await apiUpdateTaskStatus(taskId, status);
  const mapped = mapBackendTaskToItem(data);
  const current = getStoredTasks();
  const updated = current.map((t) => (t.id === mapped.id ? mapped : t));
  saveStoredTasks(updated);
  return mapped;
}

/**
 * Delete task from FastAPI Backend
 */
export async function deleteTaskFromBackend(taskId: number): Promise<void> {
  await apiDeleteTask(taskId);
  const current = getStoredTasks();
  saveStoredTasks(current.filter((t) => t.id !== taskId));
}
