# Implementation Summary — Gộp ba chiều theo field (merge.js)

**Epic ID:** `KM-002`
**Author:** Engineer
**Status:** Draft
**Created:** `2026-11-01`
**Traces to:** `plan.md`

---

## 1. Branch and PR

| | |
|---|---|
| Branch | `feat/KM-002-merge` (đã push lên `origin`) |
| PR | **Chưa mở.** Máy này không có `gh` (`command not found: gh`), và phiên này không có công cụ GitHub nào khác. Mở tay tại `https://github.com/delete101020/keymesh/compare/master...feat/KM-002-merge`; nội dung PR soạn sẵn ở cuối mục này |

Nội dung PR soạn sẵn: tiêu đề `KM-002: gộp ba chiều theo field (merge.js)`. Thân PR liệt kê các file mới và đổi ở §3, kết quả kiểm ở §4, và trỏ tới §5 và §7 của tài liệu này.

## 2. Progress

> *One row per batch. A session in a batched run reads this first; rows marked
> done are not redone.*

Bước implement không chạy theo batch, nên cả 7 bước của plan làm trong một phiên.

| Batch | Plan steps | Commits | Tests run | State |
|---|---|---|---|---|
| 1 | 1–7 (toàn bộ plan) | `5e52651` (artifact), `0a5af32` (bước 1), `71bc67f` (bước 2), `f366344` (bước 3), `b6c65d7` (bước 4), `8088110` + `e4b162c` (bước 5), `989a1db` (bước 6), `08cb31e` (bước 7), `3b60103` (amendment plan) | `node --test test/merge.test.js` sau mỗi thay đổi; `npm test` trước mỗi commit; `node --test test/merge-props.test.js` với 3 000 và 20 000 bộ; `npm run test:browser` sau bước 6 và bước 7 | done |

## 3. What was built

> *Per plan step: what changed, in which files.*

| Plan step | Change | Files |
|---|---|---|
| 1 | Viết `canon`/`eq`/`beats` (thứ tự toàn phần), `merge3`, `mergeOrder`, phần siêu dữ liệu theo amendment FR12 (`setMeta`), và `mergeProject`/`mergeEnv` (FR16–FR17, `projectId` khi cùng tạo id). Kiểm đầu vào (FR02); `base` vắng thì dựng vault rỗng (FR21); vòng lặp bước 1 cho ba bảng. Test AC15, AC17, AC22, AC23, AC24, FR03, FR15 (env), FR01 (bẫy `Date`/`performance`/`crypto`/`Math.random` và kiểm tĩnh nguồn) | `src/public/js/core/merge.js`, `test/merge.test.js` |
| 2 | `mergeContent`: thuộc tính đơn (FR06), `mergeFields` theo id (FR07), `mergeSet` cho `tags`/`scopes` (FR08), `mergeFieldOrder` (xem §5.1), `editedContent`, và cùng tạo id (FR15). Test AC01, AC03, AC04, AC13, AC14, AC16, AC18, AC21 | như trên |
| 3 | `conflictEntry` (FR09: khoá lấy từ `rev` và đồng hồ muộn nhất của bên thua), `mergeHistory` (FR11: bỏ trùng theo khoá, sắp toàn phần, giữ bản vừa sinh), `mergeConflict` (FR10: gộp ba chiều, công thức `conflict.at`), hằng `DELETED_ELSEWHERE`. Test AC02, AC19, AC20, AC25, FR09 hai bên cùng thua, và bổ sung kiểm lịch sử cho AC13/AC18 | như trên |
| 4 | `mergeDeletedAt` (FR13, gồm cả khôi phục với khôi phục-rồi-xoá-lại), `mergeLive`, `mergePurge` (FR14, sửa hoặc khôi phục đều thắng purge), `mergeTombstones`. Test `05-del-row-1..7`, AC12, cả hai cùng purge, purge với trash, FR12 (lưu chỉ đổi `tags`, `deleteProject` chạm env, purge item đã trong thùng rác) | như trên |
| 5 | Bộ sinh có seed: mulberry32, id tất định bằng cách thay `crypto.getRandomValues` trong lúc sinh, 21 loại thao tác của model, đồng hồ hay hoà, 15% bộ có cùng `deviceId`, 35% `base` là kết quả của một lần gộp trước (nên có đánh dấu và bản `conflict`). Property test 500 bộ kiểm 8 tính chất, in seed khi fail, và in dấu vân tay FNV-1a của mọi kết quả. Lỗi tombstone do property test tìm ra được sửa, kèm một test ví dụ | `testkit/merge-gen.js`, `test/merge-props.test.js`, `src/public/js/core/merge.js`, `test/merge.test.js` |
| 6 | Đo gộp 1 MB (AC27), và đo thêm hình dạng 20 bản lịch sử nhưng chỉ in số (§5.3). Kiểm rò rỉ: 6 đầu vào sai mang chuỗi đánh dấu, chặn `console.*` | `test/perf.test.js`, `test/leak.test.js`, `testkit/merge-gen.js` |
| 7 | `docs/09` có § `merge.js`; thêm hàng KM-006/KM-009 vào bảng "Epic nào dùng thao tác nào"; sửa "Lưu ý cho epic sau" và dòng `invalid`. `docs/05` có quy tắc mới: tham chiếu 09, đồng hồ hoà, `fieldOrder`, `history`/`conflict`, `rev`/`updatedAt`, mỗi bên thua, cùng tạo id, "sửa nội dung", hai dòng mới ở bảng xoá, § "Xoá project và env". `docs/03` §1 có `note`, `conflict.at`, bản `conflict`. `docs/02` dòng 38 sửa thành `→ vault`. `test/model.test.js`: `merge.js` vào `CORE_FILES` (FR22) và vào test FR23. Thêm test FR20/AC28 đọc 05/09/03 | `docs/09-core-api.md`, `docs/05-sync.md`, `docs/03-data-model.md`, `docs/02-architecture.md`, `test/model.test.js`, `test/merge.test.js` |

