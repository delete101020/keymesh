# 08 · Lộ trình và câu hỏi mở

## Các giai đoạn

| Giai đoạn | Nội dung | Kết quả kiểm chứng được |
|---|---|---|
| **M0 · Đã xong** | v1 một file HTML, lưu file cục bộ hoặc localStorage | `legacy/envvault.html` |
| **M1 · Nền tảng** | Tạo repo git; tách v1 thành module (`crypto`, `model`, `store`, `ui`); vault v2 cùng migrate v1→v2; IndexedDB; khoá phân tầng (`vaultKey`); `merge.js` có unit test | Chạy cục bộ được, import được file v1, test gộp dữ liệu pass |
| **M2 · PWA mobile** | Manifest, Service Worker, giao diện mobile, tự khoá khi chuyển nền | Cài lên Android và iPhone, mở được khi offline |
| **M3 · Đồng bộ** | Pages Functions, D1 migration, auth, `GET/PUT /api/vault`, sync engine, thanh trạng thái | Đạt tiêu chí chấp nhận 1–3 trong [07](07-features.md#tiêu-chí-chấp-nhận-cho-kịch-bản-chính) |
| **M4 · Passkey** | Mở khoá bằng WebAuthn PRF | Đạt tiêu chí 4 |
| **M5 · Hoàn thiện** | Snapshot, quản lý thiết bị, đổi mật khẩu theo luồng mới, export Bitwarden, audit log | Đạt tiêu chí 6 |
| **M6 · Tuỳ chọn** | Argon2id (WASM), recovery key, thùng rác, gộp theo field, share target | — |

M1 và M2 vẫn dùng được hoàn toàn cục bộ mà không cần Cloudflare, nên có thể dùng ngay trong lúc làm M3.

## Hướng mở rộng: chia sẻ nhiều người (nếu không chuyển sang Vaultwarden)

Phần này chỉ phác thảo để đảm bảo thiết kế hiện tại không cản đường, chưa phải cam kết sẽ làm.

- Mỗi env có một **khoá env** riêng. Item được mã hoá riêng, rồi khoá item được bọc bằng khoá của từng env mà item thuộc về. Nhờ vậy, item dùng chung vẫn chỉ có **một bản**.
- Mỗi thành viên có một cặp khoá (ECDH P-256 trong WebCrypto). Khoá env được bọc bằng khoá công khai của từng thành viên có quyền với env đó, đúng mô hình phân quyền theo project+env.
- Server cần chuyển từ một blob sang **các dòng theo item** (`items`, `item_keys`, `env_keys`, `members`), nghĩa là phải viết lại phần sync.
- Thu hồi quyền của một người thì phải xoay khoá env và đổi các secret mà người đó đã thấy.

Khối lượng này gần bằng làm lại Bitwarden. **Khuyến nghị:** khi cần chia sẻ, chuyển sang Vaultwarden qua F-DATA-03, thay vì tự làm.

## Câu hỏi mở

| # | Câu hỏi | Đề xuất mặc định |
|---|---|---|
| Q1 | Dùng domain riêng hay `*.pages.dev`? | `pages.dev` trước; nếu có domain thì thêm Cloudflare Access |
| Q2 | Có cần thùng rác (F-ITM-12) không, hay xoá trắng ngay là đủ? | Xoá trắng ngay; snapshot trên server đã đóng vai trò lưới an toàn trong khoảng 30 phiên bản |
| Q3 | Mobile tự khoá sau bao lâu khi chuyển nền? | 60 giây, chỉnh được trong cài đặt |
| Q4 | Có giữ chế độ lưu file cục bộ (File System Access) trên desktop không? | Không giữ ở v2 cho đơn giản; thay bằng tải backup thủ công. `legacy/` vẫn còn nếu cần |
| Q5 | Có cần tách vault công việc và vault cá nhân không? | Không; dùng project để phân biệt |
| Q6 | Có cần gộp theo field ngay từ đầu không? | Chưa cần; gộp theo item và lưu lịch sử là đủ |
| Q7 | Dùng tiền tố id (`p_`, `e_`, `i_`) hay hex trần như v1? | Dùng tiền tố cho dễ debug; khi migrate thì giữ id cũ |
