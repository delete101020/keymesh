# Spec — Gộp ba chiều theo field

**Epic ID:** `KM-002`
**Owner:** Product Owner
**Status:** Draft
**Created:** `2026-11-01`
**Traces to:** `intent.md`

---

## 1. Overview

> *One paragraph: what this is, and which line of `intent.md` it serves.*

KM-002 bổ sung vào lõi một phép gộp thuần cho vault v2. Đầu vào là ba bản của cùng một vault: `base` (bản chung gần nhất), `local` và `remote`. Đầu ra là một vault hợp lệ, giữ mọi thay đổi không đụng nhau của cả hai bên. Phép gộp đi lần lượt theo từng thực thể, từng thuộc tính và từng field. Chỉ khi hai bên cùng đổi đúng một giá trị mới tính là xung đột: khi đó bản thắng chọn theo đồng hồ, bản thua vào `history`, và item được đánh dấu xung đột ở đúng field hay thuộc tính đó. Phép gộp cũng xử lý đúng các trạng thái thùng rác, khôi phục và xoá trắng. Spec này phục vụ intent §1 ("chưa có gì quyết định được kết quả hợp lệ của hai bản đó là gì") và mọi điểm ở intent §5. Quy tắc chuẩn đã có ở `docs/05-sync.md` § "Thuật toán gộp ba chiều theo field"; spec dẫn chiếu tới đó và chỉ ghi thêm phần 05 còn thiếu hoặc còn mơ hồ: xoá project/env, hai bên cùng tạo một id, đánh dấu "Đã xử lý", giới hạn lịch sử, đồng hồ hoà hoàn toàn. Hình dạng vault, đồng hồ và lịch sử của KM-001 (`docs/09-core-api.md`) giữ nguyên. Chỉ có hai bổ sung, đều có lý do ghi ở Concern 8–9: bản lịch sử `conflict` mang thêm một dấu, và `conflict.at` có quy tắc tính.

## 2. Constraints applied

> *The skills, standards and docs loaded before writing this spec. A reviewer must
> be able to tell what this spec was bound by.*

| Source | What it constrains |
|---|---|
| `CLAUDE.md` | `.claude/CLAUDE.md`: `core/` thuần (không DOM, không lưu trữ, không mạng, không console, thời gian và `deviceId` do bên gọi truyền vào); chỉ import trong `core/`; không phụ thuộc bên thứ ba; lỗi là `KeymeshError` với `code` đã định nghĩa; đổi hợp đồng `core/` thì cập nhật `docs/09-core-api.md` trong cùng thay đổi; test chỉ dùng `node:test`, lõi phải pass cả `npm test` lẫn `npm run test:browser`; không ghi plaintext ra console hay thông điệp lỗi. CLAUDE.md toàn cục chỉ quy định công cụ tìm kiếm, không ảnh hưởng đến spec |
| `.aidlc/workspace.yaml` | `artifact_language: vi`; recipe `native-full`; spec có `human_review: true` |
| `docs/epics/KM-002/state.json` | `strict_mode: true` nên làm ở độ sâu đầy đủ. Đây là revision 1, chưa có feedback hay lần từ chối nào |
| `docs/epics/KM-002/inputs.json` | `from_epic: KM-001`: kế thừa hình dạng vault, đồng hồ, lịch sử, tombstone, `validateVault`. KM-002 không đổi các quy tắc đó, chỉ thêm quy tắc gộp (xem Concern 8–9 cho hai bổ sung nhỏ về dữ liệu) |
| `docs/epics/KM-002/artifacts/intent.md` | Vấn đề, §5 "Done looks like" (6 điểm), §6 "Not this", §7 năm câu hỏi mở |
| `docs/epics/KM-002/KM-002.md` | Phạm vi F-SYNC-01 (phần thuật toán gộp), F-ITM-13 (phần dữ liệu đánh dấu); điều kiện "Xong khi" |
| `docs/epics/KM-001/artifacts/spec.md` | Mức chất lượng đã đặt cho lõi: NFR01 (0 phụ thuộc), NFR02 (Node ≥ 20 và Chromium), NFR04 (không rò rỉ), NFR06 (ngưỡng hiệu năng trên máy dev), NFR09 (mỗi FR có test gắn id, bộ test ≤ 60 s) |
| `docs/05-sync.md` § "Thuật toán gộp ba chiều theo field" | Nguồn chuẩn của bước 1 (theo thực thể), bước 2 (`merge3`, bảng cách gộp từng phần), "Xung đột thật", bảng "Xoá, thùng rác và sửa", "Tính chất cần test". Spec không chép lại mà dẫn chiếu |
| `docs/03-data-model.md` §1 | Schema vault v2, `clock`, `conflict`, `history` (`reason: edit \| conflict \| restore`), quy tắc toàn vẹn (xoá env giữ tham chiếu trong `scopes`), "Thay đổi đáng lưu lịch sử" |
| `docs/09-core-api.md` | Hợp đồng `model.js`: cách một lần lưu ghi đồng hồ và lịch sử, hình dạng tombstone khi purge, `validateVault`, `HISTORY_MAX = 20`; mục "Lưu ý cho epic sau" phần KM-002 (quy tắc xoá project/env đề xuất) |
| `src/public/js/core/model.js` (đọc mã) | Xoá field có đặt lại `at`/`dev` của field, nên `merge3` trên field so được hai lần xoá/sửa. Project/env không có `clock.deletedAt`, và `projectId` của env không đổi được sau khi tạo. Item trong thùng rác không sửa được nên "sửa" và "xoá" luôn đến từ hai thiết bị khác nhau. `validateVault` không bắt lỗi env sống nằm dưới project đã xoá |
| `docs/07-features.md` | Tiêu chí chấp nhận 2, 3, 7 của kịch bản chính; F-ITM-13 |
| `docs/08-roadmap.md` | M1 ("test gộp dữ liệu pass, kể cả các tính chất gộp theo field"); Q6 |
| `docs/01-overview.md` | Dữ liệu mỗi vault < 1 MB, là cơ sở cho NFR03 |
| Câu trả lời của originator ở phiên spec (2026-11-01) | Chốt intent §7 câu 1, 2, 3, 5 (xem §8 Concerns 1, 2, 3, 5) |