## 4. Proofs executed

> *The real command and its real output, per acceptance criterion. Never a claim
> without output.*

Bộ đầy đủ, chạy trên HEAD `3b60103` (Node v24.22.1):

```
$ npm test
ℹ tests 119
ℹ pass 119
ℹ fail 0
ℹ duration_ms 5516.115083
```

Trình duyệt:

```
$ npm run test:browser
     # AC26 500 cases: 92 items with a conflict mark, 237 in the trash or purged, fingerprint bdd2e5d0
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.0.0 Safari/537.36
tests 119  pass 119  fail 0  (7720 ms)
```

Từng test của KM-002, lấy từ `node --test test/merge.test.js test/merge-props.test.js` (đã bỏ phần thời gian). Mọi dòng ở đây cũng `ok` trong `npm run test:browser`.

### `KM-002-AC01`
```
✔ AC01 FR04 FR06 FR07 one side changes Password: the change is taken and history still has P0
```
### `KM-002-AC02`
```
✔ AC02 FR05 FR07 FR09 FR10 both change Password: remote (later) wins, one mark, local in history
✔ FR09 each side that loses a value goes to history (local wins notes, remote wins Password)
```
### `KM-002-AC03`
```
✔ AC03 FR04 FR06 FR07 Password on one side, notes on the other: both kept, no conflict
```
### `KM-002-AC04`
```
✔ AC04 FR08 scopes and tags merge as sets
```
### `KM-002-AC05`
```
✔ 05-del-row-4 AC05 AC09 FR13 one side restores, the other leaves it in the trash: it comes back whole
```
### `KM-002-AC06`
```
✔ 05-del-row-1 AC06 FR13 one side trashes, the other edits nothing: the item goes to the trash
```
### `KM-002-AC07`
```
✔ 05-del-row-2 AC07 FR13 FR19 one side trashes, the other edits title, favorite or tags: the edit wins
```
### `KM-002-AC08`
```
✔ 05-del-row-3 AC08 FR13 both trash at different times: the earlier deletedAt and its clock
```
### `KM-002-AC09`
```
✔ 05-del-row-4 AC05 AC09 FR13 one side restores, the other leaves it in the trash: it comes back whole
```
### `KM-002-AC10`
```
✔ 05-del-row-5 AC10 FR14 one side purges, the other changes nothing: the purge tombstone
```
### `KM-002-AC11`
```
✔ 05-del-row-6 AC11 FR14 one side purges, the other edits Password: the edit brings it back
```
### `KM-002-AC12`
```
✔ AC12 FR14 purge on one side, restore on the other: the restore wins and is marked
✔ FR14 both purge: one tombstone with the earlier deletedAt and purgedAt
✔ FR14 purge on one side, trash on the other (no edit): tombstone with the earlier deletedAt
✔ FR14 seed 24587: restore-then-purge on one side, other side untouched: the purge side as is
```
### `KM-002-AC13`
```
✔ AC13 FR07 one side deletes a field, the other edits it later: the edit wins and is marked
✔ AC13 FR07 the deletion is later: the field stays deleted and is marked
✔ 05-del-row-7 AC13 FR07 FR09 field deleted on one side, edited on the other: the later clock wins
```
### `KM-002-AC14`
```
✔ AC14 FR07 each side adds a different field: both fields are kept, no conflict
```
### `KM-002-AC15`
```
✔ AC15 FR16 both rename one env: the later name wins with no history or conflict mark
✔ AC15 FR16 one side renames an env, the other recolours it: both changes are kept
```
### `KM-002-AC16`
```
✔ AC16 FR17 FR18 deleting an env or project keeps every reference and adds no mark
```
### `KM-002-AC17`
```
✔ AC17 FR17 both delete one project at different times: the earlier deletedAt is kept
✔ AC17 FR17 one side renames a project, the other deletes it: the result is deleted and renamed
✔ FR03 FR17 projects and envs created on either side are all kept, in a symmetric order
```
### `KM-002-AC18`
```
✔ AC18 FR15 both sides created one id: same values are not conflicts, Password is, tags are united
✔ FR15 an env created on both sides under one id: projectId follows the later updatedAt
```
### `KM-002-AC19`
```
✔ AC19 FR10 "Đã xử lý" on one side clears the old mark; a new conflict still marks
```
### `KM-002-AC20`
```
✔ AC20 FR11 a full remote history does not push out the entry this merge writes
```
### `KM-002-AC21`
```
✔ AC21 FR05 fully tied clocks (same at, same dev): the value decides, the same way in both orders
```
### `KM-002-AC22`
```
✔ AC22 FR02 invalid input throws invalid, returns nothing and leaves all three inputs untouched
✔ AC22 KM-002 NFR05 merge errors and console carry no vault value          (test/leak.test.js)
```
### `KM-002-AC23`
```
✔ AC23 FR01 merge never modifies its inputs and the result shares no object with them
✔ FR01 NFR01 merge reads no clock and no randomness: Date, performance, crypto and Math.random are trapped
✔ FR01 NFR01 merge.js imports only errors.js and model.js and names no clock, randomness or console
```
### `KM-002-AC24`
```
✔ AC24 FR21 without a base every entity of both sides is kept
```
### `KM-002-AC25`
```
✔ AC25 FR09 FR11 NFR04 merging two devices' results of the same merge changes nothing
```
### `KM-002-AC26`
```
$ node --test test/merge-props.test.js
✔ AC26 FR01 FR03 FR18 NFR04 NFR06 merge properties on 500 seeded cases from seed 24301
ℹ AC26 500 cases: 92 items with a conflict mark, 237 in the trash or purged, fingerprint bdd2e5d0
✔ AC26 NFR04 the same seed gives the same case and the same merge result

$ MERGE_CASES=3000 node --test test/merge-props.test.js
ℹ AC26 3000 cases: 512 items with a conflict mark, 1447 in the trash or purged
ℹ pass 2
ℹ fail 0

$ MERGE_SEED=1000000 MERGE_CASES=20000 node --test test/merge-props.test.js
ℹ AC26 20000 cases: 3493 items with a conflict mark, 10031 in the trash or purged
ℹ pass 2
ℹ fail 0
```
Hai lần chạy dài ở trên làm trước khi thêm dấu vân tay, nên dòng của chúng không có `fingerprint`. Trên Chromium (`npm run test:browser`), 500 bộ cho cùng dòng `92 … 237 … fingerprint bdd2e5d0`: kết quả gộp giống hệt nhau giữa Node và trình duyệt (NFR04).

