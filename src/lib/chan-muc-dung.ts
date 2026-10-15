import { CAU_HINH } from './cau-hinh';
import { buildServerNotice, type ServerNoticeParams } from './server-notices';

/**
 * Chặn mức dùng — "agent chạy hoang = tiền thật".
 *
 * Hai lớp:
 *   1. Cửa sổ trượt theo phút cho MỖI khách (theo địa chỉ IP).
 *   2. Trần số lượt ĐANG chạy đồng thời cho cả máy chủ.
 *
 * Bộ nhớ trong tiến trình — đủ cho vòng chạy tại máy. Nhiều máy chủ thì
 * phải đổi sang kho dùng chung (Redis…), đã ghi rõ ở README mục "chưa làm".
 */

const soDoLuot = new Map<string, number[]>();
let dangChay = 0;

export type KetQuaChan =
  | { cho_qua: true }
  | {
      cho_qua: false;
      ly_do: string;
      cho_giay: number;
      code: string;
      params: ServerNoticeParams;
      text: string;
    };

export function xinLuot(khach: string): KetQuaChan {
  if (dangChay >= CAU_HINH.tranDongThoi) {
    const notice = buildServerNotice('rate.concurrencyCap', {
      active: dangChay,
      max: CAU_HINH.tranDongThoi,
    });
    return {
      cho_qua: false,
      ly_do: notice.text,
      cho_giay: 5,
      code: notice.code,
      params: notice.params ?? {},
      text: notice.text,
    };
  }

  const bayGio = Date.now();
  const motPhutTruoc = bayGio - 60_000;
  const moc = (soDoLuot.get(khach) ?? []).filter((t) => t > motPhutTruoc);

  if (moc.length >= CAU_HINH.soLuotMoiPhut) {
    const somNhat = Math.min(...moc);
    const choGiay = Math.max(1, Math.ceil((somNhat + 60_000 - bayGio) / 1000));
    soDoLuot.set(khach, moc);
    const notice = buildServerNotice('rate.perMinuteCap', {
      maxPerMin: CAU_HINH.soLuotMoiPhut,
      waitSec: choGiay,
    });
    return {
      cho_qua: false,
      ly_do: notice.text,
      cho_giay: choGiay,
      code: notice.code,
      params: notice.params ?? {},
      text: notice.text,
    };
  }

  moc.push(bayGio);
  soDoLuot.set(khach, moc);
  return { cho_qua: true };
}

export function moLuot(): void {
  dangChay += 1;
}

export function dongLuot(): void {
  dangChay = Math.max(0, dangChay - 1);
}

/** Lấy khoá nhận dạng khách. Sau lưới proxy thì tin x-forwarded-for. */
export function nhanDangKhach(headers: Headers): string {
  const xff = headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return headers.get('x-real-ip') ?? 'may-nay';
}