## 3. User scenarios

"Người dùng" trực tiếp của phép gộp là người làm KM-006 (sync engine) và KM-009 (thùng rác), theo intent §2 vai 2. Họ gọi phép gộp từ code hoặc từ test. Người dùng cuối hai thiết bị (intent §2 vai 1) chỉ thấy kết quả, sau khi các epic đó nối phép gộp vào.

### 3.1 Primary flow
> *Given / when / then, from the user's point of view.*

1. **Sửa ở một bên (kịch bản 2).**
   *Given* `base` có item "Partner X" với Password = `P0`, `local` không đổi gì, còn `remote` (điện thoại offline) đổi Password thành `P1`,
   *when* gộp,
   *then* kết quả có Password = `P1`, không có đánh dấu xung đột, và lịch sử vẫn còn bản có `P0` mà điện thoại đã ghi lúc lưu.
2. **Sửa hai chỗ khác nhau (kịch bản 3, ý 2).**
   *Given* laptop đổi Password còn điện thoại sửa ghi chú của cùng item,
   *when* gộp,
   *then* kết quả có cả Password mới lẫn ghi chú mới, và không có đánh dấu xung đột.
3. **Gán thêm env ở hai bên (kịch bản 3, ý 3).**
   *Given* item nằm ở `PaymentGW/uat` và `PaymentGW/staging`; laptop gán thêm `PaymentGW/prod`, điện thoại gán thêm `CRM/uat`,
   *when* gộp,
   *then* item nằm ở cả bốn env.
4. **Cùng sửa một field (kịch bản 3, ý 1).**
   *Given* hai bên cùng đổi Password sang hai giá trị khác nhau, và bản của điện thoại có đồng hồ muộn hơn,
   *when* gộp,
   *then* vẫn chỉ có một item, Password lấy theo điện thoại, item được đánh dấu xung đột trên đúng field Password, và lịch sử có bản của laptop với `reason: "conflict"`.
5. **Xoá rồi khôi phục (kịch bản 7).**
   *Given* item đã ở trong thùng rác ở cả hai bên sau lần đồng bộ trước (`base` có `deletedAt`), sau đó điện thoại khôi phục nó còn laptop để nguyên,
   *when* gộp,
   *then* item trở lại, đủ field và lịch sử như trước khi bị xoá.

### 3.2 Edge and error paths
> *Dependency down, permission denied, empty state, boundary inputs, interruption
> and recovery.*

- **Phụ thuộc ngoài / quyền:** không áp dụng. Phép gộp không gọi mạng, không đọc lưu trữ và không cần khoá; nó nhận vault đã giải mã.
- **Đầu vào sai:** `local` hoặc `remote` không qua được `validateVault`, `base` có mặt nhưng không hợp lệ, hoặc ba bản khác `vaultId` hay khác `v`. Khi đó không có kết quả nào được trả về, lỗi ném ra là `KeymeshError` với `code: "invalid"`, và cả ba đầu vào giữ nguyên.
- **Rỗng:** ba vault rỗng gộp ra vault rỗng. Không có `base` (vault chưa từng được đồng bộ chung) thì coi `base` là vault rỗng cùng `vaultId`.
- **Hai bên cùng tạo một id** (ví dụ cùng import một file): gộp như với `base` rỗng (Concern 2).
- **Xoá cạnh tranh với sửa:** mọi dòng ở bảng "Xoá, thùng rác và sửa" của 05, cộng thêm việc khôi phục cạnh tranh với xoá trắng (Concern 7).
- **Xoá env/project trong khi bên kia vẫn dùng:** env vẫn bị xoá, mọi tham chiếu được giữ, không gắn đánh dấu (Concern 1).
- **Biên của lịch sử:** khi bên kia đã có đủ `HISTORY_MAX` bản mới hơn, bản thua của lần gộp này vẫn được giữ (Concern 5).
- **Đồng hồ hoà hoàn toàn** (cùng `at`, cùng `dev`, giá trị khác nhau): xảy ra được khi hai thiết bị mang cùng `deviceId`, ví dụ khôi phục cùng một bản sao lưu IndexedDB lên hai máy. Phân xử bằng chính giá trị, nên kết quả không phụ thuộc thứ tự (Concern 4).
- **Gián đoạn và khôi phục:** phép gộp không có trạng thái giữa chừng. Nếu bị gọi lại với cùng đầu vào, nó cho đúng cùng kết quả. Gộp tiếp kết quả với chính nó không đổi gì.

