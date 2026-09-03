// VẬT THỬ «ĐỔI MẢNG PHỤ THUỘC» — y hệt moc-truoc.tsx, chỉ bớt một phần tử phụ thuộc.
import { useState, useEffect, useCallback, useLayoutEffect } from 'react';
const truocKhiVe = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
export function Tren() {
  const [a, datA] = useState(0);
  const [b, datB] = useState('x');
  truocKhiVe(() => { datA(1); }, []);
  const bam = useCallback(() => datB('y'), [a]);
  return <div className="tren" onClick={bam}>{String(a)}</div>;
}
export function Duoi() {
  const [c, datC] = useState<number | null>(null);
  useEffect(() => { datC(2); }, []);
  return <span className="duoi">{String(c)}</span>;
}
