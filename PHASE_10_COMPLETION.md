# BÁO CÁO NGHIỆM THU: PHASE 10 — LEAVE MANAGEMENT (COMPLETE)
**ANTIGRAVITY MASTER PROJECT: HỆ THỐNG CHẤM CÔNG – NHÂN SỰ – KPI – THƯỞNG PHẠT – TÍNH LƯƠNG**
*Thời gian hoàn thành: 2026-09-04 | Trạng thái: COMPLETE & VERIFIED 100%*

---

## 1. TỔNG QUAN KẾT QUẢ NGHIỆM THU

Toàn bộ các tiêu chuẩn kiểm thử tự động, an toàn kiểu dữ liệu và chất lượng mã nguồn đều đã **VƯỢT QUA 100%**:

| Hạng mục kiểm tra | Chi tiết kỹ thuật | Kết quả |
| :--- | :--- | :---: |
| **Unit & Integration Tests** | `vitest run src/lib/services/__tests__/leave.service.test.ts` — 24/24 tests passed | **PASS** ✅ |
| **Full Project Test Suite** | `vitest run` — 200/200 tests passed (11 test suites) | **PASS** ✅ |
| **TypeScript Strict Checking** | `npx tsc --noEmit` — 0 errors across entire project | **PASS** ✅ |
| **Anti-Overlap Collision Guard** | Kiểm tra trùng lặp ngày phép & đi muộn cùng ngày | **PASS** ✅ |
| **RBAC & Self-Approval Prevention**| Chặn tự duyệt cho Manager & chặn duyệt trái bộ phận | **PASS** ✅ |

---

## 2. NỘI DUNG ĐÃ XÂY DỰNG & ĐÁP ỨNG ĐẦY ĐỦ YÊU CẦU

### A. Hỗ Trợ Đầy Đủ Các Loại Đơn Ngoại Lệ (Leave Request Types)
1. **Nghỉ phép (`LEAVE`)**:
   - Hỗ trợ chọn loại nghỉ phép (Phép năm, Nghỉ ốm, Việc riêng, Nghỉ không lương, v.v.).
   - Xác định ngày bắt đầu (`startDate`), ngày kết thúc (`endDate`), tổng số ngày dự kiến (`durationDays`).
2. **Xin đi muộn (`LATE_REQUEST`)**:
   - Khai báo ngày đi muộn, giờ dự kiến đến văn phòng (`expectedTime`), lý do cụ thể.
3. **Xin về sớm (`EARLY_LEAVE`)**:
   - Khai báo ngày về sớm, giờ dự kiến rời văn phòng (`expectedTime`), lý do cụ thể.

### B. Kiểm Tra Logic Nghiệp Vụ & Chặn Xung Đột (Anti-Collision & Guard Rails)
1. **Chặn đơn trùng lặp (Overlapping Leave Prevention)**:
   - Tự động quét và phát hiện các đơn nghỉ phép `PENDING` hoặc `APPROVED` có thời gian giao thoa (`startDate <= req.endDate && endDate >= req.startDate`).
   - Ngăn chặn gửi nhiều đơn đi muộn (`LATE_REQUEST`) hoặc về sớm (`EARLY_LEAVE`) trong cùng một ngày.
2. **Ràng buộc tính hợp lệ của ngày tháng (Invalid Dates Guard)**:
   - Nghiêm cấm `endDate < startDate`.
   - Giới hạn ngày trong quá khứ: Chặn các đơn tạo lùi quá 30 ngày so với hiện tại.
3. **Audit Trail & Tính toàn vẹn**:
   - Mọi thao tác nộp đơn, xét duyệt, từ chối, hủy đơn đều chạy trong Prisma `$transaction` và tự động ghi vết chi tiết vào `AuditLog`.
   - Lưu trữ rõ `approverId`, `approvedAt`, `approvalNotes`.

### C. Quy Trình Phê Duyệt & Phân Quyền (Approval Workflow & RBAC)
1. **Quyền nộp & hủy đơn**:
   - Nhân viên chỉ được nộp đơn cho chính mình, chỉ được hủy đơn khi ở trạng thái `PENDING`.
