# 07 · Đặc tả chức năng

Ký hiệu trạng thái: ✅ đã có trong v1 (`legacy/envvault.html`) · 🆕 mới ở v2 · ⏳ để sau.
Ký hiệu ưu tiên: **P1** bắt buộc cho bản đầu · **P2** nên có · **P3** tuỳ chọn.

## 1. Tài khoản và mở khoá

| ID | Chức năng | Ưu tiên | Trạng thái |
|---|---|---|---|
| F-AUTH-01 | Tạo tài khoản: username + master password (nhập 2 lần, có thanh đo độ mạnh, cảnh báo nếu < 12 ký tự) | P1 | 🆕 |
| F-AUTH-02 | Đăng nhập trên thiết bị mới | P1 | 🆕 |
| F-AUTH-03 | Mở khoá bằng master password, chạy được cả khi offline | P1 | ✅ (v1 dùng file) → 🆕 |
| F-AUTH-04 | Mở khoá bằng passkey (vân tay/Face ID), bật hoặc tắt theo từng thiết bị | P1 | 🆕 |
| F-AUTH-05 | Khoá thủ công; tự khoá khi không thao tác; tự khoá khi app chuyển sang nền (mobile) | P1 | ✅ một phần (v1 chỉ có tự khoá khi không thao tác) |
| F-AUTH-06 | Đổi master password | P1 | ✅ → 🆕 (theo luồng mới) |
| F-AUTH-07 | Quản lý thiết bị: xem và thu hồi session | P2 | 🆕 |
| F-AUTH-08 | Đăng xuất (tuỳ chọn xoá dữ liệu cục bộ) | P1 | 🆕 |
| F-AUTH-09 | Xoay khoá của một vault; xoay khoá tài khoản | P3 | 🆕 |
| F-AUTH-10 | Recovery key in ra giấy | P3 | ⏳ |
| F-AUTH-11 | Chỉnh thời gian tự khoá trong cài đặt (desktop: không thao tác, mặc định 10 phút; mobile: sau khi chuyển nền, mặc định 60 giây) | P1 | 🆕 |

## 1b. Vault

Schema, API, lưu trữ và sync hỗ trợ nhiều vault từ đầu (M1–M3). Giao diện quản lý vault làm sau.

| ID | Chức năng | Ưu tiên | Trạng thái |
|---|---|---|---|
| F-VLT-01 | Tạo sẵn một vault mặc định khi đăng ký; mọi chức năng khác chạy trên vault đang chọn | P1 | 🆕 |
| F-VLT-02 | Tạo, đổi tên, đặt màu, xoá vault (xoá phải nhập lại mật khẩu, không xoá được vault cuối cùng) | P2 | 🆕 |
| F-VLT-03 | Chuyển vault: bộ chọn ở đầu cột trái (desktop) hoặc đầu trang chủ (mobile); tìm kiếm có tuỳ chọn "mọi vault" | P2 | 🆕 |
| F-VLT-04 | Chuyển hoặc sao chép item sang vault khác (scope bị bỏ vì env thuộc vault cũ) | P3 | 🆕 |

## 2. Project và môi trường

| ID | Chức năng | Ưu tiên | Trạng thái |
|---|---|---|---|
| F-PRJ-01 | Thêm project, kèm danh sách env khởi tạo (mặc định `dev, uat, staging, prod`) | P1 | ✅ |
| F-PRJ-02 | Đổi tên hoặc xoá project; xoá thì hỏi xác nhận và báo số item bị ảnh hưởng | P1 | ✅ |
| F-PRJ-03 | Thêm, đổi tên, xoá env | P1 | ✅ |
| F-PRJ-04 | Sắp xếp thứ tự project/env | P2 | 🆕 |
| F-PRJ-05 | Đặt màu cho env (ví dụ prod màu đỏ); env prod hiện cảnh báo nhẹ khi copy | P2 | 🆕 |

## 3. Item

