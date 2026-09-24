"use client";

import {
  apiGetInvoices,
  apiGetInvoiceMetrics,
  apiCreateInvoice,
  apiUpdateInvoice,
  apiDeleteInvoice,
  getInvoiceDownloadUrl,
  getInvoicePreviewUrl,
  apiDownloadInvoiceFile,
  BackendInvoice,
  BackendInvoiceMetrics,
} from "./api";

export { getInvoiceDownloadUrl, getInvoicePreviewUrl, apiDownloadInvoiceFile };

export interface InvoiceItem {
  id: string;
  invoiceNumber: string;
  vendor?: string;
  date: string;
  amount: number;
  currency: string;
  fileName?: string;
  fileSize?: string;
  fileType?: string;
  hasFile: boolean;
  status: string;
  is_active: boolean;
  created_at: string;
}

export type { BackendInvoiceMetrics };

const STORAGE_KEY = "microservice_invoices_cache_v2";

export function getStoredInvoices(): InvoiceItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as InvoiceItem[];
  } catch {
    return [];
  }
}

export function saveStoredInvoices(items: InvoiceItem[], notify: boolean = true) {
  if (typeof window === "undefined") return;
  try {
    const str = JSON.stringify(items);
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing !== str) {
      localStorage.setItem(STORAGE_KEY, str);
      if (notify) {
        window.dispatchEvent(new Event("invoices_store_update"));
      }
    }
  } catch {
    // ignore
  }
}

export function clearStoredInvoices() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event("invoices_store_update"));
  } catch {
    // ignore
  }
}

function mapBackendInvoiceToItem(b: BackendInvoice): InvoiceItem {
  return {
    id: b.id,
    invoiceNumber: b.invoice_number,
    vendor: b.vendor || undefined,
    date: b.invoice_date,
    amount: b.total_amount,
    currency: b.currency || "AED",
    fileName: b.file_name || undefined,
    fileSize: b.file_size || undefined,
    fileType: b.file_type || undefined,
    hasFile: Boolean(b.has_file || b.file_name),
    status: b.status || "Verified",
    is_active: b.is_active,
    created_at: b.created_at,
  };
}

/**
 * Pure Backend: Fetch all invoices and metrics directly from FastAPI backend
 */
export async function fetchInvoicesFromBackend(
  search?: string,
  vendor?: string
): Promise<{
  items: InvoiceItem[];
  metrics: BackendInvoiceMetrics;
}> {
  const data = await apiGetInvoices(search, vendor);
  const mapped = (data.items || []).map(mapBackendInvoiceToItem);
  saveStoredInvoices(mapped, false);
  return {
    items: mapped,
    metrics: data.metrics,
  };
}

/**
 * Pure Backend: Fetch invoice metrics directly from FastAPI backend
 */
export async function fetchInvoiceMetricsFromBackend(): Promise<BackendInvoiceMetrics> {
  return await apiGetInvoiceMetrics();
}

/**
 * Pure Backend: Create new invoice with optional file upload via FastAPI backend
 */
export async function createInvoiceInBackend(formData: FormData): Promise<InvoiceItem> {
  const created = await apiCreateInvoice(formData);
  const mapped = mapBackendInvoiceToItem(created);
  const current = getStoredInvoices();
  saveStoredInvoices([mapped, ...current.filter((i) => i.id !== mapped.id)]);
  return mapped;
}

/**
 * Pure Backend: Update invoice via FastAPI backend
 */
export async function updateInvoiceInBackend(
  invoiceId: string,
  formData: FormData
): Promise<InvoiceItem> {
  const updated = await apiUpdateInvoice(invoiceId, formData);
  const mapped = mapBackendInvoiceToItem(updated);
  const current = getStoredInvoices();
  saveStoredInvoices(current.map((i) => (i.id === invoiceId ? mapped : i)));
  return mapped;
}

/**
 * Pure Backend: Delete invoice via FastAPI backend
 */
export async function deleteInvoiceFromBackend(invoiceId: string): Promise<void> {
  await apiDeleteInvoice(invoiceId);
  const current = getStoredInvoices();
  saveStoredInvoices(current.filter((i) => i.id !== invoiceId));
}