2. **Quy tắc xét duyệt cho Cấp Quản Lý (Manager)**:
   - Quản lý chỉ được duyệt đơn của nhân viên thuộc bộ phận do mình phụ trách (`managedDepartments`).
   - **Chặn tự duyệt (Self-Approval Block)**: Manager không được tự phê duyệt đơn xin nghỉ/đi muộn của chính mình (phải chuyển cấp trên hoặc HR).
3. **Quy tắc xét duyệt cho HR / Admin**:
   - Toàn quyền phê duyệt hoặc từ chối đơn của toàn bộ nhân viên công ty.
   - Bắt buộc nhập ghi chú giải trình (`approvalNotes`) khi từ chối đơn.

### D. Giao Diện Người Dùng & Dashboard
1. **Modal nộp đơn (`LeaveRequestModal.tsx`)**:
   - Giao diện 2 bước trực quan: Chọn loại yêu cầu (Nghỉ phép, Đi muộn, Về sớm) -> Điền form với preview thời gian và cảnh báo hợp lệ.
2. **Modal duyệt đơn (`LeaveProcessModal.tsx`)**:
   - Dành cho Quản lý & HR: Hiển thị đầy đủ thông tin nhân viên, loại đơn, thời gian, lý do; cho phép phê duyệt hoặc từ chối kèm lý do.
3. **Widget bảng tin Dashboard (`PendingLeavesWidget.tsx`)**:
   - Tích hợp tại trang chủ Dashboard (`/`), hiển thị 3 bộ đếm tức thời (Nghỉ phép chờ duyệt, Xin đi muộn chờ duyệt, Xin về sớm chờ duyệt) kèm danh sách 5 đơn gần nhất và nút xử lý trực tiếp.
4. **Trang quản lý đơn toàn diện (`/leaves`)**:
   - Bảng danh sách phân trang với các tab lọc theo trạng thái (`PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`) và lọc loại đơn.
   - Thao tác nhanh: Duyệt đơn, Từ chối đơn, Hủy đơn của tôi.

---

## 3. DANH SÁCH FILE ĐÃ TRIỂN KHAI

| Thành phần | Đường dẫn | Chức năng |
| :--- | :--- | :--- |
| **Logic nghiệp vụ** | `src/lib/services/leave.service.ts` | Xử lý CRUD đơn, kiểm tra trùng lặp, logic duyệt RBAC, thống kê dashboard |
| **Validation Schema** | `src/lib/validations/leave.ts` | Zod schema kiểm tra dữ liệu đầu vào |
| **API Endpoints** | `src/app/api/v1/leaves/route.ts` | GET danh sách (phân trang, lọc), POST tạo đơn mới |
| **API Chi tiết & Thao tác**| `src/app/api/v1/leaves/[id]/route.ts` | GET chi tiết đơn xin nghỉ |
| | `src/app/api/v1/leaves/[id]/process/route.ts` | PATCH xét duyệt/từ chối đơn |
| | `src/app/api/v1/leaves/[id]/cancel/route.ts` | POST hủy đơn của chính mình |
| | `src/app/api/v1/leaves/summary/route.ts` | GET thống kê số lượng đơn chờ duyệt |
| **UI Components** | `src/components/leaves/LeaveRequestModal.tsx` | Dialog tạo đơn nộp nghỉ phép/đi muộn/về sớm |
| | `src/components/leaves/LeaveProcessModal.tsx` | Dialog phê duyệt/từ chối đơn |
| | `src/components/leaves/PendingLeavesWidget.tsx` | Widget thống kê đơn chờ duyệt trên Dashboard |
| **Trang quản lý** | `src/app/leaves/page.tsx` | Giao diện quản lý danh sách đơn xin nghỉ phép |
| **Dashboard Home** | `src/app/page.tsx` | Tích hợp widget pending leaves và điều hướng /leaves |
| **Bộ kiểm thử** | `src/lib/services/__tests__/leave.service.test.ts` | 24 ca kiểm thử chuyên sâu cho toàn bộ quy trình |

