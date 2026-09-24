"use client";

import {
  apiGetInventory,
  apiCreateInventoryItem,
  apiUpdateInventoryItem,
  apiDeleteInventoryItem,
  apiGetParts,
  apiCreatePart,
  apiDeletePart,
  apiGetPartDetails,
  BackendInventoryItem,
  BackendPartItem,
  PartDrillDownDetails,
  InventoryItemCreatePayload,
  InventoryItemUpdatePayload,
  PartCreatePayload,
} from "./api";
import { getInvoiceDownloadUrl, getInvoicePreviewUrl, apiDownloadInvoiceFile } from "./invoicesStore";

export type { BackendPartItem, InventoryItemUpdatePayload, PartDrillDownDetails };
export { apiGetPartDetails };

export interface InventoryItem {
  id: string;
  sn: number;
  vendor: string;
  product: string;
  brand: string;
  part: string;
  quantity: number;
  invoiceNumber: string;
  invoiceId?: string;
  invoiceFileName?: string;
  invoiceFileSize?: string;
  invoiceFileType?: string;
  hasInvoiceFile: boolean;
  availability: string;
  created_at: string;
  availableQuantity?: number;
  allocatedQuantity?: number;
  activeProjectsCount?: number;
}

export { getInvoiceDownloadUrl, getInvoicePreviewUrl, apiDownloadInvoiceFile };

const INVENTORY_STORAGE_KEY = "microservice_master_inventory_cache_v2";

export function getStoredInventory(): InventoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(INVENTORY_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as InventoryItem[];
  } catch {
    return [];
  }
}

export function saveStoredInventory(items: InventoryItem[], notify: boolean = true) {
  if (typeof window === "undefined") return;
  try {
    const str = JSON.stringify(items);
    const existing = localStorage.getItem(INVENTORY_STORAGE_KEY);
    if (existing !== str) {
      localStorage.setItem(INVENTORY_STORAGE_KEY, str);
      if (notify) {
        window.dispatchEvent(new Event("inventory_store_update"));
      }
    }
  } catch (err) {
    console.error("Failed to cache inventory:", err);
  }
}

export function clearStoredInventory() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(INVENTORY_STORAGE_KEY);
    window.dispatchEvent(new Event("inventory_store_update"));
  } catch {
    // ignore
  }
}

function mapBackendInventoryToItem(b: BackendInventoryItem, index: number): InventoryItem {
  return {
    id: b.id,
    sn: index + 1,
    vendor: b.vendor || "—",
    product: b.product_name,
    brand: b.brand,
    part: b.part_number,
    quantity: b.quantity,
    invoiceNumber: b.invoice_number,
    invoiceId: b.invoice_id,
    invoiceFileName: b.invoice_file_name,
    invoiceFileSize: b.invoice_file_size,
    invoiceFileType: b.invoice_file_type,
    hasInvoiceFile: b.has_invoice_file,
    availability: b.availability || "Available",
    created_at: b.created_at,
    availableQuantity: b.available_quantity,
    allocatedQuantity: b.allocated_quantity,
    activeProjectsCount: b.active_projects_count,
  };
}

/**
 * Pure Backend: Fetch master inventory from FastAPI
 */
export async function fetchInventoryFromBackend(search?: string): Promise<{ items: InventoryItem[]; total_count: number }> {
  const res = await apiGetInventory(search);
  const mapped = res.items.map((it, idx) => mapBackendInventoryToItem(it, idx));
  saveStoredInventory(mapped, false);
  return { items: mapped, total_count: res.total_count };
}

/**
 * Pure Backend: Create new master inventory item in FastAPI
 */
export async function createInventoryItemInBackend(
  payload: InventoryItemCreatePayload
): Promise<InventoryItem> {
  const created = await apiCreateInventoryItem(payload);
  const current = getStoredInventory();
  const mapped = mapBackendInventoryToItem(created, current.length);
  const updated = [mapped, ...current].map((it, idx) => ({ ...it, sn: idx + 1 }));
  saveStoredInventory(updated);
  return mapped;
}

/**
 * Pure Backend: Update master inventory item in FastAPI
 */
export async function updateInventoryItemInBackend(
  itemId: string,
  payload: InventoryItemUpdatePayload
): Promise<InventoryItem> {
  const updated = await apiUpdateInventoryItem(itemId, payload);
  const current = getStoredInventory();
  const mappedList = current.map((it) => (it.id === itemId ? mapBackendInventoryToItem(updated, it.sn - 1) : it));
  saveStoredInventory(mappedList);
  return mapBackendInventoryToItem(updated, 0);
}

/**
 * Pure Backend: Delete master inventory item in FastAPI
 */
export async function deleteInventoryItemFromBackend(itemId: string): Promise<void> {
  await apiDeleteInventoryItem(itemId);
  const current = getStoredInventory();
  const filtered = current.filter((it) => it.id !== itemId).map((it, idx) => ({ ...it, sn: idx + 1 }));
  saveStoredInventory(filtered);
}

const PARTS_STORAGE_KEY = "microservice_master_parts_cache_v1";

export function getStoredParts(): BackendPartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PARTS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as BackendPartItem[];
  } catch {
    return [];
  }
}

export function saveStoredParts(items: BackendPartItem[]) {
  if (typeof window === "undefined") return;
  try {
    const str = JSON.stringify(items);
    const existing = localStorage.getItem(PARTS_STORAGE_KEY);
    if (existing !== str) {
      localStorage.setItem(PARTS_STORAGE_KEY, str);
      window.dispatchEvent(new Event("parts_store_update"));
    }
  } catch (err) {
    console.error("Failed to cache master parts:", err);
  }
}

/**
 * Pure Backend: Fetch registered master parts from FastAPI
 */
export async function fetchPartsFromBackend(search?: string): Promise<{ items: BackendPartItem[]; total_count: number }> {
  const res = await apiGetParts(search);
  saveStoredParts(res.items);
  return res;
}

/**
 * Pure Backend: Register new part number in FastAPI
 */
export async function createPartInBackend(
  productName: string,
  partNumber: string,
  description?: string
): Promise<BackendPartItem> {
  const created = await apiCreatePart({
    product_name: productName.trim(),
    part_number: partNumber.trim().toUpperCase(),
    description: description ? description.trim() : "",
  });
  const current = getStoredParts();
  const exists = current.some((p) => p.id === created.id || p.part_number.toUpperCase() === created.part_number.toUpperCase());
  if (!exists) {
    const updated = [...current, created].sort((a, b) => a.part_number.localeCompare(b.part_number));
    saveStoredParts(updated);
  }
  return created;
}

/**
 * Pure Backend: Delete / deactivate a master part in FastAPI
 */
export async function deletePartInBackend(partIdOrNumber: string): Promise<void> {
  await apiDeletePart(partIdOrNumber);
  const current = getStoredParts();
  const filtered = current.filter(
    (p) => p.id !== partIdOrNumber && p.part_number.toUpperCase() !== partIdOrNumber.toUpperCase()
  );
  saveStoredParts(filtered);
}