## 4. Functional requirements

Dẫn chiếu intent: §5.1 = kịch bản 3, §5.2 = kịch bản 2, §5.3 = kịch bản 7, §5.4 = bảng xoá + xoá project/env + cùng tạo id, §5.5 = các tính chất, §5.6 = kết quả hợp lệ; §7.n = câu hỏi mở thứ n.

| Id | Requirement | Priority | Traces to |
|---|---|---|---|
| `KM-002-FR01` | Lõi có một phép gộp nhận `base` (có thể vắng), `local`, `remote` và trả về **vault mới**. Phép gộp không sửa đầu vào nào. Kết quả chỉ phụ thuộc ba đầu vào: không đọc giờ hệ thống, không cần `deviceId`, không có nguồn ngẫu nhiên | Must | intent §1; §5.5 |
| `KM-002-FR02` | Kiểm đầu vào trước khi gộp: `local`, `remote` (và `base` nếu có) phải hợp lệ theo `validateVault`, cùng `v` và cùng `vaultId`. Sai thì ném `KeymeshError` `invalid`, không trả kết quả nào. Thông điệp lỗi không kèm giá trị nào lấy từ vault | Must | §5.6 |
| `KM-002-FR03` | Gộp từng bảng `projects`, `envs`, `items` theo `id`, trên hợp các id của cả ba bản, theo bước 1 của 05: hai bên giống nhau thì giữ; chỉ một bên có thì giữ bên đó; có ở cả hai nhưng `base` không có thì gộp như FR15; còn lại gộp theo thuộc tính. Không id nào có trong `local` hoặc `remote` vắng mặt ở kết quả | Must | §5.5 |
| `KM-002-FR04` | Mỗi giá trị đơn được gộp theo `merge3` của 05. "Đổi" nghĩa là khác giá trị trong `base` khi so sâu, không dựa vào đồng hồ. Chỉ khi cả hai bên đổi và cho ra hai giá trị khác nhau mới là **xung đột thật** | Must | §5.1; Q6 |
| `KM-002-FR05` | Phân xử xung đột thật: đồng hồ có `at` lớn hơn thắng, hoà thì so `dev`. Hoà cả hai thì so chính hai giá trị theo một thứ tự toàn phần cố định, giống nhau trên mọi nền tảng. Đồng hồ của giá trị trong kết quả là đồng hồ của bên được chọn. Nếu hai bên cùng giữ một giá trị nhưng đồng hồ khác nhau thì lấy đồng hồ muộn hơn theo đúng quy tắc trên | Must | §5.1, §5.5; §7.4 |
| `KM-002-FR06` | Item: các thuộc tính đơn `type`, `title`, `notes`, `expires`, `favorite`, `forkedFrom`, `fieldOrder` được gộp theo FR04–FR05, mỗi thuộc tính dùng `clock[thuộc tính]` của nó | Must | §5.1 |
| `KM-002-FR07` | Item: `fields` gộp theo `field.id`. Field chỉ có ở một bên thì giữ. Field có ở cả hai bên thì gộp **cả field** (`label`, `kind`, `v`, `file`, `deletedAt`) theo FR04–FR05 với đồng hồ `at`/`dev` của field. Một bên xoá field, bên kia sửa field đó thì đồng hồ muộn hơn thắng | Must | §5.1, §5.4 |
| `KM-002-FR08` | Item: `scopes` và `tags` gộp như tập hợp ba chiều theo 05. Phần thêm vào ở cả hai bên đều được giữ; phần một bên bỏ đi bị bỏ nếu bên kia không thêm lại. Mỗi phần tử chỉ xuất hiện một lần. Gộp tập hợp không bao giờ sinh xung đột | Must | §5.1 |
| `KM-002-FR09` | Khi một item có ít nhất một xung đột thật, **mỗi bên thua ít nhất một giá trị** được đẩy nguyên bản trước khi gộp của nó vào `history`, với `reason: "conflict"` và đúng hình dạng bản lịch sử ở 03/09. `at`, `rev`, `dev` của bản này chỉ suy ra từ ba đầu vào, để hai thiết bị gộp cùng ba bản thì sinh ra bản lịch sử giống hệt nhau và lần gộp sau bỏ được bản trùng | Must | §5.1, §5.5 |
| `KM-002-FR10` | Đánh dấu xung đột: `conflict.fields` gồm id các field xung đột, `conflict.attrs` gồm tên các thuộc tính xung đột (kể cả `deletedAt`/`purgedAt` theo FR13–FR14). Đánh dấu đã có trước đó được gộp ba chiều như tập hợp so với `base`, nên một bên đã bấm "Đã xử lý" mà bên kia không đổi thì đánh dấu cũ mất. Xung đột mới phát sinh trong lần gộp này được thêm vào. Cả hai tập đều rỗng thì `conflict = null`. `conflict.at` lấy từ đồng hồ của các giá trị xung đột (ví dụ đồng hồ muộn nhất trong số đó), không lấy từ giờ hệ thống | Must | §5.1; §7.3 |
| `KM-002-FR11` | `history` gộp theo khoá `(at, rev, dev)`, bỏ bản trùng, sắp mới nhất trước, cắt còn `HISTORY_MAX`. Mọi bản `conflict` sinh ra **trong lần gộp này** luôn được giữ: khi phải cắt, bỏ những bản cũ nhất trong số còn lại. Hai bản trùng khoá nhưng khác nội dung thì chọn theo một quy tắc cố định, không phụ thuộc thứ tự đầu vào | Must | §5.5; §7.5 |
| `KM-002-FR12` | Siêu dữ liệu của thực thể trong kết quả: `rev` là `max(l.rev, r.rev) + 1` nếu kết quả khác cả `l` lẫn `r`, nếu không thì lấy theo bên trùng với kết quả. `updatedAt` là `max` của mọi đồng hồ trong kết quả. `createdAt` là giá trị nhỏ hơn của hai bên | Must | §5.6 |
| `KM-002-FR13` | Thùng rác (theo bảng ở 05): một bên chuyển vào thùng rác, bên kia không sửa nội dung → item vào thùng rác. Một bên chuyển vào thùng rác, bên kia sửa nội dung → **bên sửa thắng**: `deletedAt = null`, các thay đổi nội dung được gộp như thường, bên đã xoá vào `history` với `reason: "conflict"` kèm dấu "đã bị xoá ở thiết bị khác" (FR19), và `conflict.attrs` có `deletedAt`. Cả hai cùng xoá → giữ `deletedAt` **sớm hơn** cùng đồng hồ của nó. Một bên khôi phục, bên kia vẫn để trong thùng rác → bên khôi phục thắng. "Sửa nội dung" nghĩa là đổi so với `base` bất kỳ thuộc tính nào trong `type`, `title`, `notes`, `expires`, `favorite`, `forkedFrom`, `fieldOrder`, `fields`, `tags`, `scopes` | Must | §5.3, §5.4 |
| `KM-002-FR14` | Xoá trắng: một bên purge, bên kia không đổi gì → kết quả là tombstone đúng hình dạng ở 09 § "Purge". Một bên purge, bên kia sửa nội dung **hoặc khôi phục** item khỏi thùng rác → item sống lại với nội dung, lịch sử và `deletedAt` của bên đó, `purgedAt = null`, `conflict.attrs` có `purgedAt`. Bên purge không sinh bản lịch sử vì nội dung của nó đã bị xoá trắng. Cả hai cùng purge → tombstone, giữ `deletedAt` và `purgedAt` sớm hơn | Must | §5.4 |
| `KM-002-FR15` | Hai bên cùng tạo một id (`base` không có id đó): gộp như với một thực thể rỗng. Mọi giá trị khác nhau đều là xung đột thật theo FR05, FR09, FR10. `scopes`/`tags` lấy hợp của hai bên. Giá trị giống nhau thì không tính xung đột. Giá trị không có đồng hồ riêng (`projectId` của env) lấy theo bên có `updatedAt` muộn hơn, hoà thì theo FR05 | Must | §5.4; §7.2 |
| `KM-002-FR16` | Project/env: `name`, `order` (cả hai) và `color` (env) gộp theo FR04–FR05 với `clock` của chúng. Khi xung đột thì bản muộn hơn thắng, không ghi lịch sử và không gắn đánh dấu | Must | §5.4 |
| `KM-002-FR17` | Xoá project/env: chỉ một bên đổi `deletedAt` so với `base` thì bên đó thắng; cả hai cùng xoá thì giữ `deletedAt` sớm hơn. Sửa thuộc tính ở một bên và xoá ở bên kia thì áp dụng cả hai. Phép gộp **không tự tạo thêm lần xoá nào** và không gắn đánh dấu: item được gán vào env mà bên kia đã xoá vẫn giữ id env đó trong `scopes`; env mới tạo trong project mà bên kia đã xoá vẫn được giữ, còn project vẫn ở trạng thái đã xoá | Must | §5.4; §7.1 |
| `KM-002-FR18` | Kết quả gộp luôn hợp lệ theo `validateVault` khi đầu vào hợp lệ | Must | §5.6 |
| `KM-002-FR19` | Bản lịch sử `conflict` sinh ra do xoá cạnh tranh với sửa (FR13) mang một dấu cố định, máy đọc được, để UI (KM-004/KM-009) hiện câu "đã bị xoá ở thiết bị khác". Câu chữ hiển thị không nằm trong dữ liệu. Phần bổ sung này được ghi vào 03 §1 và 09 | Must | §5.4; intent §6 (đổi hình dạng phải ghi lý do) |
| `KM-002-FR20` | `docs/09-core-api.md` có mục cho phép gộp: đầu vào, đầu ra, lỗi, tính thuần, và các quy tắc ở FR05, FR10, FR11, FR19. `docs/05-sync.md` có thêm quy tắc xoá project/env (FR17), quy tắc cùng tạo id (FR15), đánh dấu "Đã xử lý" (FR10), giới hạn lịch sử (FR11), đồng hồ hoà hoàn toàn (FR05), và cách hiểu "sửa nội dung" (FR13–FR14). Mọi chỗ trong 05 trái với spec này được sửa trong cùng thay đổi | Must | intent §1, §4 (ghi chú KM-001), §6 |
| `KM-002-FR21` | Gộp vault không có `base` (FR01) thì coi `base` là vault rỗng cùng `vaultId`: thực thể chỉ ở một bên được giữ, thực thể ở cả hai bên gộp theo FR15 | Should | intent §1 |

