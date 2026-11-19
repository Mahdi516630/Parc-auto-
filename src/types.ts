export type UserStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface UserPermissions {
  viewOrders: boolean;
  createOrders: boolean;
  editOrders: boolean;
  deleteOrders: boolean;
  printOrders: boolean;
  exportData: boolean;
  manageUsers: boolean;
}

export type PermissionKey = keyof UserPermissions;

export interface RoleDefinition {
  id: string;
  label: string;
  description: string;
  permissions: UserPermissions;
  isSystem?: boolean;
}

export interface UserRecord {
  id: string;
  username: string;
  email: string;
  fullName: string;
  department: string;
  roleId: string;
  status: UserStatus;
  permissions: UserPermissions;
  createdAt: string;
  validatedAt?: string;
  validatedBy?: string;
  lastLoginAt?: string;
}

export type CustomFieldType = 'text' | 'date' | 'checkbox' | 'number' | 'textarea';

export interface CustomFieldDefinition {
  id: string;
  label: string;
  type: CustomFieldType;
  required: boolean;
  placeholder?: string;
  showInTable: boolean;
  enabled: boolean;
}

export type CoreFieldKey =
  | 'marque'
  | 'modele'
  | 'immat'
  | 'vin'
  | 'km'
  | 'date'
  | 'remarque'
  | 'tech'
  | 'ctrl';

export interface CoreFieldConfig {
  key: CoreFieldKey;
  label: string;
  placeholder: string;
  required: boolean;
  visible: boolean;
}

export interface FormConfig {
  coreFields: CoreFieldConfig[];
  customFields: CustomFieldDefinition[];
  checklistItems: string[];
  updatedAt: string;
  updatedBy?: string;
}

export interface RepairOrder {
  id: number;
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
  customValues?: Record<string, string | boolean>;
  createdById: string;
  createdByName: string;
  createdAt: string;
  updatedById?: string;
  updatedByName?: string;
  updatedAt?: string;
}

export interface ActivityLog {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  action:
    | 'register'
    | 'login'
    | 'user_approved'
    | 'user_rejected'
    | 'user_suspended'
    | 'permissions_updated'
    | 'role_updated'
    | 'form_config_updated'
    | 'order_created'
    | 'order_updated'
    | 'order_deleted';
  targetLabel: string;
  details?: string;
}

export type PeriodFilter = 'jour' | 'semaine' | 'mois' | 'tout';
export type SortDirection = 'desc' | 'asc';

export interface AdminOverviewPayload {
  users: UserRecord[];
  roles: RoleDefinition[];
  formConfig: FormConfig;
  logs: ActivityLog[];
  stats: {
    totalUsers: number;
    pendingUsers: number;
    approvedUsers: number;
    suspendedOrRejectedUsers: number;
    totalOrders: number;
    ordersThisMonth: number;
    ordersToday: number;
    completeOrders: number;
    incompleteOrders: number;
    completionRate: number;
    checklistCount: number;
    brandBreakdown: Array<{ brand: string; count: number }>;
    authorBreakdown: Array<{ name: string; count: number }>;
    checklistGapBreakdown: Array<{ label: string; missingCount: number }>;
    repairTypeBreakdown: Array<{
      index: number;
      label: string;
      shortLabel: string;
      completedCount: number;
      pendingCount: number;
      rate: number;
    }>;
    monthlyEvolution: Array<{
      month: string;
      monthLabel: string;
      totalOrders: number;
      completeOrders: number;
      incompleteOrders: number;
    }>;
  };
}
