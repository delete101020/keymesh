# Implementation Plan — Gộp ba chiều theo field (merge.js)

**Epic ID:** `KM-002`
**Author:** Engineer
**Status:** Draft
**Created:** `2026-11-01`
**Traces to:** `spec.md`

---

## 1. Approach

Thêm **một module thuần mới**, `src/public/js/core/merge.js`, export `merge(base, local, remote)` trả về một vault mới, cùng hằng `DELETED_ELSEWHERE`. Đây là dấu của FR19, có giá trị `'deleted-elsewhere'`, nằm ở khoá `note` của bản lịch sử. Module chỉ import `./errors.js` (`KeymeshError`) và `./model.js` (`validateVault`, `HISTORY_MAX`, `VAULT_VERSION`). Nó không gọi `newId`, `randomBytes`, `Date` hay thao tác sửa nào của model. `model.js` giữ nguyên, nên blast-radius trên mã đang có bằng 0. Theo codegraph, `validateVault` có 4 bên gọi, `HISTORY_MAX` và `VAULT_VERSION` chỉ được dùng trong `model.js` và test; merge chỉ *đọc* các export này. Thuật toán đi đúng hai bước của `docs/05-sync.md`. Bước 1 đi theo thực thể, trên hợp các id. Bước 2 dựng một `merge3` chung trên cặp (giá trị, đồng hồ). Từ `merge3` có các bộ gộp cho từng phần: thuộc tính đơn, field (cả field), tập hợp (`tags`/`scopes`/đánh dấu `conflict`), lịch sử, và trạng thái xoá (`deletedAt`/`purgedAt`). Item, project và env ghép các bộ gộp đó lại. Đầu ra được dựng mới hoàn toàn, sao chép sâu từ đầu vào, nên không dùng chung tham chiếu nào với đầu vào (FR01).

**Phương án đã bỏ: gộp bằng cách "phát lại thao tác".** Cách này ghi nhật ký thao tác `updateItem`/`trashItem`… ở mỗi bên rồi chạy lại trên `base`. Bỏ vì ba lý do. Nó cần lưu nhật ký thao tác, mà KM-001 không có và 05 không thiết kế. Phát lại phải gọi model với `ctx`, tức là sinh đồng hồ mới, trái FR01. Và kết quả phụ thuộc thứ tự phát lại, nên khó chứng minh tính đối xứng. Phép gộp trên trạng thái (state-based) thì chỉ cần ba bản vault, đúng thứ KM-003/KM-006 sẽ có. Cũng đã bỏ cách trả `{ result, conflicts }` như `docs/02-architecture.md` dòng 38 đang ghi: spec FR01 nói phép gộp trả **vault**, còn xung đột nằm ở `item.conflict`. Plan sửa dòng 38 cho khớp.

**Các quyết định spec giao cho engineer, hoặc spec còn im lặng.** Mọi quyết định dưới đây được ghi vào `docs/09-core-api.md` § `merge.js` (FR20, NFR07):

