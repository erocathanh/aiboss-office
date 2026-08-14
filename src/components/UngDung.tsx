'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/* Bố cục + tên lớp CSS bê nguyên bản mẫu 09 Owner đã duyệt. ⛔ Không thiết kế lại. */

interface PhongBan { ma: string; icon: string; ten: string; so_nhan_su: number }
interface NhanSu {
  ten: string; nhan: string; phong: string; ten_phong: string;
  vai: string; viet_tat: string; tim: string;
}
interface TomTatPhien {
  ma: string; moc: number; moc_doc: string;
  tin_cuoi: string; so_luot: number; dang_chay: boolean;
}
interface Tin { ai: 'toi' | 'ho'; chu: string; gio: string; loi?: boolean }

const MA_O = 'o-1'; // vòng này CHỈ MỘT Ô. Chia 2–4 ô để vòng sau.

const MAU_PHONG = ['#c89425', '#5b8def', '#3fb27f', '#e0724a', '#9b6bd6', '#d94f70', '#4bb3c4'];

function boDau(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

function gioBayGio(): string {
  return new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function UngDung({
  phongBan, nhanSu, tong,
}: {
  phongBan: PhongBan[];
  nhanSu: NhanSu[];
  tong: { nhan_su: number; phong_ban: number; truong_phong: number };
}) {
  const [phongMo, datPhongMo] = useState<string | null>(null);
  const [phongChon, datPhongChon] = useState<string | null>(null);
  const [tuKhoa, datTuKhoa] = useState('');
  const [nsChon, datNsChon] = useState<NhanSu | null>(null);

  const [tin, datTin] = useState<Tin[]>([]);
  const [soan, datSoan] = useState('');
  const [dangChay, datDangChay] = useState(false);
  const [dangNap, datDangNap] = useState(false);
  const [chiPhi, datChiPhi] = useState<number | null>(null);
  const [token, datToken] = useState<number | null>(null);
  const [noiTiep, datNoiTiep] = useState(false);

  const [dsPhien, datDsPhien] = useState<TomTatPhien[]>([]);
  const [phienHienTai, datPhienHienTai] = useState<string | null>(null);
  const [moChonPhien, datMoChonPhien] = useState(false);
  const [moDan, datMoDan] = useState(false);          // mở/đóng ô dán lệnh resume
  const [chuoiDan, datChuoiDan] = useState('');       // chuỗi Owner dán từ sổ phiên
  const [loiDan, datLoiDan] = useState('');           // kết quả kiểm — hiện thẳng ra màn hình

  const bangTinRef = useRef<HTMLDivElement>(null);
  const daKhoiPhuc = useRef(false);

  /* ---------- Danh sách nhân sự sau lọc ---------- */
  const dsHien = useMemo(() => {
    const k = boDau(tuKhoa.trim());
    return nhanSu.filter((n) => {
      if (phongChon && n.phong !== phongChon) return false;
      // ⭐ `n.tim` gộp CẢ nhãn dễ hiểu LẪN tên kỹ thuật ⇒ gõ "marketing" ra đúng người,
      //    gõ "web-funnel" cũng ra đúng người.
      return !k || n.tim.includes(k);
    });
  }, [nhanSu, phongChon, tuKhoa]);

  /* ---------- Cuộn xuống đáy khi có tin mới ---------- */
  useEffect(() => {
    const b = bangTinRef.current;
    if (b) b.scrollTop = b.scrollHeight;
  }, [tin]);

  /* ---------- Nạp danh sách phiên thật của nhân sự ---------- */
  const napDsPhien = useCallback(async (ten: string) => {
    try {
      const r = await fetch(`/api/phien?ma_o=${MA_O}&ma_nhan_su=${encodeURIComponent(ten)}`);
      const j = await r.json();
      datDsPhien(Array.isArray(j.phien) ? j.phien : []);
    } catch { datDsPhien([]); }
  }, []);

  /* ---------- Nạp LỊCH SỬ THẬT của một phiên ---------- */
  const napLichSu = useCallback(async (ten: string, maPhien: string) => {
    datDangNap(true);
    try {
      const r = await fetch(
        `/api/phien?ma_nhan_su=${encodeURIComponent(ten)}&ma_phien=${encodeURIComponent(maPhien)}`,
      );
      const j = await r.json();
      datTin(Array.isArray(j.lich_su) ? j.lich_su : []);
      datNoiTiep(true);
    } catch { datTin([]); } finally { datDangNap(false); }
  }, []);

  /* ---------- Khôi phục nguyên trạng sau khi tắt trình duyệt / máy chủ ---------- */
  useEffect(() => {
    if (daKhoiPhuc.current) return;
    daKhoiPhuc.current = true;
    (async () => {
      try {
        const r = await fetch('/api/o');
        const j = await r.json();
        const o = j?.o?.[MA_O];
        if (!o?.ma_nhan_su) return;
        const ns = nhanSu.find((x) => x.ten === o.ma_nhan_su);
        if (!ns) return;
        datNsChon(ns);
        datPhongChon(ns.phong);
        datPhongMo(ns.phong);
        await napDsPhien(ns.ten);
        if (o.ma_phien) {
          datPhienHienTai(o.ma_phien);
          await napLichSu(ns.ten, o.ma_phien);
        }
      } catch { /* không khôi phục được thì bắt đầu trắng */ }
    })();
  }, [nhanSu, napDsPhien, napLichSu]);

  /* ---------- Chọn một nhân sự ---------- */
  async function chonNhanSu(n: NhanSu) {
    datNsChon(n);
    datTin([]);
    datChiPhi(null);
    datToken(null);
    datNoiTiep(false);
    datMoChonPhien(false);
    datPhienHienTai(null);
    await napDsPhien(n.ten);

    // Mặc định NỐI LẠI phiên gần nhất còn nối được — ⛔ không mặc định đẻ phiên mới.
    try {
      const r = await fetch(`/api/phien?ma_o=${MA_O}&ma_nhan_su=${encodeURIComponent(n.ten)}`);
      const j = await r.json();
      const ds: TomTatPhien[] = Array.isArray(j.phien) ? j.phien : [];
      const ganNhat = ds.find((p) => !p.dang_chay);
      if (ganNhat) {
        datPhienHienTai(ganNhat.ma);
        await fetch('/api/o', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ma_o: MA_O, ma_nhan_su: n.ten, ma_phien: ganNhat.ma }),
        });
        await napLichSu(n.ten, ganNhat.ma);
        return;
      }
    } catch { /* bỏ qua */ }

    await fetch('/api/o', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ma_o: MA_O, ma_nhan_su: n.ten, ma_phien: null }),
    });
  }

  /* ---------- Bấm chọn một phiên trong danh sách ---------- */
  async function chonPhien(p: TomTatPhien) {
    if (!nsChon || p.dang_chay) return; // ⛔ không nối vào phiên đang chạy nơi khác
    datMoChonPhien(false);
    datPhienHienTai(p.ma);
    datChiPhi(null);
    datToken(null);
    await fetch('/api/o', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ma_o: MA_O, ma_nhan_su: nsChon.ten, ma_phien: p.ma }),
    });
    await napLichSu(nsChon.ten, p.ma);
  }

  /* ---------- Dán lệnh resume chép từ sổ phiên (resume.erocathanh.com) ----------
   *
   * Owner chép lệnh ở sổ phiên rồi dán thẳng vào đây. Nhận cả 3 dạng hay gặp:
   *    claude --resume <uuid>
   *    cd "/duong/dan" && claude --resume <uuid>
   *    <uuid>                       ← dán trần
   *
   * 🔴 Vì sao phải KIỂM trước khi nối, ⛔ đừng nối mù:
   *    bản ghi phiên nằm ở ~/.claude/projects/<đường-dẫn-mã-hoá>/<uuid>.jsonl.
   *    Nối vào mã ⛔ không có bản ghi thì Claude ⛔ KHÔNG báo lỗi — nó lặng lẽ
   *    mở một phiên TRẮNG, và người dùng tưởng mình đang tiếp mạch cũ.
   */
  const MAU_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

  async function danLenhResume() {
    if (!nsChon) return;
    const ma = (chuoiDan.match(MAU_UUID) ?? [])[0];
    if (!ma) {
      datLoiDan('⛔ Không thấy mã phiên trong chuỗi vừa dán. Cần một mã dạng 8-4-4-4-12 chữ số/chữ cái.');
      return;
    }
    datLoiDan('Đang kiểm bản ghi phiên…');
    try {
      const r = await fetch(
        `/api/phien?ma_nhan_su=${encodeURIComponent(nsChon.ten)}&ma_phien=${encodeURIComponent(ma)}`,
      );
      const j = await r.json();
      const lichSu = Array.isArray(j.lich_su) ? j.lich_su : [];
      if (!lichSu.length) {
        // ⛔ KHÔNG im lặng mở phiên trắng — nói thẳng, để Owner còn biết mà tra lại.
        datLoiDan(
          `⛔ Đọc được mã ${ma.slice(0, 8)}… nhưng KHÔNG thấy nội dung phiên. ` +
          `Thường là do phiên đó thuộc THƯ MỤC KHÁC — bản ghi tra theo đường dẫn nơi phiên được mở.`,
        );
        return;
      }
      datPhienHienTai(ma);
      datTin(lichSu);
      datNoiTiep(true);
      datChiPhi(null);
      datToken(null);
      await fetch('/api/o', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ma_o: MA_O, ma_nhan_su: nsChon.ten, ma_phien: ma }),
      });
      datLoiDan(`✅ Đã nối phiên ${ma.slice(0, 8)}… — đọc được ${lichSu.length} lượt.`);
      datChuoiDan('');
      napDsPhien(nsChon.ten);
    } catch {
      datLoiDan('⛔ Không gọi được máy chủ để kiểm phiên.');
    }
  }

  /* ---------- Mở phiên mới (nút riêng) ---------- */
  async function phienMoi() {
    if (!nsChon) return;
    datMoChonPhien(false);
    datPhienHienTai(null);
    datTin([]);
    datNoiTiep(false);
    datChiPhi(null);
    datToken(null);
    await fetch('/api/o', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ma_o: MA_O, ma_nhan_su: nsChon.ten, ma_phien: null }),
    });
  }

  /* ---------- Gửi câu hỏi, đọc luồng SSE ---------- */
  async function gui() {
    const cauHoi = soan.trim();
    if (!cauHoi || !nsChon || dangChay) return;

    datSoan('');
    datChiPhi(null);
    datToken(null);
    datTin((t) => [...t, { ai: 'toi', chu: cauHoi, gio: gioBayGio() }]);
    datDangChay(true);

    let daMoBong = false;
    const themChu = (c: string) => {
      datTin((t) => {
        const n = [...t];
        if (!daMoBong) { n.push({ ai: 'ho', chu: c, gio: gioBayGio() }); daMoBong = true; }
        else { n[n.length - 1] = { ...n[n.length - 1]!, chu: n[n.length - 1]!.chu + c }; }
        return n;
      });
    };

    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ma_o: MA_O,
          ma_nhan_su: nsChon.ten,
          cau_hoi: cauHoi,
          phien_moi: phienHienTai === null,
        }),
      });

      if (!r.ok || !r.body) {
        const j = await r.json().catch(() => ({ loi: `Máy chủ trả mã ${r.status}.` }));
        datTin((t) => [...t, { ai: 'ho', chu: j.loi ?? 'Lỗi không rõ.', gio: gioBayGio(), loi: true }]);
        return;
      }

      const doc = r.body.getReader();
      const giai = new TextDecoder();
      let dem = '';

      for (;;) {
        const { done, value } = await doc.read();
        if (done) break;
        dem += giai.decode(value, { stream: true });
        const khoi = dem.split('\n\n');
        dem = khoi.pop() ?? '';
        for (const k of khoi) {
          const d = k.split('\n').find((x) => x.startsWith('data: '));
          if (!d) continue;
          let j: Record<string, unknown>;
          try { j = JSON.parse(d.slice(6)); } catch { continue; }

          if (j.loai === 'chu') themChu(String(j.chu));
          else if (j.loai === 'da-noi-mach') datNoiTiep(Boolean(j.noi_tiep));
          else if (j.loai === 'mat-ban-ghi') {
            // ⛔ KHÔNG im lặng — người dùng phải biết mình vừa mất ngữ cảnh.
            datNoiTiep(false);
            datTin((t) => [...t, { ai: 'ho', chu: String(j.thong_diep), gio: gioBayGio(), loi: true }]);
          } else if (j.loai === 'loi') {
            datTin((t) => [...t, { ai: 'ho', chu: String(j.thong_diep), gio: gioBayGio(), loi: true }]);
          } else if (j.loai === 'xong') {
            if (typeof j.chi_phi_usd === 'number') datChiPhi(j.chi_phi_usd);
            if (typeof j.token === 'number') datToken(j.token);
          }
        }
      }
    } catch (e) {
      datTin((t) => [...t, {
        ai: 'ho', chu: e instanceof Error ? e.message : 'Mất kết nối.', gio: gioBayGio(), loi: true,
      }]);
    } finally {
      datDangChay(false);
      if (nsChon) {
        await napDsPhien(nsChon.ten);
        // Phiên vừa tạo → hỏi máy chủ xem ô đang giữ mã nào.
        try {
          const r = await fetch('/api/o');
          const j = await r.json();
          const m = j?.o?.[MA_O]?.ma_phien;
          if (m) datPhienHienTai(m);
        } catch { /* bỏ qua */ }
      }
    }
  }

  const demTheoPhong = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of nhanSu) m.set(n.phong, (m.get(n.phong) ?? 0) + 1);
    return m;
  }, [nhanSu]);

  return (
    <>
      <header className="thanh-de">
        <div className="dau-an">ET</div>
        <div className="khoi-de">
          <b>Phòng ban AI</b>
          <span>Nói chuyện thật với trợ lý AI · Eroca Thanh</span>
        </div>
        <div className="so-lieu">
          <div className="o-so"><b>{tong.nhan_su}</b><span>Nhân sự</span></div>
          <div className="vach" />
          <div className="o-so"><b>{tong.phong_ban}</b><span>Phòng ban</span></div>
          <div className="vach" />
          <div className="o-so"><b>{tong.truong_phong}</b><span>Trưởng phòng</span></div>
        </div>
      </header>

      <div className="khung">
        {/* ===== Cột 1 — cây phòng ban ===== */}
        <aside className="cot cot-1">
          <div className="de-cot">Cơ cấu tổ chức</div>
          <div className="cay">
            <div
              className={`goc${phongChon === null ? ' chon' : ''}`}
              onClick={() => { datPhongChon(null); datPhongMo(null); }}
            >
              <span className="ic">🏛</span>
              <span className="nhan-ten">Toàn bộ nhân sự</span>
              <span className="dem-nho">{nhanSu.length}</span>
            </div>

            {phongBan.map((p) => (
              <div key={p.ma}>
                <div
                  className={`nut${phongMo === p.ma ? ' mo' : ''}${phongChon === p.ma ? ' chon' : ''}`}
                  onClick={() => {
                    datPhongChon(p.ma);
                    datPhongMo(phongMo === p.ma ? null : p.ma);
                  }}
                >
                  <span className="caret">▶</span>
                  <span className="ic">{p.icon}</span>
                  <span className="nhan-ten">{p.ten}</span>
                  <span className="dem-nho">{demTheoPhong.get(p.ma) ?? 0}</span>
                </div>
                <div className="con">
                  {nhanSu.filter((n) => n.phong === p.ma).slice(0, 40).map((n) => (
                    <div
                      key={n.ten}
                      className={`la${nsChon?.ten === n.ten ? ' chon' : ''}`}
                      onClick={() => chonNhanSu(n)}
                      title={n.ten}
                    >
                      <span className="cham" />
                      <span className="nhan-ten">{n.nhan}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="thanh-mau">
            <div className="tieu">Tỉ trọng nhân sự</div>
            <div className="thanh-ty">
              {phongBan.map((p, i) => (
                <i key={p.ma} style={{
                  width: `${(p.so_nhan_su / nhanSu.length) * 100}%`,
                  background: MAU_PHONG[i % MAU_PHONG.length],
                }} />
              ))}
            </div>
            <div className="chu-thich">
              {phongBan.map((p, i) => (
                <div key={p.ma}>
                  <i style={{ background: MAU_PHONG[i % MAU_PHONG.length] }} />
                  {p.ten}<b>{p.so_nhan_su}</b>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* ===== Cột 2 — danh sách nhân sự ===== */}
        <section className="cot cot-2">
          <div className="de-cot">
            <span>{phongChon ? phongBan.find((p) => p.ma === phongChon)?.ten : 'Toàn bộ nhân sự'}</span>
            <span className="dem">{dsHien.length}</span>
          </div>
          <div className="hop-tim">
            <input
              type="search" autoComplete="off" value={tuKhoa}
              onChange={(e) => datTuKhoa(e.target.value)}
              placeholder="Tìm theo việc hoặc theo tên kỹ thuật…"
            />
          </div>
          <div className="ds">
            {dsHien.length === 0 && <div className="rong">Không có ai khớp.</div>}
            {dsHien.map((n) => (
              <div
                key={n.ten}
                className={`the-ns${nsChon?.ten === n.ten ? ' chon' : ''}`}
                data-vai={n.vai}
                onClick={() => chonNhanSu(n)}
                title={`${n.nhan}\n${n.ten}`}
              >
                <div className="vuong">{n.viet_tat}</div>
                <div className="noi">
                  {/* ⭐ Dòng CHÍNH = nhãn dễ hiểu · dòng PHỤ = tên kỹ thuật (nhỏ, mờ) */}
                  <div className="ten">{n.nhan}</div>
                  <div className="ma-ky-thuat">{n.ten}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ===== Cột 3 — khung trao đổi (1 ô) ===== */}
        <section className="cot cot-3">
          <div className="de-khu">
            <span className="nhan-khu">Khu trao đổi</span>
            <span className="nhan-that">● Nối thẳng Claude Code trên máy</span>
          </div>

          <div className="luoi bc-1">
            <div className="o-chat tieu-diem">
              {!nsChon ? (
                <div className="rong-o">
                  <div className="to">💬</div>
                  <b>Chưa chọn ai</b>
                  <span>Chọn một nhân sự ở cột giữa để mở khung trao đổi.</span>
                </div>
              ) : (
                <>
                  <div className="de-o">
                    <div className="anh-o">{nsChon.viet_tat}</div>
                    <div className="tt-o">
                      {/* ⭐ nhãn to · slug nhỏ mờ */}
                      <b title={nsChon.nhan}>{nsChon.nhan}</b>
                      <div className="ma-ky-thuat" title={nsChon.ten}>{nsChon.ten}</div>
                    </div>
                    <button
                      className="nut-chu" type="button"
                      onClick={() => datMoChonPhien((v) => !v)}
                      title="Danh sách phiên đã có của nhân sự này"
                    >
                      🕘 Phiên ({dsPhien.length})
                    </button>
                    <button
                      className="nut-chu" type="button"
                      onClick={() => { datMoDan((v) => !v); datLoiDan(''); }}
                      title="Dán lệnh resume chép từ sổ phiên resume.erocathanh.com"
                    >
                      📋 Dán lệnh
                    </button>
                    <button className="nut-chu" type="button" onClick={phienMoi} title="Mở phiên mới">
                      ＋ Phiên mới
                    </button>
                  </div>

                  {/* Dòng nhắc: đổi cấu hình thì PHẢI mở phiên mới mới thấy — Owner vừa vấp đúng chỗ này */}
                  <div className="nhac-phien">
                    {phienHienTai ? (
                      <>
                        Đang nối phiên <code>{phienHienTai.slice(0, 8)}…</code> — phiên cũ giữ nguyên
                        bối cảnh lúc nó được mở.{' '}
                        <button type="button" className="lien-ket" onClick={phienMoi}>
                          Mở phiên mới
                        </button>{' '}
                        nếu vừa đổi cấu hình mà chưa thấy tác dụng.
                      </>
                    ) : (
                      <>Phiên mới — sẽ có mã sau lượt gửi đầu tiên.</>
                    )}
                  </div>

                  {moDan && (
                    <div className="hop-dan">
                      <div className="dan-nhan">
                        Dán lệnh chép từ sổ phiên (<code>resume.erocathanh.com</code>) — nhận cả
                        <code>claude --resume &lt;mã&gt;</code>, lệnh có <code>cd &quot;…&quot;</code>, hoặc mã trần.
                      </div>
                      <div className="dan-hang">
                        <input
                          className="o-dan"
                          value={chuoiDan}
                          onChange={(e) => datChuoiDan(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') danLenhResume(); }}
                          placeholder='claude --resume 4766aa5e-…'
                          spellCheck={false}
                        />
                        <button className="nut-chu manh" type="button" onClick={danLenhResume}>
                          Nối phiên
                        </button>
                      </div>
                      {loiDan && <div className="dan-ket-qua">{loiDan}</div>}
                    </div>
                  )}

                  {moChonPhien && (
                    <div className="chon-nhanh">
                      <div className="ds-nhanh">
                        {dsPhien.length === 0 && (
                          <div className="rong">Chưa có phiên nào. Gửi câu đầu tiên để mở phiên.</div>
                        )}
                        {dsPhien.map((p) => (
                          <div
                            key={p.ma}
                            className={`mon${p.dang_chay ? ' dang-chay' : ''}`}
                            onClick={() => chonPhien(p)}
                            title={p.dang_chay
                              ? 'Đang chạy ở nơi khác — nối vào sẽ hỏng bản ghi phiên'
                              : p.ma}
                          >
                            <b>
                              {p.ma === phienHienTai ? '● ' : ''}
                              {p.tin_cuoi || '(chưa có tin)'}
                            </b>
                            <i>
                              {p.moc_doc} · {p.so_luot} lượt
                              {p.dang_chay ? ' · ⛔ đang chạy nơi khác' : ''}
                            </i>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="than">
                    <div className="bang-tin" ref={bangTinRef}>
                      {dangNap && <div className="moc-ngay">Đang nạp lịch sử phiên…</div>}
                      {!dangNap && tin.length === 0 && (
                        <div className="rong-o">
                          <div className="to">✨</div>
                          <b>{phienHienTai ? 'Phiên trống' : 'Phiên mới'}</b>
                          <span>Gõ câu hỏi bên dưới để bắt đầu.</span>
                        </div>
                      )}
                      {tin.map((t, i) => (
                        <div key={i} className={`dong-tin ${t.ai}`}>
                          <div className="anh-nho">{t.ai === 'toi' ? 'ET' : nsChon.viet_tat}</div>
                          <div>
                            <div className={`bong${t.loi ? ' loi' : ''}${
                              dangChay && i === tin.length - 1 && t.ai === 'ho' ? ' dang-chay' : ''
                            }`}>
                              {t.chu}
                            </div>
                            <span className="gio">{t.gio}</span>
                          </div>
                        </div>
                      ))}
                      {dangChay && tin[tin.length - 1]?.ai === 'toi' && (
                        <div className="dong-tin ho">
                          <div className="anh-nho">{nsChon.viet_tat}</div>
                          <div className="cham-go"><i /><i /><i /></div>
                        </div>
                      )}
                    </div>

                    <div className="soan">
                      <textarea
                        value={soan}
                        onChange={(e) => datSoan(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); gui(); }
                        }}
                        disabled={dangChay}
                        rows={1}
                        placeholder={dangChay ? 'Đang trả lời…' : 'Nhập câu hỏi… (Enter để gửi)'}
                      />
                      <button className="nut-gui" type="button" onClick={gui} disabled={dangChay || !soan.trim()}>
                        Gửi
                      </button>
                    </div>

                    <div className="vach-tt">
                      <span className={`cham-noi${phienHienTai ? '' : ' tat'}`} />
                      <span>
                        {phienHienTai
                          ? `Đang nối phiên ${phienHienTai.slice(0, 8)}…${noiTiep ? ' · giữ mạch' : ''}`
                          : 'Phiên mới — chưa có mã'}
                      </span>
                      {/* ⭐ Token đứng TRƯỚC đô-la: token mới là thứ ăn vào hạn mức tuần. */}
                      {(token !== null || chiPhi !== null) && (
                        <span className="phai">
                          {token !== null && <b style={{ color: 'var(--vang-sang)' }}>{token.toLocaleString('vi-VN')} token</b>}
                          {token !== null && chiPhi !== null && ' · '}
                          {chiPhi !== null && `≈ ${chiPhi.toFixed(4)} USD`}
                        </span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