## 5. Non-functional requirements

| Id | Requirement | Target |
|---|---|---|
| `KM-002-NFR01` | Thuần và không phụ thuộc | Phép gộp nằm trong lõi và chỉ dùng lõi. Không DOM, không lưu trữ, không mạng, không ghi console, không đọc giờ hệ thống hay nguồn ngẫu nhiên. Có 0 package bên thứ ba khi chạy lẫn khi test |
| `KM-002-NFR02` | Tương thích môi trường | Cùng một bộ test gộp pass 100% trên Node ≥ 20 (máy dev hiện là v24.22.1) và qua `npm run test:browser` trên Chromium desktop bản hiện hành |
| `KM-002-NFR03` | Hiệu năng trên máy dev của originator (Node) | Gộp một vault khoảng 1 MB (khoảng 500 item, mỗi item 8 field và 20 bản lịch sử, khoảng 10% item có sửa ở cả hai bên, trong đó một nửa đụng nhau): ≤ 200 ms, trung vị của 5 lần. Ngưỡng này bằng ngân sách mã hoá 1 MB của KM-001 NFR06 và chưa có số đo cơ sở. Trên điện thoại chưa đặt ngưỡng (Concern 12) |
| `KM-002-NFR04` | Tất định | Cùng ba đầu vào thì kết quả giống hệt nhau khi so sâu, giữa các lần chạy và giữa Node với trình duyệt |
| `KM-002-NFR05` | Không rò rỉ | Thông điệp lỗi, giá trị trả về khi lỗi và đầu ra console không chứa giá trị nào lấy từ vault (title, `v`, notes…). Kiểm bằng dữ liệu có đánh dấu riêng như KM-001 AC22 |
| `KM-002-NFR06` | Độ phủ test | Mỗi FR có ít nhất 1 test chỉ rõ id FR đó. Mỗi dòng của bảng "Xoá, thùng rác và sửa" ở 05 có 1 test riêng. Mỗi tính chất ở 05 § "Tính chất cần test" chạy trên ≥ 500 bộ dữ liệu sinh ngẫu nhiên, sinh từ một seed: khi fail thì in seed ra để tái hiện (seed không phải bí mật). Cả bộ `npm test` vẫn xong trong ≤ 60 s trên máy dev |
| `KM-002-NFR07` | Hợp đồng ổn định | Hành vi gộp được mô tả ở 09 đủ để KM-006 và KM-009 dùng mà không cần đọc mã. Đổi hành vi thì đổi 09 trong cùng thay đổi |