- **So bằng và thứ tự toàn phần.** "Bằng" là so sâu **không phụ thuộc thứ tự khoá**. Lý do: `applyFields` của model xoá rồi gán lại `file`, nên hai bản cùng nội dung có thể khác thứ tự khoá, và `JSON.stringify` như `same()` của model sẽ so sai. Merge dùng `canon(v)`: JSON với khoá sắp tăng dần, bỏ `undefined`. Thứ tự toàn phần khi đồng hồ hoà hoàn toàn (Concern 4) là so chuỗi `canon` theo code unit, **lớn hơn thắng**. Thứ tự này giống nhau trên mọi nền tảng vì không dùng `localeCompare`.
- **Đồng hồ.** `later(a, b)`: `at` lớn hơn thắng; hoà thì `dev` lớn hơn (so code unit) thắng; hoà cả hai thì so giá trị như trên.
- **Đồng hồ của giá trị hai bên cùng giữ** (FR05, câu cuối). Nếu đồng hồ một bên bằng đồng hồ ở `base`, lấy đồng hồ bên kia; nếu không thì `later`. Khi đồng hồ đi tới, cách này cho đúng kết quả như "lấy đồng hồ muộn hơn". Nó chỉ khác khi lệch giờ hay hoà đồng hồ, và nhờ đó giữ được `merge(b, b, r) = r` (AC26). Đây là tinh chỉnh của FR05, ghi ở Risks #3.
- **Siêu dữ liệu (FR12, amendment đã được originator chốt ngày 2026-11-01).** Nếu nội dung kết quả, tức mọi khoá trừ `rev` và `updatedAt`, bằng đúng một bên thì lấy nguyên `rev`/`updatedAt` của bên đó. Bằng cả hai bên thì lấy bên có `(rev, updatedAt)` lớn hơn. Còn lại thì `rev = max(l.rev, r.rev) + 1` và `updatedAt = max(l.updatedAt, r.updatedAt, đồng hồ muộn nhất trong kết quả)`. `createdAt` luôn là `min`. Lý do: model tăng `updatedAt` mà không ghi đồng hồ khi chỉ đổi `tags`/`scopes`, khi `deleteProject` chạm vào env, và khi purge item đã nằm trong thùng rác. Nếu áp nguyên văn FR12 thì AC26 fail. Phải sửa câu FR12 trong 05/09 theo đúng amendment này.
- **Thứ tự mảng.** Thứ tự mảng phải đối xứng, đồng thời phải giữ `merge(b, b, r) = r`. Danh sách id của `projects`/`envs`/`items`/`fields` được gộp bằng `merge3` trên dãy id. Chỉ một bên đổi dãy thì lấy dãy bên đó, rồi nối các id còn thiếu vào cuối. Cả hai cùng đổi thì xếp id của `base` theo thứ tự `base`, sau đó là nhóm id mới của từng bên theo thứ tự của bên đó. Nhóm nào có id đầu nhỏ hơn đứng trước; id đã xếp thì không lặp lại. Tập hợp `tags`/`scopes`/`conflict.fields`/`conflict.attrs` cũng `merge3` trên mảng trước. Khi cả hai cùng đổi thì gộp tập hợp ba chiều theo 05 và **sắp tăng dần**. `history` luôn sắp theo `(at, rev, dev)` giảm dần, hoà thì theo `canon` giảm dần. Nhờ vậy `merge(b, l, r)` và `merge(b, r, l)` bằng nhau tuyệt đối, kể cả thứ tự `history`.
- **Bản lịch sử `conflict` (FR09).** Hình dạng: `{ at, rev, dev, reason: 'conflict', title, type, fields, notes, expires, scopes }` của bên thua *trước khi gộp*. `rev` là `rev` của bên đó; `at`/`dev` là đồng hồ muộn nhất của bên đó, xét `item.clock.*` và `at`/`dev` của mọi field theo `later`. Bản do xoá thua sửa (FR13) có thêm `note: DELETED_ELSEWHERE`. Khoá `(at, rev, dev)` của bản này không trùng bản `edit` nào của chính bên đó, vì `rev` của bản `edit` luôn nhỏ hơn `rev` hiện tại. Hai thiết bị gộp cùng ba bản sẽ sinh ra cùng một bản lịch sử, nên lần gộp sau bỏ được bản trùng (AC25).
- **Cắt lịch sử (FR11).** Gộp `base.history`, `l.history`, `r.history` theo khoá rồi bỏ trùng. Trùng khoá mà khác nội dung thì giữ bản có `canon` lớn hơn. Sắp như trên, rồi giữ mọi bản `conflict` sinh trong lần gộp này (tối đa 2). Phần còn lại lấp bằng các bản mới nhất cho đủ `HISTORY_MAX`.
- **`conflict.at` (FR10, Concern 9).** `max` của: `at` ở đồng hồ cả hai bên của mọi giá trị xung đột trong lần gộp này (với `purgedAt` thì lấy chính `purgedAt` của bên purge), và `x.conflict.at` của mỗi bên `x` có ít nhất một đánh dấu còn trong kết quả. Kết quả gộp của item tombstone luôn có `conflict = null`.
- **"Sửa nội dung" (FR13–FR14).** Một bên được tính là sửa nội dung khi có thuộc tính khác `base` trong `type`, `title`, `notes`, `expires`, `favorite`, `forkedFrom`, `fieldOrder`, khi một field (phần giá trị: `label`, `kind`, `v`, `file`, `deletedAt`) khác `base` hoặc là field mới, hoặc khi `tags`/`scopes` khác `base` **về tập hợp**. Đổi `conflict` không tính là sửa nội dung.
- **Trạng thái xoá của item.** Xét theo thứ tự sau.
  1. Có bên đã purge: áp FR14 trước tiên.
  2. Không bên nào purge: `deletedAt` qua `merge3` không cần đồng hồ.
     - Chỉ một bên đổi `deletedAt`: bên đó thắng. Ngoại lệ: bên đổi là bên chuyển vào thùng rác, mà bên kia sửa nội dung. Khi đó item sống, `conflict.attrs` có `deletedAt`, và bản lịch sử của bên xoá có `note`.
     - Cả hai cùng đặt `deletedAt` khác `null`: giữ giá trị nhỏ hơn cùng `clock.deletedAt` của nó.
     - Cả hai cùng đổi, một bên ra `null`: chỉ xảy ra khi một bên khôi phục, còn bên kia khôi phục rồi xoá lại. Phân xử theo `later` trên `clock.deletedAt`, đánh dấu `deletedAt`, rồi áp lại ngoại lệ "bên sửa nội dung thắng".
  3. Hai tombstone gộp với nhau: dùng bộ gộp thuộc tính, không sinh lịch sử hay đánh dấu; `deletedAt` và `purgedAt` lấy giá trị nhỏ hơn.
