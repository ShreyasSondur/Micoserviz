/**
 * Native direct API client for MicroService ERP
 * Connects frontend directly to FastAPI backend using dynamic environment variables.
 * No third-party network proxies or external dependencies.
 */

export const API_BASE_URL =
  (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1").replace(/\/+$/, "");

export const BACKEND_ROOT_URL =
  (process.env.NEXT_PUBLIC_BACKEND_URL || API_BASE_URL.replace(/\/api\/v1\/?$/, "")).replace(/\/+$/, "");

const TOKEN_KEY = "microservice_access_token";
const USER_KEY = "microservice_user_profile";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string, remember: boolean = true) {
  if (typeof window === "undefined") return;
  if (remember) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    sessionStorage.setItem(TOKEN_KEY, token);
  }
}

export function getStoredUser(): any | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setStoredUser(user: any, remember: boolean = true) {
  if (typeof window === "undefined") return;
  const str = JSON.stringify(user);
  const existing = remember ? localStorage.getItem(USER_KEY) : sessionStorage.getItem(USER_KEY);
  if (remember) {
    localStorage.setItem(USER_KEY, str);
  } else {
    sessionStorage.setItem(USER_KEY, str);
  }
  if (existing !== str) {
    window.dispatchEvent(new Event("auth_user_change"));
  }
}

export function clearStoredUser() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event("auth_user_change"));
}

export function clearStoredToken() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  clearStoredUser();
}

export function getUserRole(): string {
  const u = getStoredUser();
  if (u?.is_env_admin) return "Admin";
  return u?.role || "Admin";
}

export function isAdmin(): boolean {
  const role = getUserRole();
  return role === "Admin" || role === "Administrator";
}

export function isSiteSupervisor(): boolean {
  const role = getUserRole();
  return role === "Site Supervisor" || role === "SITE_SUPERVISOR";
}

export function isProjectManagerOrProcurement(): boolean {
  const role = getUserRole();
  return role === "Project Manager" || role === "Procurement";
}

export function canEditOrDelete(): boolean {
  return isAdmin();
}

export async function apiVerifyAdminPassword(password: string): Promise<boolean> {
  const token = getStoredToken();
  const res = await fetch(`${API_BASE_URL}/auth/verify-admin-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Incorrect admin password. Action denied.");
  }
  return true;
}


export interface BackendHealthResponse {
  status: string;
  project: string;
  database: string;
  version: string;
}

export interface LoginResponse {
  requires_otp: boolean;
  message?: string;
  access_token?: string;
  email?: string;
  dev_otp?: string;
  user?: {
    id: string;
    username: string;
    email: string;
    role: string;
    is_active: boolean;
    is_env_admin: boolean;
  };
}

export interface VerifyOTPResponse {
  access_token: string;
  token_type: string;
  user: {
    id: string;
    username: string;
    email: string;
    role: string;
    is_active: boolean;
  };
}

export interface ResendOTPResponse {
  message: string;
  dev_otp?: string;
}

/**
 * Perform health check against FastAPI backend
 */
export async function checkBackendHealth(): Promise<{ ok: boolean; data?: BackendHealthResponse; error?: string }> {
  try {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    // Allow up to 35 seconds for Render free tier spinning up from sleep
    const timeoutId = controller ? setTimeout(() => controller.abort(), 35000) : null;
    const res = await fetch(`${BACKEND_ROOT_URL}/health`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
      cache: "no-store",
      signal: controller?.signal,
    });
    if (timeoutId) clearTimeout(timeoutId);

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}: ${res.statusText}` };
    }
    const data = await res.json();
    return { ok: true, data };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to reach backend" };
  }
}

/**
 * Call backend login endpoint
 */
export async function apiLogin(usernameOrEmail: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      username_or_email: usernameOrEmail,
      password: password,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.detail || "Authentication failed");
  }

  if (data.access_token) {
    setStoredToken(data.access_token);
  }
  if (data.user) {
    setStoredUser(data.user);
  }

  return data;
}

/**
 * Verify 6-digit OTP code against backend
 */
export async function apiVerifyOTP(email: string, otpCode: string): Promise<VerifyOTPResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      email: email,
      otp_code: otpCode,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.detail || "OTP verification failed");
  }

  if (data.access_token) {
    setStoredToken(data.access_token);
  }
  if (data.user) {
    setStoredUser(data.user);
  }

  return data;
}

/**
 * Resend OTP code
 */
export async function apiResendOTP(email: string): Promise<ResendOTPResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/resend-otp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({ email }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.detail || "Failed to resend verification code");
  }

  return data;
}

/**
 * Get currently authenticated profile from backend
 */