## 6. Acceptance criteria

| Id | Given / When / Then |
|---|---|
| `KM-002-AC01` | *Given* `base` có item với Password `P0`, `local` không đổi, `remote` được tạo từ `base` bằng `updateItem` đổi Password thành `P1` *when* gộp *then* Password = `P1`, `conflict = null`, `history` có bản chứa `P0` (FR04, FR06, FR07; kịch bản 2) |
| `KM-002-AC02` | *Given* hai bên cùng đổi Password (`f_02`) sang hai giá trị khác nhau, đồng hồ của `remote` muộn hơn *when* gộp *then* còn đúng 1 item, Password lấy theo `remote`, `conflict.fields = ["f_02"]`, `conflict.attrs = []`, và `history` có 1 bản `reason: "conflict"` chứa Password của `local` (FR05, FR07, FR09, FR10; kịch bản 3 ý 1) |
| `KM-002-AC03` | *Given* `local` đổi Password, `remote` đổi `notes` của cùng item *when* gộp *then* kết quả có cả Password mới lẫn `notes` mới, `conflict = null`, không có bản lịch sử `conflict` nào (FR04, FR06, FR07; kịch bản 3 ý 2) |
| `KM-002-AC04` | *Given* `base.scopes = {uat, staging}`, `local` thêm `prod`, `remote` thêm `crm-uat` *when* gộp *then* `scopes` có đúng 4 env, mỗi env một lần, không có xung đột. Thêm: một bên bỏ `staging` còn bên kia không đổi thì `staging` bị bỏ; hai bên cùng thêm một tag thì tag đó xuất hiện một lần (FR08; kịch bản 3 ý 3) |
| `KM-002-AC05` | *Given* `base` có item đã vào thùng rác, có đủ field và lịch sử; `local` gọi `restoreItem`; `remote` để nguyên *when* gộp *then* `deletedAt = null`, `fields` và `history` của item giống hệt trước khi xoá, không có xung đột (FR13; kịch bản 7) |
| `KM-002-AC06` | *Given* một bên `trashItem`, bên kia không sửa gì *when* gộp *then* item có `deletedAt` của bên xoá, không có xung đột (FR13; 05 bảng xoá dòng 1) |
| `KM-002-AC07` | *Given* một bên `trashItem`, bên kia đổi `title` *when* gộp *then* `deletedAt = null`, `title` mới, `conflict.attrs` có `deletedAt`, và `history` có bản `conflict` mang dấu "đã bị xoá ở thiết bị khác". Lặp lại với bên kia chỉ đổi `favorite` hoặc `tags`: kết quả giống vậy (FR13, FR19; dòng 2) |
| `KM-002-AC08` | *Given* hai bên cùng `trashItem` ở hai thời điểm khác nhau *when* gộp theo cả hai thứ tự *then* `deletedAt` và `clock.deletedAt` là của lần xoá sớm hơn (FR13; dòng 3) |
| `KM-002-AC09` | *Given* `base` có item trong thùng rác; một bên khôi phục, bên kia để nguyên *when* gộp *then* item sống (FR13; dòng 4). Trường hợp này cũng là AC05 |
| `KM-002-AC10` | *Given* một bên `purgeItem`, bên kia không đổi gì *when* gộp *then* kết quả là tombstone đúng hình dạng ở 09 § "Purge" (FR14; dòng 5) |
| `KM-002-AC11` | *Given* một bên `purgeItem`, bên kia đổi Password *when* gộp *then* item sống với nội dung và lịch sử của bên sửa, `purgedAt = null`, `deletedAt = null`, `conflict.attrs` có `purgedAt` (FR14; dòng 6) |
| `KM-002-AC12` | *Given* `base` có item trong thùng rác; một bên `purgeItem`, bên kia `restoreItem` *when* gộp *then* item sống với đủ nội dung, `purgedAt = null`, `conflict.attrs` có `purgedAt` (FR14; Concern 7) |
| `KM-002-AC13` | *Given* một bên xoá field `f_03` (`updateItem` bỏ nó khỏi `fields`), bên kia sửa `v` của `f_03` với đồng hồ muộn hơn *when* gộp *then* `f_03` sống với giá trị mới, `conflict.fields` có `f_03`, `history` có bản của bên xoá. Đảo đồng hồ (bên xoá muộn hơn) *then* `f_03` bị xoá, `history` có bản chứa giá trị đã sửa (FR07, FR09; dòng 7) |
| `KM-002-AC14` | *Given* mỗi bên thêm một field mới, id khác nhau *when* gộp *then* cả hai field có trong kết quả, không có xung đột (FR07) |
| `KM-002-AC15` | *Given* hai bên cùng đổi `name` của một env, `remote` muộn hơn *when* gộp *then* `name` theo `remote`, và kết quả không có bản lịch sử hay đánh dấu xung đột mới nào. *Given* một bên đổi `name`, bên kia đổi `color` *then* có cả hai thay đổi (FR16) |
| `KM-002-AC16` | *Given* `local` `deleteEnv(E)`, `remote` gán item X vào E và tạo env F trong project P mà `local` đã `deleteProject(P)` *when* gộp *then* E và P có `deletedAt`; X còn E trong `scopes`; F có mặt trong kết quả; không item nào có đánh dấu; kết quả hợp lệ theo `validateVault` (FR17, FR18; Concern 1) |
| `KM-002-AC17` | *Given* hai bên cùng xoá một project ở hai thời điểm khác nhau *when* gộp theo cả hai thứ tự *then* `deletedAt` là thời điểm sớm hơn. *Given* một bên đổi tên, bên kia xoá *then* kết quả vừa đã xoá vừa có tên mới (FR17) |
| `KM-002-AC18` | *Given* `base` không có item I; cả hai bên có I với cùng Username, khác Password, khác `tags` *when* gộp *then* còn 1 item I, Password theo đồng hồ muộn hơn, `conflict.fields` chỉ có field Password, `tags` là hợp của hai bên, `history` có bản thua (FR15) |
| `KM-002-AC19` | *Given* `base` có item với `conflict = { fields: ["f_02"], attrs: [] }`, `local` đã đặt `conflict = null`, `remote` giữ nguyên *when* gộp *then* `conflict = null`. *Given* tình huống như vậy, nhưng lần gộp này có thêm xung đột mới trên `notes` *then* `conflict = { fields: [], attrs: ["notes"], … }` (FR10; Concern 3) |
| `KM-002-AC20` | *Given* `remote` có 20 bản lịch sử, bản nào cũng mới hơn mọi bản của `local`, và hai bên xung đột trên Password *when* gộp *then* `history` có đúng 20 bản, trong đó có bản `conflict` chứa Password của bên thua (FR11; Concern 5) |
| `KM-002-AC21` | *Given* hai bên đổi `title` khác nhau với đồng hồ hoà hoàn toàn (cùng `at`, cùng `dev`) *when* gộp `(b, l, r)` và `(b, r, l)` *then* hai kết quả giống hệt nhau khi so sâu (FR05; Concern 4) |
| `KM-002-AC22` | *Given* `local` không hợp lệ (ví dụ `items[0].type` lạ), hoặc `remote` khác `vaultId` *when* gộp *then* ném `KeymeshError` `code: "invalid"`, không có kết quả, ba đầu vào giữ nguyên, và thông điệp lỗi không chứa giá trị đánh dấu nào lấy từ vault (FR02, NFR05) |
| `KM-002-AC23` | *Given* ba đầu vào bất kỳ *when* gộp *then* so sâu với bản sao chụp trước khi gộp thì cả ba đầu vào không đổi (FR01) |
| `KM-002-AC24` | *Given* không có `base`, `local` và `remote` có các item khác id *when* gộp *then* kết quả có mọi item của cả hai bên (FR21) |
| `KM-002-AC25` | *Given* `m1 = merge(b, l, r)` và `m2 = merge(b, r, l)` có xung đột *when* gộp `merge(b, m1, m2)` *then* kết quả bằng `m1` và không có bản lịch sử `conflict` nào bị trùng (FR09, FR11, NFR04) |
| `KM-002-AC26` | *Given* ≥ 500 bộ `(b, l, r)` sinh ngẫu nhiên từ `b` bằng các thao tác của `model.js` (sửa thuộc tính, sửa/thêm/xoá field, đổi scopes/tags, thùng rác, khôi phục, purge, sửa/xoá project/env), với đồng hồ có thể hoà, chạy trên Node **và** trình duyệt *when* gộp *then* mọi tính chất sau đều đúng: `merge(b, x, x) = x`; `merge(b, b, r) = r` và `merge(b, l, b) = l`; `merge(b, l, r)` và `merge(b, r, l)` giống nhau khi so sâu, chỉ cho phép khác thứ tự `history`; không id thực thể hay field nào có trong `l`/`r` mà vắng ở kết quả; mọi giá trị trước gộp của `title`, `type`, `fields`, `notes`, `expires`, `scopes` ở `l`/`r` mà không còn trong nội dung hiện tại thì có trong một bản `history` (trừ nội dung bị xoá trắng có chủ ý theo FR14); item chỉ vào thùng rác hoặc bị purge khi một bên xoá và bên kia không sửa nội dung; kết quả hợp lệ theo `validateVault` (FR01, FR03–FR18, NFR02, NFR04, NFR06) |
| `KM-002-AC27` | *Given* máy dev của originator và vault ~1 MB như mô tả ở NFR03 *when* đo gộp 5 lần *then* trung vị ≤ 200 ms (NFR03) |
| `KM-002-AC28` | *Given* thay đổi của KM-002 *when* reviewer đọc `docs/09-core-api.md`, `docs/05-sync.md`, `docs/03-data-model.md` *then* có mục hợp đồng phép gộp, có các quy tắc mới (xoá project/env, cùng tạo id, "Đã xử lý", giới hạn lịch sử, đồng hồ hoà, "sửa nội dung", dấu "đã bị xoá ở thiết bị khác"), và 05 không còn chỗ nào trái với spec này (FR19, FR20, NFR07) |
| `KM-002-AC29` | *Given* bộ test gộp *when* chạy `npm test` *then* mỗi FR có test mang id của nó, mỗi dòng bảng xoá ở 05 có một test, và cả bộ xong ≤ 60 s (NFR06) |

