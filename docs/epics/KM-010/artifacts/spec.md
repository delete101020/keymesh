# Spec — Backup, bản sao file và export Bitwarden

**Epic ID:** `KM-010`
**Owner:** Product Owner
**Status:** Draft
**Created:** `2026-11-02`
**Traces to:** `intent.md`

---

## 1. Overview

> *One paragraph: what this is, and which line of `intent.md` it serves.*

KM-010 cho chủ tài khoản ba lối ra ở intent §1: tải file backup đã mã hoá và import lại khi mất nơi chứa, bản sao tự ghi ra file để không phải nhớ tải (chỉ Chromium desktop), và export Bitwarden để chuyển sang Vaultwarden mà giữ được quan hệ một item nhiều `Project/env`. Đạt nghĩa là **đạt bằng tay với dữ liệu thử, trên server chạy cục bộ, với trình duyệt laptop cùng giả lập Android, rồi cùng giả lập iOS**; riêng bản sao file chỉ kiểm trên Chromium desktop (intent §5). Kế thừa không đổi từ KM-003: cách giữ dữ liệu trên thiết bị, cách mở khoá, chuẩn hoá NFC. Điều spec này đổi: thu hẹp `KM-003-FR47` (Concern 13); `docs/03`, `docs/05` về lúc ghi bản sao (Concern 8); F-DATA-03 thêm điều kiện nhập lại mật khẩu; `KM-010.md` thêm phụ thuộc KM-006, KM-008. Trả lời câu 1–5 ở intent §7 (Concern 1–7); câu 6, 7 hoãn cho build-plan (Concern 15, 16). Đạt ở đây không mở điều kiện nào về secret thật.

## 2. Constraints applied

> *The skills, standards and docs loaded before writing this spec. A reviewer must
> be able to tell what this spec was bound by.*

