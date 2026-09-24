"use client";

import {
  apiGetManpower,
  apiGetManpowerMetrics,
  apiCreateManpower,
  apiUpdateManpower,
  apiDeleteManpower,
  BackendManpower,
  BackendManpowerMetrics,
} from "./api";

export type ManpowerType = "Internal" | "External";

export interface ManpowerItem {
  id: string;
  name: string;
  type: ManpowerType;
  dateAdded: string;
  is_active?: boolean;
}

export type { BackendManpowerMetrics };

const STORAGE_KEY = "microservice_manpower_store_v3";

export function getStoredManpower(): ManpowerItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ManpowerItem[];
  } catch {
    return [];
  }
}

export function saveStoredManpower(items: ManpowerItem[], notify: boolean = true) {
  if (typeof window === "undefined") return;
  try {
    const str = JSON.stringify(items);
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing !== str) {
      localStorage.setItem(STORAGE_KEY, str);
      if (notify) {
        window.dispatchEvent(new Event("manpower_store_update"));
      }
    }
  } catch {
    // ignore
  }
}

export function clearStoredManpower() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event("manpower_store_update"));
  } catch {
    // ignore
  }
}

function mapBackendManpowerToItem(m: BackendManpower): ManpowerItem {
  return {
    id: m.id,
    name: m.name,
    type: m.type as ManpowerType,
    dateAdded: m.date_added || (m.created_at ? m.created_at.split("T")[0] : new Date().toISOString().split("T")[0]),
    is_active: m.is_active,
  };
}

/**
 * Pure Backend: Fetch all manpower personnel and metrics directly from FastAPI backend
 */
export async function fetchManpowerFromBackend(
  search?: string,
  type?: string
): Promise<{
  items: ManpowerItem[];
  metrics: BackendManpowerMetrics;
}> {
  const data = await apiGetManpower(search, type);
  const mapped = (data.items || []).map(mapBackendManpowerToItem);
  saveStoredManpower(mapped, false);
  return {
    items: mapped,
    metrics: data.metrics,
  };
}

/**
 * Pure Backend: Fetch manpower metrics directly from FastAPI backend
 */
export async function fetchManpowerMetricsFromBackend(): Promise<BackendManpowerMetrics> {
  return await apiGetManpowerMetrics();
}

/**
 * Pure Backend: Create new manpower personnel via FastAPI backend
 */
export async function createManpowerInBackend(payload: {
  name: string;
  type: ManpowerType;
}): Promise<ManpowerItem> {
  const created = await apiCreateManpower({
    name: payload.name.trim(),
    type: payload.type,
  });
  const mapped = mapBackendManpowerToItem(created);
  const current = getStoredManpower();
  saveStoredManpower([mapped, ...current.filter((p) => p.id !== mapped.id)]);
  return mapped;
}

/**
 * Pure Backend: Update manpower personnel via FastAPI backend
 */
export async function updateManpowerInBackend(
  manpowerId: string,
  payload: {
    name?: string;
    type?: ManpowerType;
    is_active?: boolean;
  }
): Promise<ManpowerItem> {
  const updated = await apiUpdateManpower(manpowerId, {
    name: payload.name?.trim(),
    type: payload.type,
    is_active: payload.is_active,
  });
  const mapped = mapBackendManpowerToItem(updated);
  const current = getStoredManpower();
  saveStoredManpower(current.map((p) => (p.id === manpowerId ? mapped : p)));
  return mapped;
}

/**
 * Pure Backend: Delete manpower personnel via FastAPI backend
 */
export async function deleteManpowerFromBackend(manpowerId: string): Promise<void> {
  await apiDeleteManpower(manpowerId);
  const current = getStoredManpower();
  saveStoredManpower(current.filter((p) => p.id !== manpowerId));
}

// Backward-compatibility alias
export const syncManpowerFromBackend = async (): Promise<ManpowerItem[] | null> => {
  try {
    const res = await fetchManpowerFromBackend();
    return res.items;
  } catch {
    return null;
  }
};