- **Project/env (FR16–FR17).** `name`/`order`/`color` qua `merge3` với `clock`, không có lịch sử hay đánh dấu. `deletedAt` qua `merge3` không cần đồng hồ: cả hai cùng đổi thì lấy `min`. `projectId` không có đồng hồ: chỉ khác nhau khi hai bên cùng tạo một id, và khi đó lấy theo bên có `updatedAt` muộn hơn (FR15).
- **Đầu vào (FR02).** Kiểm cả ba bản bằng `validateVault`, cùng `v` và cùng `vaultId`. Sai thì ném `KeymeshError('invalid', 'local' | 'remote' | 'base' | 'vaultId' | 'v')`: chi tiết lỗi chỉ là tên do lõi chọn, không có giá trị nào của vault. `base` là `null`/`undefined` thì coi là vault rỗng cùng `vaultId`, dựng thành object ngay trong `merge.js` (FR21). Kết quả chỉ có năm khoá `v`, `vaultId`, `projects`, `envs`, `items`. Khoá lạ ở cấp vault không được giữ, và điều này được ghi ở 09.

## 2. Files

| Path | Change | Why |
|---|---|---|
| `src/public/js/core/merge.js` | Mới. `merge(base, local, remote)`, `DELETED_ELSEWHERE`; nội bộ: `canon`, `eq`, `later`, `merge3`, `mergeSet`, `mergeOrder`, `mergeHistory`, `mergeConflict`, `mergeDeletion`, `mergeItem`, `mergeProject`, `mergeEnv` | FR01–FR19, FR21, NFR01, NFR04 |
| `test/merge.test.js` | Mới. Test ví dụ, mỗi test có tên bắt đầu bằng id AC/FR: AC01–AC25, AC28 (phần tĩnh), một test riêng cho mỗi dòng bảng "Xoá, thùng rác và sửa" ở 05 (gắn nhãn `05-del-row-1..7`); kiểm tĩnh nguồn `merge.js` không có `Date`, `Math.random`, `crypto`, `randomBytes`, `newId`, `console` và chỉ import `./errors.js`, `./model.js`; chạy `merge` dưới `withGlobal` thay `Date`/`crypto`/`Math` bằng bản ném lỗi | AC01–AC25, AC29, FR01, NFR01 |
| `test/merge-props.test.js` | Mới. Property test trên ≥ 500 bộ sinh từ seed; in seed của bộ fail | AC26, NFR02, NFR04, NFR06 |
| `testkit/merge-gen.js` | Mới. PRNG có seed (mulberry32), sinh `b` rồi `l`/`r` bằng thao tác của `model.js` với id tất định (thay `crypto.getRandomValues` bằng bản có seed trong lúc sinh, qua `withGlobal`), đồng hồ có thể hoà, có thể cùng `dev`; các vị từ kiểm tính chất (không mất id, nội dung thua tìm lại được); `bigMergeCase()` dựng vault ~1 MB cho NFR03 | AC26, AC27 |
| `test/perf.test.js` | Thêm một test: gộp vault ~1 MB (500 item × 8 field × 20 lịch sử, 10% sửa hai bên, nửa số đó đụng nhau), trung vị 5 lần ≤ 200 ms trên Node; trình duyệt chỉ in số | AC27, NFR03 |
| `test/leak.test.js` | Thêm một test: gọi `merge` với đầu vào sai mang chuỗi đánh dấu (title, `v`, notes), chặn `console.*`; quét `message`, `JSON.stringify(err)` và output console | AC22, NFR05 |
| `test/model.test.js` | Thêm `'merge.js'` vào `CORE_FILES` (FR22 của KM-001) và thêm `merge.js` vào test FR23 "09 nêu tên mọi export" | Giữ các kiểm tĩnh cũ phủ cả module mới; AC28 |
| `docs/09-core-api.md` | Thêm § `merge.js` (đầu vào/ra, lỗi, tính thuần, mọi quyết định ở §1 Approach, `DELETED_ELSEWHERE`); sửa bảng "Epic nào dùng thao tác nào" (thêm hàng KM-006/KM-009 dùng `merge`); thay ghi chú KM-002 ở "Lưu ý cho epic sau" bằng chỉ dẫn tới § mới | FR20, NFR07, AC28 |
| `docs/05-sync.md` | Sửa § "Thuật toán gộp ba chiều theo field": "toàn bộ item của bên thua" → mỗi bên thua ít nhất một giá trị (Concern 6); thêm quy tắc xoá project/env, cùng tạo id, gộp đánh dấu / "Đã xử lý", ưu tiên bản thua khi cắt lịch sử, đồng hồ hoà hoàn toàn, định nghĩa "sửa nội dung", khôi phục thắng xoá trắng, amendment FR12 cho `rev`/`updatedAt`, `note: "deleted-elsewhere"` | FR20, AC28 |
| `docs/03-data-model.md` | §1 Schema: bản lịch sử có thể có `note` (hiện chỉ `"deleted-elsewhere"`); quy tắc tính `conflict.at` | FR19, Concern 8–9 |
| `docs/02-architecture.md` | Dòng 38: `merge(base, local, remote) → vault` (đánh dấu nằm ở `item.conflict`) thay cho `→ {result, conflicts}` | Tài liệu khớp hợp đồng FR01 |

