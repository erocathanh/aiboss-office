/**
 * 🧊 ĐÓNG BĂNG HÀNH VI — `src/components/UngDung.tsx`, tầng CẤP MÔ-ĐUN.
 *
 * 🎯 MỤC ĐÍCH: sau khi chia tệp, nói được bằng SỐ rằng hành vi KHÔNG đổi.
 *    Mấy khai báo dưới đây là thứ SẼ BỊ DI CHUYỂN đầu tiên khi chia — và di chuyển là lúc
 *    một giá trị lặng lẽ đổi mà `tsc` vẫn xanh.
 *
 * 🔬 CÁCH: bóc nguyên văn mã ra khỏi cây cú pháp rồi CHẠY THẬT (xem `boc-mo-dun.mjs`).
 *    KHÔNG import `UngDung.tsx` (nó kéo React), KHÔNG sửa `src/`, KHÔNG chạm phiên thật,
 *    KHÔNG sinh tiến trình `claude` nào.
 *
 * ⚠️ Sau khi chia tệp, mấy khai báo này sẽ nằm ở TỆP KHÁC. Lúc đó sửa hằng `NGUON` bên dưới
 *    thành danh sách tệp mới — **bài thử phải theo mã, chứ mã đừng theo bài thử.**
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { bocThuanNhieuTep } from './boc-mo-dun.mjs';

/**
 * 🔀 CHO PHÉP TRỎ NGUỒN KHÁC — dùng cho ĐỐI CHỨNG ÂM và cho lúc SAU KHI CHIA TỆP.
 * 🔑 Nhờ nó mà phép «cố ý làm hỏng rồi xem có ĐỎ không» chạy được trên một BẢN CHÉP,
 *    KHÔNG phải sửa `src/` rồi nhớ khôi phục — mà «nhớ khôi phục» chính là chỗ hay quên.
 */
const NGUON = process.env.NGUON_THU
  // TRỤC ② (04/09): 21 khai báo cấp mô-đun đã DỜI sang hai tệp mới. Bộ bóc vốn dựng ra để
  // đón đúng lượt này — chú thích của nó viết sẵn «chúng chính là thứ sẽ BỊ DI CHUYỂN khi chia tệp».
  // Nay bóc từ CẢ BA tệp: nếu chỉ trỏ tệp cũ thì 91 phép đóng băng sẽ đỏ vì mã KHÔNG còn ở đó,
  // và người đọc dễ tưởng hành vi đã đổi — trong khi nó chỉ ĐỔI CHỖ.
  ?? [
    new URL('../src/components/UngDung.tsx', import.meta.url).pathname,
    new URL('../src/components/ung-dung/hang-so.ts', import.meta.url).pathname,
    new URL('../src/components/ung-dung/bong-bong.tsx', import.meta.url).pathname,
  ].join(',');
const { tep, ten, bo } = bocThuanNhieuTep(NGUON.split(','));
const M = await import(tep);

describe('bóc được đúng thứ mong đợi', () => {
  test('21 khai báo thuần chạy được', () => {
    assert.equal(ten.length, 21, 'số khai báo bóc được đổi ⇒ có thứ vừa THÊM hoặc vừa MẤT');
  });
  test('6 khai báo nằm NGOÀI tầm phủ, có lý do từng cái', () => {
    assert.equal(bo.length, 6);
    for (const [t, ly] of bo) assert.ok(ly.length > 10, `${t} bị bỏ mà KHÔNG có lý do`);
  });
});

describe('LA_BO_DUNG_SAN — chốt chống ghi đè đội THẬT của Owner', () => {
  // 🕳 Ca 20/08: quên khai một bộ vào đây ⇒ Owner bấm hai bộ liên tiếp là đội THẬT bị ghi đè,
  //    KHÔNG có đường về. Đây là hàm có hậu quả nặng nhất trong cả tệp.
  const BO = ['BO_MARKETING', 'BO_VAN_HANH', 'BO_QUAN_LY_TRUONG', 'BO_QUAN_LY_CU', 'BO_CONG_NGHE'];
  for (const b of BO) {
    test(`nhận ra ${b} là bộ dựng sẵn`, () => {
      const ds = M[b];
      const ten = Array.isArray(ds) && typeof ds[0] === 'object' ? ds.map((x: any) => x.ten) : ds;
      assert.equal(M.LA_BO_DUNG_SAN(ten), true, `${b} KHÔNG được nhận ra ⇒ đội thật của Owner sẽ bị đè`);
    });
  }
  test('đội RIÊNG của Owner KHÔNG bị nhận nhầm là bộ dựng sẵn', () => {
    assert.equal(M.LA_BO_DUNG_SAN(['ghe-a', 'ghe-b', 'ghe-c', 'ghe-d', 'ghe-e', 'ghe-f']), false);
  });
  test('mảng RỖNG KHÔNG bị nhận là bộ dựng sẵn', () => {
    assert.equal(M.LA_BO_DUNG_SAN([]), false, 'rỗng mà true ⇒ mọi đội đều bị coi là dựng sẵn');
  });
});