Mỗi bộ kiểm 8 tính chất. Bảy tính chất đầu theo AC26: `merge(b,x,x)=x`; `merge(b,b,r)=r`; `merge(b,l,b)=l`; `merge(b,l,r)` bằng `merge(b,r,l)` **tuyệt đối, kể cả thứ tự `history`**; không mất id thực thể hay field; nội dung thua tìm lại được; chỉ xoá khi được phép; `validateVault` ok. Tính chất thứ tám là thêm: `merge(b,m,m)=m`. Cách hiểu "nội dung thua tìm lại được" ghi ở đầu `test/merge-props.test.js`: xét theo từng phần tử, bỏ qua nội dung bị purge có chủ ý và item có lịch sử đã đầy 20 bản. Lần chạy đầu fail đúng một bộ (`seed 24587: merge(b, b, r) = r`); lỗi này được sửa ở `8088110` (§5.4).

### `KM-002-AC27`
```
$ node --test test/perf.test.js
✔ AC27 KM-002 NFR03 merging a ~1 MB vault (500 items × 8 fields, 10% edited on both sides) ≤ 200 ms median
ℹ AC27 merge 500 × 8, no earlier history (1.00 MB): median 48.1 ms, runs 47, 48, 48, 49, 51 ms
✔ AC27 KM-002 NFR03 (measured only) the 500 × 8 × 20-history shape
ℹ AC27 merge 500 × 8 × 20 history (13.35 MB): median 488.9 ms, runs 486, 488, 489, 489, 494 ms
```
Trên Chromium: 1 MB có trung vị 28,6 ms; 13,35 MB có trung vị 268,9 ms. Xem §5.3 về hình dạng vault.