**Không đụng:** `src/public/js/core/model.js`, `crypto.js`, `bytes.js`, `errors.js` (không cần mã lỗi mới, `invalid` đã có), `testkit/vectors.js`, `testkit/browser/*` (runner tự quét `test/*.test.js`, shim đã có đủ `deepEqual`/`throws`/`match`), `package.json` (script `test` đã quét `test/**/*.test.js`), `envvault.html`, `design/`.

## 3. Order

Làm trên nhánh `feat/KM-002-merge`, mỗi bước là một commit.

1. **Khung `merge.js`, so sánh và project/env.** Viết `canon`/`eq`/`later`/`merge3`/`mergeOrder`, kiểm đầu vào (FR02), `base` vắng (FR21), vòng lặp bước 1 cho cả ba bảng, `mergeProject`/`mergeEnv` (FR16–FR17), siêu dữ liệu theo amendment FR12. Item ở bước này chỉ có các nhánh của bước 1 (giống nhau, hoặc chỉ một bên có); item khác nhau ở cả hai bên tạm ném `KeymeshError('unsupported', 'item')`. Đồng thời viết phần đầu `test/merge.test.js`: AC15–AC17, AC22–AC24, FR01 (bất biến đầu vào, không chung tham chiếu), kiểm tĩnh nguồn, kiểm không đọc giờ hay nguồn ngẫu nhiên. *Sau bước này:* gộp đúng vault chỉ có project/env; lỗi đầu vào bị chặn; `npm test` xanh.
2. **Item: thuộc tính, field, tập hợp.** `mergeItem` với thuộc tính đơn (FR06), field theo id (FR07), `mergeSet` cho `tags`/`scopes` (FR08), phát hiện xung đột thật và phân xử (FR04–FR05), cùng tạo id (FR15). Bỏ nhánh `unsupported` tạm. Test AC01, AC03, AC04, AC13 (cả hai chiều đồng hồ), AC14, AC18, AC21. *Sau bước này:* kịch bản 2 và kịch bản 3 ý 2–3 pass ở mức model.
3. **Item: lịch sử và đánh dấu.** `mergeHistory` (FR11: bỏ trùng, sắp, ưu tiên bản thua vừa sinh), bản lịch sử `conflict` (FR09), `mergeConflict` (FR10, `conflict.at`). Test AC02, AC19, AC20, AC25. *Sau bước này:* kịch bản 3 ý 1 pass; hai thiết bị gộp cùng ba bản ra kết quả giống hệt nhau.
4. **Item: thùng rác và xoá trắng.** `mergeDeletion` theo §1 (FR13, FR14, FR19, `DELETED_ELSEWHERE`), gộp tombstone. Test AC05–AC12 và 7 test `05-del-row-1..7` (dòng 7 dùng lại kịch bản AC13). *Sau bước này:* mọi dòng bảng xoá ở 05 có test riêng và pass; mọi FR01–FR21 có ít nhất một test mang id.
5. **Bộ sinh và property test.** Viết `testkit/merge-gen.js` và `test/merge-props.test.js` gồm 500 bộ, kiểm mọi tính chất AC26 trên từng bộ. Lỗi do property test lộ ra được sửa trong `merge.js` kèm một test ví dụ mới trong `merge.test.js` (không chỉ dựa vào seed). *Sau bước này:* AC26 pass trên Node; khi một bộ fail, thông báo có seed.
6. **Hiệu năng và rò rỉ.** Thêm test vào `test/perf.test.js` (AC27) và `test/leak.test.js` (AC22/NFR05). Nếu vượt 200 ms thì tối ưu `canon` (nhớ đệm `canon` theo object trong một lần gộp) trước khi nghĩ cách khác. *Sau bước này:* AC27 có số đo thật; không rò rỉ.
7. **Tài liệu và kiểm cuối.** Viết `docs/09` § `merge.js`, sửa `docs/05`, `docs/03` §1, `docs/02` dòng 38; mở rộng test FR22/FR23 trong `test/model.test.js`. Chạy `npm test` (đo tổng thời gian) và `npm run test:browser`. *Sau bước này:* AC28, AC29 sẵn sàng cho verifier; cả hai môi trường xanh.

