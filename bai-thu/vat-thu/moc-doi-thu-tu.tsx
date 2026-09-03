// VẬT THỬ «ĐỔI THỨ TỰ» — y hệt moc-truoc.tsx, chỉ HOÁN VỊ hai móc trong `Tren`.
// Tập hợp dòng KHÔNG đổi ⇒ thước dời-thuần của LÀN A cũng IM. Chỉ thước này bắt được.
import { useState, useEffect, useCallback, useLayoutEffect } from 'react';
const truocKhiVe = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
export function Tren() {
  const [b, datB] = useState('x');
  const [a, datA] = useState(0);
  truocKhiVe(() => { datA(1); }, [b]);
  const bam = useCallback(() => datB('y'), [a]);
  return <div className="tren" onClick={bam}>{String(a)}</div>;
}
export function Duoi() {
  const [c, datC] = useState<number | null>(null);
  useEffect(() => { datC(2); }, []);
  return <span className="duoi">{String(c)}</span>;
}
