# PHASE 18 — ROLE-BASED DASHBOARD (ADMIN/HR, MANAGER, EMPLOYEE)

## ✅ STATUS: COMPLETED & VERIFIED 100%

**Completed At:** 2026-09-04T21:05:00+07:00  
**Test Results:** 371/371 tests PASS (23 test files)  
**TypeScript:** `tsc --noEmit` EXIT CODE 0 — Zero errors, zero warnings  
**Architecture Pattern:** Modular Monolith • Pure SVG Visualization • Zero Hardcoded Metrics • Multi-Role Guarded Scoping  

---

## 1. Executive Summary

Phase 18 builds an enterprise-grade, role-based dashboard for Antigravity HRMS supporting **Admin/HR**, **Manager**, and **Employee** roles. All metrics, KPIs, summaries, trends, and charts are calculated from live PostgreSQL/Prisma models with zero hard-coded figures, featuring modern Royal Luxury dark UI styling, interactive SVG charts (without external dependency conflicts), and seamless role switching.

---

## 2. Implemented Features & Role Specifications

### 👑 Admin / HR Dashboard
| Metric / Component | Description & Calculation |
|---|---|
| **Total Employees** | Đếm tổng số nhân viên đang hoạt động trong hệ thống (`deletedAt: null`, `status: 'ACTIVE'`) |
| **Present Today** | Số nhân viên đã check-in hôm nay (`workDate = today`, `checkInTime != null` hoặc trạng thái có mặt) |
| **Absent Today** | Số nhân viên vắng mặt: `Math.max(0, totalEmployees - presentToday - onLeaveToday)` |
| **Late Today** | Số nhân viên đi muộn trong ngày (`lateMinutes > 0`) |
| **Pending Leave** | Hàng đợi đơn xin nghỉ phép chờ xử lý (`leaveRequest` với `status: 'PENDING'`) |
| **Pending Attendance** | Hàng đợi giải trình công / chấm công bù chờ duyệt (`attendanceAdjustment` với `status: 'PENDING'`) |
| **Payroll Status** | Trạng thái kỳ lương gần nhất (Tên kỳ, mã, `DRAFT/SUBMITTED/APPROVED/PAID`, tổng chi trả Gross & Net, số lượng nhân sự) |
| **Overtime Hours** | Tổng giờ tăng ca hôm nay và lũy kế toàn công ty trong tháng (`attendance.otHours`) |
| **Bonus** | Tổng tiền khen thưởng đã duyệt trong tháng (`employeeBonusPenalty` where `type = 'BONUS'` & `status = 'APPROVED'`) |
| **Penalty** | Tổng tiền kỷ luật / phạt đã duyệt trong tháng (`employeeBonusPenalty` where `type = 'PENALTY'` & `status = 'APPROVED'`) |
| **7-Day Attendance Trend Chart** | Biểu đồ SVG đa cột thể hiện số lượng Có mặt, Đi muộn, Vắng mặt trong 7 ngày gần nhất |
| **Department Headcount & Budget** | Thống kê số lượng nhân sự và tổng quỹ lương theo từng phòng ban (TECH, HR, SALES) |

---

### 👔 Manager Dashboard
| Metric / Component | Description & Calculation |
|---|---|
| **Team Attendance** | Tỷ lệ điểm danh của phòng ban: quân số có mặt hôm nay / tổng nhân sự bộ phận, % tỷ lệ |
| **Lateness** | Đi muộn trong ngày (số lượng người, tổng phút muộn) và số lần đi muộn trong tuần của team |
| **KPI** | Điểm KPI trung bình của team (`averageScore`), % hoàn thành mục tiêu (`averageCompletionRate`), số bài chờ chấm |
| **Approval Queue** | Hàng đợi phê duyệt phân loại tab: Đơn phép, Giải trình công, Đánh giá KPI, Đề xuất Thưởng/Phạt |
| **Live Team Presence Table** | Bảng danh sách thành viên trực thuộc với giờ check-in, check-out, số phút muộn và badge trạng thái thời gian thực |
| **Team Attendance 7-Day Chart** | Biểu đồ SVG xu hướng điểm danh riêng cho phòng ban của quản lý |

---

### 👤 Employee Dashboard
| Metric / Component | Description & Calculation |
|---|---|
| **Today's Attendance** | Giờ check-in, check-out, phương thức (QR/GPS), số phút muộn, giờ làm thực tế, giờ tăng ca, trạng thái ("Đang làm việc", "Đã kết thúc ca", "Chưa check-in") |
| **Working Hours** | Giờ làm hôm nay, tổng giờ làm tích lũy tháng, giờ chuẩn 176h, vòng tròn tiến độ SVG Donut Ring |
| **Overtime** | Giờ tăng ca hôm nay và tổng giờ tăng ca tích lũy trong tháng |
| **Leave Balance** | Số ngày phép đã dùng trong năm, hạn mức 12 ngày, số ngày phép còn lại, số đơn phép đang chờ duyệt, lịch sử nghỉ phép gần nhất |
| **KPI Scorecard** | Điểm số KPI kỳ hiện tại, % hoàn thành mục tiêu, trạng thái duyệt, chi tiết từng chỉ tiêu (Thực tế / Mục tiêu / Đơn vị / Thưởng) |
| **Salary** | Lương hợp đồng (Gross), đơn giá giờ làm, ước tính lương thực nhận (Net) |
| **Payslip** | Thẻ thông tin phiếu lương gần nhất kèm nút xem chi tiết và **Tải PDF thật trực tiếp** |
| **Notifications** | Số lượng thông báo chưa đọc, danh sách thông báo gần đây, hành động đánh dấu đã đọc |
| **14-Day Work Hours Chart** | Biểu đồ SVG mượt mà thể hiện giờ làm thực tế so sánh với định mức chuẩn 8h/ngày |

