# ANTIGRAVITY MASTER PROJECT — ROLE-BASED ACCESS CONTROL (RBAC) MATRIX
**Mô Hình Kiểm Soát Truy Cập Phân Quyền Hạt Mịn (Fine-Grained RBAC & Data Scoping)**  
*Document Version: 1.0.0 | Status: APPROVED | Target: Next.js Middleware & Service-Level Enforcement*

---

## 1. ĐỊNH NGHĨA CÁC VAI TRÒ HỆ THỐNG (ROLES)

1. **`SUPER_ADMIN` (Quản trị viên tối cao)**:
   - Toàn quyền cấu hình tham số hệ thống, quản lý tài khoản người dùng, phân quyền vai trò, xem toàn bộ nhật ký kiểm toán (Audit Trail) và can thiệp bảo mật.
2. **`HR_ADMIN` (Quản trị viên nhân sự)**:
   - Quản lý hồ sơ nhân viên, cơ cấu phòng ban, danh mục chức vụ, địa điểm làm việc, lịch phân ca, duyệt đơn nghỉ phép, thiết lập thư viện KPI và chính sách thưởng phạt.
3. **`PAYROLL_OFFICER` (Chuyên viên tính lương)**:
   - Khởi tạo kỳ tính lương, kích hoạt động cơ tính lương tự động, điều chỉnh số liệu hạch toán, trình duyệt bảng lương, phát hành phiếu lương điện tử và xuất báo cáo tài chính nhân sự.
4. **`DEPARTMENT_MANAGER` (Trưởng bộ phận / Quản lý trực tiếp)**:
   - Quản lý nhân sự trong phạm vi phòng ban mình phụ trách: xem lịch, duyệt đổi ca, duyệt giải trình chấm công, phê duyệt đơn nghỉ phép, đánh giá điểm KPI định kỳ của nhân viên cấp dưới.
5. **`EMPLOYEE` (Nhân viên thông thường)**:
   - Thực hiện check-in/out bằng QR và GPS, xem lịch ca cá nhân, gửi đơn xin đổi ca, gửi đơn giải trình công, nộp đơn xin nghỉ phép, tự chấm điểm KPI, xem và tải phiếu lương cá nhân.

---

## 2. NGUYÊN TẮC PHÂN VÙNG DỮ LIỆU (DATA SCOPING RULES)

Bên cạnh quyền thao tác (Actions: Read/Write/Delete), hệ thống bắt buộc kiểm soát **Phạm vi dữ liệu (Data Scope)** ở tầng truy vấn cơ sở dữ liệu:

- **`GLOBAL`**: Toàn bộ dữ liệu của tất cả nhân viên và phòng ban trong công ty. Áp dụng cho: `SUPER_ADMIN`, `HR_ADMIN`, `PAYROLL_OFFICER`.
- **`DEPARTMENT`**: Chỉ các dữ liệu thuộc phòng ban mà người dùng đang quản lý (`employee.department_id === current_user.department_id` hoặc các phòng ban con). Áp dụng cho: `DEPARTMENT_MANAGER`.
- **`SELF`**: Chỉ dữ liệu của chính cá nhân người dùng (`record.employee_id === current_user.employee_id`). Áp dụng cho: `EMPLOYEE`.

---

## 3. MA TRẬN PHÂN QUYỀN TOÀN DIỆN (PERMISSION MATRIX)