**Batches** — consecutive steps one fresh session can finish, tests passing.

**Batch 1** — steps 1–2: `merge.js` gộp đúng project/env và nội dung item (thuộc tính, field, tập hợp); lỗi đầu vào bị chặn; test AC01, AC03, AC04, AC13–AC18, AC21–AC24 pass.
**Batch 2** — steps 3–4: lịch sử, đánh dấu xung đột, thùng rác, xoá trắng; mọi AC01–AC25 và 7 dòng bảng xoá pass; mọi FR có test.
**Batch 3** — steps 5–6: bộ sinh có seed, property test 500 bộ, hiệu năng 1 MB và rò rỉ đều pass trên Node.
**Batch 4** — step 7: tài liệu 09/05/03/02 khớp mã; `npm test` ≤ 60 s và `npm run test:browser` xanh.

## 4. Risks

| Risk | Likelihood | What we do about it |
|---|---|---|
| **Bên gọi hiện có bị ảnh hưởng.** Codegraph: `validateVault` có 4 bên gọi, `HISTORY_MAX`/`VAULT_VERSION` chỉ dùng trong `model.js` và test; `merge.js` chỉ đọc chúng, không sửa `model.js` | Thấp | Không đổi mã đang có. Chạy cả bộ `npm test` cũ ở mỗi bước. Thay đổi duy nhất trong test cũ là thêm `merge.js` vào hai danh sách ở `test/model.test.js` |
| **Mất tính đối xứng vì thứ tự** (mảng, thứ tự khoá trong object, `history`) làm AC26 fail ngẫu nhiên | Cao | So bằng bằng `canon` (khoá đã sắp); thứ tự mảng theo quy tắc ở §1; `history` sắp hoàn toàn. Property test chạy cả `(b,l,r)` và `(b,r,l)` rồi `deepEqual` cả vault |
| **Tinh chỉnh FR05** (đồng hồ của giá trị hai bên cùng giữ) khác chữ của spec khi đồng hồ lệch hay hoà | Trung bình | Ghi rõ ở 09 và 05. Khi đồng hồ đi tới thì cho cùng kết quả với spec. Reviewer xem lại; nếu bị bác thì AC26 `merge(b,b,r)=r` cần được nới cho trường hợp lệch giờ |
| **Amendment FR12** đổi câu chữ spec | Đã chốt | Originator chọn "lấy metadata bên trùng" (2026-11-01). Ghi vào 05/09 trong bước 7; test riêng cho lưu chỉ đổi `tags`, `deleteProject` chạm env, purge item đã ở trong thùng rác |
| **Vị từ "mọi nội dung thua tìm lại được"** ở AC26 mơ hồ với tập hợp và field, và bị `HISTORY_MAX` cắt | Trung bình | Kiểm theo từng phần tử: mỗi giá trị thuộc tính đơn, mỗi field (theo id và giá trị), mỗi phần tử `scopes` của `l`/`r` không còn trong kết quả phải có trong một bản `history`. Bộ sinh giới hạn ≤ 5 lần lưu mỗi bên để lịch sử chưa chạm trần; việc cắt được AC20 kiểm riêng. Ghi cách hiểu này vào đầu `merge-props.test.js` và vào implement.md |
| **Id tất định trong trình duyệt**: thay `globalThis.crypto` bằng `withGlobal` có thể không làm được trên Chromium | Thấp | KM-001 đã làm `withGlobal('crypto', undefined)` trên cả hai môi trường. Nếu không được thì bộ sinh tự đổi id sau khi sinh (ánh xạ id → id có seed), không động vào lõi |
| **Hiệu năng**: `canon` cả thực thể ba lần với vault 1 MB | Trung bình | Đo ở bước 6. Phương án dự phòng: nhớ đệm `canon` trong `Map` theo object trong phạm vi một lần gộp, và so `rev`+`updatedAt` trước khi so sâu |
| **Hard to reverse.** Dấu `note: 'deleted-elsewhere'` và quy tắc khoá lịch sử thành định dạng dữ liệu khi có dữ liệu thật | Trung bình | Đóng băng trong 03/09 ở bước 7. `validateVault` đã chấp nhận bản lịch sử có khoá thêm, nên không cần migrate. Ngoài hai điểm này, phép gộp không đổi hình dạng dữ liệu |
| **Ít chắc chắn nhất:** cạnh tranh `deletedAt` khi cả hai cùng đổi và một bên ra `null` (khôi phục với khôi phục rồi xoá lại); spec không có dòng cho trường hợp này | Thấp (hiếm) | Quy tắc ở §1 (`later` + đánh dấu `deletedAt` + "bên sửa nội dung thắng"); có test ví dụ riêng; bộ sinh có thao tác xoá lại sau khi khôi phục; ghi ở 05 |