export async function apiGetMe(): Promise<any> {
  const token = getStoredToken();
  if (!token) throw new Error("No active session token");

  const data = await fetchBackendJson<any>(`${API_BASE_URL}/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (typeof window !== "undefined" && data) {
    const raw = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
    const str = JSON.stringify(data);
    if (raw !== str) {
      if (localStorage.getItem(TOKEN_KEY)) {
        localStorage.setItem(USER_KEY, str);
      } else {
        sessionStorage.setItem(USER_KEY, str);
      }
    }
  }
  return data;
}

export interface BackendUser {
  id: string;
  username: string;
  name?: string;
  email: string;
  role: string;
  is_active: boolean;
  is_env_admin: boolean;
  created_at: string;
}

export interface BackendUserMetrics {
  total: number;
  project_managers: number;
  procurement: number;
  site_supervisors: number;
  admins: number;
  projectManagers?: number;
  siteSupervisors?: number;
}

export interface BackendUserListResponse {
  users: BackendUser[];
  metrics: BackendUserMetrics;
}

/**
 * Helper to build auth headers
 */
function getAuthHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    "Accept": "application/json",
    "Content-Type": "application/json",
  };
  const token = getStoredToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Universal backend request helper with clean error messages
 */
async function fetchBackendJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  let res: Response;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    res = await fetch(url, {
      ...options,
      signal: options.signal || controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err?.name === "AbortError") {
      throw new Error(`Request timed out connecting to ${url}`);
    }
    const errorMsg = err?.message || String(err);
    if (
      err?.name === "TypeError" ||
      errorMsg.includes("Failed to fetch") ||
      errorMsg.includes("NetworkError") ||
      errorMsg.includes("fetch")
    ) {
      throw new Error(
        `Unable to connect to backend server at ${API_BASE_URL}. Please ensure the FastAPI backend is running.`
      );
    }
    throw new Error(`Network error: ${errorMsg}`);
  } finally {
    clearTimeout(timeoutId);
  }

  let data: any = null;
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  } else {
    const text = await res.text().catch(() => "");
    if (text) data = { detail: text };
  }

  if (!res.ok) {
    const errorDetail =
      data?.detail ||
      data?.message ||
      (typeof data === "string" ? data : `Request failed with status ${res.status}`);
    const message = Array.isArray(errorDetail)
      ? errorDetail.map((e: any) => e.msg || JSON.stringify(e)).join(", ")
      : errorDetail;
    const errorObj = new Error(message);
    (errorObj as any).status = res.status;
    throw errorObj;
  }

  return data as T;
}

/**
 * Fetch all users and metrics purely from backend
 */
export async function apiGetUsers(): Promise<BackendUserListResponse> {
  return await fetchBackendJson<BackendUserListResponse>(`${API_BASE_URL}/users`, {
    method: "GET",
    headers: getAuthHeaders(),
    cache: "no-store",
  });
}

/**
 * Fetch user metrics purely from backend
 */
export async function apiGetUserMetrics(): Promise<BackendUserMetrics> {
  return await fetchBackendJson<BackendUserMetrics>(`${API_BASE_URL}/users/metrics`, {
    method: "GET",
    headers: getAuthHeaders(),
    cache: "no-store",
  });
}

/**
 * Create a new user in backend
 */
export async function apiCreateUser(payload: {
  username?: string;
  name?: string;
  email: string;
  role: string;
  password: string;
}): Promise<BackendUser> {
  return await fetchBackendJson<BackendUser>(`${API_BASE_URL}/users`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
}

/**
 * Update user in backend
 */
export async function apiUpdateUser(
  userId: string,
  payload: {
    username?: string;
    name?: string;
    email?: string;
    role?: string;
    password?: string;
  }
): Promise<BackendUser> {
  return await fetchBackendJson<BackendUser>(`${API_BASE_URL}/users/${userId}`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
}

/**
 * Delete user in backend
 */
export async function apiDeleteUser(userId: string): Promise<{ message: string; id: string }> {
  return await fetchBackendJson<{ message: string; id: string }>(`${API_BASE_URL}/users/${userId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
}

export interface BackendManpower {
  id: string;
  name: string;
  type: "Internal" | "External";
  is_active: boolean;
  created_at: string;
  date_added?: string;
}

export interface BackendManpowerMetrics {
  total: number;
  internal: number;
  external: number;
}

export interface BackendManpowerListResponse {
  items: BackendManpower[];
  metrics: BackendManpowerMetrics;
}

export interface BackendManpowerAttendanceResponse {
  workers: {
    id: string;
    name: string;
    type: "Internal" | "External";
    created_at?: string | null;
  }[];
  attendance_map: Record<string, Record<string, number>>;
  distinct_dates_worked: string[];
}

/**
 * Fetch manpower attendance timesheet grid from backend
 */
export async function apiGetManpowerAttendance(params?: {
  start_date?: string;
  end_date?: string;
  type?: string;
  search?: string;
}): Promise<BackendManpowerAttendanceResponse> {
  const query = new URLSearchParams();
  if (params?.start_date && params.start_date.trim()) query.set("start_date", params.start_date.trim());
  if (params?.end_date && params.end_date.trim()) query.set("end_date", params.end_date.trim());
  if (params?.type && params.type.trim() && params.type.trim().toUpperCase() !== "ALL") query.set("type", params.type.trim());
  if (params?.search && params.search.trim()) query.set("search", params.search.trim());
  const queryString = query.toString() ? `?${query.toString()}` : "";

  return await fetchBackendJson<BackendManpowerAttendanceResponse>(`${API_BASE_URL}/manpower/attendance${queryString}`, {
    method: "GET",
    headers: getAuthHeaders(),
    cache: "no-store",
  });
}


/**
 * Fetch all manpower personnel & metrics from backend
 */
export async function apiGetManpower(search?: string, type?: string): Promise<BackendManpowerListResponse> {
  const params = new URLSearchParams();
  if (search && search.trim()) params.set("search", search.trim());
  if (type && type.trim() && type.trim().toUpperCase() !== "ALL") params.set("type", type.trim());
  const queryString = params.toString() ? `?${params.toString()}` : "";

  return await fetchBackendJson<BackendManpowerListResponse>(`${API_BASE_URL}/manpower${queryString}`, {
    method: "GET",
    headers: getAuthHeaders(),
    cache: "no-store",
  });
}

/**
 * Fetch manpower metrics from backend
 */
export async function apiGetManpowerMetrics(): Promise<BackendManpowerMetrics> {
  return await fetchBackendJson<BackendManpowerMetrics>(`${API_BASE_URL}/manpower/metrics`, {
    method: "GET",
    headers: getAuthHeaders(),
    cache: "no-store",
  });
}

/**
 * Create new manpower worker in backend
 */
export async function apiCreateManpower(payload: {
  name: string;
  type: "Internal" | "External";
}): Promise<BackendManpower> {
  return await fetchBackendJson<BackendManpower>(`${API_BASE_URL}/manpower`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
}

/**
 * Update manpower worker in backend
 */
export async function apiUpdateManpower(
  manpowerId: string,
  payload: {
    name?: string;
    type?: "Internal" | "External";
    is_active?: boolean;
  }
): Promise<BackendManpower> {
  return await fetchBackendJson<BackendManpower>(`${API_BASE_URL}/manpower/${manpowerId}`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
}

/**
 * Delete manpower worker in backend
 */
export async function apiDeleteManpower(manpowerId: string): Promise<{ message: string; id: string }> {
  return await fetchBackendJson<{ message: string; id: string }>(`${API_BASE_URL}/manpower/${manpowerId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
}

export interface BackendInvoice {
  id: string;
  invoice_number: string;
  vendor?: string | null;
  invoice_date: string;
  total_amount: number;
  currency: string;
  file_name?: string | null;
  file_size?: string | null;
  file_type?: string | null;
  has_file: boolean;
  status: string;
  is_active: boolean;
  created_at: string;
}

export interface BackendInvoiceMetrics {
  total_count: number;
  total_amount_aed: number;
  vendors_count: number;
}

export interface BackendInvoiceListResponse {
  items: BackendInvoice[];
  metrics: BackendInvoiceMetrics;
}

/**
 * Fetch all invoices and metrics from backend
 */
export async function apiGetInvoices(search?: string, vendor?: string): Promise<BackendInvoiceListResponse> {
  const params = new URLSearchParams();
  if (search && search.trim()) params.set("search", search.trim());
  if (vendor && vendor.trim() && vendor.trim().toUpperCase() !== "ALL") params.set("vendor", vendor.trim());
  const queryString = params.toString() ? `?${params.toString()}` : "";

  return await fetchBackendJson<BackendInvoiceListResponse>(`${API_BASE_URL}/invoices${queryString}`, {
    method: "GET",
    headers: getAuthHeaders(),
    cache: "no-store",
  });
}

/**
 * Fetch invoice metrics from backend
 */
export async function apiGetInvoiceMetrics(): Promise<BackendInvoiceMetrics> {
  return await fetchBackendJson<BackendInvoiceMetrics>(`${API_BASE_URL}/invoices/metrics`, {
    method: "GET",
    headers: getAuthHeaders(),
    cache: "no-store",
  });
}

/**
 * Create a new invoice in backend (supports FormData with file upload)
 */
export async function apiCreateInvoice(formData: FormData): Promise<BackendInvoice> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/invoices`, {
      method: "POST",
      headers,
      body: formData,
    });
  } catch (err: any) {
    throw new Error(`Unable to connect to backend: ${err?.message || err}`);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    let errDetail = "";
    if (typeof data?.detail === "string") {
      errDetail = data.detail;
    } else if (Array.isArray(data?.detail)) {
      errDetail = data.detail
        .map((d: any) => (d.loc ? `${d.loc.slice(-1)[0]}: ${d.msg}` : d.msg || JSON.stringify(d)))
        .join(", ");
    } else if (data?.detail && typeof data.detail === "object") {
      errDetail = data.detail.message || JSON.stringify(data.detail);
    }
    throw new Error(errDetail || `Failed to create invoice (Status ${res.status})`);
  }
  return data as BackendInvoice;
}

/**
 * Update an invoice in backend (supports FormData with optional new file)
 */
export async function apiUpdateInvoice(invoiceId: string, formData: FormData): Promise<BackendInvoice> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/invoices/${invoiceId}`, {
      method: "PUT",
      headers,
      body: formData,
    });
  } catch (err: any) {
    throw new Error(`Unable to connect to backend: ${err?.message || err}`);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    let errDetail = "";
    if (typeof data?.detail === "string") {
      errDetail = data.detail;
    } else if (Array.isArray(data?.detail)) {
      errDetail = data.detail
        .map((d: any) => (d.loc ? `${d.loc.slice(-1)[0]}: ${d.msg}` : d.msg || JSON.stringify(d)))
        .join(", ");
    } else if (data?.detail && typeof data.detail === "object") {
      errDetail = data.detail.message || JSON.stringify(data.detail);
    }
    throw new Error(errDetail || `Failed to update invoice (Status ${res.status})`);
  }
  return data as BackendInvoice;
}

/**
 * Delete an invoice in backend
 */
export async function apiDeleteInvoice(invoiceId: string): Promise<{ message: string; id: string }> {
  return await fetchBackendJson<{ message: string; id: string }>(`${API_BASE_URL}/invoices/${invoiceId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
}

/**
 * Get direct download URL for an invoice file (includes auth token in query if available)
 */
export function getInvoiceDownloadUrl(invoiceId: string): string {
  const token = getStoredToken();
  if (token) {
    return `${API_BASE_URL}/invoices/${invoiceId}/download?token=${encodeURIComponent(token)}`;
  }
  return `${API_BASE_URL}/invoices/${invoiceId}/download`;
}

/**
 * Get direct preview URL for an invoice file (includes auth token in query if available)
 */
export function getInvoicePreviewUrl(invoiceId: string): string {
  const token = getStoredToken();
  if (token) {
    return `${API_BASE_URL}/invoices/${invoiceId}/preview?token=${encodeURIComponent(token)}`;
  }
  return `${API_BASE_URL}/invoices/${invoiceId}/preview`;
}

/**
 * Helper to download an invoice file using an authenticated fetch + blob download
 */
export async function apiDownloadInvoiceFile(invoiceId: string, filename?: string): Promise<void> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}/invoices/${invoiceId}/download`, { headers });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail || `Download failed with status ${res.status}`);
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  a.download = filename || `Invoice_${invoiceId}.pdf`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 200);
}

/**
 * Master Inventory Interfaces & Endpoints
 */
export interface BackendInventoryItem {
  id: string;
  product_name: string;
  vendor?: string;
  brand: string;
  part_number: string;
  quantity: number;
  invoice_number: string;
  invoice_id?: string;
  invoice_file_name?: string;
  invoice_file_size?: string;
  invoice_file_type?: string;
  has_invoice_file: boolean;
  availability: string;
  is_active: boolean;
  created_at: string;
  available_quantity?: number;
  allocated_quantity?: number;
  active_projects_count?: number;
}

export interface BackendInventoryListResponse {
  items: BackendInventoryItem[];
  total_count: number;
}

export interface InventoryItemCreatePayload {
  product_name: string;
  vendor?: string;
  brand: string;
  part_number: string;
  quantity: number;
  invoice_number: string;
  invoice_id?: string;
  availability?: string;
}

export interface ActiveProjectAllocation {
  project_key: string;
  project_name: string;
  project_code: string;
  required_qty: number;
  allocated_qty: number;
  remaining_qty: number;
  status: "Added" | "Partially Added" | "Yet To Order" | string;
}

export interface PartAllocationSummary {
  part_number: string;
  total_received: number;
  total_allocated: number;
  available_in_warehouse: number;
  active_projects: ActiveProjectAllocation[];
}

/**
 * Fetch dynamic project allocations for a specific master inventory part
 */
export async function apiGetPartAllocations(partNumber: string): Promise<PartAllocationSummary> {
  return await fetchBackendJson<PartAllocationSummary>(
    `${API_BASE_URL}/inventory/part/${encodeURIComponent(partNumber)}/allocations`,
    {
      method: "GET",
      headers: getAuthHeaders(),
      cache: "no-store",
    }
  );
}

/**
 * Fetch master inventory items from backend
 */
export async function apiGetInventory(search?: string): Promise<BackendInventoryListResponse> {
  const params = new URLSearchParams();
  if (search && search.trim()) {
    params.set("search", search.trim());
  }

  const query = params.toString() ? `?${params.toString()}` : "";
  return await fetchBackendJson<BackendInventoryListResponse>(`${API_BASE_URL}/inventory${query}`, {
    method: "GET",
    headers: getAuthHeaders(),
    cache: "no-store",
  });
}

/**
 * Create a new master inventory item in backend
 */
export async function apiCreateInventoryItem(
  payload: InventoryItemCreatePayload
): Promise<BackendInventoryItem> {
  return await fetchBackendJson<BackendInventoryItem>(`${API_BASE_URL}/inventory`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
}

export interface InventoryItemUpdatePayload {
  product_name?: string;
  vendor?: string;
  brand?: string;
  part_number?: string;
  quantity?: number;
  invoice_number?: string;
  invoice_id?: string;
  availability?: string;
}

/**
 * Update an existing master inventory item in backend
 */
export async function apiUpdateInventoryItem(
  itemId: string,
  payload: InventoryItemUpdatePayload
): Promise<BackendInventoryItem> {
  return await fetchBackendJson<BackendInventoryItem>(`${API_BASE_URL}/inventory/${itemId}`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
}

/**
 * Delete a master inventory item in backend
 */
export async function apiDeleteInventoryItem(itemId: string): Promise<{ message: string; id: string }> {
  return await fetchBackendJson<{ message: string; id: string }>(`${API_BASE_URL}/inventory/${itemId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
}

/**
 * Master Parts (SKUs) Interfaces & Endpoints
 */
export interface BackendPartItem {
  id: string;
  part_number: string;
  product_name?: string;
  brand?: string;
  vendor?: string;
  description?: string;
  is_active: boolean;
  created_at: string;
}

export interface BackendPartListResponse {
  items: BackendPartItem[];
  total_count: number;
}

export interface PartCreatePayload {
  product_name: string;
  part_number: string;
  description?: string;
}

export interface LinkedInvoiceItem {
  invoice_number: string;
  invoice_id?: string;
  vendor?: string;
  invoice_date?: string;
  quantity: number;
  file_name?: string;
  has_file: boolean;
  created_at?: string;
}

export interface ProjectInvoiceAllocation {
  project_key: string;
  project_name: string;
  project_code: string;
  vendor?: string;
  quantity: number;
  invoice_number: string;
  invoice_id?: string;
  invoice_date?: string;
  file_name?: string;
  has_file: boolean;
}

export interface PartDrillDownDetails {
  part_number: string;
  product_name: string;
  description?: string;
  total_inventory: number;
  total_in_warehouse?: number;
  total_allocated: number;
  available_in_warehouse: number;
  remaining_in_warehouse?: number;
  total_consumed?: number;
  active_projects: ActiveProjectAllocation[];
  linked_invoices: LinkedInvoiceItem[];
  project_invoice_allocations?: ProjectInvoiceAllocation[];
}

/**
 * Fetch registered master parts from backend
 */
export async function apiGetParts(search?: string): Promise<BackendPartListResponse> {
  const params = new URLSearchParams();
  if (search && search.trim()) {
    params.set("search", search.trim());
  }

  const query = params.toString() ? `?${params.toString()}` : "";
  return await fetchBackendJson<BackendPartListResponse>(`${API_BASE_URL}/inventory/parts${query}`, {
    method: "GET",
    headers: getAuthHeaders(),
    cache: "no-store",
  });
}

/**
 * Fetch complete drill-down details for a specific part (stock, project allocations, and linked invoices)
 */
export async function apiGetPartDetails(partNumber: string): Promise<PartDrillDownDetails> {
  return await fetchBackendJson<PartDrillDownDetails>(
    `${API_BASE_URL}/inventory/parts/${encodeURIComponent(partNumber)}/details`,
    {
      method: "GET",
      headers: getAuthHeaders(),
      cache: "no-store",
    }
  );
}

/**
 * Register a new master part in backend
 */
export async function apiCreatePart(payload: PartCreatePayload): Promise<BackendPartItem> {
  return await fetchBackendJson<BackendPartItem>(`${API_BASE_URL}/inventory/parts`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
}

/**
 * Delete / deactivate a master part in backend
 */
export async function apiDeletePart(partId: string): Promise<void> {
  await fetchBackendJson<void>(`${API_BASE_URL}/inventory/parts/${encodeURIComponent(partId)}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
}


// ==========================================
// CASH FLOW TYPES & API CALLS
// ==========================================

export interface BackendPettyCashItem {
  file_name?: string;
  id: string;
  type: string;
  amount: number;
  description: string;
  invoice_number?: string;
  invoice_id?: string;
  date: string;
  is_active: boolean;
  created_at?: string;
}

export interface BackendPettyCashListResponse {
  items: BackendPettyCashItem[];
  total_balance: number;
  total_cash_in: number;
  total_cash_out: number;
}

export interface BackendCreditLoanItem {
  file_name?: string;
  id: string;
  description: string;
  amount: number;
  invoice_number?: string;
  invoice_id?: string;
  date: string;
  is_active: boolean;
  created_at?: string;
}

export interface BackendCreditLoanListResponse {
  items: BackendCreditLoanItem[];
  total_amount: number;
}

export interface BackendCashflowSummary {
  petty_balance: number;
  total_cash_in: number;
  total_cash_out: number;
  total_credit_loans: number;
  petty_count: number;
  loans_count: number;
}

/**
 * Fetch petty cash transactions from FastAPI backend
 */
export async function apiGetPettyCash(
  typeFilter?: string,
  search?: string,
  dateFilter?: string
): Promise<BackendPettyCashListResponse> {
  const params = new URLSearchParams();
  if (typeFilter && typeFilter.toUpperCase() !== "ALL") params.set("type_filter", typeFilter);
  if (search && search.trim()) params.set("search", search.trim());
  if (dateFilter && dateFilter.trim()) params.set("date_filter", dateFilter.trim());
  const query = params.toString() ? `?${params.toString()}` : "";
  return await fetchBackendJson<BackendPettyCashListResponse>(`${API_BASE_URL}/cashflow/petty${query}`, {
    method: "GET",
    headers: getAuthHeaders(),
    cache: "no-store",
  });
}

/**
 * Create a new petty cash transaction in FastAPI backend
 */
export async function apiCreatePettyCash(formData: FormData): Promise<BackendPettyCashItem> {
  const token = getStoredToken();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/cashflow/petty`, {
      method: "POST",
      headers,
      body: formData,
    });
  } catch (err: any) {
    throw new Error(`Unable to connect to backend: ${err?.message || err}`);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    let errDetail = data?.detail || `Failed to create petty cash (Status ${res.status})`;
    throw new Error(typeof errDetail === "string" ? errDetail : JSON.stringify(errDetail));
  }
  return data as BackendPettyCashItem;
}

/**
 * Delete a petty cash transaction in FastAPI backend
 */
export async function apiDeletePettyCash(id: string): Promise<{ message: string; id: string }> {
  return await fetchBackendJson<{ message: string; id: string }>(`${API_BASE_URL}/cashflow/petty/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
}

/**
 * Fetch credit / loan items from FastAPI backend
 */
export async function apiGetCreditLoans(search?: string, dateFilter?: string): Promise<BackendCreditLoanListResponse> {
  const params = new URLSearchParams();
  if (search && search.trim()) params.set("search", search.trim());
  if (dateFilter && dateFilter.trim()) params.set("date_filter", dateFilter.trim());
  const query = params.toString() ? `?${params.toString()}` : "";
  return await fetchBackendJson<BackendCreditLoanListResponse>(`${API_BASE_URL}/cashflow/loans${query}`, {
    method: "GET",
    headers: getAuthHeaders(),
    cache: "no-store",
  });
}

/**
 * Create a credit / loan entry in FastAPI backend
 */
export async function apiCreateCreditLoan(formData: FormData): Promise<BackendCreditLoanItem> {
  const token = getStoredToken();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/cashflow/loans`, {
      method: "POST",
      headers,
      body: formData,
    });
  } catch (err: any) {
    throw new Error(`Unable to connect to backend: ${err?.message || err}`);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    let errDetail = data?.detail || `Failed to create credit/loan (Status ${res.status})`;
    throw new Error(typeof errDetail === "string" ? errDetail : JSON.stringify(errDetail));
  }
  return data as BackendCreditLoanItem;
}

/**
 * Delete a credit / loan entry in FastAPI backend
 */
export async function apiDeleteCreditLoan(id: string): Promise<{ message: string; id: string }> {
  return await fetchBackendJson<{ message: string; id: string }>(`${API_BASE_URL}/cashflow/loans/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
}

/**
 * Fetch cashflow financial summary from FastAPI backend
 */

export async function apiDownloadPettyCashExcel(typeFilter?: string, search?: string, dateFilter?: string): Promise<void> {
  const params = new URLSearchParams();
  if (typeFilter && typeFilter.toUpperCase() !== "ALL") params.set("type_filter", typeFilter);
  if (search && search.trim()) params.set("search", search.trim());
  if (dateFilter && dateFilter.trim()) params.set("date_filter", dateFilter.trim());

  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const query = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`${API_BASE_URL}/cashflow/petty/export${query}`, { headers });
  if (!res.ok) throw new Error("Failed to download excel");

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  a.download = `petty_cash_export.xlsx`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); window.URL.revokeObjectURL(url); }, 200);
}

export async function apiDownloadCreditLoansExcel(search?: string, dateFilter?: string): Promise<void> {
  const params = new URLSearchParams();
  if (search && search.trim()) params.set("search", search.trim());
  if (dateFilter && dateFilter.trim()) params.set("date_filter", dateFilter.trim());

  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const query = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`${API_BASE_URL}/cashflow/loans/export${query}`, { headers });
  if (!res.ok) throw new Error("Failed to download excel");

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  a.download = `credit_loans_export.xlsx`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); window.URL.revokeObjectURL(url); }, 200);
}

export async function apiDownloadPettyDocument(id: string, filename: string = "document"): Promise<void> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}/cashflow/petty/${id}/download`, { headers });
  if (!res.ok) throw new Error("Document not found");

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); window.URL.revokeObjectURL(url); }, 200);
}

