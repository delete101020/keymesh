# Verification Report — Gộp ba chiều theo field (merge.js)

**Epic ID:** `KM-002`
**Verifier:** Verifier (independent)
**Status:** Draft
**Created:** `2026-11-01`
**Verified against:** `spec.md`, `plan.md`

Phương pháp: lập checklist từ `spec.md` (29 AC, 21 FR, 7 NFR) và `plan.md` (§5 Proofs) trước, chạy lại toàn bộ trên nhánh `feat/KM-002-merge` (HEAD `d9b6150`, Node v24.22.1, Chromium HeadlessChrome/156), tự viết thêm probe riêng và mutation test, rồi mới đọc `implement.md` để đối chiếu. Không sửa file nào trong repo; probe và bản sao để làm mutation nằm ở scratchpad.

---

## 1. Verdict

Verdict: pass

29/29 tiêu chí pass, `npm test` và `npm run test:browser` đều xanh (119/119). Không có hàng fail hay untested. Có 2 finding mức trung bình và 3 mức thấp ở §6; không finding nào chặn, nhưng hai finding đầu cần người sở hữu spec xử lý (sửa chữ spec cho khớp mã).

## 2. Acceptance criteria

Ghi chú chung: các lệnh dưới đây chạy từ thư mục gốc repo. "Probe" là script tôi tự viết ở scratchpad, dựng dữ liệu bằng thao tác của `model.js` rồi gọi `merge` qua API công khai, không dùng lại fixture của repo.