### `KM-002-AC28`
```
✔ FR20 FR19 AC28 docs 05/09/03 carry the merge rules and 05 no longer contradicts the spec
✔ FR23 KM-002 AC28 docs/09-core-api.md names every public export of crypto.js, model.js and merge.js
✔ FR22 core sources use no storage, network, DOM or console, and import only within core/   (giờ gồm merge.js)
```
Phần đọc tay để verifier làm: `docs/09-core-api.md` § `merge.js`, `docs/05-sync.md` § "Thuật toán gộp ba chiều theo field" và § "Xoá project và env", `docs/03-data-model.md` §1 (khối JSON item và đoạn ghi chú ngay sau nó).

### `KM-002-AC29`
```
$ rg -o "^test\(['\`][^'\`]*" test/merge.test.js test/merge-props.test.js | rg -o 'FR\d\d' | sort -u
FR01 FR02 FR03 FR04 FR05 FR06 FR07 FR08 FR09 FR10 FR11 FR12 FR13 FR14 FR15 FR16 FR17 FR18 FR19 FR20 FR21
$ rg -c "^test\('05-del-row" test/merge.test.js
7
$ npm test
ℹ tests 119   ℹ pass 119   ℹ fail 0   ℹ duration_ms 5516.115083
```
Cả bộ xong trong 5,5 s, dưới ngưỡng 60 s.

## 5. Deviations from the plan

> *Anything done differently, and why. If nothing, say so explicitly.*

Đã ghi thành mục Amendments ở cuối `plan.md` (commit `3b60103`).

1. **`fieldOrder` không sinh xung đột** (khác FR06, vốn xếp nó vào nhóm thuộc tính đơn qua FR04–FR05). Lý do: `updateItem` đổi `fieldOrder` mỗi khi thêm hay xoá field, nên AC14 (mỗi bên thêm một field, "không có xung đột") không thể pass nếu gộp như thuộc tính đơn. Cách làm: chỉ một bên đổi thì lấy bên đó; cả hai cùng đổi thì giữ tập id ba chiều theo thứ tự của bên có `clock.fieldOrder` thắng, rồi phần còn lại theo bên kia. Sau đó khớp với `fields` đã gộp: bỏ id của field đã xoá, nối field còn sống còn thiếu. Nhờ bước khớp này, field "sống lại" ở AC13 vẫn có trong `fieldOrder`. Đổi `fieldOrder` vẫn tính là "sửa nội dung". Đã ghi ở 05 và 09. **Originator/PO cần xác nhận.**
2. **`history` gộp từ `local.history ∪ remote.history`**, không thêm `base.history` như plan §1 viết. Bản của `base` mà cả hai bên đã cắt thì không nên quay lại; còn bản chưa bị cắt thì đã có ở ít nhất một bên.
3. **Hình dạng vault của AC27/NFR03.** Spec ghi "khoảng 1 MB (500 item, 8 field, 20 bản lịch sử)". Hai số này không khớp nhau: mỗi bản lịch sử chép cả 8 field, nên hình dạng đó đo được 13,35 MB. Test chấm ngưỡng 200 ms trên vault 1,00 MB (500 item × 8 field, không có lịch sử cũ; 50 item sửa ở cả hai bên, 25 trong số đó đụng nhau), vì 01-overview lấy "< 1 MB mỗi vault" làm tiền đề. Hình dạng 20 bản lịch sử được đo và in ra nhưng không chấm: 489 ms trên Node, 269 ms trên Chromium.
4. **Quy tắc tombstone khi chỉ một bên purge.** Plan §1 nói "lấy giá trị nhỏ hơn". Đã tinh chỉnh: chỉ lấy `deletedAt` của bên không purge khi chính bên đó đã đổi `deletedAt` so với `base`. Property test tìm ra trường hợp sai (seed 24587): bên purge đã khôi phục rồi xoá trắng, còn bên kia giữ nguyên `deletedAt` cũ của `base`. Nếu lấy `min` thì `merge(b, b, r) ≠ r`. Có test hồi quy riêng.
5. **Đối xứng mạnh hơn AC26 yêu cầu.** AC26 cho phép khác thứ tự `history`; mã cho kết quả bằng nhau tuyệt đối, kể cả thứ tự `history`.
6. **Thứ tự test nhỏ.** AC16 viết ở bước 2 thay vì bước 1, vì nó cần gộp item (bên kia gán item vào env). Dấu vân tay ở property test được thêm trong một commit riêng (`e4b162c`) sau bước 6.
7. **Không có `base` mà hai bên cùng có một item và một bên xoá:** mọi bên tính là đã sửa nội dung, nên item sống và có đánh dấu `deletedAt`. Plan không nói tới trường hợp này. Đã ghi ở 09.