describe('năm bộ ghế — đóng băng NỘI DUNG, không chỉ số lượng', () => {
  test('mỗi bộ đúng 6 ghế', () => {
    for (const b of ['BO_MARKETING', 'BO_VAN_HANH', 'BO_QUAN_LY_TRUONG', 'BO_QUAN_LY_CU', 'BO_CONG_NGHE'])
      assert.equal(M[b].length, 6, `${b} KHÔNG còn 6 ghế`);
  });
  test('BO_CONG_NGHE giữ đúng sáu ghế và sáu mã phiên đã ghim', () => {
    assert.deepEqual(M.BO_CONG_NGHE.map((x: any) => x.ten), [
      'claude-eroca-boss', 'claude-aiboss-app-pm', 'claude-phong-ban-pm',
      'claude-aiboss-app-exe', 'claude-zalo-bot', 'claude-tro-ly-dieu-hanh',
    ]);
    for (const x of M.BO_CONG_NGHE)
      assert.match(x.phien, M.MAU_UUID, `ghế ${x.ten} mất mã phiên ⇒ ô mở ra TRỐNG`);
  });
  test('BO_QUAN_LY_TRUONG mồi mã phiên vào goiY, KHÔNG vào phien', () => {
    // 🕳 Nhét vào `phien` thì ô mở ra TRỐNG và KHÔNG có nút Fork — ghi trong chú thích tại chỗ.
    const co = M.BO_QUAN_LY_TRUONG.filter((x: any) => x.goiY);
    assert.equal(co.length, 5);
    for (const x of M.BO_QUAN_LY_TRUONG) assert.equal(x.phien, null, `${x.ten} có phien ⇒ mất nút Fork`);
  });
});

describe('hàm chuỗi', () => {
  test('boDau — bỏ dấu tiếng Việt, kể cả đ/Đ', () => {
    /**
     * 🕳 ĐỐI CHỨNG ÂM TÌM RA LỖ TRONG CHÍNH BÀI THỬ NÀY: bản đầu chỉ có ca chữ HOA (`Đặng`, `ĐIỆN`).
     *    Gỡ nhánh `đ` THƯỜNG ⇒ bộ đo VẪN XANH, vì `Đ`→`D` rồi `toLowerCase()` vẫn ra `d`.
     * 🔑 Hai nhánh khác nhau trong mã, mà bài thử chỉ đi qua MỘT — nhánh kia có gỡ đi cũng không ai biết.
     * 📌 Đây đúng lý do phép «cố ý làm hỏng» là BẮT BUỘC: nó soi bài thử, chứ không chỉ soi mã.
     */
    assert.equal(M.boDau('Đặng Thị Hoà'), 'dang thi hoa');   // Đ HOA
    assert.equal(M.boDau('đường Đông'), 'duong dong');       // đ THƯỜNG — ca bị thiếu
    assert.equal(M.boDau('ĐIỆN'), 'dien');
    assert.equal(M.boDau('abc'), 'abc');
  });
  test('chenRanh — chèn xuống dòng đúng mốc', () => {
    assert.equal(M.chenRanh('abcdef', [3]), 'abc\ndef');
    assert.equal(M.chenRanh('abcdef', [2, 4]), 'ab\ncd\nef');
  });
  test('chenRanh — KHÔNG mốc thì trả nguyên văn', () => {
    assert.equal(M.chenRanh('abcdef'), 'abcdef');
    assert.equal(M.chenRanh('abcdef', []), 'abcdef');
  });
  test('chenRanh — mốc ngoài phạm vi bị BỎ, không nổ', () => {
    assert.equal(M.chenRanh('abc', [0]), 'abc');
    assert.equal(M.chenRanh('abc', [99]), 'abc');
    assert.equal(M.chenRanh('abc', [-1]), 'abc');
  });
});

describe('mã ô và mã tin', () => {
  test('maOCua — chỉ số 0 thành ô o-1 (đếm từ 1 cho người đọc)', () => {
    assert.equal(M.maOCua(0), 'o-1');
    assert.equal(M.maOCua(5), 'o-6');
  });
  test('datMa — mỗi lần một mã KHÁC nhau', () => {
    const a = M.datMa(), b = M.datMa();
    assert.notEqual(a, b, 'hai tin trùng mã ⇒ React dựng lại nhầm bong bóng');
    assert.match(a, /^t\d+$/);
  });
});

describe('hằng số — đóng băng GIÁ TRỊ, vì đổi lặng lẽ là hỏng lặng lẽ', () => {
  test('LECH_COI_LA_DAY = 8', () => assert.equal(M.LECH_COI_LA_DAY, 8));
  test('NHIP_THAM_DO_MS = 5000', () => assert.equal(M.NHIP_THAM_DO_MS, 5_000));
  test('DAM_ICON = bold (MỘT độ đậm cho cả dự án)', () => assert.equal(M.DAM_ICON, 'bold'));
  test('bốn khoá localStorage giữ nguyên tên', () => {
    // đổi tên khoá = Owner mất bố cục / tiêu điểm / đội cũ đã lưu, và mất IM LẶNG
    assert.equal(typeof M.KHOA_BO_CUC, 'string');
    const k = [M.KHOA_BO_CUC, M.KHOA_TIEU_DIEM, M.KHOA_BO_GHE_CU, M.KHOA_AN_COT];
    assert.equal(new Set(k).size, 4, 'hai khoá trùng tên ⇒ ghi đè nhau');
  });
  test('MAU_UUID nhận uuid thật, TỪ CHỐI chuỗi bịa', () => {
    assert.match('1b696a63-f02d-405d-918e-0a909d8d6ae4', M.MAU_UUID);
    assert.doesNotMatch('khong-phai-uuid', M.MAU_UUID);
  });
});

describe('O_TRONG — hình dạng ô rỗng', () => {
  test('hienMau mặc định TẮT', () => {
    // 🕳 17/08: bật mặc định ⇒ mọi câu in THÔ ⇒ Owner thấy nguyên dấu ** và tưởng markdown hỏng.
    assert.equal(M.O_TRONG.hienMau, false);
  });
  test('ô rỗng KHÔNG tự nhận là đang chạy', () => {
    assert.equal(M.O_TRONG.dangChay, false);
    assert.equal(M.O_TRONG.dangNap, false);
  });
  test('số trường của ô rỗng — đổi là có người thêm/bớt trạng thái', () => {
    assert.equal(Object.keys(M.O_TRONG).length, 26);
  });
});