| Id | Criterion | Verdict | Evidence |
|---|---|---|---|
| `KM-002-AC01` | Một bên đổi Password: lấy giá trị mới, `conflict = null`, history còn `P0` | pass | `node --test test/merge.test.js` → `✔ AC01 FR04 FR06 FR07 one side changes Password: the change is taken and history still has P0`. Cũng pass trong `npm run test:browser` |
| `KM-002-AC02` | Cùng đổi Password: 1 item, theo `remote` (muộn hơn), `conflict.fields=[f]`, `attrs=[]`, đúng 1 bản `conflict` chứa giá trị `local` | pass | `✔ AC02 FR05 FR07 FR09 FR10 both change Password: remote (later) wins, one mark, local in history`. Probe riêng: `PASS AC02 same field both sides` (gồm `deepEqual(merge(b,l,r), merge(b,r,l))` và `validateVault(m).ok`) |
| `KM-002-AC03` | Password ở một bên, `notes` ở bên kia: có cả hai, không xung đột | pass | `✔ AC03 FR04 FR06 FR07 Password on one side, notes on the other: both kept, no conflict` |
| `KM-002-AC04` | `scopes`/`tags` gộp như tập hợp (4 env một lần, bỏ một phía thì mất, cùng thêm tag thì một lần) | pass | `✔ AC04 FR08 scopes and tags merge as sets`. Đọc `mergeSet` trong `merge.js:205-212`: công thức khớp 05 |
| `KM-002-AC05` | Khôi phục item trong thùng rác, bên kia để nguyên: `deletedAt=null`, `fields`/`history` như trước khi xoá | pass | `✔ 05-del-row-4 AC05 AC09 FR13 one side restores, the other leaves it in the trash: it comes back whole` |
| `KM-002-AC06` | Một bên `trashItem`, bên kia không sửa: vào thùng rác, không xung đột | pass | `✔ 05-del-row-1 AC06 FR13 one side trashes, the other edits nothing: the item goes to the trash` |
| `KM-002-AC07` | Trash vs sửa `title`/`favorite`/`tags`: item sống, `attrs` có `deletedAt`, history có bản `conflict` mang dấu `deleted-elsewhere` | pass | `✔ 05-del-row-2 AC07 FR13 FR19 …`. Probe riêng chạy cả ba kiểu sửa, mỗi kiểu kiểm `deletedAt===null`, `attrs` có `deletedAt`, có bản `note==='deleted-elsewhere'`, và đối xứng hai thứ tự: `PASS AC07 trash vs edit favorite/tags/title` |
| `KM-002-AC08` | Cùng `trashItem` ở hai thời điểm: lấy `deletedAt`/`clock.deletedAt` sớm hơn, theo cả hai thứ tự | pass | `✔ 05-del-row-3 AC08 FR13 both trash at different times: the earlier deletedAt and its clock` |
| `KM-002-AC09` | Một bên khôi phục, bên kia để nguyên: item sống | pass | Cùng test với AC05 (`05-del-row-4 AC05 AC09`), đúng như spec nêu "trường hợp này cũng là AC05" |
| `KM-002-AC10` | `purgeItem` vs không đổi: tombstone đúng hình dạng 09 § Purge | pass | `✔ 05-del-row-5 AC10 FR14 …`. Probe riêng: `PASS AC10 purge vs nothing = tombstone` (`deepEqual` với item đã purge ở bên purge, `purgedAt` có giá trị) |
| `KM-002-AC11` | Purge vs sửa Password: item sống với nội dung bên sửa, `purgedAt=null`, `deletedAt=null`, `attrs` có `purgedAt` | pass | `✔ 05-del-row-6 AC11 FR14 …`. Probe riêng: `PASS AC11 purge vs edit` (kèm đối xứng và `validateVault`) |
| `KM-002-AC12` | Purge vs restore: item sống, `purgedAt=null`, `attrs` có `purgedAt` | pass | `✔ AC12 FR14 purge on one side, restore on the other: the restore wins and is marked`. Probe riêng: `PASS AC12 purge vs restore` |
| `KM-002-AC13` | Xoá field vs sửa field, cả hai chiều đồng hồ; bên thua vào history | pass | `✔ AC13 FR07 …edit wins and is marked`, `✔ AC13 FR07 the deletion is later…`, `✔ 05-del-row-7 AC13 FR07 FR09 …` |
| `KM-002-AC14` | Mỗi bên thêm một field khác nhau: có cả hai, không xung đột | pass | `✔ AC14 FR07 each side adds a different field: both fields are kept, no conflict`. Lưu ý Amendment 1 (`fieldOrder`), xem Finding 2 |
| `KM-002-AC15` | Env: cùng đổi `name` thì bản muộn thắng không lịch sử/đánh dấu; đổi `name` và `color` thì có cả hai | pass | `✔ AC15 FR16 both rename one env…` và `✔ AC15 FR16 one side renames an env, the other recolours it…` |
| `KM-002-AC16` | `deleteEnv`/`deleteProject` vs gán item/tạo env mới: tham chiếu giữ nguyên, không đánh dấu, hợp lệ | pass | `✔ AC16 FR17 FR18 deleting an env or project keeps every reference and adds no mark`. Probe riêng: `PASS AC16 env/project delete keeps refs` (E, P có `deletedAt`; X còn E trong `scopes`; F có mặt; `conflict===null`; `validateVault(m).ok`; đối xứng) |
| `KM-002-AC17` | Cùng xoá project: lấy sớm hơn theo cả hai thứ tự; đổi tên + xoá: có cả hai | pass | `✔ AC17 FR17 both delete one project at different times…` và `✔ AC17 FR17 one side renames a project, the other deletes it…` |
| `KM-002-AC18` | Hai bên cùng tạo id (base không có): 1 item, Password theo đồng hồ, `conflict.fields` chỉ Password, `tags` là hợp, có bản thua | pass | `✔ AC18 FR15 both sides created one id: same values are not conflicts, Password is, tags are united` |
| `KM-002-AC19` | "Đã xử lý" một bên thì mất đánh dấu; có xung đột mới thì `conflict={fields:[],attrs:["notes"],…}` | pass | `✔ AC19 FR10 "Đã xử lý" on one side clears the old mark; a new conflict still marks` |
| `KM-002-AC20` | `remote` đã đầy 20 bản mới hơn, xung đột Password: history đúng 20 và có bản thua | pass | `✔ AC20 FR11 a full remote history does not push out the entry this merge writes`. Probe riêng: `PASS AC20 full remote history keeps loser` (22 lần sửa ở `remote`; `history.length===20`; có bản `conflict` chứa `LL`) |
| `KM-002-AC21` | Đồng hồ hoà hoàn toàn: `(b,l,r)` và `(b,r,l)` giống hệt | pass | `✔ AC21 FR05 fully tied clocks (same at, same dev): the value decides, the same way in both orders`; cũng `ok` trong `npm run test:browser` |
| `KM-002-AC22` | Đầu vào sai (`type` lạ, khác `vaultId`): `KeymeshError invalid`, không có kết quả, đầu vào nguyên vẹn, lỗi không chứa giá trị của vault | pass | `✔ AC22 FR02 invalid input throws invalid…` và `✔ AC22 KM-002 NFR05 merge errors and console carry no vault value`. Probe riêng: `PASS AC22 invalid + leak` (chuỗi đánh dấu `SECRETMARK` không có trong `message`, `JSON.stringify(err)`, `stack`; `vaultId` lệch và `remote=null` cũng ném) |
| `KM-002-AC23` | Đầu vào không bị sửa | pass | `✔ AC23 FR01 merge never modifies its inputs and the result shares no object with them`. Probe riêng: `PASS AC23 inputs untouched`. Mutation/lint tĩnh: `rg` trên `merge.js` chỉ thấy 2 dòng `import` (`./errors.js`, `./model.js`), không có `Date`, `Math.random`, `crypto`, `console`, `newId`, `randomBytes` |
| `KM-002-AC24` | Không có `base`: kết quả có mọi item của cả hai bên | pass | `✔ AC24 FR21 without a base every entity of both sides is kept` |
| `KM-002-AC25` | `merge(b, m1, m2) = m1`, không bản `conflict` nào bị trùng | pass | `✔ AC25 FR09 FR11 NFR04 merging two devices' results of the same merge changes nothing`; cũng `ok` trên Chromium |
| `KM-002-AC26` | ≥ 500 bộ ngẫu nhiên, chạy Node **và** trình duyệt, đủ các tính chất | pass | Node: `✔ AC26 FR01 FR03 FR18 NFR04 NFR06 merge properties on 500 seeded cases from seed 24301` → `ℹ AC26 500 cases: 92 items with a conflict mark, 237 in the trash or purged, fingerprint bdd2e5d0`. Chromium: cùng dòng và cùng `fingerprint bdd2e5d0` (kết quả gộp giống hệt giữa Node và trình duyệt, NFR04). Tôi chạy thêm 6 seed khác tự chọn (`MERGE_SEED=1,7,424242,987654,31337,2026`, 500 bộ mỗi seed): cả 6 `ℹ pass 2 ℹ fail 0`. Chạy `MERGE_SEED=777000 MERGE_CASES=3000`: `ℹ AC26 3000 cases: 543 … fingerprint 1ad9f806`, `ℹ pass 2 ℹ fail 0`. Mutation test, xem §3 |
| `KM-002-AC27` | Gộp vault ~1 MB (NFR03), trung vị 5 lần ≤ 200 ms | pass | `npm test`: `ℹ AC27 merge 500 × 8, no earlier history (1.00 MB): median 56.6 ms, runs 56, 57, 57, 57, 58 ms` (Node), Chromium: `median 29.3 ms`. **Kèm cảnh báo:** hình dạng nguyên văn của NFR03 (500 item × 8 field × 20 lịch sử) đo `13.35 MB: median 496.1 ms` trên Node, vượt 200 ms. Spec tự mâu thuẫn (hình dạng đó không phải ~1 MB), và người implement tự chọn cách hiểu. Xem Finding 1 |
| `KM-002-AC28` | 09/05/03 có hợp đồng merge và mọi quy tắc mới; 05 không còn chỗ trái spec | pass | Tự động: `✔ FR20 FR19 AC28 docs 05/09/03 carry the merge rules…`, `✔ FR23 KM-002 AC28 docs/09-core-api.md names every public export of crypto.js, model.js and merge.js`. Đọc tay: `docs/09-core-api.md` § `merge.js` (dòng 121-193) có đầu vào/ra/lỗi/tính thuần/so bằng/đồng hồ hoà/thứ tự mảng/bản lịch sử `conflict`/`rev`-`updatedAt`; `docs/05-sync.md` có bảng "Xoá, thùng rác và sửa" 9 dòng, § "Xoá project và env", đồng hồ hoà hoàn toàn, "Đã xử lý" (hàng `conflict`), "cùng tạo id", giới hạn lịch sử (hàng `history`), định nghĩa "Sửa nội dung"; `docs/03-data-model.md` dòng 121 và 135 có `note: "deleted-elsewhere"` và quy tắc bản `conflict`; `docs/02-architecture.md:38` đã đổi thành `→ vault`. `rg "Toàn bộ item của \*\*bên thua\*\*" docs/` chỉ thấy trong `spec.md` và `plan.md`, không còn trong 05/09/03 |
| `KM-002-AC29` | Mỗi FR có test mang id; mỗi dòng bảng xoá 05 có test; cả bộ ≤ 60 s | pass | Tên test chứa đủ `FR01`…`FR21` (vòng `for i in 01..21; rg -q "FRi" test/merge*.test.js …` không in thiếu id nào); `rg -o '05-del-row-\d'` → `05-del-row-1 … 05-del-row-7`; `time npm test` → `npm test 2>&1  13.41s user … 5.701 total`, `ℹ tests 119 ℹ pass 119 ℹ fail 0 ℹ duration_ms 5541.48`. Không có test nào tên "AC29", đúng bản chất tiêu chí này (là kiểm meta, không phải hành vi) |

