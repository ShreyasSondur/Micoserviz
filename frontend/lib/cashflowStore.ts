"use client";

import {
  apiGetPettyCash,
  apiCreatePettyCash,
  apiDeletePettyCash,
  apiGetCreditLoans,
  apiCreateCreditLoan,
  apiDeleteCreditLoan,
  apiGetCashflowSummary,
  apiDownloadInvoiceByNumber,
  apiDownloadPettyCashExcel,
  apiDownloadCreditLoansExcel,
  apiDownloadPettyDocument,
  apiDownloadLoanDocument,
  BackendPettyCashItem,
  BackendCreditLoanItem,
  BackendCashflowSummary,
} from "./api";

export type PettyCashType = "Cash In" | "Cash Out";

export interface PettyCashTransaction {
  id: string;
  type: PettyCashType;
  amount: number;
  invoiceNumber?: string;
  invoiceId?: string;
  description: string;
  date: string;
  fileName?: string;
}

export interface CreditLoanItem {
  id: string;
  description: string;
  amount: number;
  invoiceNumber?: string;
  invoiceId?: string;
  date: string;
  fileName?: string;
}

export { apiDownloadInvoiceByNumber, apiDownloadPettyCashExcel, apiDownloadCreditLoansExcel, apiDownloadPettyDocument, apiDownloadLoanDocument };

const PETTY_KEY = "microservice_petty_cash_store_v2";
const LOANS_KEY = "microservice_credit_loans_store_v2";

function mapBackendPettyToItem(b: BackendPettyCashItem): PettyCashTransaction {
  return {
    id: b.id,
    type: b.type as PettyCashType,
    amount: b.amount,
    invoiceNumber: b.invoice_number || undefined,
    invoiceId: b.invoice_id || undefined,
    description: b.description,
    date: b.date,
    fileName: b.file_name,
  };
}

function mapBackendLoanToItem(b: BackendCreditLoanItem): CreditLoanItem {
  return {
    id: b.id,
    description: b.description,
    amount: b.amount,
    invoiceNumber: b.invoice_number || undefined,
    invoiceId: b.invoice_id || undefined,
    date: b.date,
    fileName: b.file_name,
  };
}

export function getStoredPettyCash(): PettyCashTransaction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PETTY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PettyCashTransaction[];
  } catch {
    return [];
  }
}

export function saveStoredPettyCash(items: PettyCashTransaction[], notify: boolean = true) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PETTY_KEY, JSON.stringify(items));
    if (notify) {
      window.dispatchEvent(new Event("cashflow_store_update"));
    }
  } catch {
    // ignore
  }
}

export function getStoredCreditLoans(): CreditLoanItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOANS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CreditLoanItem[];
  } catch {
    return [];
  }
}

export function saveStoredCreditLoans(items: CreditLoanItem[], notify: boolean = true) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOANS_KEY, JSON.stringify(items));
    if (notify) {
      window.dispatchEvent(new Event("cashflow_store_update"));
    }
  } catch {
    // ignore
  }
}

/**
 * Pure Backend: Fetch Petty Cash from FastAPI backend
 */
export async function fetchPettyCashFromBackend(
  typeFilter?: string,
  search?: string,
  dateFilter?: string
): Promise<{ items: PettyCashTransaction[]; totalBalance: number; totalCashIn: number; totalCashOut: number }> {
  const data = await apiGetPettyCash(typeFilter, search, dateFilter);
  const mapped = (data.items || []).map(mapBackendPettyToItem);
  saveStoredPettyCash(mapped, false);
  return {
    items: mapped,
    totalBalance: data.total_balance,
    totalCashIn: data.total_cash_in,
    totalCashOut: data.total_cash_out,
  };
}

/**
 * Pure Backend: Create Petty Cash in FastAPI backend
 */
export async function createPettyCashInBackend(payload: {
  type: PettyCashType;
  amount: number;
  description: string;
  invoiceNumber?: string;
  invoiceId?: string;
  date?: string;
  file?: File | null;
}): Promise<PettyCashTransaction> {
  const fd = new FormData();
  fd.append("type", payload.type);
  fd.append("amount", payload.amount.toString());
  fd.append("description", payload.description);
  if (payload.invoiceNumber) fd.append("invoice_number", payload.invoiceNumber);
  if (payload.invoiceId) fd.append("invoice_id", payload.invoiceId);
  if (payload.date) fd.append("date", payload.date);
  if (payload.file) fd.append("file", payload.file);

  const created = await apiCreatePettyCash(fd);
  const mapped = mapBackendPettyToItem(created);
  const current = getStoredPettyCash();
  saveStoredPettyCash([mapped, ...current.filter((i) => i.id !== mapped.id)], true);
  return mapped;
}

/**
 * Pure Backend: Delete Petty Cash in FastAPI backend
 */
export async function deletePettyCashFromBackend(id: string): Promise<void> {
  await apiDeletePettyCash(id);
  const current = getStoredPettyCash();
  saveStoredPettyCash(current.filter((i) => i.id !== id), true);
}

/**
 * Pure Backend: Fetch Credit Loans from FastAPI backend
 */
export async function fetchCreditLoansFromBackend(
  search?: string,
  dateFilter?: string
): Promise<{ items: CreditLoanItem[]; totalAmount: number }> {
  const data = await apiGetCreditLoans(search, dateFilter);
  const mapped = (data.items || []).map(mapBackendLoanToItem);
  saveStoredCreditLoans(mapped, false);
  return {
    items: mapped,
    totalAmount: data.total_amount,
  };
}

/**
 * Pure Backend: Create Credit Loan in FastAPI backend
 */
export async function createCreditLoanInBackend(payload: {
  description: string;
  amount: number;
  invoiceNumber?: string;
  invoiceId?: string;
  date?: string;
  file?: File | null;
}): Promise<CreditLoanItem> {
  const fd = new FormData();
  fd.append("description", payload.description);
  fd.append("amount", payload.amount.toString());
  if (payload.invoiceNumber) fd.append("invoice_number", payload.invoiceNumber);
  if (payload.invoiceId) fd.append("invoice_id", payload.invoiceId);
  if (payload.date) fd.append("date", payload.date);
  if (payload.file) fd.append("file", payload.file);

  const created = await apiCreateCreditLoan(fd);
  const mapped = mapBackendLoanToItem(created);
  const current = getStoredCreditLoans();
  saveStoredCreditLoans([mapped, ...current.filter((i) => i.id !== mapped.id)]);
  return mapped;
}

/**
 * Pure Backend: Delete Credit Loan in FastAPI backend
 */
export async function deleteCreditLoanFromBackend(id: string): Promise<void> {
  await apiDeleteCreditLoan(id);
  const current = getStoredCreditLoans();
  saveStoredCreditLoans(current.filter((i) => i.id !== id));
}

/**
 * Pure Backend: Fetch Cashflow summary
 */
export async function fetchCashflowSummaryFromBackend(): Promise<BackendCashflowSummary> {
  return await apiGetCashflowSummary();
}

export function calculatePettyBalance(transactions: PettyCashTransaction[]): number {
  return transactions.reduce((acc, t) => {
    if (t.type === "Cash In") {
      return acc + t.amount;
    } else {
      return acc - t.amount;
    }
  }, 0);
}

export function calculateTotalCreditLoans(loans: CreditLoanItem[]): number {
  return loans.reduce((acc, l) => acc + l.amount, 0);
}