## 5. Proofs

| Criterion | Proof | How it is run |
|---|---|---|
| `KM-002-AC01` | `test/merge.test.js` › "AC01 FR04 FR06 FR07 sửa một bên": `remote` dựng bằng `updateItem`; kiểm `v`, `conflict === null`, `history` có `P0` | `npm test` |
| `KM-002-AC02` | "AC02 FR05 FR09 FR10 cùng sửa Password": kiểm 1 item, giá trị `remote`, `conflict.fields = [id]`, `attrs = []`, đúng 1 bản `reason: 'conflict'` chứa Password của `local` | `npm test` |
| `KM-002-AC03` | "AC03 sửa hai chỗ khác nhau": có cả hai thay đổi, `conflict === null`, không có bản `conflict` | `npm test` |
| `KM-002-AC04` | "AC04 FR08 scopes/tags": 4 env đúng một lần; bỏ `staging` một bên thì mất; cùng thêm tag thì có một lần | `npm test` |
| `KM-002-AC05` | "AC05 FR13 khôi phục" (đồng thời `05-del-row-4`): `fields`/`history` `deepEqual` với item trước khi xoá | `npm test` |
| `KM-002-AC06` | `05-del-row-1` / AC06 | `npm test` |
| `KM-002-AC07` | `05-del-row-2` / AC07: lặp với `title`, `favorite`, `tags`; kiểm `note === DELETED_ELSEWHERE` | `npm test` |
| `KM-002-AC08` | `05-del-row-3` / AC08: gộp theo cả hai thứ tự | `npm test` |
| `KM-002-AC09` | Cùng test với AC05 (`05-del-row-4`) | `npm test` |
| `KM-002-AC10` | `05-del-row-5` / AC10: so với hình dạng tombstone ở 09 § "Purge" | `npm test` |
| `KM-002-AC11` | `05-del-row-6` / AC11 | `npm test` |
| `KM-002-AC12` | "AC12 FR14 purge với restore" | `npm test` |
| `KM-002-AC13` | `05-del-row-7` / AC13: hai chiều đồng hồ | `npm test` |
| `KM-002-AC14` | "AC14 FR07 mỗi bên thêm field" | `npm test` |
| `KM-002-AC15` | "AC15 FR16 env name/color": không có bản lịch sử hay đánh dấu nào mới | `npm test` |
| `KM-002-AC16` | "AC16 FR17 FR18 xoá env/project giữ tham chiếu": kiểm cả `validateVault(result).ok` | `npm test` |
| `KM-002-AC17` | "AC17 FR17 cùng xoá project, đổi tên + xoá" | `npm test` |
| `KM-002-AC18` | "AC18 FR15 cùng tạo id": dựng hai item cùng id bằng cách chép id | `npm test` |
| `KM-002-AC19` | "AC19 FR10 Đã xử lý": hai trường hợp | `npm test` |
| `KM-002-AC20` | "AC20 FR11 lịch sử đầy": `history.length === 20`, có bản thua | `npm test` |
| `KM-002-AC21` | "AC21 FR05 đồng hồ hoà hoàn toàn": `deepEqual(merge(b,l,r), merge(b,r,l))` | `npm test`, `npm run test:browser` |
| `KM-002-AC22` | "AC22 FR02" trong `merge.test.js` (`type` lạ, `vaultId` lệch, `v` lệch, `base` hỏng; đầu vào giữ nguyên) và test mới trong `test/leak.test.js` (chuỗi đánh dấu không có trong `message`/`JSON.stringify(err)`/console) | `npm test` |
| `KM-002-AC23` | "AC23 FR01": `structuredClone` ba đầu vào trước khi gộp rồi `deepEqual` sau đó; sửa kết quả không làm đổi đầu vào; chạy `merge` khi `Date`, `crypto`, `Math.random` đã bị thay bằng bản ném lỗi; kiểm tĩnh nguồn | `npm test`, `npm run test:browser` |
| `KM-002-AC24` | "AC24 FR21 không có base" | `npm test` |
| `KM-002-AC25` | "AC25 merge(b, m1, m2) = m1": đếm bản `conflict` theo khoá, không trùng | `npm test` |
| `KM-002-AC26` | `test/merge-props.test.js`: ≥ 500 bộ từ seed, mỗi bộ kiểm 7 tính chất (idempotent, `merge(b,b,r)=r`/`merge(b,l,b)=l`, đối xứng, không mất id thực thể/field, nội dung thua tìm lại được, chỉ xoá khi bên kia không sửa nội dung, `validateVault` ok); in seed khi fail; `MERGE_SEED=<n>` (Node) để chạy lại | `npm test` (Node) **và** `npm run test:browser` (Chromium) |
| `KM-002-AC27` | `test/perf.test.js` › "AC27 NFR03 gộp 1 MB ≤ 200 ms": `t.diagnostic` in trung vị và 5 số đo | `npm test`; dán số đo vào implement.md |
| `KM-002-AC28` | Kiểm tay: đọc lại 09 § `merge.js`, 05, 03 §1 theo danh sách quy tắc ở AC28. Kiểm tự động: test FR23 mở rộng (09 nêu `merge` và `DELETED_ELSEWHERE`), và `merge.test.js` kiểm 05 không còn cụm "Toàn bộ item của **bên thua**" | `npm test` + verifier đọc |
| `KM-002-AC29` | Mỗi FR01–FR21 xuất hiện trong tên ít nhất một test; mỗi nhãn `05-del-row-1..7` có test. Kiểm bằng `rg -o 'FR\d\d' test/merge*.test.js \| sort -u` và `rg -c '05-del-row' test/merge.test.js`; đo thời gian bằng `time npm test` (≤ 60 s) | Shell; kết quả dán vào implement.md |

