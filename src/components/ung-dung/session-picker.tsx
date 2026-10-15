'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TomTatPhien } from '@/lib/doc-phien';
import { useT } from '@/i18n';

export type SessionChoice = TomTatPhien & { co_so_huu?: boolean; owner_seat?: string | null };
const buttonStyle = { fontSize: 'calc(16px * var(--text-scale, 1))', minHeight: 40, padding: '6px 12px', cursor: 'pointer' };

export function SessionRows({ sessions, current, busy, pending, onConnect }: {
  sessions: SessionChoice[]; current: string | null; busy: boolean; pending: boolean;
  onConnect: (session: SessionChoice) => void;
}) {
  const { lang, t } = useT();
  const locale = lang === 'vi' ? 'vi-VN' : 'en-US';
  const dateText = (stamp: number | null | undefined) =>
    typeof stamp === 'number' && Number.isFinite(stamp)
      ? new Date(stamp).toLocaleString(locale, { hour12: false, timeZoneName: 'short' })
      : t('common.unknown');

  return <div style={{ maxHeight: '35dvh', overflowY: 'auto', overscrollBehavior: 'contain' }}>
    {sessions.map(session => <div key={session.ma} data-session-id={session.ma}
      style={{ borderTop: '1px solid rgba(200,148,37,.3)', padding: '10px 0', overflowWrap: 'anywhere' }}>
      <code>{session.ma}.jsonl</code>
      <div>{session.ma === current ? t('home.sessionPicker.statusAttached') : t('home.sessionPicker.statusNotAttached')}{session.co_so_huu ? t('home.sessionPicker.statusOwnerLocked') : ''}</div>
      {session.owner_seat && !session.co_so_huu && <div>{t('home.sessionPicker.ownerAssignedNote', { seat: session.owner_seat })}</div>}
      <dl style={{ margin: '8px 0', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 3 }}>
        <dt>{t('home.sessionPicker.recordStartLabel')}</dt><dd style={{ margin: 0 }}>{dateText(session.started_at)}</dd>
        <dt>{t('home.sessionPicker.lastModifiedLabel')}</dt><dd style={{ margin: 0 }}>{dateText(session.moc)}</dd>
        <dt>{t('home.sessionPicker.sizeLabel')}</dt><dd style={{ margin: 0 }}>{typeof session.size_bytes === 'number'
          ? `${(session.size_bytes / 1_000_000).toLocaleString(locale, { minimumFractionDigits: 6, maximumFractionDigits: 6 })} MB · ${session.size_bytes.toLocaleString(locale)} byte` : t('common.unknown')}</dd>
      </dl>
      <div>{t('home.sessionPicker.fileCreatedLabel', { date: dateText(session.file_created_at) })}</div>
      {session.dang_chay && <div>{t('home.sessionPicker.activeSessionWarning')}</div>}
      <button type="button" style={buttonStyle} disabled={busy || pending || session.dang_chay}
        onClick={() => onConnect(session)} aria-label={t('home.sessionPicker.attachAria', { id: session.ma })}>{t('home.sessionPicker.attachButton')}</button>
    </div>)}
  </div>;
}

export function SessionPicker({ slot, seat, current, busy, onConnect }: {
  slot: string; seat: string; current: string | null; busy: boolean;
  onConnect: (session: SessionChoice) => Promise<boolean>;
}) {
  const { t } = useT();
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
      if (!response.ok || !Array.isArray(data.phien)) throw new Error(t('home.sessionPicker.loadErrorTryAgain'));
      if (!mounted.current || id !== requestId.current) return;
      setSessions(data.phien);
      setError('');
    } catch {
      if (mounted.current && id === requestId.current) setError(t('home.sessionPicker.loadErrorStale'));
    } finally {
      if (mounted.current && id === requestId.current) setLoading(false);
    }
  }, [slot, seat, t]);
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
      if (mounted.current) setMessage(success ? t('home.sessionPicker.connectSuccess', { id: session.ma }) : t('home.sessionPicker.connectStale'));
    } catch (failure) {
      if (mounted.current) setMessage(failure instanceof Error ? failure.message : t('home.sessionPicker.connectFailed'));
    } finally {
      connecting.current = false;
      if (mounted.current) { setPending(false); void refresh(); }
    }
  }

  // 🔠 Cỡ chữ đi theo mức đọc của app (globals.css, khối «HAI MỨC CỠ CHỮ»). Viết thẳng vào style
  // vì khối này KHÔNG có lớp CSS riêng; `calc` + biến vẫn chạy trong thuộc tính style.
  // Người soi 18/09 chỉ ra đây là phần ĐỌC nằm trong khung chat mà vòng 1 bỏ sót.
  return <section aria-label={t('home.sessionPicker.sectionAria')} style={{ fontSize: 'calc(16px * var(--ti-le-chu, 1))', minWidth: 0, lineHeight: 1.5 }}>
    <h3 style={{ fontSize: 'calc(16px * var(--ti-le-chu, 1))' }}>{t('home.sessionPicker.heading')}</h3>
    <p>{t('home.sessionPicker.currentLabel')} <code style={{ overflowWrap: 'anywhere' }}>{current ?? t('home.sessionPicker.noSession')}</code></p>
    <p>{t('home.sessionPicker.orderNote')}</p>
    <p>{t('home.sessionPicker.timestampNote')}</p>
    {busy && <p>{t('home.sessionPicker.busyNote')}</p>}
    <p>{t('home.sessionPicker.activeGuardNote')}</p>
    <button type="button" style={buttonStyle} disabled={pending || loading} onClick={() => void refresh()}>{t('home.sessionPicker.reloadButton')}</button>
    {loading && <p role="status">{t('home.sessionPicker.loadingStatus')}</p>}
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {!loading && !error && sessions.length === 0 && <p>{t('home.sessionPicker.emptyList')}</p>}
    <SessionRows sessions={sessions} current={current} busy={busy || loading || !!error} pending={pending} onConnect={session => void connect(session)} />
  </section>;
}

