// VẬT THỬ «sau khi DỜI TỆP», mảnh 1 — component `Tren` y nguyên, chỉ đổi tệp ở.
import { useState, useEffect, useCallback, useLayoutEffect } from 'react';
const truocKhiVe = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
export function Tren() {
  const [a, datA] = useState(0);
  const [b, datB] = useState('x');
  truocKhiVe(() => { datA(1); }, [b]);
  const bam = useCallback(() => datB('y'), [a]);
  return <div className="tren" onClick={bam}>{String(a)}</div>;
}