## 6. Feedback loop

- Vòng chính: `node --test test/merge.test.js` sau mỗi thay đổi nhỏ ở `merge.js` (dưới 1 s), rồi `npm test` cả bộ trước mỗi commit.
- Property test: `node --test test/merge-props.test.js`. Khi một bộ fail, chạy lại đúng bộ đó bằng `MERGE_SEED=<seed in ra> node --test test/merge-props.test.js`, rồi chuyển nó thành test ví dụ trong `merge.test.js` trước khi sửa.
- Trình duyệt: `npm run test:browser` (Chromium headless qua `testkit/browser/run.mjs`) ở cuối batch 1, batch 3 và bước 7.
- Hiệu năng: đọc dòng `# AC27 …` mà `t.diagnostic` in ra trong output của `npm test`.
- Không cần dựng thêm vòng phản hồi nào: runner Node và runner trình duyệt của KM-001 tự quét file test mới.

## 7. Deliberately not doing

- Không sửa `model.js`. Không thêm `clock.deletedAt` cho project/env (spec §7). Không thêm `validateVault` cho env sống dưới project đã xoá (Concern 10, hoãn tới KM-003).
- Không gộp `meta` của vault, không làm sync, lưu `base` hay UI badge (KM-003/004/006/009).
- Không gọi `validateVault` trên kết quả *bên trong* `merge`, vì sẽ tốn thời gian ở mỗi lần gộp. Tính hợp lệ của kết quả được chứng minh bằng test (FR18, AC16, AC26).
- Không giữ khoá lạ ở cấp vault hay trong thực thể khi phải dựng lại thực thể; chỉ giữ khi thực thể được lấy nguyên một bên ở bước 1. Ghi ở 09.
- Không đặt ngưỡng hiệu năng cho trình duyệt hay điện thoại (Concern 12); trình duyệt chỉ in số đo.
- Không sửa các chỗ cũ của 02/03 không liên quan đến merge (ví dụ Playwright ở `docs/02` dòng 96).