## 3. Promised proofs

Mọi proof ở `plan.md` §5 đều đã chạy lại; ngoài ra có thêm kiểm độc lập.

| Proof | Executed | Result |
|---|---|---|
| `npm test` (AC01-AC25, AC28 tự động, AC29) | có | 119/119 pass, 5,7 s |
| `npm run test:browser` (AC21, AC23, AC26) | có | `tests 119  pass 119  fail 0  (7947 ms)` trên HeadlessChrome/156 |
| AC26 trên Node **và** Chromium | có | Cùng `fingerprint bdd2e5d0` ở cả hai |
| `MERGE_SEED=<n>` chạy lại một bộ (plan §6) | có | Chạy với 7 seed khác nhau, đều pass |
| `t.diagnostic` đo AC27 và dán vào implement.md | có | Số đo trong `implement.md` (48,1 ms / 488,9 ms) lệch vài ms so với lần chạy của tôi (56,6 ms / 496,1 ms), cùng bậc độ lớn, kết luận không đổi |
| AC29: `rg -o 'FR\d\d'`, `rg -c '05-del-row'`, `time npm test` | có | Xem hàng AC29 |
| AC28 kiểm tay 09/05/03 | có | Xem hàng AC28 |
| Risk "mất đối xứng vì thứ tự" (plan §4): property test chạy cả `(b,l,r)` và `(b,r,l)` rồi `deepEqual` cả vault | có | `if (!same(merge(b, r, l), m))` ở `test/merge-props.test.js`; tính chất này pass 500 bộ × (1 + 6) seed + 3000 bộ |
| Risk "bộ test có thể rỗng nghĩa" | có, thêm | **Mutation test** trên bản sao ở scratchpad (repo không bị đụng, đã `diff` xác nhận): M1 đảo so sánh `at` của đồng hồ → `ℹ pass 31 ℹ fail 10`; M2 bỏ quy tắc "giữ bản `conflict` vừa sinh khi cắt" → `ℹ pass 40 ℹ fail 1` (AC20 bắt được); M3 bỏ nhánh "thêm ở một bên" của `mergeSet` → `ℹ pass 38 ℹ fail 3`. Baseline `ℹ pass 41 ℹ fail 0`. Cả ba biến thể đều bị bắt |