---

## 4. KẾT QUẢ TEST CHI TIẾT (24/24 PASS)

```bash
 ✓ src/lib/services/__tests__/leave.service.test.ts > LeaveService.createLeaveRequest > 1. creates a LEAVE request successfully
 ✓ src/lib/services/__tests__/leave.service.test.ts > LeaveService.createLeaveRequest > 2. creates a LATE_REQUEST successfully
 ✓ src/lib/services/__tests__/leave.service.test.ts > LeaveService.createLeaveRequest > 3. creates an EARLY_LEAVE request successfully
 ✓ src/lib/services/__tests__/leave.service.test.ts > LeaveService.createLeaveRequest > 4. rejects when endDate < startDate
 ✓ src/lib/services/__tests__/leave.service.test.ts > LeaveService.createLeaveRequest > 5. rejects requests more than 30 days in the past
 ✓ src/lib/services/__tests__/leave.service.test.ts > LeaveService.createLeaveRequest > 6. prevents overlapping LEAVE requests
 ✓ src/lib/services/__tests__/leave.service.test.ts > LeaveService.createLeaveRequest > 7. prevents duplicate LATE_REQUEST on same day
 ✓ src/lib/services/__tests__/leave.service.test.ts > LeaveService.processLeaveRequest > 8. HR can approve a PENDING request
 ✓ src/lib/services/__tests__/leave.service.test.ts > LeaveService.processLeaveRequest > 9. HR can reject a PENDING request with notes
 ✓ src/lib/services/__tests__/leave.service.test.ts > LeaveService.processLeaveRequest > 10. Employee (no privileged roles) cannot process — throws 403
 ✓ src/lib/services/__tests__/leave.service.test.ts > LeaveService.processLeaveRequest > 11. Manager cannot self-approve their own request — throws 403
 ✓ src/lib/services/__tests__/leave.service.test.ts > LeaveService.processLeaveRequest > 12. Manager blocked from employee in different department — throws 403
 ✓ src/lib/services/__tests__/leave.service.test.ts > LeaveService.processLeaveRequest > 13. Non-PENDING request cannot be processed — throws 400
 ✓ src/lib/services/__tests__/leave.service.test.ts > LeaveService.processLeaveRequest > 14. Not-found request throws 404
 ✓ src/lib/services/__tests__/leave.service.test.ts > LeaveService.cancelLeaveRequest > 15. Employee can cancel their own PENDING request
 ✓ src/lib/services/__tests__/leave.service.test.ts > LeaveService.cancelLeaveRequest > 16. Employee cannot cancel another employee's request — throws 403
 ✓ src/lib/services/__tests__/leave.service.test.ts > LeaveService.cancelLeaveRequest > 17. Cannot cancel a non-PENDING (APPROVED) request — throws 400
 ✓ src/lib/services/__tests__/leave.service.test.ts > LeaveService.listLeaveRequests — RBAC scoping > 18. Employee sees only their own requests (scoped by employeeId)
 ✓ src/lib/services/__tests__/leave.service.test.ts > LeaveService.listLeaveRequests — RBAC scoping > 19. HR sees all requests (no RBAC restriction)
 ✓ src/lib/services/__tests__/leave.service.test.ts > LeaveService.listLeaveRequests — RBAC scoping > 20. Status filter applied correctly
 ✓ src/lib/services/__tests__/leave.service.test.ts > LeaveService.listLeaveRequests — RBAC scoping > 21. RequestType filter applied correctly
 ✓ src/lib/services/__tests__/leave.service.test.ts > LeaveService.listLeaveRequests — RBAC scoping > 22. Returns paginated meta
 ✓ src/lib/services/__tests__/leave.service.test.ts > LeaveService.getDashboardSummary > 23. HR dashboard returns correct pending counts
 ✓ src/lib/services/__tests__/leave.service.test.ts > LeaveService.getDashboardSummary > 24. Employee dashboard scoped to own requests

Test Files  1 passed (1)
     Tests  24 passed (24)
  Duration  2.58s
```