---

## 3. Danh Sách Tệp Mã Nguồn Mới & Chỉnh Sửa

| Tệp | Mô tả |
|---|---|
| [`src/lib/services/dashboard.service.ts`](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/src/lib/services/dashboard.service.ts) | Service nghiệp vụ trích xuất và tính toán toàn bộ số liệu thời gian thực từ Prisma models |
| [`src/lib/services/__tests__/dashboard.service.test.ts`](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/src/lib/services/__tests__/dashboard.service.test.ts) | 7 bài kiểm thử đơn vị & tích hợp bao quát Admin/HR, Manager, Employee, Notifications, Edge cases |
| [`src/app/api/v1/dashboard/route.ts`](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/src/app/api/v1/dashboard/route.ts) | Route API hợp nhất hỗ trợ auto-detect vai trò và chuyển đổi góc nhìn qua `?role=admin\|manager\|employee` |
| [`src/app/api/v1/dashboard/admin/route.ts`](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/src/app/api/v1/dashboard/admin/route.ts) | API bảo vệ theo role `admin`, `hr` |
| [`src/app/api/v1/dashboard/manager/route.ts`](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/src/app/api/v1/dashboard/manager/route.ts) | API bảo vệ theo role `manager`, `admin`, `hr` |
| [`src/app/api/v1/dashboard/employee/route.ts`](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/src/app/api/v1/dashboard/employee/route.ts) | API cho nhân viên tự phục vụ |
| [`src/app/api/v1/dashboard/notifications/route.ts`](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/src/app/api/v1/dashboard/notifications/route.ts) | API đánh dấu thông báo đã đọc |
| [`src/components/dashboard/SvgCharts.tsx`](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/src/components/dashboard/SvgCharts.tsx) | Hệ thống biểu đồ SVG thuần cao cấp: Multi-series Bar Chart, Area/Line Chart, Donut Progress Ring |
| [`src/components/dashboard/StatCard.tsx`](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/src/components/dashboard/StatCard.tsx) | Thẻ hiển thị chỉ số Royal Luxury với glow, badge và icon |
| [`src/components/dashboard/AdminHrDashboardView.tsx`](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/src/components/dashboard/AdminHrDashboardView.tsx) | Giao diện Admin/HR với 10 chỉ số, biểu đồ xu hướng 7 ngày, cơ cấu phòng ban và lối tắt xử lý |
| [`src/components/dashboard/ManagerDashboardView.tsx`](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/src/components/dashboard/ManagerDashboardView.tsx) | Giao diện Quản lý với điểm danh team, đi muộn, KPI, hàng đợi duyệt tab động |
| [`src/components/dashboard/EmployeeDashboardView.tsx`](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/src/components/dashboard/EmployeeDashboardView.tsx) | Giao diện Nhân viên với chấm công hôm nay, giờ làm, tăng ca, phép, KPI, phiếu lương, thông báo |
| [`src/components/dashboard/DashboardClient.tsx`](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/src/components/dashboard/DashboardClient.tsx) | Client wrapper với bộ chuyển đổi góc nhìn theo quyền, làm mới dữ liệu và xử lý loading |
| [`src/app/dashboard/page.tsx`](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/src/app/dashboard/page.tsx) | Trang `/dashboard` chính thức |
| [`src/app/page.tsx`](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/src/app/page.tsx) | Tích hợp Dashboard trực tiếp vào trang chủ `/` |
| [`prisma/seed.ts`](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/prisma/seed.ts) | Nạp sẵn 14 ngày điểm danh mẫu, đơn phép, giải trình công, KPI, thưởng phạt, kỳ lương, thông báo |

---

## 4. Kết Quả Kiểm Thử (Verification Summary)

```
Test Files  23 passed (23)
Tests       371 passed (371)
Time        ~38s
TypeScript  tsc --noEmit EXIT CODE 0
```

- **Zero Regression**: Toàn bộ 364 tests trước đó (bao gồm Auth, Employee, Shifts, QR Attendance, GPS, Leaves, KPI, Bonuses, Penalties, Payroll Engine, Payslip PDF) vẫn duy trì tỷ lệ đạt 100%.
- **Zero Mocks trong nghiệp vụ**: Dữ liệu hiển thị trên dashboard được tính toán hoàn toàn từ câu truy vấn cơ sở dữ liệu thật thông qua Prisma.
