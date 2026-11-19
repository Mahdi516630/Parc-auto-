import type {
  AdminOverviewPayload,
  FormConfig,
  RepairOrder,
  RoleDefinition,
  UserPermissions,
  UserRecord,
  UserStatus,
} from './types';

const TOKEN_STORAGE_KEY = 'pap_auth_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota errors
  }
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError(
      String(data.error || 'Une erreur est survenue lors de la communication avec le serveur.'),
      res.status,
      typeof data.code === 'string' ? data.code : undefined,
    );
  }
  return data as T;
}

export interface AuthResponse {
  token: string;
  user: UserRecord;
  requiresValidation: boolean;
}

export interface PublicRoleOption {
  id: string;
  label: string;
  description: string;
}

export async function fetchPublicRoles(): Promise<PublicRoleOption[]> {
  const res = await request<{ roles: PublicRoleOption[] }>('/api/public/roles');
  return res.roles;
}

export async function loginUser(identifier: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
  });
}

export async function registerUser(payload: {
  fullName: string;
  username: string;
  email: string;
  department: string;
  roleId: string;
  password: string;
}): Promise<AuthResponse> {
  return request<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchMe(): Promise<{
  user: UserRecord;
  roles: RoleDefinition[];
  formConfig: FormConfig;
}> {
  return request<{ user: UserRecord; roles: RoleDefinition[]; formConfig: FormConfig }>(
    '/api/auth/me',
  );
}

export async function fetchFormConfig(): Promise<FormConfig> {
  const res = await request<{ formConfig: FormConfig }>('/api/form-config');
  return res.formConfig;
}

export async function fetchOrders(): Promise<RepairOrder[]> {
  const res = await request<{ orders: RepairOrder[] }>('/api/orders');
  return res.orders;
}

export interface OrderSavePayload {
  date: string;
  marque: string;
  modele: string;
  immat: string;
  vin: string;
  km: number;
  checks: boolean[];
  remarque: string;
  tech: string;
  ctrl: string;
  customValues: Record<string, string | boolean>;
}

export async function createOrder(payload: OrderSavePayload): Promise<RepairOrder> {
  const res = await request<{ order: RepairOrder }>('/api/orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.order;
}

export async function updateOrder(id: number, payload: OrderSavePayload): Promise<RepairOrder> {
  const res = await request<{ order: RepairOrder }>(`/api/orders/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return res.order;
}

export async function deleteOrder(id: number): Promise<void> {
  await request<{ ok: boolean }>(`/api/orders/${id}`, {
    method: 'DELETE',
  });
}

export async function fetchAdminOverview(): Promise<AdminOverviewPayload> {
  return request<AdminOverviewPayload>('/api/admin/overview');
}

export async function adminUpdateUser(
  userId: string,
  payload: {
    status?: UserStatus;
    roleId?: string;
    permissions?: Partial<UserPermissions>;
    department?: string;
    fullName?: string;
  },
): Promise<{ user: UserRecord; overview: AdminOverviewPayload }> {
  return request<{ user: UserRecord; overview: AdminOverviewPayload }>(
    `/api/admin/users/${userId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  );
}

export async function adminDeleteUser(userId: string): Promise<AdminOverviewPayload> {
  const res = await request<{ overview: AdminOverviewPayload }>(`/api/admin/users/${userId}`, {
    method: 'DELETE',
  });
  return res.overview;
}

export async function adminCreateRole(payload: {
  label: string;
  description: string;
  permissions: UserPermissions;
}): Promise<{ role: RoleDefinition; overview: AdminOverviewPayload }> {
  return request<{ role: RoleDefinition; overview: AdminOverviewPayload }>('/api/admin/roles', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function adminUpdateRole(
  roleId: string,
  payload: {
    label: string;
    description: string;
    permissions: UserPermissions;
    syncUsers: boolean;
  },
): Promise<{ role: RoleDefinition; overview: AdminOverviewPayload }> {
  return request<{ role: RoleDefinition; overview: AdminOverviewPayload }>(
    `/api/admin/roles/${roleId}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
  );
}

export async function adminDeleteRole(roleId: string): Promise<AdminOverviewPayload> {
  const res = await request<{ overview: AdminOverviewPayload }>(`/api/admin/roles/${roleId}`, {
    method: 'DELETE',
  });
  return res.overview;
}

export async function adminUpdateFormConfig(
  config: FormConfig,
): Promise<{ formConfig: FormConfig; overview: AdminOverviewPayload }> {
  return request<{ formConfig: FormConfig; overview: AdminOverviewPayload }>(
    '/api/admin/form-config',
    {
      method: 'PUT',
      body: JSON.stringify(config),
    },
  );
}

export async function adminResetFormConfig(): Promise<{
  formConfig: FormConfig;
  overview: AdminOverviewPayload;
}> {
  return request<{ formConfig: FormConfig; overview: AdminOverviewPayload }>(
    '/api/admin/form-config/reset',
    {
      method: 'POST',
    },
  );
}