## 4. Regressions

```
$ npm test
...
ℹ tests 119
ℹ suites 0
ℹ pass 119
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 5541.480167
npm test 2>&1  13.41s user 0.93s system 251% cpu 5.701 total

$ npm run test:browser
...
tests 119  pass 119  fail 0  (7947 ms)
```

Bộ test cũ của KM-001 xanh nguyên vẹn: `git diff master...HEAD --stat` cho `src/public/js/core/model.js`, `errors.js`, `package.json` là rỗng (không đụng). Thay đổi duy nhất trong test cũ là `test/model.test.js` (+3/-2: thêm `merge.js` vào hai danh sách), `test/perf.test.js` (+26) và `test/leak.test.js` (+47), đều là thêm test.

## 5. Out-of-scope check

Đối chiếu từng gạch đầu dòng ở `spec.md` §7:

- Mạng, push/pull, 409, server, snapshot: không có. `merge.js` chỉ import `./errors.js` và `./model.js`; `git diff --stat` không có file nào trong `src/functions/`.
- Lưu `base`/`local`, cờ `dirty`: không có.
- UI badge, nút "Đã xử lý", câu chữ hiển thị: không có. Dấu `note: 'deleted-elsewhere'` là dữ liệu, không phải câu chữ.
- Giao diện thùng rác, tự xoá trắng sau 30 ngày: không có.
- Hiển thị env sống dưới project đã xoá: không có; `validateVault` không bị đổi (`model.js` không đụng).
- Gộp `meta` của vault: không có; kết quả chỉ có 5 khoá `v, vaultId, projects, envs, items` (09 dòng 134 ghi rõ).
- Gộp giữa hai `vaultId` khác nhau: bị chặn bằng `invalid` (AC22 pass).
- Đổi đồng hồ, tombstone, `HISTORY_MAX` của KM-001: không đổi. Hai ngoại lệ được phép (dấu `note`, `conflict.at`) đã ghi vào 03/09.
- Thêm `clock.deletedAt` cho project/env: không có (`model.js` nguyên vẹn).
- Ngưỡng hiệu năng trên điện thoại: không đặt; chỉ in số đo trên Chromium.

