// VẬT THỬ «BÓC RA MÓC TỰ VIẾT» — refactor này GIỮ NGUYÊN thứ tự móc thật của React,
// nên thước PHẢI im. Nếu nó kêu ở đây thì nó sẽ kêu oan đúng lần chia ta định làm.
import { useState, useEffect, useCallback, useLayoutEffect } from 'react';
const truocKhiVe = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
function useDoiAB() {
  const [a, datA] = useState(0);
  const [b, datB] = useState('x');
  truocKhiVe(() => { datA(1); }, [b]);
  return { a, datB };
}
export function Tren() {
  const { a, datB } = useDoiAB();
  const bam = useCallback(() => datB('y'), [a]);
  return <div className="tren" onClick={bam}>{String(a)}</div>;
}
export function Duoi() {
  const [c, datC] = useState<number | null>(null);
  useEffect(() => { datC(2); }, []);
  return <span className="duoi">{String(c)}</span>;
}