Ngoài các điểm trên, mã đi đúng plan: các file ở §2, không sửa `model.js`/`crypto.js`/`bytes.js`/`errors.js`/`package.json`/`testkit/browser/*`.

## 6. Discovered work

> *Found but deliberately not done, and where it went — a plan amendment, a new
> intent, an issue.*

| Item | Where it went |
|---|---|
| NFR03 của spec mô tả một vault không thể có (≈ 13 MB chứ không phải 1 MB) | Amendment 3 trong `plan.md` và §5.3 ở đây. Originator nên sửa câu NFR03 khi duyệt |
| FR06 nên bỏ `fieldOrder` khỏi danh sách thuộc tính đơn | Amendment 1 trong `plan.md`; 05 và 09 đã ghi quy tắc mới. Câu của spec chưa sửa (spec đã duyệt, không phải việc của bước implement) |
| Cách hiển thị env sống dưới project đã xoá, hoặc item chỉ trỏ tới env đã xoá | Đã hoãn sẵn trong spec, Concern 10 (KM-003). 09 "Lưu ý cho epic sau" có nhắc |
| Gộp vault 13 MB mất 489 ms trên Node. Nếu sau này vault lớn thật thì có thể nhớ đệm `canon` trong một lần gộp | Không làm, vì ngưỡng 1 MB đạt với dư nhiều (48 ms). Ghi ở đây cho KM-006 nếu đo được chậm trên điện thoại (spec Concern 12) |

## 7. Known gaps

> *What a reviewer should look at hardest.*

- **Bỏ trùng `history` theo khoá `(at, rev, dev)` đúng chữ FR11** (trùng khoá thì giữ bản có `canon` lớn hơn). Có một trường hợp suy biến kép: hai bên mang cùng `deviceId`, cùng `rev`, cùng đồng hồ muộn nhất, và mỗi bên thua một giá trị khác nhau. Khi đó hai bản `conflict` mới trùng khoá, nên một bản bị bỏ. Muốn tránh thì phải bỏ trùng theo nội dung, tức là đổi FR11.
- **Bước khớp `fieldOrder`** (§5.1) bỏ id của field đã xoá và nối field còn sống còn thiếu. Bên gọi tự đặt `fieldOrder` "lệch" (thiếu một field còn sống) thì bước này sửa lại khi hai bên cùng đổi. Với vault do model sinh ra thì không bao giờ xảy ra, vì `fieldOrder` luôn đúng bằng các field còn sống.
- **`canon(undefined)` bằng `canon(null)`** ở vị trí phần tử mảng hay giá trị gốc (khoá có giá trị `undefined` thì bị bỏ). Dữ liệu vault là JSON nên không có `undefined`; chỉ cần để ý nếu ai đó truyền object chưa qua JSON.
- **Bộ sinh của property test** không sinh trường hợp hai bên cùng tạo một id (chỉ có test ví dụ AC18 và test env), và giới hạn ≤ 5 thao tác mỗi bên. Tính chất "nội dung thua tìm lại được" bỏ qua item có lịch sử đã đủ 20 bản.
- **`merge` không gọi `validateVault` trên kết quả** (plan §7). Tính hợp lệ được kiểm trên 500 bộ ở mỗi lần `npm test`, cộng 23 000 bộ chạy tay.
- **`latestClock` dùng cho khoá của bản `conflict`** xét cả `clock.deletedAt`, nên một bên vừa khôi phục có `at` bằng lúc khôi phục. Cách này tất định và đối xứng, nhưng reviewer nên xem có đúng ý "đồng hồ muộn nhất của bên đó" không.
- PR chưa mở (§1).

---

Status: done