| ID | Chức năng | Ưu tiên | Trạng thái |
|---|---|---|---|
| F-ITM-01 | Tạo item theo loại với field mẫu. Bước 1 chọn loại (lưới icon + mô tả), bước 2 điền form. Loại: login, api_key, token, ssh, doc, note (v1) và **db, server, vpn** (v2) | P1 | ✅ (v2 thêm 3 loại) |
| F-ITM-02 | Thêm, xoá, sắp xếp field tuỳ ý; đổi `kind` của field | P1 | ✅ |
| F-ITM-03 | **Gán item vào nhiều env, kể cả khác project** | P1 | ✅ |
| F-ITM-04 | Sửa item: mọi env được gán đều thấy giá trị mới | P1 | ✅ |
| F-ITM-05 | **Fork** item cho một env (tạo bản riêng, gỡ env đó khỏi item gốc, lưu `forkedFrom`) | P1 | ✅ |
| F-ITM-06 | Nhân bản item | P2 | ✅ |
| F-ITM-07 | Xoá item: chuyển vào thùng rác (tombstone `deletedAt`, giữ nội dung) | P1 | ✅ → 🆕 |
| F-ITM-08 | Lịch sử phiên bản (20 bản), xem diff, khôi phục | P1 | ✅ (v2 thêm diff) |
| F-ITM-09 | Ngày hết hạn và danh sách "Sắp hết hạn" (≤ 14 ngày) | P2 | ✅ |
| F-ITM-10 | Sinh mật khẩu ngay cạnh field `secret`: chế độ *Ngẫu nhiên* (độ dài 8–64, chữ hoa, số, ký tự đặc biệt) và *Dễ nhớ* (ghép từ) | P2 | ✅ (v2 thêm tuỳ chọn) |
| F-ITM-11 | Tag, đánh dấu yêu thích | P3 | 🆕 |
| F-ITM-12 | **Thùng rác**: xem, khôi phục item đã xoá trong 30 ngày; *Xoá vĩnh viễn* từng item hoặc *Dọn thùng rác*; tự xoá trắng khi quá 30 ngày | P1 | 🆕 |
| F-ITM-13 | Badge ⚠ cho item có xung đột đồng bộ, **tô sáng đúng field/thuộc tính bị xung đột**, kèm nút "Đã xử lý" | P1 | 🆕 |
| F-ITM-14 | Hiện chip "Dùng chung: uat, staging (+1 project khác)" trong chi tiết item | P1 | ✅ |
| F-ITM-15 | **Field OTP (TOTP)**: nhập secret base32 hoặc URI `otpauth://`, hoặc **quét QR** bằng camera / từ ảnh chụp màn hình; màn xem hiện mã hiện tại kèm đếm ngược, copy mã | P2 | 🆕 |
| F-ITM-16 | **Field từ file**: field nhiều dòng đọc nội dung từ file văn bản (≤ 64 KB, ví dụ `.ovpn`, cert, SSH key) và tải lại thành file đúng tên ở màn xem | P2 | 🆕 |

## 4. Xem và tìm kiếm

| ID | Chức năng | Ưu tiên | Trạng thái |
|---|---|---|---|
| F-VIEW-01 | Các bộ lọc: Tất cả · Chưa gán · Sắp hết hạn · theo Project · theo Env | P1 | ✅ |
| F-VIEW-02 | Tìm kiếm theo tiêu đề, field không phải secret, ghi chú, tag (Cmd/Ctrl+K) | P1 | ✅ |
| F-VIEW-03 | Copy field (xoá clipboard sau 30 giây), hiện/ẩn secret | P1 | ✅ |
| F-VIEW-04 | Mở URL trong tab mới | P1 | ✅ |
| F-VIEW-05 | Gần đây/yêu thích ở màn hình chính trên mobile | P2 | 🆕 |

## 5. Đồng bộ và dữ liệu

