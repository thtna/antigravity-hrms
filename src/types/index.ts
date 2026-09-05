/**
 * Core Application Types for Antigravity HRMS
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
    timestamp: string;
  };
}

export type RoleCode = 
  | 'admin'
  | 'hr'
  | 'manager'
  | 'employee';

export interface UserSession {
  userId: string;
  employeeId?: string;
  email: string;
  fullName: string;
  departmentId?: string | null;
  roles: RoleCode[];
  permissions: string[];
  isActive: boolean;
}

export interface SanitizedUser {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  employeeId?: string;
  departmentId?: string | null;
  roles: RoleCode[];
  permissions: string[];
  lastLoginAt?: Date | null;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface EmployeeDocumentItem {
  id: string;
  name: string;
  type: 'CONTRACT' | 'ID_CARD' | 'RESUME' | 'CERTIFICATE' | 'OTHER';
  url: string;
  size?: number;
  uploadedAt?: string;
}

export interface EmployeeRecord {
  id: string;
  userId: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  fullName: string;
  avatarUrl?: string | null;
  gender: string;
  dob: Date | string;
  identityCard?: string | null;
  phoneNumber: string;
  departmentId: string;
  positionId: string;
  worksiteId?: string | null;
  hireDate: Date | string;
  contractType: string;
  contractSalary: number;
  hourlyRate: number;
  insuranceSalary: number;
  taxCode?: string | null;
  dependentsCount: number;
  bankAccountNo?: string | null;
  bankName?: string | null;
  documents: EmployeeDocumentItem[];
  status: string;
  createdAt: Date | string;
  updatedAt?: Date | string;
  department?: { id: string; code: string; name: string };
  position?: { id: string; code: string; title: string; baseSalaryGrade?: number };
  worksite?: { id: string; name: string; address?: string; radiusMeters?: number } | null;
  user?: { id: string; email: string; isActive: boolean; lastLoginAt?: Date | null };
}