| Mã Quyền (Permission Code) | Phân hệ | SUPER_ADMIN | HR_ADMIN | PAYROLL_OFFICER | DEPT_MANAGER | EMPLOYEE | Phạm vi áp dụng |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Hồ sơ & Cơ cấu** | | | | | | | |
| `dept:read` | Organization | ✅ | ✅ | ✅ | ✅ | ✅ | Global |
| `dept:write` | Organization | ✅ | ✅ | ❌ | ❌ | ❌ | Global |
| `position:read` | Organization | ✅ | ✅ | ✅ | ✅ | ✅ | Global |
| `position:write` | Organization | ✅ | ✅ | ❌ | ❌ | ❌ | Global |
| `worksite:manage` | Organization | ✅ | ✅ | ❌ | ❌ | ❌ | Global |
| `employee:read_all` | HR Core | ✅ | ✅ | ✅ | ❌ | ❌ | Global |
| `employee:read_dept` | HR Core | ❌ | ❌ | ❌ | ✅ | ❌ | Department |
| `employee:read_self` | HR Core | ✅ | ✅ | ✅ | ✅ | ✅ | Self |
| `employee:write` | HR Core | ✅ | ✅ | ❌ | ❌ | ❌ | Global |
| `employee:delete` | HR Core | ✅ | ❌ | ❌ | ❌ | ❌ | Global (Soft delete) |
| **Lịch ca & Chấm công** | | | | | | | |
| `shift:manage` | Schedules | ✅ | ✅ | ❌ | ❌ | ❌ | Global |
| `schedule:read` | Schedules | ✅ | ✅ | ✅ | ✅ | ✅ | Contextual Scope |
| `schedule:assign` | Schedules | ✅ | ✅ | ❌ | ✅ | ❌ | Department / Global |
| `schedule:swap_request`| Schedules | ❌ | ❌ | ❌ | ❌ | ✅ | Self |
| `schedule:swap_approve`| Schedules | ✅ | ✅ | ❌ | ✅ | ❌ | Department / Global |
| `attendance:kiosk` | Attendance | ✅ | ✅ | ❌ | ❌ | ❌ | Kiosk Display Only |
| `attendance:checkin` | Attendance | ✅ | ✅ | ✅ | ✅ | ✅ | Self (QR/GPS) |
| `attendance:read_all` | Attendance | ✅ | ✅ | ✅ | ❌ | ❌ | Global |
| `attendance:read_dept`| Attendance | ❌ | ❌ | ❌ | ✅ | ❌ | Department |
| `attendance:read_self`| Attendance | ✅ | ✅ | ✅ | ✅ | ✅ | Self |
| `attendance:adjust_request`| Attendance | ✅ | ✅ | ✅ | ✅ | ✅ | Self |
| `attendance:adjust_review` | Attendance | ✅ | ✅ | ❌ | ✅ | ❌ | Department / Global |
| **Nghỉ phép & Ngày lễ** | | | | | | | |
| `leave_type:manage` | Leave | ✅ | ✅ | ❌ | ❌ | ❌ | Global |
| `leave:request` | Leave | ✅ | ✅ | ✅ | ✅ | ✅ | Self |
| `leave:read_all` | Leave | ✅ | ✅ | ✅ | ❌ | ❌ | Global |
| `leave:read_dept` | Leave | ❌ | ❌ | ❌ | ✅ | ❌ | Department |
| `leave:approve` | Leave | ✅ | ✅ | ❌ | ✅ | ❌ | Department / Global |
| **KPI & Hiệu suất** | | | | | | | |
| `kpi:template_manage` | KPI | ✅ | ✅ | ❌ | ❌ | ❌ | Global |
| `kpi:assign` | KPI | ✅ | ✅ | ❌ | ✅ | ❌ | Department / Global |
| `kpi:self_review` | KPI | ✅ | ✅ | ✅ | ✅ | ✅ | Self |
| `kpi:manager_evaluate`| KPI | ✅ | ✅ | ❌ | ✅ | ❌ | Department / Global |
| `kpi:read_summary` | KPI | ✅ | ✅ | ✅ | ✅ | ❌ | Department / Global |
| **Thưởng & Phạt** | | | | | | | |
| `reward:read` | Rewards | ✅ | ✅ | ✅ | ✅ | ❌ | Department / Global |
| `reward:create` | Rewards | ✅ | ✅ | ✅ | ✅ | ❌ | Department / Global |
| `reward:approve` | Rewards | ✅ | ✅ | ❌ | ❌ | ❌ | Global (C-Level/HR) |
| **Tính lương & Phiếu lương**| | | | | | | |
| `payroll:period_manage`| Payroll | ✅ | ❌ | ✅ | ❌ | ❌ | Global |
| `payroll:calculate` | Payroll | ✅ | ❌ | ✅ | ❌ | ❌ | Global |
| `payroll:view_all` | Payroll | ✅ | ❌ | ✅ | ❌ | ❌ | Global |
| `payroll:approve_hr` | Payroll | ✅ | ✅ | ❌ | ❌ | ❌ | Global |
| `payroll:approve_cfo`| Payroll | ✅ | ❌ | ❌ | ❌ | ❌ | Global |
| `payroll:lock` | Payroll | ✅ | ❌ | ✅ | ❌ | ❌ | Global |
| `payroll:view_self` | Payroll | ✅ | ✅ | ✅ | ✅ | ✅ | Self (My Payslip) |
| **Hệ thống & Kiểm toán** | | | | | | | |
| `audit:read` | System | ✅ | ❌ | ❌ | ❌ | ❌ | Global Immutable |
| `settings:manage` | System | ✅ | ❌ | ❌ | ❌ | ❌ | Global |
| `user:manage` | System | ✅ | ❌ | ❌ | ❌ | ❌ | Global |

---

## 4. CƠ CHẾ THỰC THI PHÂN QUYỀN TRONG CODE (ENFORCEMENT MECHANISM)

### 4.1. Middleware kiểm tra quyền nguyên tử (Server Action / API Guard)
```typescript
// src/lib/auth/guard.ts
export async function requirePermission(permission: string) {
  const session = await getAuthSession();
  if (!session) {
    throw new ApiError('UNAUTHORIZED', 'Bạn cần đăng nhập để thực hiện thao tác này', 401);
  }
  
  if (session.roles.includes('SUPER_ADMIN')) {
    return session; // Super Admin bypasses check
  }

  const hasPermission = session.permissions.includes(permission);
  if (!hasPermission) {
    throw new ApiError('FORBIDDEN', 'Bạn không có quyền thực hiện hành động này', 403);
  }

  return session;
}
```

### 4.2. Database Scoping Helper (Prisma Query Level)
```typescript
// src/lib/auth/scope.ts
export function applyDataScope(session: SessionUser, targetTable: 'employees' | 'leave_requests' | 'attendance') {
  if (session.roles.includes('SUPER_ADMIN') || session.roles.includes('HR_ADMIN')) {
    return {}; // Không giới hạn (Global Scope)
  }

  if (session.roles.includes('DEPARTMENT_MANAGER')) {
    return {
      employee: {
        department_id: session.department_id,
      }
    };
  }

  // Mặc định là nhân viên bình thường (Self Scope)
  return {
    employee_id: session.employee_id,
  };
}
```