## 7. Out of scope

> *What this explicitly does not do. Mandatory — an unbounded spec is not a spec.*

- Giao tiếp mạng, push/pull, xử lý 409, thử lại, thanh trạng thái (KM-006); server, so sánh version, snapshot (KM-005).
- Lưu `base`/`local` trên thiết bị, cờ `dirty` (KM-003).
- Badge ⚠, tô sáng field, nút "Đã xử lý", câu chữ "đã bị xoá ở thiết bị khác" hiển thị cho người dùng (KM-004). Epic này chỉ tạo dữ liệu đánh dấu.
- Giao diện thùng rác và việc tự xoá trắng sau 30 ngày (KM-009). Ở đây chỉ gộp đúng các trạng thái xoá đã có.
- Cách hiển thị env sống nằm dưới project đã xoá, hoặc item chỉ còn tham chiếu tới env đã xoá (Concern 10).
- Gộp `meta` của vault (tên, màu, thứ tự vault): theo 05 là "bản sửa muộn hơn thắng", thuộc KM-006.
- Gộp giữa hai vault khác `vaultId`; chuyển item giữa các vault.
- Đổi đồng hồ, cách một lần lưu ghi lịch sử, hình dạng tombstone hay `HISTORY_MAX` của KM-001. Ngoại lệ là hai bổ sung đã ghi lý do: dấu trên bản lịch sử `conflict` (FR19) và quy tắc `conflict.at` (FR10).
- Thêm `clock.deletedAt` cho project/env.
- Ngưỡng hiệu năng trên điện thoại (Concern 12).