| ID | Chức năng | Ưu tiên | Trạng thái |
|---|---|---|---|
| F-SYNC-01 | Đồng bộ tự động, ưu tiên offline, theo từng vault, **gộp theo field** (xem [05-sync.md](05-sync.md)) | P1 | 🆕 |
| F-SYNC-02 | Thanh trạng thái đồng bộ và nút "Đồng bộ ngay" | P1 | 🆕 |
| F-SYNC-03 | Xem và khôi phục snapshot trên server (theo từng vault) | P2 | 🆕 |
| F-DATA-01 | Tải backup đã mã hoá (`keymesh-backup`), chọn một hoặc tất cả vault | P1 | ✅ (v1 là chính file) → 🆕 |
| F-DATA-02 | Import backup v2 vào vault đang chọn hoặc vault mới | P1 | 🆕 |
| F-DATA-03 | **Export sang Bitwarden JSON** (dạng tổ chức) **theo từng vault**: mỗi cặp `Project/env` thành một collection, item dùng chung có nhiều `collectionIds`. Field `otp` đầu tiên của item login thành `login.totp`; các field còn lại thành custom field | P2 | 🆕 |
| F-DATA-04 | Export plaintext JSON/CSV, phải nhập lại mật khẩu và đọc cảnh báo | P3 | 🆕 |
| F-DATA-05 | Nhật ký hoạt động (đăng nhập, thiết bị, lỗi xung đột) | P3 | 🆕 |
| F-DATA-06 | **Bản sao tự động ra file** (chỉ Chromium desktop): chọn file một lần, app tự ghi đè `keymesh-backup` sau mỗi lần lưu/sync; chỉ ghi, không đọc để sync; báo khi cần cấp lại quyền | P2 | 🆕 |

## 6. PWA và mobile

| ID | Chức năng | Ưu tiên | Trạng thái |
|---|---|---|---|
| F-PWA-01 | Cài được lên màn hình chính (manifest, icon), mở ở chế độ standalone | P1 | 🆕 |
| F-PWA-02 | Mở được khi offline (Service Worker cache app shell) | P1 | 🆕 |
| F-PWA-03 | Báo khi có phiên bản app mới và cho bấm để tải lại | P2 | 🆕 |
| F-PWA-04 | Giao diện mobile riêng (xem bên dưới) | P1 | 🆕 |
| F-PWA-05 | Giao diện sáng/tối theo hệ thống | P1 | ✅ |
| F-PWA-06 | Share target: chia sẻ link từ app khác vào để tạo nhanh item `doc` (chỉ Android) | P3 | ⏳ |

---

## Thiết kế giao diện

### Desktop (≥ 900px): 3 cột như v1

```
┌──────────────┬────────────────────┬──────────────────────────────┐
│ 🔍 Tìm (⌘K)  │ Payment GW › uat   │ Partner X portal   [Sửa] [⋯] │
│ ★ Tất cả     │ ──────────────────  │ LOGIN · Dùng chung: uat,     │
│ ○ Chưa gán   │ LOGIN Partner X ⇆  │          staging             │
│ ⏰ Sắp hết hạn│ API   Stripe test  │ Username  acme_uat     [⧉]   │
│ ▾ Payment GW │ DOC   Runbook      │ Password  ••••••  [👁] [⧉]   │
│    dev       │                    │ URL       https://…    [↗]   │
│   ▸uat       │                    │ Ghi chú …                    │
│    staging   │                    │ Lịch sử (4) · Fork cho env…  │
│ ▸ CRM        │          [+ Item]  │                              │
├──────────────┴────────────────────┴──────────────────────────────┤
│ ● Đã đồng bộ · 2 phút trước                         🔒 Khoá       │
└──────────────────────────────────────────────────────────────────┘
```

### Mobile (< 900px): dạng stack, chú trọng **xem và copy nhanh**