## Amendments

Ghi trong lúc implement (2026-11-01). Chi tiết và lý do ở `implement.md` §5.

1. **`fieldOrder` không sinh xung đột.** Mỗi lần thêm hay xoá field, `updateItem` đều đổi `fieldOrder`. Vì vậy AC14 (mỗi bên thêm một field) sẽ luôn là "cùng đổi" và bị đánh dấu nếu gộp `fieldOrder` như thuộc tính đơn của FR06. Cách làm: chỉ một bên đổi thì lấy bên đó; cả hai cùng đổi thì giữ tập id ba chiều theo thứ tự của bên có `clock.fieldOrder` thắng. Sau đó khớp với `fields` đã gộp. Ghi ở 05 và 09.
2. **`history` gộp từ `local` và `remote`, không thêm `base.history`.** Bản nào của `base` mà cả hai bên đã cắt đi thì không nên quay lại.
3. **Vault đo AC27.** 500 item × 8 field × 20 bản lịch sử là khoảng 13 MB, không phải 1 MB, vì mỗi bản lịch sử chép đủ 8 field. Ngưỡng 200 ms được chấm trên vault ~1 MB (500 × 8, không có lịch sử cũ). Hình dạng 20 bản lịch sử chỉ được đo và in ra.
4. **Tombstone khi bên kia không purge.** Chỉ lấy `deletedAt` của bên không purge khi chính bên đó đã đổi `deletedAt` so với `base`. Lỗi này do property test tìm ra (seed 24587).