## 8. Concerns

> *Every conflict between the intent and a constraint, itself, or something that
> already ships. Each must be resolved inline or deferred with a named owner
> before this spec is approved.*

| # | Concern | Needs | Resolution |
|---|---|---|---|
| 1 | Intent §7 câu 1: một bên xoá env, bên kia gán item vào env đó (hoặc tạo env trong project vừa xoá). 05 chưa có quy tắc | Originator | **Đã chốt (originator, 2026-11-01): giữ xoá, giữ tham chiếu.** Phép gộp không hồi sinh env/project và không tự tạo thêm lần xoá nào; item giữ id env trong `scopes` theo quy tắc toàn vẹn ở 03; không gắn đánh dấu. Cùng xoá thì lấy thời điểm sớm hơn; chỉ một bên đổi thì bên đó thắng, đúng ghi chú KM-001 ở 09 (FR17, AC16–17) |
| 2 | Intent §7 câu 2: hai bên cùng tạo một id | Originator | **Đã chốt (originator, 2026-11-01): làm theo 05, gộp với `base` rỗng.** Mọi giá trị khác nhau đều là xung đột thật và có đánh dấu theo từng field; tập hợp lấy hợp (FR15, AC18) |
| 3 | Intent §7 câu 3: một bên đã bấm "Đã xử lý", bên kia vẫn còn đánh dấu. 05 không nói `conflict` được gộp thế nào | Originator | **Đã chốt (originator, 2026-11-01): gộp ba chiều theo từng id field/tên thuộc tính.** Bên đã xử lý thắng nếu bên kia không đổi; xung đột mới của lần gộp được thêm vào; rỗng thì `null` (FR10, AC19) |
| 4 | Intent §7 câu 4: đồng hồ hoà hoàn toàn. 05 chỉ nói "hoà thì so `dev`" | Product Owner | **Đã chốt (PO).** Xảy ra được khi hai máy mang cùng `deviceId`, ví dụ khôi phục cùng một bản sao IndexedDB. Khi đó so chính giá trị theo một thứ tự toàn phần cố định, để giữ tính đối xứng và tất định (FR05, AC21). Engineer chọn thứ tự cụ thể và ghi vào 09 |
| 5 | Intent §7 câu 5: cắt `HISTORY_MAX = 20` có thể đẩy bản thua ra ngoài ngay trong lần gộp | Originator | **Đã chốt (originator, 2026-11-01): ưu tiên bản thua vừa sinh.** Các bản `conflict` của lần gộp luôn được giữ, vẫn ≤ 20 (mỗi lần gộp sinh tối đa 2 bản cho một item). Ở các lần lưu sau, chúng có thể bị đẩy ra như mọi bản khác; snapshot trên server là lưới an toàn (FR11, AC20) |
| 6 | 05 viết "toàn bộ item của **bên thua**" (số ít), nhưng gộp theo giá trị thì mỗi bên có thể thua một giá trị khác nhau (local thắng `notes`, remote thắng Password). Nếu chỉ lưu một bên thì tính chất "mọi nội dung thua tìm lại được" sai | Product Owner | **Đã chốt (PO):** mọi bên thua ít nhất một giá trị đều được đẩy vào `history` (FR09). 05 được sửa cho khớp (FR20). Originator xem lại khi duyệt spec |
| 7 | Bảng xoá ở 05 nói "bên kia sửa nội dung" nhưng không định nghĩa "nội dung", và không có dòng cho việc khôi phục cạnh tranh với xoá trắng (thùng rác tự dọn sau 30 ngày trên một máy, máy kia khôi phục) | Product Owner | **Đã chốt (PO), theo intent §1 ("không mất dữ liệu âm thầm").** "Sửa nội dung" là đổi bất kỳ thuộc tính nào người dùng sửa được (FR13), kể cả `favorite` và `tags`. Khôi phục cũng thắng xoá trắng, và có đánh dấu `purgedAt` (FR14, AC12). Đánh đổi: thao tác "Xoá vĩnh viễn" có chủ ý vẫn thua một lần khôi phục đồng thời; người dùng thấy badge và xoá lại được |
| 8 | Bản lịch sử `conflict` do xoá cạnh tranh với sửa cần "note" (05) nhưng hình dạng bản lịch sử ở 03/09 không có chỗ cho nó. Intent §6 không cho đổi hình dạng của KM-001 nếu không ghi lý do | Product Owner | **Đã chốt (PO):** thêm một dấu cố định, máy đọc được, vào bản lịch sử loại này; câu chữ do UI lo (FR19). Lý do: 05 đã yêu cầu thông tin này, và `validateVault` hiện chỉ kiểm bản lịch sử là object nên dữ liệu cũ vẫn hợp lệ. Engineer cập nhật 03 §1 và 09 trong cùng thay đổi |
| 9 | 03 có `conflict.at` nhưng không nói lấy giờ từ đâu, trong khi lõi không được tự đọc giờ và phép gộp phải đối xứng | Product Owner | **Đã chốt (PO):** `conflict.at` lấy từ đồng hồ của các giá trị xung đột, không cần bên gọi truyền giờ (FR01, FR10). Engineer chọn công thức cụ thể và ghi vào 09 |
| 10 | Theo Concern 1, kết quả gộp có thể có env sống dưới project đã xoá, hoặc item chỉ còn trỏ tới env đã xoá. Cả hai đều hợp lệ theo `validateVault`, nhưng UI phải biết hiển thị chúng thế nào | Originator | **Hoãn, owner: originator, lúc: build-plan KM-003 (màn project/env).** Đề xuất: env có project đã xoá thì coi như đã xoá khi hiển thị; item không còn env sống thì vào *Chưa gán* (03). Phép gộp không đổi dữ liệu vì chuyện này |
| 11 | Gộp `meta` của vault cũng là "gộp hai bản", nhưng intent §6 đã loại | — | **Đã chốt theo intent §6:** ngoài phạm vi, thuộc KM-006 |
| 12 | Chưa có số đo tốc độ gộp trên điện thoại | Originator (đo trên thiết bị thật) | **Hoãn, owner: originator, lúc: KM-006 chạy sync trên iPhone/Android.** KM-002 chỉ đặt ngưỡng trên máy dev (NFR03) |

---

*No implementation detail: no libraries, tables, endpoints or file layouts.*