Không có hành vi ngoài phạm vi nào được giao.

## 6. Findings

| # | Finding | Severity | Where |
|---|---|---|---|
| 1 | **NFR03/AC27 tự mâu thuẫn và đã được xử lý một chiều.** Spec mô tả vault "~1 MB (≈500 item, 8 field, 20 lịch sử)" nhưng hình dạng đó là 13,35 MB. Trên hình dạng nguyên văn, Node đo 496,1 ms (> 200 ms); chỉ hình dạng ~1 MB (500 × 8, không lịch sử cũ) mới đạt (56,6 ms). Test chấm ngưỡng trên hình dạng 1 MB và chỉ in số cho hình dạng 13 MB. Tôi chấm AC27 pass vì tiêu chí nêu "~1 MB" và 01-overview chặn vault < 1 MB. Nhưng quyết định chọn cách hiểu này do người implement ghi vào Amendment 3, chưa thấy người sở hữu spec xác nhận, và `spec.md` chưa được sửa | Medium | `spec.md` NFR03/AC27; `plan.md` Amendment 3; `test/perf.test.js` |
| 2 | **Mã lệch chữ của spec ở hai chỗ, spec chưa sửa.** (a) FR06 xếp `fieldOrder` vào thuộc tính đơn gộp theo FR04-FR05, nhưng mã cho `fieldOrder` không bao giờ sinh xung đột (Amendment 1), vì nếu không thì AC14 không thể pass. (b) FR12 nêu công thức `rev`/`updatedAt` khác với mã và với 05/09 (amendment "lấy metadata bên trùng"; `plan.md` nói originator chốt ngày 2026-11-01, tôi không kiểm được xác nhận này từ file nào trong repo). Cả hai đều có lý do kỹ thuật vững và có test, kèm cảnh báo "Originator/PO cần xác nhận" ở `implement.md` §5.1. Rủi ro là người đọc `spec.md` rồi KM-006 dựa vào đó sẽ hiểu sai | Medium | `spec.md` FR06, FR12 so với `merge.js`, `docs/05-sync.md` bảng "Phần của thực thể", `docs/09-core-api.md:181` |
| 3 | **Property test "nội dung thua tìm lại được" yếu hơn chữ AC26 ở hai chỗ**: bỏ qua item có lịch sử đã đủ 20 bản, và bỏ qua nội dung bị purge có chủ ý. Chỗ thứ hai đúng theo spec (FR14); chỗ thứ nhất là cách hiểu đã khai trong đầu `test/merge-props.test.js` và `plan.md` §4 Risks, và AC20 phủ riêng việc cắt. Bộ sinh còn không sinh trường hợp "hai bên cùng tạo một id" (chỉ có test ví dụ AC18 và env). Mutation test vẫn bắt được cả ba lỗi tôi chèn, nên độ phủ thực tế đủ dùng | Low | `test/merge-props.test.js` đầu file; `testkit/merge-gen.js`; `implement.md` §7 |
| 4 | **Khoảng trống FR09/FR11 ở trường hợp suy biến kép**: hai bên mang cùng `deviceId`, cùng `rev`, cùng đồng hồ muộn nhất, và mỗi bên thua một giá trị khác nhau. Hai bản `conflict` trùng khoá nên một bản bị bỏ; một bên thua sẽ không còn bản tương ứng trong `history`. Người implement đã nêu ở `implement.md` §7. Tôi không tái hiện riêng trường hợp này, chỉ ghi nhận từ mô tả và từ việc `mergeHistory` bỏ trùng theo khoá (`merge.js:312-322`). Xảy ra khi hai máy khôi phục cùng một bản sao lưu và cùng sửa, tức là đúng tình huống Concern 4 | Low | `merge.js:312-322`; `spec.md` FR09, FR11 |
| 5 | **PR chưa mở** (máy không có `gh`). Nhánh đã đẩy lên `origin` (`git branch -vv` cho thấy `[origin/feat/KM-002-merge]` đã khớp HEAD). Không ảnh hưởng đến verdict. Thêm một điều nhỏ: `implement.md` nêu đã chạy 23 000 bộ bằng tay, tôi chỉ tái hiện được 3 000 + 7 × 500 bộ, các lần chạy 20 000 bộ không được tôi chạy lại | Info | `implement.md` §1, §4 |

Về vòng phản hồi (plan §6): mọi tiêu chí đều kiểm được bằng lệnh có sẵn, không tiêu chí nào "không kiểm được". Vòng phản hồi của plan đủ dùng.

## 7. Shortest path to pass

Verdict đã là pass, nên không có thay đổi nào bắt buộc. Để đóng hai finding mức trung bình trước khi KM-006 bắt đầu dựa vào hợp đồng:

1. Sửa `spec.md` NFR03/AC27 cho khớp thực tế: ngưỡng 200 ms chấm trên vault ~1 MB (500 item × 8 field, không lịch sử cũ), còn hình dạng 20 lịch sử/item được ghi là chỉ đo (Finding 1).
2. Sửa `spec.md` FR06 (bỏ `fieldOrder` khỏi danh sách thuộc tính đơn, thêm quy tắc "không sinh xung đột") và FR12 (công thức `rev`/`updatedAt` theo amendment), hoặc ghi lại xác nhận của originator vào artifact để người đọc sau có căn cứ (Finding 2).