export async function apiDownloadLoanDocument(id: string, filename: string = "document"): Promise<void> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}/cashflow/loans/${id}/download`, { headers });
  if (!res.ok) throw new Error("Document not found");

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); window.URL.revokeObjectURL(url); }, 200);
}

export async function apiGetCashflowSummary(): Promise<BackendCashflowSummary> {
  return await fetchBackendJson<BackendCashflowSummary>(`${API_BASE_URL}/cashflow/summary`, {
    method: "GET",
    headers: getAuthHeaders(),
    cache: "no-store",
  });
}

/**
 * Download a 100% valid, authenticated PDF invoice by invoice number directly from FastAPI backend
 */
export async function apiDownloadInvoiceByNumber(
  invoiceNumber: string,
  filename?: string
): Promise<void> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const encodedNum = encodeURIComponent(invoiceNumber.trim());
  const res = await fetch(`${API_BASE_URL}/invoices/by-number/${encodedNum}/download`, { headers });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail || `Download failed with status ${res.status}`);
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  a.download = filename || `Invoice_${invoiceNumber}.pdf`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 200);
}

// ==========================================
// PROJECT COSTING & SOA TYPES & API CALLS
// ==========================================

export interface BackendCostingItem {
  id: number;
  project_key: string;
  sl_no: number;
  part_no: string;
  description: string;
  qty: number;
  purchase_unit_price: number;
  purchase_total: number;
  margin: number;
  selling_margin_percent: number;
  selling_unit_price: number;
  selling_total: number;
  vendor?: string;
  brand?: string;
  invoice_number?: string;
  procurement_status: "Added" | "Partially Added" | "Not Added" | "Yet To Order" | "Yet To Deliver" | string;
  allocated_qty?: number;
  remaining_qty?: number;
}

export interface BackendSOAItem {
  id: number;
  project_key: string;
  stage_number?: number;
  date: string;
  po_no: string;
  document_no: string;
  doc_type: string;
  value: number;
  received: number;
  remarks: string;
  mode: string;
  balance: number;
  document_url?: string;
  document_name?: string;
  document_size?: string;
}

export async function apiGetProjectCosting(projectKey: string): Promise<BackendCostingItem[]> {
  return await fetchBackendJson<BackendCostingItem[]>(`${API_BASE_URL}/projects/${projectKey}/costing`, {
    method: "GET",
    headers: getAuthHeaders(),
    cache: "no-store",
  });
}

export async function apiCreateProjectCosting(
  projectKey: string,
  payload: Partial<BackendCostingItem>
): Promise<BackendCostingItem> {
  return await fetchBackendJson<BackendCostingItem>(`${API_BASE_URL}/projects/${projectKey}/costing`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function apiUpdateProjectCosting(
  projectKey: string,
  itemId: number,
  payload: Partial<BackendCostingItem>
): Promise<BackendCostingItem> {
  return await fetchBackendJson<BackendCostingItem>(`${API_BASE_URL}/projects/${projectKey}/costing/${itemId}`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function apiDeleteProjectCosting(
  projectKey: string,
  itemId: number
): Promise<{ message: string; id: number }> {
  return await fetchBackendJson<{ message: string; id: number }>(
    `${API_BASE_URL}/projects/${projectKey}/costing/${itemId}`,
    {
      method: "DELETE",
      headers: getAuthHeaders(),
    }
  );
}

// ==========================================
// PROJECT PROCUREMENT API & TYPES
// ==========================================

export interface BackendProcurementItem {
  id: number;
  project_key: string;
  sl_no: number;
  part_no: string;
  product_name: string;
  vendor?: string;
  brand?: string;
  qty: number;
  allocated_qty: number;
  status: "Added" | "Partially Added" | "Yet To Order" | "Yet To Deliver" | string;
  invoice_number?: string;
  notes?: string;
  remaining_qty?: number;
  available_stock?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ProcurementItemCreatePayload {
  sl_no?: number;
  part_no: string;
  product_name?: string;
  vendor?: string;
  brand?: string;
  qty: number;
  allocated_qty?: number;
  status?: string;
  invoice_number?: string;
  notes?: string;
}

export interface ProcurementItemUpdatePayload {
  sl_no?: number;
  part_no?: string;
  product_name?: string;
  vendor?: string;
  brand?: string;
  qty?: number;
  allocated_qty?: number;
  status?: string;
  invoice_number?: string;
  notes?: string;
}

export async function apiGetProjectProcurement(projectKey: string): Promise<BackendProcurementItem[]> {
  return await fetchBackendJson<BackendProcurementItem[]>(
    `${API_BASE_URL}/projects/${projectKey}/procurement`,
    {
      method: "GET",
      headers: getAuthHeaders(),
      cache: "no-store",
    }
  );
}

export async function apiCreateProjectProcurement(
  projectKey: string,
  payload: ProcurementItemCreatePayload
): Promise<BackendProcurementItem> {
  return await fetchBackendJson<BackendProcurementItem>(
    `${API_BASE_URL}/projects/${projectKey}/procurement`,
    {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    }
  );
}

export async function apiUpdateProjectProcurement(
  projectKey: string,
  itemId: number,
  payload: ProcurementItemUpdatePayload
): Promise<BackendProcurementItem> {
  return await fetchBackendJson<BackendProcurementItem>(
    `${API_BASE_URL}/projects/${projectKey}/procurement/${itemId}`,
    {
      method: "PUT",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    }
  );
}

export async function apiDeleteProjectProcurement(
  projectKey: string,
  itemId: number
): Promise<void> {
  await fetchBackendJson<void>(
    `${API_BASE_URL}/projects/${projectKey}/procurement/${itemId}`,
    {
      method: "DELETE",
      headers: getAuthHeaders(),
    }
  );
}

export interface ProcurementItemShiftPayload {
  source_project_key: string;
  part_no: string;
  quantity: number;
  notes?: string;
}

export interface ProcurementShiftResponse {
  source_project_key: string;
  destination_project_key: string;
  part_no: string;
  shifted_quantity: number;
  source_remaining_allocated: number;
  destination_total_allocated: number;
  message: string;
}

export async function apiShiftProjectProcurement(
  destProjectKey: string,
  payload: ProcurementItemShiftPayload
): Promise<ProcurementShiftResponse> {
  return await fetchBackendJson<ProcurementShiftResponse>(
    `${API_BASE_URL}/projects/${destProjectKey}/procurement/shift`,
    {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    }
  );
}

export async function apiGetProjectSOA(projectKey: string): Promise<BackendSOAItem[]> {
  return await fetchBackendJson<BackendSOAItem[]>(`${API_BASE_URL}/projects/${projectKey}/soa`, {
    method: "GET",
    headers: getAuthHeaders(),
    cache: "no-store",
  });
}

export async function apiCreateProjectSOA(
  projectKey: string,
  payload: Partial<BackendSOAItem>
): Promise<BackendSOAItem> {
  return await fetchBackendJson<BackendSOAItem>(`${API_BASE_URL}/projects/${projectKey}/soa`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function apiUpdateProjectSOA(
  projectKey: string,
  itemId: number,
  payload: Partial<BackendSOAItem>
): Promise<BackendSOAItem> {
  return await fetchBackendJson<BackendSOAItem>(`${API_BASE_URL}/projects/${projectKey}/soa/${itemId}`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function apiDeleteProjectSOA(
  projectKey: string,
  itemId: number
): Promise<{ message: string; id: number }> {
  return await fetchBackendJson<{ message: string; id: number }>(
    `${API_BASE_URL}/projects/${projectKey}/soa/${itemId}`,
    {
      method: "DELETE",
      headers: getAuthHeaders(),
    }
  );
}

// ==========================================
// PROJECT ITEM & SECTION STATUS SYNC
// ==========================================

export type SectionStatusType = "not_started" | "in_progress" | "completed";

export interface BackendResourceItem {
  id: number;
  project_key: string;
  sl_no: number;
  name: string;
  type: "Internal" | "External" | string;
  hours_worked: number;
  date?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ResourceItemCreatePayload {
  sl_no?: number;
  name: string;
  type?: "Internal" | "External" | string;
  hours_worked?: number;
  date?: string;
}

export interface BackendProjectItem {
  id: number;
  project_key: string;
  name: string;
  client: string;
  location?: string;
  code: string;
  priority: string;
  priority_level: string;
  current_stage: number;
  total_stages: number;
  manager?: string;
  supervisor?: string;
  start_date?: string;
  budget?: string;
  is_completed: boolean;
  completed_at?: string;
  commercial_status: SectionStatusType;
  engineering_status: SectionStatusType;
  budget_status: SectionStatusType;
  procurement_status: SectionStatusType;
  soa_status?: SectionStatusType;
  resource_status: SectionStatusType;
  site_execution_status: SectionStatusType;
  handover_status: SectionStatusType;
  verified_progress_percentage?: number;
  commercial_stages?: any[];
  engineering_stages?: any[];
  costing_items?: BackendCostingItem[];
  soa_items?: BackendSOAItem[];
  resource_items?: BackendResourceItem[];
}

export async function apiGetProjects(): Promise<BackendProjectItem[]> {
  return await fetchBackendJson<BackendProjectItem[]>(`${API_BASE_URL}/projects`, {
    method: "GET",
    headers: getAuthHeaders(),
    cache: "no-store",
  });
}

export async function apiGetProject(projectKey: string): Promise<BackendProjectItem> {
  return await fetchBackendJson<BackendProjectItem>(`${API_BASE_URL}/projects/${projectKey}`, {
    method: "GET",
    headers: getAuthHeaders(),
    cache: "no-store",
  });
}

export async function apiCreateProject(payload: Partial<BackendProjectItem>): Promise<BackendProjectItem> {
  return await fetchBackendJson<BackendProjectItem>(`${API_BASE_URL}/projects`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function apiUpdateProject(
  projectKey: string,
  payload: Partial<BackendProjectItem>
): Promise<BackendProjectItem> {
  return await fetchBackendJson<BackendProjectItem>(`${API_BASE_URL}/projects/${projectKey}`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function apiDeleteProject(projectKey: string): Promise<{ message: string; project_key: string }> {
  return await fetchBackendJson<{ message: string; project_key: string }>(`${API_BASE_URL}/projects/${projectKey}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
}

