'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TomTatPhien } from '@/lib/doc-phien';

export type SessionChoice = TomTatPhien & { co_so_huu?: boolean; owner_seat?: string | null };
const buttonStyle = { fontSize: 'calc(16px * var(--text-scale, 1))', minHeight: 40, padding: '6px 12px', cursor: 'pointer' };
const dateText = (stamp: number | null | undefined) => typeof stamp === 'number' && Number.isFinite(stamp)
  ? new Date(stamp).toLocaleString('vi-VN', { hour12: false, timeZoneName: 'short' }) : 'Không rõ';

export function SessionRows({ sessions, current, busy, pending, onConnect }: {
  sessions: SessionChoice[]; current: string | null; busy: boolean; pending: boolean;
  onConnect: (session: SessionChoice) => void;
}) {
  return <div style={{ maxHeight: '35dvh', overflowY: 'auto', overscrollBehavior: 'contain' }}>
    {sessions.map(session => <div key={session.ma} data-session-id={session.ma}
      style={{ borderTop: '1px solid rgba(200,148,37,.3)', padding: '10px 0', overflowWrap: 'anywhere' }}>
      <code>{session.ma}.jsonl</code>
      <div>{session.ma === current ? 'Đang nối' : 'Chưa nối vào ô này'}{session.co_so_huu ? ' · Owner đã khoá' : ''}</div>
      {session.owner_seat && !session.co_so_huu && <div>Owner đã gán cho: {session.owner_seat} — bấm Nối sẽ đổi sang ghế này.</div>}
      <dl style={{ margin: '8px 0', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 3 }}>
        <dt>Bắt đầu bản ghi</dt><dd style={{ margin: 0 }}>{dateText(session.started_at)}</dd>
        <dt>Kết thúc · sửa cuối</dt><dd style={{ margin: 0 }}>{dateText(session.moc)}</dd>
        <dt>Dung lượng</dt><dd style={{ margin: 0 }}>{typeof session.size_bytes === 'number'
          ? `${(session.size_bytes / 1_000_000).toLocaleString('vi-VN', { minimumFractionDigits: 6, maximumFractionDigits: 6 })} MB · ${session.size_bytes.toLocaleString('vi-VN')} byte` : 'Không rõ'}</dd>
      </dl>
      <div>Tệp được tạo trên máy: {dateText(session.file_created_at)}</div>
      {session.dang_chay && <div>Có dấu hiệu đang chạy / vừa ghi; chưa cho nối.</div>}
      <button type="button" style={buttonStyle} disabled={busy || pending || session.dang_chay}
        onClick={() => onConnect(session)} aria-label={`Nối phiên ${session.ma}`}>Nối</button>
    </div>)}
  </div>;
}

export function SessionPicker({ slot, seat, current, busy, onConnect }: {
  slot: string; seat: string; current: string | null; busy: boolean;
  onConnect: (session: SessionChoice) => Promise<boolean>;
}) {
  const [sessions, setSessions] = useState<SessionChoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const requestId = useRef(0);
  const mounted = useRef(false);
  const connecting = useRef(false);
  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const response = await fetch(`/api/phien?ma_o=${encodeURIComponent(slot)}&ma_nhan_su=${encodeURIComponent(seat)}&owner_picker=1`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.phien)) throw new Error('Không đọc được danh sách phiên. Bấm Tải lại danh sách.');
      if (!mounted.current || id !== requestId.current) return;
      setSessions(data.phien);
      setError('');
    } catch {
      if (mounted.current && id === requestId.current) setError('Không đọc được danh sách phiên. Danh sách cũ không dùng để nối; hãy tải lại.');
    } finally {
      if (mounted.current && id === requestId.current) setLoading(false);
    }
  }, [slot, seat]);
  const invalidateRequests = useCallback(() => { mounted.current = false; requestId.current++; }, []);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return invalidateRequests;
  }, [refresh, current, invalidateRequests]);

  async function connect(session: SessionChoice) {
    if (connecting.current || busy || loading || error || session.dang_chay) return;
    connecting.current = true;
    setPending(true);
    setMessage('');
    try {
      const success = await onConnect(session);
      if (mounted.current) setMessage(success ? `Đã nối và khoá theo lựa chọn của Owner: ${session.ma}` : 'Ô đã đổi trong lúc nối; kết quả cũ không được ghi lên giao diện.');
    } catch (failure) {
      if (mounted.current) setMessage(failure instanceof Error ? failure.message : 'Không nối được phiên.');
    } finally {
      connecting.current = false;
      if (mounted.current) { setPending(false); void refresh(); }
    }
  }

  // 🔠 Cỡ chữ đi theo mức đọc của app (globals.css, khối «HAI MỨC CỠ CHỮ»). Viết thẳng vào style
  // vì khối này KHÔNG có lớp CSS riêng; `calc` + biến vẫn chạy trong thuộc tính style.
  // Người soi 18/09 chỉ ra đây là phần ĐỌC nằm trong khung chat mà vòng 1 bỏ sót.
  return <section aria-label="Danh sách phiên JSONL" style={{ fontSize: 'calc(16px * var(--ti-le-chu, 1))', minWidth: 0, lineHeight: 1.5 }}>
    <h3 style={{ fontSize: 'calc(16px * var(--ti-le-chu, 1))' }}>Phiên trong thư mục ghế</h3>
    <p>Đang nối: <code style={{ overflowWrap: 'anywhere' }}>{current ?? 'Chưa có phiên'}</code></p>
    <p>Thứ tự sửa cuối mới → cũ; không xếp hạng phiên nên chọn. Bấm Nối là Owner xác nhận sở hữu, thay liên kết ô hiện tại.</p>
    <p>Bắt đầu bản ghi = timestamp hợp lệ đầu tiên trong 256 KiB đầu tệp, có thể kế thừa từ phiên gốc khi fork/chép. Không rõ nghĩa là chưa tìm thấy mốc đáng đọc. Tạo tệp không phải bắt đầu hội thoại. Sửa cuối là mtime, không chứng minh phiên đã kết thúc. MB = 1.000.000 byte.</p>
    {busy && <p>Ô đang chạy; vẫn xem được danh sách nhưng chờ lượt xong mới nối.</p>}
    <p>Phiên vừa ghi trong 5 phút hoặc có tiến trình được nhận diện sẽ bị chặn khi nối. Không nhận diện được tiến trình không chứng minh phiên rảnh.</p>
    <button type="button" style={buttonStyle} disabled={pending || loading} onClick={() => void refresh()}>Tải lại danh sách</button>
    {loading && <p role="status">Đang đọc danh sách…</p>}
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {!loading && !error && sessions.length === 0 && <p>Không thấy tệp phiên JSONL trong thư mục ghế này.</p>}
    <SessionRows sessions={sessions} current={current} busy={busy || loading || !!error} pending={pending} onConnect={session => void connect(session)} />
  </section>;
}
