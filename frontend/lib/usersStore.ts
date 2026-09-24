"use client";

import {
  apiGetUsers,
  apiGetUserMetrics,
  apiCreateUser,
  apiUpdateUser,
  apiDeleteUser,
  BackendUser,
  BackendUserMetrics,
} from "./api";

export type UserRole = "Admin" | "Project Manager" | "Procurement" | "Site Supervisor";

export interface UserItem {
  id: string;
  name: string;
  username: string;
  role: UserRole;
  email: string;
  password?: string;
  is_active?: boolean;
  is_env_admin?: boolean;
  created_at?: string;
}

export type { BackendUserMetrics };

const STORAGE_KEY = "microservice_users_cache_v2";

export function getStoredUsers(): UserItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as UserItem[];
  } catch {
    return [];
  }
}

export function saveStoredUsers(users: UserItem[], notify: boolean = true) {
  if (typeof window === "undefined") return;
  try {
    const str = JSON.stringify(users);
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing !== str) {
      localStorage.setItem(STORAGE_KEY, str);
      if (notify) {
        window.dispatchEvent(new Event("users_store_update"));
      }
    }
  } catch {
    // ignore
  }
}

export function clearStoredUsers() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event("users_store_update"));
  } catch {
    // ignore
  }
}

function mapBackendUserToUserItem(u: BackendUser): UserItem {
  return {
    id: u.id,
    name: u.name || u.username,
    username: u.username,
    role: u.role as UserRole,
    email: u.email,
    password: "••••••••",
    is_active: u.is_active,
    is_env_admin: u.is_env_admin,
    created_at: u.created_at,
  };
}

/**
 * Pure Backend: Fetch all users and metrics directly from FastAPI backend
 */
export async function fetchUsersFromBackend(): Promise<{
  users: UserItem[];
  metrics: BackendUserMetrics;
}> {
  const data = await apiGetUsers();
  const mapped = (data.users || []).map(mapBackendUserToUserItem);
  saveStoredUsers(mapped, false);
  return {
    users: mapped,
    metrics: data.metrics,
  };
}

/**
 * Pure Backend: Fetch user metrics directly from FastAPI backend
 */
export async function fetchUserMetricsFromBackend(): Promise<BackendUserMetrics> {
  return await apiGetUserMetrics();
}

/**
 * Pure Backend: Create new user via FastAPI backend
 */
export async function createUserInBackend(payload: {
  name: string;
  email: string;
  role: UserRole;
  password: string;
}): Promise<UserItem> {
  const created = await apiCreateUser({
    username: payload.name.trim(),
    name: payload.name.trim(),
    email: payload.email.trim(),
    role: payload.role,
    password: payload.password,
  });
  const mapped = mapBackendUserToUserItem(created);
  // refresh cache
  const current = getStoredUsers();
  saveStoredUsers([mapped, ...current.filter((u) => u.id !== mapped.id)]);
  return mapped;
}

/**
 * Pure Backend: Update user via FastAPI backend
 */
export async function updateUserInBackend(
  userId: string,
  payload: {
    name?: string;
    email?: string;
    role?: UserRole;
    password?: string;
  }
): Promise<UserItem> {
  const updated = await apiUpdateUser(userId, {
    username: payload.name?.trim(),
    name: payload.name?.trim(),
    email: payload.email?.trim(),
    role: payload.role,
    password: payload.password?.trim() || undefined,
  });
  const mapped = mapBackendUserToUserItem(updated);
  // refresh cache
  const current = getStoredUsers();
  saveStoredUsers(current.map((u) => (u.id === userId ? mapped : u)));
  return mapped;
}

/**
 * Pure Backend: Delete user via FastAPI backend
 */
export async function deleteUserFromBackend(userId: string): Promise<void> {
  await apiDeleteUser(userId);
  const current = getStoredUsers();
  saveStoredUsers(current.filter((u) => u.id !== userId));
}

// Backward-compatibility alias
export const syncUsersFromBackend = async (): Promise<UserItem[] | null> => {
  try {
    const res = await fetchUsersFromBackend();
    return res.users;
  } catch {
    return null;
  }
};