export async function apiUpdateProjectSectionStatus(
  projectKey: string,
  sectionKey:
    | "commercial_status"
    | "engineering_status"
    | "budget_status"
    | "procurement_status"
    | "soa_status"
    | "resource_status"
    | "site_execution_status"
    | "handover_status",
  newStatus: SectionStatusType
): Promise<BackendProjectItem> {
  return await fetchBackendJson<BackendProjectItem>(`${API_BASE_URL}/projects/${projectKey}`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify({ [sectionKey]: newStatus }),
  });
}

// ==========================================
// PROJECT RESOURCE ALLOCATION ENDPOINTS
// ==========================================

export async function apiGetProjectResources(projectKey: string, date?: string): Promise<BackendResourceItem[]> {
  const params = new URLSearchParams();
  if (date && date.trim() && date.trim().toLowerCase() !== "all") {
    params.set("date", date.trim());
  }
  const query = params.toString() ? `?${params.toString()}` : "";
  return await fetchBackendJson<BackendResourceItem[]>(`${API_BASE_URL}/projects/${projectKey}/resources${query}`, {
    method: "GET",
    headers: getAuthHeaders(),
    cache: "no-store",
  });
}

export async function apiCreateProjectResource(
  projectKey: string,
  payload: ResourceItemCreatePayload
): Promise<BackendResourceItem> {
  return await fetchBackendJson<BackendResourceItem>(`${API_BASE_URL}/projects/${projectKey}/resources`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function apiUpdateProjectResource(
  projectKey: string,
  itemId: number,
  payload: Partial<ResourceItemCreatePayload>
): Promise<BackendResourceItem> {
  return await fetchBackendJson<BackendResourceItem>(
    `${API_BASE_URL}/projects/${projectKey}/resources/${itemId}`,
    {
      method: "PUT",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    }
  );
}

export async function apiDeleteProjectResource(
  projectKey: string,
  itemId: number
): Promise<{ message: string; id: number }> {
  return await fetchBackendJson<{ message: string; id: number }>(
    `${API_BASE_URL}/projects/${projectKey}/resources/${itemId}`,
    {
      method: "DELETE",
      headers: getAuthHeaders(),
    }
  );
}

// ==========================================
// TASKS (ACTIVE TASK LIST & LOGS) API
// ==========================================

export interface BackendTaskItem {
  id: number;
  title: string;
  raised_by: string;
  raised_to: string;
  project_key?: string | null;
  project_name?: string | null;
  priority: "low" | "medium" | "high";
  note?: string | null;
  status: "not_started" | "in_progress" | "completed";
  raised_date: string;
  started_date?: string | null;
  completed_date?: string | null;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface BackendTaskListResponse {
  items: BackendTaskItem[];
  total_count: number;
  active_count: number;
  completed_count: number;
}

export interface TaskCreatePayload {
  title: string;
  raised_to: string;
  project_key?: string | null;
  project_name?: string | null;
  priority?: "low" | "medium" | "high";
  note?: string | null;
}

export interface TaskStatusUpdatePayload {
  status: "not_started" | "in_progress" | "completed";
}

export async function apiGetTasks(
  statusFilter?: string,
  assignedTo?: string,
  search?: string
): Promise<BackendTaskListResponse> {
  const params = new URLSearchParams();
  if (statusFilter && statusFilter.toLowerCase() !== "all") {
    params.set("status", statusFilter.toLowerCase().trim());
  }
  if (assignedTo && assignedTo.trim()) {
    params.set("assigned_to", assignedTo.trim());
  }
  if (search && search.trim()) {
    params.set("search", search.trim());
  }
  const query = params.toString() ? `?${params.toString()}` : "";
  return await fetchBackendJson<BackendTaskListResponse>(`${API_BASE_URL}/tasks${query}`, {
    method: "GET",
    headers: getAuthHeaders(),
    cache: "no-store",
  });
}

export async function apiCreateTask(payload: TaskCreatePayload): Promise<BackendTaskItem> {
  return await fetchBackendJson<BackendTaskItem>(`${API_BASE_URL}/tasks`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function apiUpdateTaskStatus(
  taskId: number,
  status: "not_started" | "in_progress" | "completed"
): Promise<BackendTaskItem> {
  return await fetchBackendJson<BackendTaskItem>(`${API_BASE_URL}/tasks/${taskId}/status`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify({ status }),
  });
}

export async function apiDeleteTask(taskId: number): Promise<{ message: string; id: number }> {
  return await fetchBackendJson<{ message: string; id: number }>(`${API_BASE_URL}/tasks/${taskId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
}

// ==========================================
// SITE EXECUTION PROGRESS & LOGS API
// ==========================================

export interface SiteExecutionImageItem {
  id?: string;
  name?: string;
  url: string;
  size?: string;
}

export interface BackendSiteExecutionLog {
  id: number;
  project_key: string;
  date: string;
  supervisor_name: string;
  creator_role?: string;
  phase_name: string;
  description: string;
  images: SiteExecutionImageItem[];
  created_at?: string;
}

export interface SiteExecutionLogCreatePayload {
  date: string;
  supervisor_name: string;
  creator_role?: string;
  phase_name: string;
  description: string;
  images: SiteExecutionImageItem[];
}

export async function apiGetSiteExecutionLogs(
  projectKey: string,
  date?: string
): Promise<BackendSiteExecutionLog[]> {
  const params = new URLSearchParams();
  if (date && date.trim() && date.trim().toLowerCase() !== "all") {
    params.set("date", date.trim());
  }
  const query = params.toString() ? `?${params.toString()}` : "";
  return await fetchBackendJson<BackendSiteExecutionLog[]>(
    `${API_BASE_URL}/projects/${projectKey}/site-execution${query}`,
    {
      method: "GET",
      headers: getAuthHeaders(),
      cache: "no-store",
    }
  );
}

export async function apiCreateSiteExecutionLog(
  projectKey: string,
  payload: SiteExecutionLogCreatePayload
): Promise<BackendSiteExecutionLog> {
  return await fetchBackendJson<BackendSiteExecutionLog>(
    `${API_BASE_URL}/projects/${projectKey}/site-execution`,
    {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    }
  );
}

export async function apiUpdateSiteExecutionLog(
  projectKey: string,
  logId: number,
  payload: Partial<SiteExecutionLogCreatePayload>
): Promise<BackendSiteExecutionLog> {
  return await fetchBackendJson<BackendSiteExecutionLog>(
    `${API_BASE_URL}/projects/${projectKey}/site-execution/${logId}`,
    {
      method: "PUT",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    }
  );
}

export async function apiDeleteSiteExecutionLog(
  projectKey: string,
  logId: number
): Promise<{ message: string }> {
  return await fetchBackendJson<{ message: string }>(
    `${API_BASE_URL}/projects/${projectKey}/site-execution/${logId}`,
    {
      method: "DELETE",
      headers: getAuthHeaders(),
    }
  );
}

export async function apiUpdateSiteVerifiedProgress(
  projectKey: string,
  verifiedProgressPercentage: number
): Promise<BackendProjectItem> {
  return await fetchBackendJson<BackendProjectItem>(
    `${API_BASE_URL}/projects/${projectKey}/site-execution/progress`,
    {
      method: "PUT",
      headers: getAuthHeaders(),
      body: JSON.stringify({ verified_progress_percentage: verifiedProgressPercentage }),
    }
  );
}