```
 Màn 1: Trang chủ            Màn 2: Env             Màn 3: Item
┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐
│ KeyMesh     ● 🔒  │   │ ‹ Payment GW      │   │ ‹ uat        [Sửa]│
│ ┌───────────────┐ │   │ [dev][uat][stg][p]│   │ Partner X portal  │
│ │ 🔍 Tìm…        │ │   │ ───────────────── │   │ LOGIN · ⇆ uat,stg │
│ └───────────────┘ │   │ LOGIN Partner X ⇆ │   │ ┌───────────────┐ │
│ Gần đây           │   │ API   Stripe test │   │ │Username       │ │
│  Partner X · uat  │   │ DOC   Runbook     │   │ │acme_uat   [⧉] │ │
│  Stripe · dev     │   │                   │   │ ├───────────────┤ │
│ Dự án             │   │                   │   │ │Password       │ │
│  Payment GW   4 › │   │                   │   │ │•••••• [👁][⧉] │ │
│  CRM          3 › │   │                   │   │ └───────────────┘ │
│ ⏰ Sắp hết hạn (1) │   │             [ + ] │   │ Lịch sử · Fork    │
└───────────────────┘   └───────────────────┘   └───────────────────┘
```

Nguyên tắc cho mobile:

- **Từ lúc mở app đến lúc copy được mật khẩu: tối đa 3 lần chạm sau khi mở khoá** (mở khoá → chạm item ở *Gần đây* → copy).
- Env của một project hiện thành **tab ngang** để chuyển nhanh giữa uat và staging.
- Vùng chạm tối thiểu 44×44 px. Ô tìm kiếm luôn ở đầu trang chủ.
- Sửa item mở màn hình toàn trang; field secret dùng `autocomplete="off"`, `autocapitalize="off"` và `spellcheck="false"`.
- Vuốt từ mép trái hoặc bấm "‹" để quay lại; điều hướng dựa trên `history.pushState` để nút Back của Android hoạt động đúng.
- Khi chuyển nền thì khoá sau 60 giây (chỉnh được trong cài đặt) và che nội dung (Android: hiện lớp phủ trắng khi `visibilitychange` để màn đa nhiệm không chụp lại secret).

### Thông báo và trạng thái

| Trạng thái | Hiển thị |
|---|---|
| Đã đồng bộ | ● xanh |
| Có thay đổi chưa push | ● vàng "N thay đổi chờ" |
| Offline | ● xám "Offline" |
| Lỗi hoặc cần đăng nhập lại | ● đỏ, chạm vào để xem chi tiết |
| Có xung đột | Badge ⚠ trên item và số lượng ở trang chủ |

## Tiêu chí chấp nhận cho kịch bản chính

1. Tạo item "Partner X" gán vào `PaymentGW/uat` và `PaymentGW/staging` trên laptop. Trong ≤ 60 giây, item hiện trên điện thoại ở **cả hai** env.
2. Đổi mật khẩu của item trên điện thoại khi đang **offline**, rồi bật mạng lại. Laptop nhận được mật khẩu mới, và lịch sử có bản cũ.
3. Laptop và điện thoại cùng sửa **field Password** của item đó khi offline, rồi cả hai online. Item còn lại một bản, có badge ⚠ trên field Password, và lịch sử chứa bản thua.
   - Laptop sửa Password, điện thoại sửa Ghi chú của cùng item khi offline, rồi cả hai online. Item có **cả hai thay đổi** và **không** có badge ⚠.
   - Laptop gán item thêm vào `PaymentGW/prod`, điện thoại gán thêm vào `CRM/uat` khi offline. Sau khi đồng bộ, item nằm ở cả bốn env.
4. Mở app trên iPhone khi đang ở chế độ máy bay: vẫn mở khoá được bằng Face ID và xem được dữ liệu.
5. Fork item cho `staging`. Sửa bản fork không ảnh hưởng bản ở `uat`.
6. Export Bitwarden rồi import vào Vaultwarden thử nghiệm: item "Partner X" nằm trong 2 collection `PaymentGW/uat` và `PaymentGW/staging`.
7. Xoá item trên laptop. Item biến khỏi danh sách trên cả hai thiết bị, hiện trong *Thùng rác*. Khôi phục trên điện thoại thì item quay lại đủ field và lịch sử trên cả hai thiết bị.
8. Bật bản sao file trên Chrome desktop, sửa một item. Trong ≤ 15 giây file được ghi lại; import file đó vào một tài khoản thử nghiệm mở được bằng master password và thấy thay đổi vừa sửa.