| Source | What it constrains |
|---|---|
| `CLAUDE.md` | `.claude/CLAUDE.md`: JavaScript thuần, không build, không phụ thuộc thứ ba ở runtime lẫn test; phân lớp `ui/` → `app.js` → `store`/`sync`/`mirror` → `core/`; `core/` thuần, là hợp đồng ở 09; server không giải mã gì; CSP chỉ `'self'`, không `innerHTML` với dữ liệu người dùng; không ghi password, khoá, secret, plaintext ra `console`, lỗi hay URL |
| `.aidlc/workspace.yaml`, `state.json`, `inputs.json` | `artifact_language: vi`; `strict_mode: true`; chưa có feedback hay lần từ chối; `from_epic: KM-003`. Không có project skill nào ràng buộc thêm |
| `docs/epics/KM-010/artifacts/intent.md`, `KM-010.md` | Phạm vi, "Not this", bảy câu hỏi mở, mức kiểm |
| `docs/epics/KM-003` (`intent`, `spec`) | FR07 (câu báo sai mật khẩu), FR13 (một tab mở khoá), FR28 (khôi phục giữ env đang gán), FR38–FR39, FR47, AC44, Concern 14 (file plaintext do người dùng chủ động tải) |
| `docs/epics/KM-006/artifacts/spec.md` | FR09, FR11, FR13 (xoá dữ liệu gỡ cả bản sao file), FR23, FR25, NFR07, Concern 8 |
| `docs/epics/KM-008/artifacts/spec.md` | FR09, FR14, FR19, FR24 (nhập lại mật khẩu kể cả khi mở bằng passkey), FR38–FR40 (lệch giờ chặn thay đổi), câu ở FR08 về file backup |
| `docs/epics/KM-009` (`spec`, `plan`) | FR27–FR33, Concern 1, 2, 23; Amendment 1 (item sống lại từ xoá trắng có badge khi có lần gộp thật) |
| `docs/03-data-model.md` | Định dạng `keymesh-backup`, `meta.mirror`, kiểu field, mẫu field, `reason` của lịch sử |
| `docs/04-security.md` | CSP, dòng Bản sao file, mô hình mối đe doạ, điều kiện về secret thật |
| `docs/05-sync.md` | Quy tắc gộp, bảng xoá, § Bản sao tự động ra file |
| `docs/06-api.md` | Body tối đa 2 000 000 byte; `409 vault_exists` theo id trên toàn server |
| `docs/07-features.md`, `docs/08-roadmap.md` | F-DATA-01, 02, 03, 06; tiêu chí 6, 8; Q4, Q8 |
| `docs/09-core-api.md` | `unlockWithPassword`, `validateVault`, `kdf.iter` ngoài khoảng là `unsupported`; đổi hợp đồng thì sửa 09 |
| `src/public/js/core/*`, `store.js`, `test/ui-static.test.js`, `test/e2e/sweep.e2e.js` (đã đọc, 2026-11-02) | Trên `master` chưa có mã của KM-006, KM-008, KM-009; hai test đang cấm chữ `backup`, `import`, `export` |
| Chạy thử trên `merge.js`, `model.js` thật (2026-11-02) | Kết quả ở Concern 1 |
| Tài liệu ngoài (tra 2026-11-02): [Bitwarden: Import from a Custom File](https://bitwarden.com/help/condition-bitwarden-import/), [Vaultwarden PR #3087](https://github.com/dani-garcia/vaultwarden/pull/3087), [caniuse `showSaveFilePicker`](https://caniuse.com/mdn-api_window_showsavefilepicker) | Dạng JSON tổ chức, giới hạn Notes 10 000 ký tự sau mã hoá, Chrome Android nay cũng có API chọn file. **Chưa kiểm trên Vaultwarden thật** (Concern 5, 16) |
| Trả lời của originator (2026-11-02, phiên `/spec` và intent) | Concern 1, 3, 5; các mục "originator chốt" ở intent §5, §6 |

## 3. User scenarios

### 3.1 Primary flow
> *Given / when / then, from the user's point of view.*

Dữ liệu thử, server cục bộ. "Máy A" là trình duyệt laptop, "máy B" lần lượt là giả lập Android rồi giả lập iOS.

1. **Tải backup.** *Given* máy đang mở khoá, *when* mở Backup, chọn một vault hoặc mọi vault rồi tải, *then* có một file; mở file ra không đọc được secret, tên vault hay tên item nào.
2. **Khôi phục sau khi mất dữ liệu.** *Given* đã xoá sạch dữ liệu trình duyệt và lập tài khoản mới, *when* import file vào vault đang chọn hoặc vault mới, nhập mật khẩu của file, xem con số rồi xác nhận, *then* thấy lại đủ item, env đang gán, lịch sử, thùng rác. Từ đó dữ liệu mở bằng mật khẩu của tài khoản đang dùng.
3. **Import vào vault đang có dữ liệu.** *Given* item X sửa sau lúc tải file, Y đã xoá, Z thêm sau lúc tải file, *when* import rồi đồng bộ hai máy, *then* X hiện bản trong file và bản vừa bị thay nằm trong lịch sử, Y quay lại, Z vẫn còn; hai máy giống nhau theo nội dung.
4. **Bật bản sao.** *Given* Chrome desktop, *when* bật bản sao và chọn file, *then* file được ghi ngay. *When* sửa một item, *then* trong ≤ 15 giây file được ghi lại; import file đó vào một tài khoản thử nghiệm bằng mật khẩu của file thì thấy thay đổi vừa sửa.
5. **Cấp lại quyền.** *Given* đã khởi động lại trình duyệt và mất quyền ghi, *when* mở khoá, *then* app báo "Bản sao file: cần cấp lại quyền", mọi thứ khác vẫn chạy. *When* bấm cấp lại, *then* file có dữ liệu mới nhất.
6. **Export Bitwarden.** *Given* vault có "Partner X" gán vào `PaymentGW/uat` và `PaymentGW/staging`, *when* chọn export, nhập đúng mật khẩu, đọc cảnh báo không mã hoá và các con số sẽ không sang, rồi tải, *then* có một file; import vào Vaultwarden thử nghiệm thì item nằm trong 2 collection đó và mã OTP khớp với KeyMesh.

### 3.2 Edge and error paths
> *Dependency down, permission denied, empty state, boundary inputs, interruption
> and recovery.*

| Tình huống | Kết quả mong đợi |
|---|---|
| Offline, hoặc tài khoản chưa đăng ký | Tải backup, import, bản sao, export đều chạy, 0 request. Kết quả import lên server ở lượt đồng bộ sau, nếu có đăng ký |
| File không phải JSON, file v1 của EnvVault, file Bitwarden, `v` lạ, quá 64 MB | Báo định dạng không dùng được **trước khi** hỏi mật khẩu; dữ liệu không đổi |
| `kdf.iter` trong file ngoài khoảng cho phép | Báo cần bản app mới hơn, không chạy dẫn xuất khoá |
| Sai mật khẩu của file | Một câu chung "sai mật khẩu hoặc file hỏng", thử lại được, dữ liệu không đổi |
| Đúng mật khẩu nhưng một vault trong file hỏng hoặc không hợp lệ | Vault đó hiện "không đọc được", không chọn được; các vault khác vẫn import được |
| File trùng hệt dữ liệu hiện tại, hoặc import lại cùng file | Báo không có gì thay đổi, không ghi gì, không có lịch sử mới |
| Kết quả import làm vault vượt giới hạn ghi của server | Từ chối trọn lần import, gợi ý vào vault mới; không ghi gì |
| App khoá giữa lúc import, hoặc đóng tab trước khi xác nhận | Nội dung file đã giải mã bị bỏ khỏi bộ nhớ, không ghi gì |
| Mất mạng hoặc đóng app sau khi xác nhận | Kết quả đã ghi trên máy, ở trạng thái chờ, đẩy lên ở lượt sau; không import hai lần |
| Đồng hồ lệch quá 1 giờ (`KM-008-FR39`) | Import bị chặn kèm lý do. Tải backup, bản sao, export vẫn được vì không đổi vault |
| Tên vault trong file trùng vault đang có; project, env có id khác nhưng trùng tên | Thêm hậu tố " (import)", không gộp theo tên (FR11, FR14) |
| Item trong thùng rác của file đã quá 30 ngày | Vào thùng rác với thời hạn mới 30 ngày, không bị tự xoá trắng ngay (FR15) |
| B có thay đổi chờ ở item A vừa import | Gộp theo quy tắc hiện có, không mất giá trị nào. Nếu giá trị trong file bằng đúng `base` thì import không tính là đổi, bản B hiện ra, bản file còn trong lịch sử (Concern 1) |
| Hai máy import cùng file khi offline | Hai máy giống nhau theo nội dung sau đồng bộ, không có đánh dấu xung đột; lịch sử có thể có hai bản cùng giá trị (Concern 1) |
| Trình duyệt không hỗ trợ bản sao; Chrome trên Android có API nhưng không phải desktop | Không thấy tuỳ chọn, vẫn tải backup được (Concern 7) |
| Huỷ hộp chọn file khi bật bản sao | Bản sao vẫn tắt |
| Từ chối khi cấp lại quyền | Vẫn báo cần cấp lại; app không tự hỏi lại cho tới khi người dùng bấm |
| File bị xoá, chuyển chỗ, đĩa đầy, ghi lỗi | Báo lỗi và thời điểm ghi thành công gần nhất, có lối chọn file khác; file cũ không bị ghi dở; thử lại ở lần lưu sau |
| Đóng tab trong lúc chờ ghi bản sao | Lần mở khoá sau, nếu còn quyền, ghi bù trong ≤ 15 giây; hết quyền thì báo như bước 5 ở 3.1 |
| Đăng xuất giữ dữ liệu | Bản sao tiếp tục với cùng tài khoản |
| Thay bằng tài khoản khác, hoặc xoá dữ liệu trên máy | Cấu hình bản sao bị gỡ theo `KM-006-FR13`, không ghi đè file của tài khoản trước; file trên đĩa vẫn còn và hộp xác nhận nói rõ (Concern 4) |
| Xoá vault | Lần ghi sau file không còn vault đó (đã chấp nhận ở intent §6) |
| Sai mật khẩu khi export Bitwarden | Không có file, không có cảnh báo tiếp theo, thử lại được; 0 request |
| Mở khoá bằng passkey rồi export | Vẫn phải gõ master password |
| App khoá trong luồng export | Hộp thoại đóng, mật khẩu đã nhập và plaintext bị bỏ, không có file |
| Vault không có item sống | Không có file, nói rõ không có gì để export |
| Item không có env sống | Vào collection "Chưa gán" |
| Giá trị quá dài so với giới hạn của Vaultwarden | Item vẫn sang, giá trị được thay bằng một dòng báo; danh sách item và field bị ảnh hưởng hiện trước khi tải (FR36) |
| Tiêu đề, tên project chứa HTML hoặc ký tự lạ | Hiện đúng dạng chữ ở mọi màn của epic, không chạy gì |

## 4. Functional requirements

| Id | Requirement | Priority | Traces to |
|---|---|---|---|
| `KM-010-FR01` | Khi mở khoá, có thao tác tải backup: chọn một vault theo tên hoặc mọi vault, nhận một file đúng định dạng `keymesh-backup` v2 ở 03. Không cần mật khẩu lại, không cần mạng, không cần đăng ký | Must | §5 Tải backup; F-DATA-01 |
| `KM-010-FR02` | File chứa bản đã mã hoá mới nhất đang lưu trên máy, gồm cả thay đổi chưa đẩy. Không có plaintext ngoài các trường của định dạng. Tên file không chứa tên vault, username | Must | §5 Tải backup |
| `KM-010-FR03` | Giao diện nói rõ: file mở bằng mật khẩu đang mở máy này lúc tải, và đổi mật khẩu sau đó không ảnh hưởng file đã tải | Must | §6 Thu hồi file; KM-009 Concern 23 |
| `KM-010-FR04` | Vault không đọc được trên máy vẫn được đưa vào file nguyên trạng, kèm câu báo tên hoặc 8 ký tự đầu của id. Vault đang chờ xoá không vào file | Should | §1 Mất nơi chứa |
| `KM-010-FR05` | Khi mở khoá, có thao tác import: chọn file, kiểm định dạng và kích thước tối đa 64 MB **trước** khi hỏi mật khẩu. Không dùng được thì báo rõ, 0 thay đổi. Chỉ nhận `keymesh-backup` v2 | Must | §5 Khôi phục; §6 Import v1; F-DATA-02 |
| `KM-010-FR06` | Luôn hỏi **mật khẩu của file**, kể cả khi file do chính tài khoản này tạo. Sai mật khẩu và file hỏng dùng chung một câu, thử lại được. Mật khẩu không được lưu. Sau import, dữ liệu thuộc tài khoản đang mở và mở bằng mật khẩu của tài khoản đó | Must | §5 Tiêu chí 8; §7 câu 3; Concern 3 |
| `KM-010-FR07` | Mở file xong, hiện danh sách vault theo tên đã giải mã, số item, thời điểm tải (ghi rõ do file khai). Mỗi vault phải giải mã được và qua `validateVault`; không đạt thì hiện "không đọc được", không chọn được. Mặc định chọn mọi vault đọc được | Must | §5 Khôi phục; §7 câu 2 |
| `KM-010-FR08` | Chọn đích: **vault mới** (mỗi vault chọn thành một vault mới), hoặc **vault đang chọn** (chỉ khi chọn đúng một vault). Không gộp nhiều vault của file vào một | Must | §5 Import; §7 câu 2; Concern 2 |
| `KM-010-FR09` | Trước khi ghi, hiện con số cho từng đích: item thêm mới; item đổi nội dung (bản hiện tại vào lịch sử); item quay lại từ thùng rác hoặc đã xoá trắng; item giữ nguyên; project, env thêm hoặc đổi tên. Có câu nói kết quả sẽ lan sang máy khác sau khi đồng bộ. Không hiện secret. 0 lần ghi tới khi xác nhận. Không có khác biệt thì báo và không có nút xác nhận | Must | §5 Import không làm mất gì |
| `KM-010-FR10` | Import là trọn vẹn: đọc rồi ghi một lần xuống máy cho mọi đích, lỗi thì không đổi gì. Với vault đang có, kết quả là **một lần lưu bình thường** rồi đồng bộ theo KM-006. Kết quả làm một vault vượt giới hạn ghi ở 06 thì từ chối trọn lần import | Must | §5 Khôi phục; §5 Import |
| `KM-010-FR11` | Vault mới có id mới, khoá mới, bọc bằng khoá của tài khoản đang mở; không giữ khoá của file. Mang đủ project, env, item, lịch sử, thùng rác, liên kết fork, tên và màu; đứng cuối danh sách. Trùng tên vault thì thêm " (import)", vẫn trùng thì thêm số. Không cần mạng | Must | §5 Import vào vault mới; §7 câu 2; Concern 2 |
| `KM-010-FR12` | Import vào vault đang có theo từng item, so sánh theo `id`. **File còn sống:** hiện tại sống mà khác nội dung thì bản file hiện ra; đang ở thùng rác thì ra khỏi thùng rác và bản file hiện ra; đã xoá trắng thì quay lại với nội dung và env của file; không có thì thêm nguyên; giống hệt thì không đổi. **File ở thùng rác:** hiện tại sống thì vẫn sống; ở thùng rác thì giữ; đã xoá trắng hoặc không có thì quay lại thùng rác. **File đã xoá trắng:** không đổi gì, không thêm gì. Import không làm item đang sống biến mất | Must | §5 Import không làm mất gì; §7 câu 1; Concern 1 |
| `KM-010-FR13` | Cùng item có nội dung khác nhau thì **bản không hiện ra nằm ở đầu lịch sử** với nhãn "Khôi phục", gồm cả khi bản file là bản không hiện ra. "Nội dung" là `title`, field, `notes`, `expires`. Item đang có giữ nguyên `type` và env đang gán, như `KM-003-FR28`. Lịch sử của file và lịch sử hiện tại được hợp lại, bỏ trùng, mới nhất ở đầu, tối đa `HISTORY_MAX`; bản vừa bị thay luôn còn | Must | §5 Import không làm mất gì; §7 câu 1; Concern 1, 6 |
| `KM-010-FR14` | Project, env: không có thì thêm, kể cả bản đã xoá của file để `scopes` không mất nghĩa; file sống mà hiện tại đã xoá thì sống lại theo file; đang sống ở cả hai thì giữ tên, thứ tự, màu hiện tại; file đã xoá mà hiện tại sống thì vẫn sống. Trùng tên với thực thể sống khác id (không phân biệt hoa thường) thì thêm " (import)", không gộp và không đổi id | Must | §5 Import; Concern 2 |
| `KM-010-FR15` | Item vào thùng rác do import mà `deletedAt` đã quá 30 ngày thì nhận thời điểm xoá mới là lúc import, để không bị tự xoá trắng ở lần mở khoá sau. Còn hạn thì giữ thời điểm cũ | Must | §5 Khôi phục "thùng rác"; §7 câu 1; Concern 6 |
| `KM-010-FR16` | Import không tạo đánh dấu xung đột trên máy thực hiện, không xoá đánh dấu đang có. Máy khác gộp theo quy tắc hiện có, không mất giá trị nào. Item sống lại từ xoá trắng có badge như KM-009 Amendment 1 khi có lần gộp thật. **Không đổi quy tắc gộp.** Thao tác mới ở lõi được ghi vào 09 | Must | §5 "Sau khi sync, máy kia thấy cùng kết quả"; Concern 1 |
| `KM-010-FR17` | Import là thao tác thay đổi vault: bị chặn khi lệch giờ theo `KM-008-FR39`, theo `KM-008-FR40` khi offline. Tải backup, bản sao, export không bị chặn | Must | `KM-008-FR39`; §5 Import |
| `KM-010-FR18` | Sau khi đẩy lên, bản ngay trước import là một bản cũ trên server, khôi phục được theo KM-009 khi epic đó đã có | Should | §5 Import không làm mất gì; Concern 12 |
| `KM-010-FR19` | Chromium desktop có thêm tuỳ chọn bản sao file: bật bằng cách chọn một file. App ghi ngay một `keymesh-backup` chứa mọi vault; ghi được mới coi là bật. Tắt thì ngừng ghi, file giữ nguyên. Máy cảm ứng theo định nghĩa "mobile" ở 04 và trình duyệt thiếu API không thấy tuỳ chọn, chỉ có tải backup | Must | §5 Bản sao; F-DATA-06; Concern 7 |
| `KM-010-FR20` | Có thay đổi so với lần ghi trước thì ghi đè file sau 10 giây không có lần lưu mới, và **không muộn hơn 15 giây** kể từ lần lưu đầu chưa được ghi, kể cả khi vẫn sửa liên tục. Áp dụng cho lần lưu trên máy, kết quả nhận từ đồng bộ, đổi tên vault, đổi mật khẩu. Không có gì đổi thì không ghi, kể cả sau lần đồng bộ thành công | Must | §5 Tiêu chí 8; Concern 8 |
| `KM-010-FR21` | App không bao giờ đọc file bản sao, ở bất kỳ luồng nào. Muốn khôi phục thì import như mọi file khác (FR05) | Must | §5 Bản sao; 08 Q4 |
| `KM-010-FR22` | Lần ghi là thay thế trọn vẹn: lỗi giữa chừng thì file cũ còn nguyên. Lỗi được báo cùng thời điểm ghi thành công gần nhất, có lối chọn file khác, thử lại ở lần có thay đổi sau; không đổi hay chặn gì khác của app | Must | §5 "Ghi lỗi thì được báo" |
| `KM-010-FR23` | Mất quyền ghi thì trạng thái hiện "Bản sao file: cần cấp lại quyền" và một nút. Cấp xong thì ghi ngay dữ liệu mới nhất. Từ chối thì giữ nguyên báo. App không tự mở hộp hỏi quyền. Báo này luôn thấy ở màn chính, cả với tài khoản chưa đăng ký | Must | §5 "Bản sao file không làm phiền" |
| `KM-010-FR24` | Bản sao chỉ ghi dữ liệu đã mã hoá nên không cần khoá. Khoá app không huỷ lần ghi đang chờ. Đóng tab làm mất lần chờ thì lần mở khoá sau ghi bù trong ≤ 15 giây nếu còn quyền. Chỉ tab đang mở khoá mới ghi | Must | §5 Tiêu chí 8; `KM-003-FR13` |
| `KM-010-FR25` | Cấu hình bản sao riêng theo thiết bị, không đồng bộ. Đăng xuất giữ dữ liệu thì vẫn chạy. Thay tài khoản hoặc xoá dữ liệu trên máy thì cấu hình bị gỡ theo `KM-006-FR13`, không ghi đè file của tài khoản trước; hộp xác nhận nói rõ file trên đĩa vẫn còn. Tài khoản mới muốn dùng thì tự chọn lại | Must | §7 câu 4; Concern 4 |
| `KM-010-FR26` | Giao diện bản sao hiện trạng thái, tên file, thời điểm ghi gần nhất, và câu: chỉ có một file bị ghi đè nên không dùng để quay lại bản cũ; đặt trong thư mục đồng bộ đám mây thì thêm một bản ciphertext ở bên thứ ba | Must | §6 Bản sao file; 04 |
| `KM-010-FR27` | Có thao tác export Bitwarden cho **vault đang chọn**, một vault một file, dạng JSON tổ chức không mã hoá theo [hướng dẫn Bitwarden](https://bitwarden.com/help/condition-bitwarden-import/). Chỉ đọc, 0 lần ghi vào vault, 0 request | Must | §5 Tiêu chí 6; F-DATA-03; G6 |
| `KM-010-FR28` | Phải gõ đúng master password trước mọi bước tiếp theo, kể cả khi mở khoá bằng passkey; kiểm trên máy, làm được khi offline. Sai thì không có file. Mỗi lần xác nhận chỉ có tác dụng cho một lần export, mật khẩu được bỏ ngay | Must | §5 "File không mã hoá là việc có ý thức" |
| `KM-010-FR29` | Trước khi tải, một màn báo rõ file **không mã hoá**, ai có file đọc được mọi secret, app không theo dõi hay xoá được file. Kèm số lượng thứ không sang: bản lịch sử, item trong thùng rác, liên kết fork, cùng các mục ở FR35 khi có. Phải bấm tải rõ ràng trên màn này | Must | §5 "Biết trước cái gì không sang được"; §5 File không mã hoá |
| `KM-010-FR30` | Mỗi env sống thành một collection tên `Project/env`, kể cả env chưa có item. Item có nhiều env sống có đủ `collectionIds`. Item không có env sống vào collection "Chưa gán", chỉ tạo khi cần. Project có `/` trong tên giữ nguyên tên | Must | §5 Tiêu chí 6; F-DATA-03; Concern 5 |
| `KM-010-FR31` | Chỉ item sống sang file. Item trong thùng rác, đã xoá trắng, field đã xoá, env và project đã xoá không sang. Vault không có item sống thì báo, không có file | Must | §5 Biết trước; §6 Mang lịch sử |
| `KM-010-FR32` | Item `login` thành login của Bitwarden: field `text` nhãn "Username" (không phân biệt hoa thường), không có thì `text` đầu tiên, thành `login.username`; field `secret` nhãn "Password", không có thì `secret` đầu tiên, thành `login.password`; mọi field `url` thành `login.uris`; field `otp` đầu tiên thành `login.totp`, giữ được `digits`, `period`, `algorithm`. Field còn lại thành custom field | Must | §5 Tiêu chí 6; F-DATA-03; §7 câu 5 |
| `KM-010-FR33` | Tám loại còn lại thành Secure Note, mọi field sống thành custom field, `notes` giữ nguyên. Không đổi nhãn field. Không giá trị nào bị bỏ âm thầm | Must | §5 Tiêu chí 6; §7 câu 5; Concern 5 |
| `KM-010-FR34` | Custom field: `text`, `url`, `multi` thành loại văn bản; `secret`, `secret-multi`, `otp` thành loại ẩn. Xuống dòng giữ nguyên. `expires` có giá trị thành custom field văn bản "Hết hạn". Tiêu đề thành tên item | Must | §7 câu 5 |
| `KM-010-FR35` | Màn báo ở FR29 có thêm số lượng khi lớn hơn 0: field `otp` không tạo mã được bên kia (item không phải login, hoặc field `otp` thứ hai trở đi), tên file của field, tag, yêu thích, đánh dấu xung đột chưa xử lý | Must | §5 Biết trước; §7 câu 5 |
| `KM-010-FR36` | Giá trị vượt giới hạn mà Vaultwarden thử nghiệm nhận được (đo ở build-plan) được thay bằng một dòng báo còn ở KeyMesh; item vẫn sang và file luôn import được. Màn báo liệt kê tiêu đề và nhãn field bị ảnh hưởng, không hiện giá trị | Must | §5 Tiêu chí 6; §5 Biết trước; Concern 5 |
| `KM-010-FR37` | Sau khi tải, plaintext được bỏ khỏi bộ nhớ app, không có đường dẫn tạm còn dùng được. App không ghi plaintext xuống nơi lưu nào của nó. App không lưu lại lịch sử export | Must | §5 File không mã hoá; §6 Bảo vệ file |
| `KM-010-FR38` | `KM-003-FR47` được thu hẹp: bỏ "backup/import/export". Hai test đang cấm được sửa đúng phần đó; các mục khác giữ nguyên trừ phần epic khác đã bỏ | Must | §4; Concern 13 |
| `KM-010-FR39` | Có bộ test chạy bằng lệnh đi qua mục 3, gồm mọi ô của FR12 trên `merge.js` thật và hai máy thật trên server cục bộ. `npm test` vẫn chạy được khi chưa cài gì | Must | §5; `CLAUDE.md` |
| `KM-010-FR40` | Originator kiểm tay theo `AC45`–`AC47`, ghi đạt hoặc không theo từng mục, từng môi trường vào `implement.md`. Mục không làm được quay lại originator, không tự coi là đạt hay tự bỏ. Epic chỉ đóng sau khi KM-006 và KM-008 đóng | Must | §5 đoạn đầu |
| `KM-010-FR41` | Sửa tài liệu: `KM-010.md` thêm phụ thuộc KM-006, KM-008 và "Xong khi" theo mức kiểm; 07 F-DATA-03 thêm nhập lại mật khẩu, loại item, Chưa gán; 04 thêm rủi ro file export không mã hoá và rủi ro một file bị ghi đè (intent §6), sửa dòng Bản sao file; 03, 05, 02 đổi lúc ghi theo FR20, ghi import không đọc bản sao; 05 thêm § Import; 08 ghi mức đạt; 09 thêm thao tác mới; ghi vào `KM-003` rằng FR47 đã đổi | Must | §5 Tài liệu khớp; `CLAUDE.md` |
| `KM-010-FR42` | Thêm vào việc của `KM-014`: chọn lại file bản sao trên domain thật; tải và chọn file trên điện thoại thật; dung lượng vault mới do import. Giữ nguyên: đưa secret thật lên server do originator quyết | Must | §6 Deploy; §6 Quyết định cất secret thật; Concern 14 |

## 5. Non-functional requirements

| Id | Requirement | Target |
|---|---|---|
| `KM-010-NFR01` | File backup và bản sao không lộ | Dò file với chuỗi đánh dấu ở password, tên vault, tên project, env, tiêu đề, giá trị, ở dạng gốc, base64, hex: 0 lần trùng. Không có khoá chưa bọc |
| `KM-010-NFR02` | Không lộ trên máy và kênh phụ | Qua mọi luồng, gồm luồng lỗi: 0 lần trùng chuỗi đánh dấu và mật khẩu của file trong `console`, thông báo lỗi, URL, IndexedDB, `localStorage`, Cache Storage. Sau khi khoá: nội dung file đã giải mã và plaintext export không còn tham chiếu trong trạng thái app |
| `KM-010-NFR03` | Server không đọc được gì | Sau chuỗi 3.1, dò toàn bộ dữ liệu server cục bộ: 0 lần trùng plaintext, tên vault, mật khẩu file, khoá. Backup, export, bản sao tạo 0 request. Import tạo 0 request cho tới lượt đồng bộ thường |
| `KM-010-NFR04` | Không mất dữ liệu khi import | Với mọi ô của FR12 và mọi tổ hợp với thay đổi chờ của máy khác: mọi giá trị hiện tại và giá trị trong file đều còn ở item hoặc lịch sử, trừ bản cũ nhất bị cắt theo `HISTORY_MAX`; bản vừa bị thay luôn còn. Hai máy giống nhau theo nội dung sau ≤ 2 lượt đẩy |
| `KM-010-NFR05` | Bản sao đúng hạn | Chrome desktop, đĩa cục bộ, tổng vault 200 KB: 20 lần đo, gồm 5 lần sửa liên tục mỗi 3 giây: mỗi lần file có thay đổi trong ≤ 15 giây kể từ lần lưu đầu chưa ghi. 10 phút không có thay đổi và có đồng bộ: 0 lần ghi file |
| `KM-010-NFR06` | Bản sao chỉ ghi | Theo dõi mọi lời gọi tới file trong toàn bộ luồng: 0 lần đọc |
| `KM-010-NFR07` | Tốc độ | Trên máy dev, vault 200 KB: tải backup ≤ 1 s; từ lúc nhập mật khẩu file tới khi hiện con số ≤ 3 s; ghi kết quả import ≤ 2 s; dựng file Bitwarden ≤ 1 s; lần ghi bản sao không chặn giao diện quá 300 ms. Các ngưỡng này chưa có số đo cơ sở |
| `KM-010-NFR08` | Accessibility | Mọi màn mới dùng được bằng bàn phím, có tên cho trình đọc màn hình, không chỉ dựa vào màu; thông báo kết quả ở vùng `status` hoặc `alert`; vùng chạm ≥ 44×44 px |
| `KM-010-NFR09` | Tương thích | Tải backup, import, export: Chrome desktop; Chrome trên giả lập Android; Safari trên giả lập iOS; cả tab lẫn app đã cài nếu Concern 15 cho phép. Bản sao: Chrome desktop. File tạo ở môi trường này import được ở môi trường kia. Không làm vỡ giới hạn 3 lần chạm tới copy ở 07 |
| `KM-010-NFR10` | Không ảnh hưởng phần đã có | `npm test`, `npm run test:browser`, `npm run test:e2e`, `npm run test:server`, `npm run vectors` đều xanh; `merge.js` và vector không đổi; `dependencies` rỗng; không thêm devDependency; CSP và `Permissions-Policy` không đổi trừ khi quay lại originator |
| `KM-010-NFR11` | Không có cửa sau cho test | Mã chạy thật không có cờ hay nhánh chỉ dành cho test |
| `KM-010-NFR12` | Chỉ dữ liệu thử | Mọi lần kiểm chỉ dùng dữ liệu thử; không ghi giá trị thật vào `implement.md`, ảnh hay log. File export thử được xoá sau khi kiểm |

## 6. Acceptance criteria

| Id | Given / When / Then |
|---|---|
| `KM-010-AC01` | *Given* hai vault có chuỗi đánh dấu, có thay đổi chưa đẩy *when* tải một vault, rồi tải mọi vault *then* file đúng định dạng 03, đúng số vault, có thay đổi chưa đẩy; dò NFR01 đạt; 0 request; tên file không có tên vault (FR01, FR02, NFR01) |
| `KM-010-AC02` | *Given* đã đổi mật khẩu sau khi tải file *when* import file đó *then* mở bằng mật khẩu cũ, không mở bằng mật khẩu mới; màn tải có câu ở FR03 (FR03, FR06) |
| `KM-010-AC03` | *Given* một vault bị sửa 1 byte trên máy *when* tải mọi vault *then* vault đó vẫn trong file, có câu báo; import file thấy vault đó "không đọc được", các vault khác vẫn chọn được (FR04, FR07) |
| `KM-010-AC04` | *Given* file không phải JSON, file `envvault.html`, file Bitwarden, `v` = 1, 64 MB + 1 byte, `kdf.iter` = 100 *when* chọn file *then* mỗi ca có câu báo, không hỏi mật khẩu, không chạy dẫn xuất khoá, kho cục bộ không đổi (FR05) |
| `KM-010-AC05` | *Given* file hợp lệ của tài khoản khác *when* nhập sai mật khẩu, rồi đúng mật khẩu *then* lần sai có câu chung và thử lại được; lần đúng thấy tên vault và số item; kho cục bộ chưa đổi; quét NFR02 không có mật khẩu file (FR06, FR07, FR09, NFR02) |
| `KM-010-AC06` | *Given* đã xoá sạch dữ liệu trình duyệt, lập tài khoản mới với mật khẩu khác *when* import file vào vault mới, khoá rồi mở lại *then* mở bằng mật khẩu tài khoản mới, mật khẩu file không mở được; thấy đủ item, env đang gán, lịch sử, thùng rác, liên kết fork (FR06, FR11) |
| `KM-010-AC07` | *Given* file có 3 vault *when* chọn cả 3 *then* đích "vault đang chọn" không có; 3 vault mới, id mới, không trùng id trong file. *When* chọn 1 *then* có cả hai đích (FR08, FR11) |
| `KM-010-AC08` | *Given* tài khoản đã đăng ký *when* import file của chính nó vào vault mới, cũng file đó ở tài khoản khác cùng server, rồi đồng bộ *then* không có `409 vault_exists`; vault lên server; máy kia mở được (FR11, Concern 2) |
| `KM-010-AC09` | *Given* vault trùng tên với vault trong file; project và env khác id mà trùng tên khác hoa thường *when* import *then* có hậu tố, không gộp; item trỏ đúng env của nó (FR11, FR14) |
| `KM-010-AC10` | *Given* trên server lẫn máy có item X đã sửa sau lúc tải file *when* import vào vault đó rồi đồng bộ hai máy *then* cả hai hiện bản file; đầu lịch sử có bản vừa bị thay, nhãn "Khôi phục"; env đang gán giữ nguyên; không có đánh dấu (FR12, FR13, FR16) |
| `KM-010-AC11` | *Given* mỗi ô của FR12 *when* import *then* đúng trạng thái ở FR12: bản hiện ra, thùng rác, xoá trắng; đúng số đếm đã hiện trước đó; không item sống nào biến mất (FR09, FR12, NFR04) |
| `KM-010-AC12` | *Given* item đang sống với nội dung khác bản trong thùng rác của file; item ở thùng rác cả hai bên, khác nội dung *when* import *then* bản hiện tại giữ nguyên trạng thái; bản file nằm trong lịch sử item (FR12, FR13) |
| `KM-010-AC13` | *Given* item thêm sau lúc tải file, item giống hệt file, item đã xoá trắng trong file *when* import *then* không đổi nội dung, không thêm lịch sử, không biến mất (FR12) |
| `KM-010-AC14` | *Given* file trùng hệt dữ liệu, hoặc vừa import xong file đó *when* import lại *then* báo không có gì thay đổi; không có lần ghi; 0 lần đẩy (FR09, FR12) |
| `KM-010-AC15` | *Given* item có 15 bản lịch sử ở file và 15 bản khác ở hiện tại *when* import *then* tối đa 20 bản, mới nhất trước, không trùng; bản vừa bị thay có mặt (FR13, NFR04) |
| `KM-010-AC16` | *Given* env và project sống trong file mà hiện tại đã xoá, project đã đổi tên, env chỉ có ở hiện tại, env đã xoá trong file mà hiện tại sống *when* import *then* đúng FR14; item trở lại đúng chỗ (FR14) |
| `KM-010-AC17` | *Given* file có item ở thùng rác xoá cách đây 40 ngày và 5 ngày *when* import, khoá rồi mở lại *then* cả hai còn trong thùng rác đủ nội dung; item 40 ngày còn đủ 30 ngày, item 5 ngày còn 25 ngày (FR15) |
| `KM-010-AC18` | *Given* lỗi ghi giả lập, kết quả vượt giới hạn ghi, khoá app trước khi xác nhận, đồng hồ lệch hơn 1 giờ *when* import *then* mỗi ca có báo, kho cục bộ trùng từng byte với trước đó (FR10, FR17) |
| `KM-010-AC19` | *Given* đóng app hoặc mất mạng ngay sau khi xác nhận *when* mở lại, có mạng *then* kết quả còn, lên server một lần theo nội dung (FR10) |
| `KM-010-AC20` | *Given* B có thay đổi chờ ở field khác, item khác, đúng giá trị A import (đồng hồ sớm và muộn hơn), và giá trị file bằng `base` *when* A import rồi hai máy đồng bộ *then* không mất giá trị nào; không ca nào làm hai máy lệch; hai chiều gộp cho cùng nội dung (FR16, NFR04) |
| `KM-010-AC21` | *Given* B có thay đổi chờ là chuyển item vào thùng rác hoặc xoá trắng, và A chưa từng có item nhưng file có *when* A import rồi đồng bộ *then* kết quả theo bảng xoá ở 05, không mất nội dung; badge `purgedAt` như KM-009 Amendment 1 (FR16, NFR04) |
| `KM-010-AC22` | *Given* hai máy offline cùng import một file vào vault chung *when* có mạng *then* giống nhau theo nội dung, không có đánh dấu xung đột, không item nào đôi (FR16, NFR04) |
| `KM-010-AC23` | *Given* đã đăng ký, KM-009 đã có *when* import đổi nội dung rồi đồng bộ *then* bản trước import có trong danh sách bản cũ và khôi phục lại được. KM-009 chưa đóng thì ghi chưa kiểm vào `implement.md` (FR18) |
| `KM-010-AC24` | *Given* Chrome desktop *when* bật và chọn file *then* file được ghi ngay, là `keymesh-backup` đủ vault, dò NFR01 đạt. *When* huỷ hộp chọn *then* vẫn tắt. *When* tắt *then* không ghi nữa, file còn (FR19, FR26) |
| `KM-010-AC25` | *Given* Firefox, Safari, giả lập Android, giả lập iOS *when* mở cài đặt *then* không thấy tuỳ chọn; tải backup vẫn có (FR19, Concern 7) |
| `KM-010-AC26` | *Given* bản sao đang bật *when* đo theo NFR05: lưu một lần, sửa liên tục mỗi 3 giây, nhận thay đổi từ máy khác, đổi tên vault, đổi mật khẩu *then* mỗi ca đạt ≤ 15 giây; sau đổi mật khẩu file mở bằng mật khẩu mới. Đồng bộ không có gì đổi: 0 lần ghi (FR20, NFR05) |
| `KM-010-AC27` | *Given* bản sao đang bật, đã sửa một item *when* import file bản sao vào tài khoản thử nghiệm bằng mật khẩu của file *then* thấy thay đổi vừa sửa (tiêu chí 8; FR20, FR06) |
| `KM-010-AC28` | *Given* toàn bộ luồng bản sao *when* theo dõi lời gọi tới file *then* 0 lần đọc; nội dung đặt tay vào file không vào vault (FR21, NFR06) |
| `KM-010-AC29` | *Given* ghi lỗi giả lập, file bị xoá, đĩa đầy *when* có thay đổi *then* báo lỗi và thời điểm ghi gần nhất; file cũ nếu còn thì nguyên vẹn; sửa, lưu, đồng bộ không bị ảnh hưởng; hết lỗi thì lần sau ghi được (FR22) |
| `KM-010-AC30` | *Given* quyền chuyển sang chưa cấp (khởi động lại trình duyệt thật) *when* mở khoá *then* có đúng câu báo và nút, không có hộp hỏi tự bật; mọi thứ khác chạy. *When* từ chối *then* vẫn báo. *When* cấp *then* file có dữ liệu mới nhất ngay (FR23) |
| `KM-010-AC31` | *Given* vừa sửa *when* khoá app trước 10 giây *then* file vẫn được ghi. *When* đóng tab trước 10 giây rồi mở khoá lại *then* ghi bù trong ≤ 15 giây (FR24) |
| `KM-010-AC32` | *Given* bản sao đang bật *when* đăng xuất giữ dữ liệu rồi sửa *then* vẫn ghi. *When* thay bằng tài khoản khác hoặc xoá dữ liệu trên máy *then* hộp xác nhận nói file còn; tài khoản mới sửa dữ liệu: file không đổi từng byte; tuỳ chọn ở trạng thái tắt; quét `KM-006-NFR04` đạt (FR25) |
| `KM-010-AC33` | *Given* sai mật khẩu; mở bằng passkey; offline; khoá app giữa chừng *when* export *then* sai thì không tới màn báo và không có file; passkey vẫn phải gõ; offline vẫn được, 0 request; khoá thì không có file (FR27, FR28) |
| `KM-010-AC34` | *Given* vault có 7 bản lịch sử, 2 item thùng rác, 1 fork *when* tới màn báo *then* thấy câu không mã hoá và đúng 7, 2, 1; chưa có file tới khi bấm tải; kho cục bộ không đổi (FR29, FR27) |
| `KM-010-AC35` | *Given* "Partner X" gán `PaymentGW/uat`, `PaymentGW/staging`; item gán env đã xoá; env trống *when* tải file *then* đúng một item có 2 `collectionIds` khớp tên; item kia ở "Chưa gán"; env trống có collection; không có collection của env đã xoá (FR30) |
| `KM-010-AC36` | *Given* item thùng rác, item xoá trắng, field đã xoá, vault chỉ có item thùng rác *when* export *then* các phần đó không có trong file (dò chuỗi đánh dấu); vault cuối báo không có gì và không có file (FR31) |
| `KM-010-AC37` | *Given* item `login` mẫu; `login` đã đổi nhãn field; có 2 URL và 2 `otp` *when* export *then* đúng ánh xạ FR32; `otp` thứ hai là custom field ẩn và được đếm ở FR35 (FR32, FR35) |
| `KM-010-AC38` | *Given* mỗi loại trong 8 loại còn lại, đủ 6 `kind`, giá trị nhiều dòng, có `expires` *when* export *then* mỗi field có mặt đúng loại ở FR34; nhiều dòng giữ nguyên; không giá trị nào thiếu; đếm đúng theo FR35 (FR33, FR34, FR35) |
| `KM-010-AC39` | *Given* `notes` và field dài hơn giới hạn đã đo, kể cả 64 KB; giá trị đúng bằng giới hạn *when* export *then* giá trị vượt được thay, màn báo nêu đúng tiêu đề và nhãn, không hiện giá trị; giá trị đúng bằng giới hạn giữ nguyên; Vaultwarden nhận trọn file (FR36) |
| `KM-010-AC40` | *Given* đã tải file Bitwarden *when* xem trạng thái app và quét theo NFR02 *then* không còn plaintext export; không có đường dẫn tạm dùng được; không có bản ghi export (FR37, NFR02) |
| `KM-010-AC41` | *Given* KM-003-FR47 *when* chạy lại hai test cấm từ *then* chỉ bỏ phần backup, import, export; các mục khác còn nguyên trừ phần epic khác đã bỏ (FR38) |
| `KM-010-AC42` | *Given* chuỗi 3.1 *when* quét theo NFR01–NFR03; giá trị HTML ở tên vault, tiêu đề, tên project trong file và trên màn báo *then* 0 lần trùng; chuỗi HTML hiện đúng dạng chữ, không tạo phần tử; 0 vi phạm CSP (NFR01, NFR02, NFR03) |
| `KM-010-AC43` | *Given* đã xong *when* chạy các lệnh ở NFR10 và soi `git diff` *then* đều xanh; `merge.js`, vector không đổi; reviewer không thấy cờ chỉ cho test hay `innerHTML` với dữ liệu người dùng; số đo NFR05, NFR07 ghi vào `implement.md` (FR39, NFR05, NFR07, NFR10, NFR11) |
| `KM-010-AC44` | *Given* mọi màn mới *when* kiểm chỉ bằng bàn phím và trình đọc màn hình *then* đạt NFR08 (NFR08) |
| `KM-010-AC45` | *Given* server cục bộ, dữ liệu thử, lần lượt laptop + giả lập Android và laptop + giả lập iOS *when* originator làm 3.1 bước 1–3, gồm file tạo ở máy này import ở máy kia *then* `implement.md` ghi đạt hoặc không theo từng mục, từng cặp. Mục không làm được do originator quyết (FR40, NFR09, NFR12) |
| `KM-010-AC46` | *Given* Chrome desktop, dữ liệu thử *when* originator làm 3.1 bước 4–5, gồm khởi động lại trình duyệt thật *then* đạt tiêu chí 8, ghi vào `implement.md` (FR40, NFR12) |
| `KM-010-AC47` | *Given* Vaultwarden thử nghiệm tự chạy cục bộ trên Mac *when* originator làm 3.1 bước 6 *then* "Partner X" nằm trong 2 collection `PaymentGW/uat`, `PaymentGW/staging`; mã OTP khớp KeyMesh trong cùng chu kỳ, với cả secret base32 và URI có `digits=8&period=60`; item chưa gán có mặt; ghi phiên bản Vaultwarden vào `implement.md` (tiêu chí 6; FR40, FR30, FR32, NFR12) |
| `KM-010-AC48` | *Given* tài liệu *when* verifier đọc lại `KM-010.md`, 02–09, `KM-003`, `KM-014.md` *then* đúng nội dung FR41, FR42; 04 ghi đủ hai rủi ro và vẫn nêu quyết định về secret thật thuộc originator (FR41, FR42) |

## 7. Out of scope

> *What this explicitly does not do. Mandatory — an unbounded spec is not a spec.*

- Bản sao chống lỗi của chính mình: chỉ một file, bị ghi đè, không giữ nhiều phiên bản (originator chấp nhận ở intent §6).
- Mang lịch sử, thùng rác, liên kết fork sang Bitwarden. Bảo vệ file Bitwarden sau khi đã tải. Thu hồi file backup đã tải.
- Import từ Bitwarden hay file v1 (Q8). Export plaintext JSON, CSV (F-DATA-04).
- Lối "tạo tài khoản từ file" trên máy trống: lập tài khoản trước rồi mới import (Concern 3).
- Mở file bằng khoá của phiên đang mở, không hỏi mật khẩu file (Concern 3).
- Export nhiều vault vào một file Bitwarden. Item type Card, Identity, SSH key của Bitwarden. Chia nhỏ hay đính kèm giá trị quá dài.
- Gộp nhiều vault của file vào một; ghép project, env theo tên; chọn từng item để import; xem trước nội dung file trước khi import ngoài các con số.
- Đổi quy tắc gộp. Quy tắc "bản nào hiện ra" do người dùng chọn lúc import (Concern 1).
- Ghi các hành động backup, import, export vào nhật ký KM-009. Lịch nhắc tải backup.
- Bản sao trên Firefox, Safari, mobile, thư mục thay vì file; tự chọn lại file; đọc file bản sao để so sánh hay khôi phục tự động.
- Quyết định cất secret thật. Deploy, Cloudflare thật, điện thoại thật (`KM-014`).

## 8. Concerns

> *Every conflict between the intent and a constraint, itself, or something that
> already ships. Each must be resolved inline or deferred with a named owner
> before this spec is approved.*

| # | Concern | Needs | Resolution |
|---|---|---|---|
| 1 | Intent §7 câu 1: có dùng lại cách khôi phục của KM-009 không, bản nào hiện ra? **Đã chạy thử trên `merge.js`, `model.js` thật (2026-11-02).** (a) Gộp với `base` là bản hiện tại, file làm `remote`: bản file hiện ra, **bản hiện tại mất hẳn**. (b) `base` là file: bản hiện tại hiện ra, bản file vào lịch sử, nên file không có tác dụng. (c) Không có `base`: bản hiện tại thắng, kèm badge. (d) Coi import là một lần lưu đồng hồ mới (mô phỏng bằng `updateItem`): không mất gì. Hai máy cùng import một giá trị: hai chiều giống nhau, không đánh dấu, lịch sử có bản trùng giá trị. Giá trị file bằng `base` mà B có sửa chờ: không tính là đổi, bản B hiện ra, bản file trong lịch sử. Item không có trên A, B đã xoá trắng: item sống, badge `purgedAt`, hai chiều giống nhau. Hai máy cùng thêm item vắng mặt: không đánh dấu. **Chưa chạy thử** các nhánh sống lại, thùng rác và thời hạn mới vì KM-008, KM-009 chưa có mã; FR39 phủ | Originator | **Originator chốt 2026-11-02: bản trong file hiện ra**, bản còn lại nằm trong lịch sử, như KM-009. Đổi lại, import file cũ đưa mọi item đã sửa về giá trị cũ và lan sang máy kia; FR09 báo con số trước khi xác nhận. Khác KM-009 ở: item vắng mặt được thêm; bản file không hiện ra cũng vào lịch sử (intent §5 "không bên nào mất"), còn KM-009 không làm vậy (FR29); item file ở thùng rác mà hiện tại xoá trắng thì quay lại |
| 2 | Intent §7 câu 2: file nhiều vault, vault trùng id. `409 vault_exists` theo id trên toàn server, nên giữ id gốc thì tài khoản khác không đẩy lên được; giữ id cũng có thể làm sống lại vault đã xoá | PO; originator có thể đổi khi duyệt spec | **Đã quyết:** vault mới luôn có id và khoá mới (FR11). "Vault đang chọn" chỉ nhận một vault của file; muốn nhiều thì mỗi vault một vault mới (FR08). Id item, env, project giữ nguyên để import lại không tạo bản đôi và fork vẫn đúng. Trùng tên thì thêm hậu tố, không gộp theo tên (FR14) vì gộp theo tên phải đổi `scopes` |
| 3 | Intent §7 câu 3: "mở được bằng master password" là mật khẩu nào | Originator | **Originator chốt 2026-11-02: mật khẩu của file;** sau import dữ liệu mở bằng mật khẩu tài khoản (FR06). Không có lối tạo tài khoản từ file. PO thêm: luôn hỏi mật khẩu file kể cả cùng tài khoản, để chỉ có một đường đi; hệ quả là quên mật khẩu cũ thì không mở được file cũ, dù `accountKey` có thể vẫn khớp (đã chấp nhận ở KM-009 Concern 23). Originator có thể đổi khi duyệt spec |
| 4 | Intent §7 câu 4: đăng nhập tài khoản khác có ghi đè file của tài khoản trước không | PO | **Đã quyết: không.** `KM-006-FR13` đã gỡ bản sao khi thay tài khoản hay xoá dữ liệu; đăng xuất giữ dữ liệu chỉ đăng nhập lại cùng tài khoản được (FR25). Rủi ro còn lại: người dùng tự chọn đúng file cũ, hệ điều hành hỏi ghi đè, app không đọc file nên không biết |
| 5 | Intent §7 câu 5: loại item và field không có tương ứng. Tài liệu Bitwarden có type 1 login, 2 note, 3 card, 4 identity; custom field 0 văn bản, 1 ẩn. Vaultwarden từ 1.28.1 báo lỗi và từ chối Notes quá 10 000 ký tự sau mã hoá, một giá trị có thể hỏng cả lần import; chưa rõ giới hạn của custom field. KeyMesh có field 64 KB. Item không có collection trong org import có thể khó tìm thấy (nhớ từ cách Bitwarden hoạt động, chưa kiểm) | Originator; PO; engineer đo | **Originator chốt 2026-11-02: bỏ riêng giá trị quá dài, item vẫn sang, liệt kê trước khi tải** (FR36). **PO quyết:** mọi loại khác `login` thành Secure Note để không đoán field nào là gì, không giá trị nào mất (FR33); item chưa gán vào "Chưa gán" (FR30). **Hoãn, owner: engineer, lúc: build-plan:** dạng file Vaultwarden hiện hành nhận thật (id collection, `organizationId`, hai collection trùng tên khi project có `/`), giới hạn thật. Không nhận dạng đã mô tả thì quay lại originator |
| 6 | "Không mất gì" có cùng nghĩa hẹp như KM-009 Concern 2 không; thùng rác quá hạn trong file bị `KM-008-FR09` xoá trắng ngay lần mở khoá sau, trái intent §5 | PO; originator có thể đổi khi duyệt spec | **Đã quyết:** cùng nghĩa hẹp: bản vừa bị thay luôn còn; bản cũ hơn 20 bản bị cắt, nhưng vẫn còn trong file và, nếu đã đăng ký, trong bản cũ trên server (FR13, FR18). Thùng rác quá hạn nhận thời hạn mới (FR15). Gộp "cùng xoá" giữ `deletedAt` sớm hơn, nên nếu máy khác cũng có item trong thùng rác thì thời hạn cũ có thể quay lại; chấp nhận vì máy đó đã giữ nội dung tới lúc đó |
| 7 | 07, 03 ghi bản sao "chỉ Chromium desktop", nhưng [caniuse](https://caniuse.com/mdn-api_window_showsavefilepicker) cho thấy Chrome Android nay có `showSaveFilePicker`. Chỉ dò API thì Android sẽ thấy tuỳ chọn; quyền ghi trên Android chưa kiểm | PO | **Đã quyết:** giữ phạm vi desktop; máy cảm ứng theo định nghĩa ở 04 không thấy tuỳ chọn (FR19, AC25). Laptop cảm ứng có chuột không bị ảnh hưởng theo định nghĩa đó |
| 8 | 05, 03 ghi "sau mỗi lần sync thành công, ghi đè file", tức mỗi 50 giây một lần khi không có gì đổi, tốn đĩa và đồng bộ đám mây. Debounce 10 giây thuần tuý có thể vượt tiêu chí 15 giây nếu sửa liên tục | PO | **Đã quyết:** chỉ ghi khi có đổi; có hạn tối đa 15 giây (FR20). Sửa 03, 05, 02 (FR41). Không đo được giới hạn với ổ mạng hay thư mục đám mây; NFR05 chỉ cam kết đĩa cục bộ |
| 9 | Brief đòi nhập lại mật khẩu, F-DATA-03 không nhắc. 04 nguyên tắc dữ liệu chỉ nằm trên đĩa ở dạng mã hoá, chưa có dòng về file export | PO | **Đã quyết** theo intent §5: FR28, FR29, FR41. Như KM-003 Concern 14, file do người dùng chủ động tải nên không trái nguyên tắc về dữ liệu app giữ. Kiểm mật khẩu ở máy, không giới hạn số lần: kẻ có dữ liệu trên đĩa thử được ngoài app, và kẻ có phiên mở khoá đã đọc được vault |
| 10 | Import đưa dữ liệu lạ vào vault. Người gửi file biết mật khẩu có thể đổi giá trị item cùng id, hoặc nén dữ liệu rất lớn làm treo tab. `exportedAt` và phần ngoài envelope không được xác thực | PO; originator có thể đổi khi duyệt spec | **Đã quyết: chấp nhận,** vì người dùng phải chủ động chọn file và nhập mật khẩu; đã có `validateVault`, trần 64 MB, trần `kdf.iter`, câu báo số thay đổi, bản cũ trong lịch sử. Treo tab không ghi gì. Thời điểm tải hiện kèm chữ "do file khai" (FR07). Ghi vào 04 |
| 11 | Backup vault đang hỏng giúp hay hại: đưa vào file thì import báo "không đọc được"; bỏ ra thì người dùng tưởng đủ | PO | **Đã quyết:** đưa vào kèm câu báo (FR04), vì lỗi có thể sửa được về sau và bản backup không nên bớt dữ liệu âm thầm |
| 12 | Intent chỉ thêm phụ thuộc KM-006, KM-008. Phần "sống lại" giống thao tác lõi của KM-009 và FR18 cần snapshot; KM-009 đang ở plan, chưa có mã | Engineer | **Đã quyết:** không thêm phụ thuộc cứng; hành vi được định nghĩa đủ ở đây. **Hoãn, owner: engineer, lúc: build-plan:** dùng lại thao tác lõi nếu KM-009 đã có, không thì tự làm và KM-009 hoà vào sau. FR18 và AC23 là Should, chưa có KM-009 thì ghi chưa kiểm |
| 13 | KM-003 FR47, AC44, `KM-008-AC70` và hai test đang cấm chữ `backup`, `sao lưu`, `import`, `export` | PO | **Đã quyết:** bỏ đúng các chữ đó (FR38, AC41). Đây là thay đổi có chủ đích; ghi vào `KM-003`. Epic đóng sau sửa `KM-008-AC70` nếu còn nhắc backup |
| 14 | `KM-014.md` chưa có; `KM-006-FR43` tạo ra nó. Trên `master` chưa có mã KM-006, KM-008 | PO | **Đã quyết:** epic đóng sau KM-006, nên file đã có khi làm FR42. Build-plan đọc spec và plan của hai epic, không đoán tên trong mã |
| 15 | Intent §7 câu 6: tải và chọn file trên giả lập Android, iOS, nhất là app đã cài trên iOS, chưa đo. Lấy file ra để kiểm bằng cách nào | Engineer; originator | **Hoãn, owner: engineer, lúc: build-plan.** Không làm được ở môi trường nào thì quay lại originator trước khi implement, không tự thu hẹp NFR09 |
| 16 | Intent §7 câu 7: dựng Vaultwarden cục bộ trên Mac cần gì, gồm HTTPS và tổ chức thử nghiệm | Engineer | **Hoãn, owner: engineer, lúc: build-plan.** Thêm công cụ chỉ ở máy kiểm, không vào `package.json`. Thiếu phần nào thì báo originator |
| 17 | Có thể `Permissions-Policy` hay CSP cản chọn file, tải file hoặc ghi file. `<a download>` qua Blob đã chạy cho field file ở KM-003 trên desktop | Engineer | **Hoãn, owner: engineer, lúc: build-plan.** Không tự nới; cần nới thì quay lại originator (NFR10) |

---

*No implementation detail: no libraries, tables, endpoints or file layouts.*
