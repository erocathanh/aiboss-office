// VẬT THỬ «sau khi DỜI TỆP», mảnh 2 — component `Duoi` y nguyên. Nhập ĐỔI TÊN để thử bí danh nhập.
import { useState, useEffect as chayXong } from 'react';
export function Duoi() {
  const [c, datC] = useState<number | null>(null);
  chayXong(() => { datC(2); }, []);
  return <span className="duoi">{String(c)}</span>;
}
