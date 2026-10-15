import { execFileSync, spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CAU_HINH } from './cau-hinh';
import { ghiSoHuu } from './so-so-huu';

/**
 * Gọi Claude Code ở CHẾ ĐỘ KHÔNG-TƯƠNG-TÁC và đẩy ra từng mẩu trả lời.
 *
 * Bộ cờ bê từ nghiên cứu openclaw (§3-B "CLI backends") rồi siết thêm cho an toàn.
 * Mỗi cờ dưới đây đều đã ĐO THẬT trên máy, không phải chép mò:
 *
 *   --output-format stream-json     mỗi dòng stdout là một JSON → đọc dần được
 *   --include-partial-messages      cho ra `stream_event`/`text_delta` = chảy từng chữ
 *   --verbose                       BẮT BUỘC, thiếu nó stream-json bị chặn
 *   --setting-sources project       ⛔ không nạp hook + CLAUDE.md của cả máy Owner.
 *                                   Đo thật: 0,32 USD → 0,067 USD một lượt.
 *   --strict-mcp-config + --mcp-config {}
 *                                   ⛔ CẮT sạch 13 máy chủ MCP của Owner.
 *                                   Đo thật: thiếu hai cờ này → 180.746 token nạp
 *                                   thừa, MỘT lượt tầm phào tốn 1,08 USD.
 *   --permission-mode dontAsk       ⛔ không bao giờ treo chờ người bấm duyệt
 *   --disallowedTools <danh sách>   vòng này agent THUẦN TRÒ CHUYỆN, ⛔ không tay chân
 *   --max-budget-usd                chốt chặn tiền ngay tầng tiến trình (đã đo: nó CẮT thật)
 *   --resume <mã phiên>             nối mạch hội thoại giữa các lượt
 *
 * ⛔ KHÔNG dùng --bare: nó tuyên bố "OAuth and keychain are never read", tức là
 *    bắt buộc phải có ANTHROPIC_API_KEY. Máy Owner đăng nhập bằng thuê bao
 *    (apiKeySource: "none") ⇒ --bare sẽ làm hỏng xác thực.
 */

/**
 * 🖐 TAY CHÂN — Owner chốt 14/08/2026: *«tôi muốn nó bypass auto mode on giống bạn»*.
 *
 * Trước đó agent bị cấm 26 công cụ ⇒ hỏi "máy tính tôi có gì" thì nó đáp
 * «mình không có công cụ để truy cập hệ thống file hay terminal» — đúng như đã cấu hình,
 * nhưng ⛔ không phải thứ Owner cần.
 *
 * ⚠️ HIỂU CHO ĐÚNG TRƯỚC KHI ĐỔI: mở tay chân = agent **chạy lệnh thật trên máy này**
 * (đọc · ghi · xoá · gọi mạng). Thư mục cách ly `/Users/Shared/phong-ban-ai-ws` chỉ là
 * CHỖ NÓ ĐỨNG, ⛔ KHÔNG phải nhà tù — `cd` ra ngoài là ra được.
 * Chấp nhận được vì: chạy TẠI MÁY, một mình Owner dùng, Owner ngồi ngay đó.
 * 🔴 Điều kiện đó mất đi thì luật này phải đổi theo — xem `CHAN_TAY_CHAN_KHI_MO_RA_NGOAI`.
 */
export const CAM_KHI_HAN_CHE = [
  'Task', 'Bash', 'Edit', 'Write', 'Read', 'Glob', 'Grep',
  'WebFetch', 'WebSearch', 'Skill', 'Monitor', 'NotebookEdit',
  'ToolSearch', 'SendMessage', 'ScheduleWakeup', 'PushNotification',
  'CronCreate', 'CronDelete', 'CronList', 'RemoteTrigger', 'Workflow',
  'TaskCreate', 'TaskUpdate', 'TaskStop', 'EnterWorktree', 'ExitWorktree',
];

/** Where this process learned its bind address, and what it learned. */
type HostDangNghe = { host: string | null; nguon: string };

/**
 * Reads the address this server is ACTUALLY listening on.
 *
 * `-H` is a command-line FLAG, not an env var. Measured 11/09/2026 on next 15.5.4:
 * `next start` parses that flag inside its OWN process (next-start.js spawns no child)
 * and rewrites only `process.title`, never `process.argv`. So argv is the honest source.
 * That title rewrite is also why `ps` shows "next-server (v15.5.4)" and tells you
 * nothing about -H: reading the process list here would measure the wrong thing.
 *
 * 🕳 ROUND 2, 12/09/2026 — the reviewer (gemini-aiboss-app-review) rejected round 1 and it was
 *    right: reading `HOST` let anyone LIE to this brake. Measured on next 15.5.4:
 *
 *      `grep env.HOST` in next/dist            -> 0 hits   (positive control: env.PORT 14 hits)
 *      HOST=127.0.0.1 npx next start           -> argv has no -H, so Next binds its default `::`
 *                                                 while this function would answer "127.0.0.1"
 *      => brake OFF at the exact moment the app is open to the network.
 *
 * 🔴 And the SAME hole exists for `HOSTNAME`, which the reviewer's recommendation would have kept.
 *    Measured the same way: `HOSTNAME=127.0.0.1 npx next start` -> argv still has no -H, Next still
 *    binds `::`. Next only honours HOSTNAME inside the STANDALONE server it generates
 *    (build/utils.js writes `process.env.HOSTNAME || '0.0.0.0'` into that file), and this app has
 *    no `output: 'standalone'` and no `.next/standalone` directory. So here HOSTNAME is a lie too.
 *
 * ⇒ ONE source only: the `-H` / `--hostname` flag in `process.argv`. Anything else means nobody
 *   declared a host, which means Node's default: every interface. That reads as EXTERNAL.
 *   If this app ever ships a standalone build, this function must be revisited — but the failure
 *   direction is safe: a standalone server.js has no -H, so the brake would over-restrict, not
 *   under-restrict.
 */
export function hostDangNghe(argv: string[] = process.argv): HostDangNghe {
  for (let i = 0; i < argv.length; i += 1) {
    const co = argv[i] ?? '';
    if ((co === '-H' || co === '--hostname') && typeof argv[i + 1] === 'string') {
      return { host: argv[i + 1], nguon: 'cờ dòng lệnh' };
    }
    const gan = /^--hostname=(.+)$/.exec(co);
    if (gan && gan[1]) return { host: gan[1], nguon: 'cờ dòng lệnh' };
  }
  return { host: null, nguon: 'không ai khai' };
}

/** Addresses that mean "this machine only". Everything else is reachable from outside. */
const CHI_MAY_NAY = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * True when this server can be reached from outside this machine.
 *
 * 🔴 "Nobody declared a host" is NOT local. Measured 11/09/2026: `server.listen(port)`
 *    with no address binds `::`, i.e. every interface. The old line read that empty
 *    case as local, which is backwards — it handed out full tools in exactly the
 *    configuration the brake existed to catch.
 */
export function ngheRaNgoai(argv: string[] = process.argv): boolean {
  const { host } = hostDangNghe(argv);
  if (host === null) return true;
  return !CHI_MAY_NAY.has(host.trim().toLowerCase());
}

/**
 * 🔒 CHẾ ĐỘ TERMINAL — mặc định TẮT để mọi ghế chạy trong ngữ cảnh cô lập.
 * Chỉ bật khi đặt tường minh `AIBOSS_SEAT_TERMINAL_MODE=1`.
 * (S17b F1: đã loại bỏ hoàn toàn biến cũ `GIONG_TERMINAL`).
 */
export function chayNhuTerminal(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AIBOSS_SEAT_TERMINAL_MODE === '1';
}

export const GIONG_TERMINAL = chayNhuTerminal();

/**
 * Tìm gốc kho aiboss-office từ một thư mục bất kỳ (đi ngược lên tìm config/office.json hoặc data/seats.json).
 */
export function findOfficeRootFromDir(startDir?: string): string {
  if (process.env.AIBOSS_OFFICE_ROOT && fs.existsSync(process.env.AIBOSS_OFFICE_ROOT)) {
    return path.resolve(process.env.AIBOSS_OFFICE_ROOT);
  }
  let cur = path.resolve(startDir || process.cwd());
  while (true) {
    if (
      fs.existsSync(path.join(cur, 'config', 'office.json')) ||
      fs.existsSync(path.join(cur, 'data', 'seats.json'))
    ) {
      return cur;
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return path.resolve(process.cwd());
}

/**
 * Resolves the MCP config argument for a seat turn.
 * If the seat is listed in data/seats.json and its generated .mcp.json exists, returns that file path.
 * If the seat is unlisted or missing, returns an empty MCP config '{"mcpServers":{}}'.
 */
export function resolveSeatMcpConfig(maNhanSu?: string | null, thuMuc?: string, repoRoot?: string): string {
  const emptyMcp = '{"mcpServers":{}}';
  try {
    const baseRoot = repoRoot ? path.resolve(repoRoot) : findOfficeRootFromDir(thuMuc);
    const seatsFile = path.join(baseRoot, 'data', 'seats.json');
    if (!fs.existsSync(seatsFile)) return emptyMcp;
    const raw = fs.readFileSync(seatsFile, 'utf8');
    const seats = JSON.parse(raw) as Array<{ seat_id?: string; dir?: string; mcp?: string[] }>;
    if (!Array.isArray(seats)) return emptyMcp;

    let matchedSeat: { seat_id?: string; dir?: string; mcp?: string[] } | undefined;
    if (maNhanSu) {
      matchedSeat = seats.find((s) => s && s.seat_id === maNhanSu);
    } else if (thuMuc) {
      const resolvedThuMuc = path.resolve(thuMuc);
      matchedSeat = seats.find((s) => s && s.dir && path.resolve(baseRoot, s.dir) === resolvedThuMuc);
    }

    if (!matchedSeat || !matchedSeat.dir) return emptyMcp;
    if (Array.isArray(matchedSeat.mcp) && matchedSeat.mcp.length === 0) return emptyMcp;

    const mcpPath = path.resolve(baseRoot, matchedSeat.dir, '.mcp.json');
    if (fs.existsSync(mcpPath)) {
      return mcpPath;
    }
    return emptyMcp;
  } catch {
    return emptyMcp;
  }
}

/**
 * Phanh mạng fail-closed (F6): khi không bật chế độ terminal và máy chủ nghe ra ngoài
 * (hoặc chạy không có cờ `-H` / `--hostname` thuộc localhost/127.0.0.1/::1), cấm 26 công cụ.
 */
export const CONG_CU_CAM: string[] = (!GIONG_TERMINAL && ngheRaNgoai()) ? CAM_KHI_HAN_CHE : [];

{
  const { host, nguon } = hostDangNghe();
  const ep = process.env.AIBOSS_SEAT_TERMINAL_MODE;
  const lyDo = ep === '1' || ep === '0'
    ? `AIBOSS_SEAT_TERMINAL_MODE=${ep} (Owner override)`
    : `${ngheRaNgoai() ? 'nghe ra ngoài' : 'chỉ máy này'} — host «${host ?? 'rỗng'}» từ ${nguon}`;
  console.log(
    `[chay-agent] giọng terminal: ${GIONG_TERMINAL ? 'BẬT' : 'TẮT'}`
    + ` · lý do: ${lyDo} · số công cụ bị cấm: ${CONG_CU_CAM.length}`,
  );
}

import {
  buildServerNotice,
  classifyAgentError,
  type ServerNoticeParams,
  type ServerNoticePayload,
} from './server-notices';

export type MauTraLoi =
  | { loai: 'phien'; ma_phien: string }
  | { loai: 'chu'; chu: string }
  | { loai: 'xong'; ma_phien: string; chi_phi_usd: number | null; token: number | null; rawResult?: Record<string, unknown> }
  | {
      loai: 'loi';
      thong_diep: string;
      code?: string;
      params?: ServerNoticeParams;
      text?: string;
    };

export interface ThamSoChay {
  cauHoi: string;
  maPhienCu?: string | null;
  loiDan?: string;
  tinHieuHuy?: AbortSignal;
  /**
   * 🔌 CHẠY NỀN — người xem rời đi thì việc VẪN CHẠY TỚI HẾT.
   * Bật cờ này ⇒ ⛔ KHÔNG giết tiến trình khi luồng xem đóng.
   * Chỉ nút DỪNG (qua `/api/dung`) mới được giết. Xem `kho-tien-trinh.ts`.
   */
  chayNen?: boolean;
  /**
   * 🖐 Báo TAY CẦM ra ngoài NGAY khi sinh, để ghi sổ tiến trình.
   *
   * 🔴 ĐỔI 02/09/2026: trước đây chuyền `pid: number`. Đó là DÒNG SINH RA CẢ NGÀY HÔM ĐÓ —
   *    ta có sẵn tay cầm và vứt nó đi để chuyền một con số, rồi xây bốn lớp dấu vân để đoán
   *    lại thứ vừa vứt. Owner dừng lại và bắt quay đầu.
   * 🔑 Chuyền tay cầm thì bên nhận KHÔNG phải hỏi «con số này còn là con của tôi KHÔNG» nữa —
   *    câu đó biến mất, chứ KHÔNG phải được trả lời tốt hơn.
   */
  khiSinh?: (tien: ChildProcess) => void;
  /**
   * ⚰️ Báo ra ngoài LÚC TIẾN TRÌNH CON CHẾT THẬT — đối xứng với `khiSinh`.
   *
   * 🕳 VÌ SAO CÓ (02/09/2026, P0 «sổ phải nói đúng»): sổ tiến trình đang được xoá ở
   *    `finally` của đường SSE, tức lúc NGƯỜI XEM rời đi — KHÔNG phải lúc việc xong.
   *    Mà `chayNen: true` cố ý để con sống tiếp. Hai điều đó cộng lại ⇒ con CHẠY THẬT
   *    mà sổ khai RẢNH ⇒ nút Dừng biến mất cho một ghế đang tiêu tiền.
   * 🔑 `close` của tiến trình con là tín hiệu DUY NHẤT trả lời đúng câu «việc xong chưa».
   *    Mọi tín hiệu khác (luồng xem đóng · vòng lặp thoát · người xem rời) chỉ trả lời
   *    câu «ĐƯỜNG XEM còn KHÔNG» — một câu khác hẳn.
   * 📌 Đo được cùng ngày: sổ khai 0 ô chạy trong khi hai tiến trình con đang sống,
   *    và một dòng khác trỏ tới pid đã chết. Sổ lệch CẢ HAI CHIỀU, nên đây là lỗi
   *    VÒNG ĐỜI, KHÔNG phải chuyện trễ một nhịp.
   */
  khiChet?: (tien: ChildProcess, ma: number | null, signal?: string | null) => void;
  /** Thư mục làm việc RIÊNG của nhân sự — quyết định phiên nằm ở kho nào. */
  thuMuc: string;
  /**
   * 🏷 GHẾ nào đang chạy lượt này — dùng để ghi SỔ SỞ HỮU PHIÊN (`so-so-huu.ts`).
   *
   * TUỲ CHỌN, và cố ý để tuỳ chọn: đường Owner GÕ TRONG Ô (`api/chat/route.ts`) hiện CHƯA
   * truyền nó xuống, vì tệp đó đang giữ bản vá round-16 bị bác và PM KHÔNG mở ở vòng này.
   * ⇒ Thiếu nó thì sổ ghi chủ là `null` (CHƯA RÕ), và việc chính chạy y như cũ.
   * 🔴 ĐỪNG suy ghế từ `thuMuc` để lấp chỗ này — sáu ghế dùng chung một thư mục, xem lời
   *    cảnh báo dài ở đầu `so-so-huu.ts`.
   */
  maNhanSu?: string | null;
}

/**
 * Classifies raw Claude CLI error output into a structured notice `{ code, params, text }`.
 * Client UI resolves `code` + `params` into the active UI language (`en` or `vi`).
 */
export function dichLoi(tho: string): ServerNoticePayload {
  return classifyAgentError(tho, 'en');
}

/**
 * F2 (S17b): Tính danh sách loại trừ CLAUDE.md theo tổ tiên thực của REPO_ROOT và HOME,
 * thay vì mẫu glob theo độ sâu hoặc toàn cục.
 * Đảm bảo `<REPO_ROOT>/CLAUDE.md` và `<REPO_ROOT>/.claude/...` KHÔNG BAO GIỜ nằm trong danh sách loại trừ.
 */
export function buildClaudeMdExcludes(options?: { repoRoot?: string; homeDir?: string }): string[] {
  const rawRepoRoot = options?.repoRoot ?? process.cwd();
  const rawHomeDir = options?.homeDir ?? (process.env.HOME || os.homedir());

  const resolvedRepo = path.resolve(rawRepoRoot);
  let realRepo = resolvedRepo;
  try {
    realRepo = fs.realpathSync(resolvedRepo);
  } catch {}

  const resolvedHome = path.resolve(rawHomeDir);
  let realHome = resolvedHome;
  try {
    realHome = fs.realpathSync(resolvedHome);
  } catch {}

  const repoRoots = new Set([resolvedRepo, realRepo]);
  const isRepoOrInsideRepo = (dirPath: string): boolean => {
    const norm = path.resolve(dirPath);
    for (const r of repoRoots) {
      if (norm === r || norm.startsWith(r + path.sep)) return true;
    }
    return false;
  };

  const excludes = new Set<string>();
  const addAncestorExcludes = (ancestor: string) => {
    if (isRepoOrInsideRepo(ancestor)) return;
    const prefix = ancestor === path.sep ? '' : ancestor.replace(/\/+$/, '');
    excludes.add(`${prefix}/CLAUDE.md`);
    excludes.add(`${prefix}/.claude/CLAUDE.md`);
    excludes.add(`${prefix}/.claude/rules/**`);
  };

  // 1. Từ HOME (cả resolved và realpath nếu khác)
  for (const h of new Set([resolvedHome, realHome])) {
    if (!h) continue;
    addAncestorExcludes(h);
    const projectsDir = path.join(h, 'Projects');
    if (!isRepoOrInsideRepo(projectsDir)) {
      excludes.add(`${projectsDir}/CLAUDE.md`);
    }
  }

  // 2. Đi ngược mọi thư mục cha nghiêm ngặt của REPO_ROOT tới `/` (không bao gồm chính REPO_ROOT)
  for (const startRoot of repoRoots) {
    let cur = path.dirname(startRoot);
    while (cur && cur !== startRoot) {
      addAncestorExcludes(cur);
      const parent = path.dirname(cur);
      if (parent === cur) break;
      cur = parent;
    }
  }

  // Chốt chặn cuối: lọc bỏ bất kỳ mẫu nào vô tình trỏ vào REPO_ROOT/CLAUDE.md hoặc REPO_ROOT/.claude/**
  return Array.from(excludes).filter((pattern) => {
    for (const r of repoRoots) {
      if (pattern === `${r}/CLAUDE.md` || pattern.startsWith(`${r}/.claude/`)) {
        return false;
      }
    }
    return true;
  });
}

export function buildClaudeSeatSettingsJson(options?: { repoRoot?: string; homeDir?: string }): string {
  return JSON.stringify({
    autoMemoryEnabled: false,
    claudeMdExcludes: buildClaudeMdExcludes(options),
  });
}

export const SEAT_ISOLATION_SETTINGS_JSON = buildClaudeSeatSettingsJson();

/**
 * F3b (S17b) & F13 (S17c): Danh sách trắng biến môi trường được phép truyền xuống tiến trình con Claude.
 * Tuyệt đối KHÔNG truyền nguyên `process.env` và KHÔNG truyền `AIBOSS_DISABLE_HOOK_2_1` hay `AIBOSS_TEST_MODE`.
 * F13: giữ các biến proxy tiêu chuẩn (cả chữ hoa và chữ thường) cho máy phụ thuộc корпоративный/local proxy.
 */
export const CLAUDE_SEAT_ENV_WHITELIST = [
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'TMPDIR',
  'LANG',
  'TERM',
  'TZ',
  'NODE_ENV',
  'SSH_AUTH_SOCK',
  'SECURITYSESSIONID',
  '__CF_USER_TEXT_ENCODING',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'NODE_EXTRA_CA_CERTS',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
  'all_proxy',
  'CLAUDE_CONFIG_DIR',
  'ANTHROPIC_API_KEY',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'AIBOSS_DATA_DIR',
  'AIBOSS_CONFIG_DIR',
  'AIBOSS_OFFICE_CONFIG_PATH',
  'AIBOSS_OFFICE_ROOT',
  'AIBOSS_AGENT_BROKER_MCP_SCRIPT',
  'MCP_HOP_THU_DIR',
  'AIBOSS_SEAT_TERMINAL_MODE',
] as const;

const TEST_ONLY_ENV_KEYS = [
  'DUONG_DAN_CLAUDE',
  'TEST_MOCK_CLAUDE_MODE',
  'TEST_MOCK_SESSION_ID',
  'TEST_MOCK_READY_FILE',
  'TEST_MOCK_RELEASE_FILE',
] as const;

export function buildClaudeSeatEnv(
  sourceEnv: NodeJS.ProcessEnv = process.env,
  repoRoot?: string
): NodeJS.ProcessEnv {
  const cleanEnv: Record<string, string | undefined> = {};
  const allowedSet = new Set<string>(CLAUDE_SEAT_ENV_WHITELIST);
  if (sourceEnv.NODE_ENV !== 'production') {
    for (const k of TEST_ONLY_ENV_KEYS) allowedSet.add(k);
  }

  const baseRoot = safeRealpath(repoRoot ?? sourceEnv.AIBOSS_OFFICE_ROOT ?? findOfficeRootFromDir());

  for (const [key, val] of Object.entries(sourceEnv)) {
    if (val === undefined) continue;
    if (key === 'AIBOSS_DISABLE_HOOK_2_1' || key === 'AIBOSS_TEST_MODE') continue;
    if (key === 'MCP_HOP_THU_DIR') {
      const trimmed = String(val).trim();
      if (!trimmed) continue;
      const realCandidate = safeRealpath(path.resolve(baseRoot, trimmed));
      const rel = path.relative(baseRoot, realCandidate);
      if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
        continue;
      }
      cleanEnv[key] = val;
      continue;
    }
    if (
      allowedSet.has(key) ||
      key.startsWith('LC_') ||
      key.startsWith('XDG_') ||
      (sourceEnv.NODE_ENV !== 'production' && key.startsWith('FAKE_CLAUDE_'))
    ) {
      cleanEnv[key] = val;
    }
  }
  return cleanEnv as NodeJS.ProcessEnv;
}

import {
  escapeSeatSettingsGlobPath,
  REQUIRED_ANCHORED_DENY_SUFFIXES,
} from './seat-settings-anchor';

export { escapeSeatSettingsGlobPath };

function safeRealpath(targetPath: string): string {
  const resolved = path.resolve(targetPath);
  try {
    return fs.realpathSync(resolved);
  } catch {
    let cur = resolved;
    const tail: string[] = [];
    while (cur !== path.dirname(cur)) {
      try {
        const realCur = fs.realpathSync(cur);
        return path.join(realCur, ...tail.reverse());
      } catch {
        tail.push(path.basename(cur));
        cur = path.dirname(cur);
      }
    }
    return resolved;
  }
}

export interface SeatSettingsAnchorInput {
  thuMuc?: string;
  seatDir?: string;
  maNhanSu?: string | null;
  repoRoot?: string;
  autoRegenerate?: boolean;
  /**
   * F22 (S17e): Explicit opt-in for directories outside an AIBOSS Office repository.
   * When omitted or false, verifySeatSettingsRootAnchor fails closed if the seat is
   * neither registered in data/seats.json nor has a valid .claude/settings.json, and
   * always requires the root .claude/settings.json to exist and match.
   */
  allowNonOfficeDir?: boolean;
}

export interface SeatSettingsAnchorVerification {
  valid: boolean;
  reason?: string;
  checkedFiles: string[];
  mismatchedRules: string[];
}

export function truncateUtf8Bytes(input: string, maxBytes = 2048): string {
  const str = String(input ?? '');
  if (maxBytes <= 0) return '';
  if (Buffer.byteLength(str, 'utf8') <= maxBytes) return str;
  let out = '';
  let usedBytes = 0;
  for (const codePoint of str) {
    const cpBytes = Buffer.byteLength(codePoint, 'utf8');
    if (usedBytes + cpBytes > maxBytes) break;
    out += codePoint;
    usedBytes += cpBytes;
  }
  return out;
}

/**
 * F7b (S17c), F14/F18 (S17d) & F22 (S17e): Kiểm tra mọi quy tắc deny tuyệt đối (`Edit(//...)`, `Write(//...)`, `Read(//...)`)
 * trong `.claude/settings.json` của ghế và gốc kho phải bắt đầu bằng `//<REPO_ROOT thật>/` (dùng chung bộ escape với
 * `gen-seat-files.mjs`, nhận diện ghế/root theo cả `path.resolve` và `realpath`, luôn kiểm `rootSettingsPath`,
 * và fail-closed `seat_unregistered_or_missing_settings` khi ghế chưa đăng ký + thiếu settings).
 */
export function verifySeatSettingsRootAnchor(
  thuMucOrInput: string | SeatSettingsAnchorInput,
  repoRootArg?: string,
  options?: { allowNonOfficeDir?: boolean }
): SeatSettingsAnchorVerification {
  const thuMuc =
    typeof thuMucOrInput === 'string'
      ? thuMucOrInput
      : String(thuMucOrInput?.thuMuc ?? thuMucOrInput?.seatDir ?? '');
  const explicitRepoRoot =
    typeof thuMucOrInput === 'string' ? repoRootArg : (thuMucOrInput?.repoRoot ?? repoRootArg);
  const allowNonOfficeDir =
    typeof thuMucOrInput === 'object' && thuMucOrInput !== null && 'allowNonOfficeDir' in thuMucOrInput
      ? thuMucOrInput.allowNonOfficeDir === true
      : options?.allowNonOfficeDir === true;

  const resolvedThuMuc = path.resolve(thuMuc);
  const realThuMuc = safeRealpath(resolvedThuMuc);
  const resolvedRoot = path.resolve(explicitRepoRoot ?? findOfficeRootFromDir(resolvedThuMuc));
  const realRoot = safeRealpath(resolvedRoot);
  const thuMucRoot = path.resolve(findOfficeRootFromDir(resolvedThuMuc));

  const candidateRoots = [resolvedRoot, realRoot, thuMucRoot];
  if (realRoot.startsWith('/private/tmp/') || realRoot === '/private/tmp') {
    candidateRoots.push(realRoot.slice('/private'.length));
  }
  if (realRoot.startsWith('/private/var/') || realRoot === '/private/var') {
    candidateRoots.push(realRoot.slice('/private'.length));
  }
  const verifiedAliasRoots = candidateRoots.filter((c) => safeRealpath(c) === realRoot);
  const allowedAnchorPrefixes = Array.from(
    new Set(verifiedAliasRoots.map((c) => `//${escapeSeatSettingsGlobPath(c)}/`))
  );

  const seatSettingsPath = path.join(resolvedThuMuc, '.claude', 'settings.json');
  const rootSettingsPath = path.join(resolvedRoot, '.claude', 'settings.json');

  let isRegisteredSeat = false;
  try {
    const seatsJsonPath = path.join(resolvedRoot, 'data', 'seats.json');
    if (fs.existsSync(seatsJsonPath)) {
      const parsedSeats = JSON.parse(fs.readFileSync(seatsJsonPath, 'utf8')) as
        | Array<{ dir?: string; seatPath?: string }>
        | { seats?: Array<{ dir?: string; seatPath?: string }> };
      const seatsList = Array.isArray(parsedSeats)
        ? parsedSeats
        : Array.isArray(parsedSeats?.seats)
          ? parsedSeats.seats
          : [];
      isRegisteredSeat = seatsList.some((s) => {
        const relDir = s?.seatPath || s?.dir;
        if (!relDir) return false;
        const candidateResolved = path.resolve(resolvedRoot, relDir);
        const candidateReal = safeRealpath(path.resolve(realRoot, relDir));
        return (
          candidateResolved === resolvedThuMuc ||
          candidateReal === realThuMuc ||
          candidateResolved === realThuMuc ||
          candidateReal === resolvedThuMuc
        );
      });
    }
  } catch {}

  const seatSettingsExists = fs.existsSync(seatSettingsPath);
  const rootSettingsExists = fs.existsSync(rootSettingsPath);

  if (!isRegisteredSeat && !seatSettingsExists) {
    if (!allowNonOfficeDir) {
      const attemptedFiles =
        rootSettingsPath !== seatSettingsPath
          ? [seatSettingsPath, rootSettingsPath]
          : [seatSettingsPath];
      return {
        valid: false,
        reason: `seat_unregistered_or_missing_settings: seat directory ${resolvedThuMuc} is not registered in data/seats.json and is missing ${seatSettingsPath}`,
        checkedFiles: attemptedFiles,
        mismatchedRules: [
          `<unregistered_or_missing:${seatSettingsPath}>`,
          ...(rootSettingsExists ? [] : [`<missing:${rootSettingsPath}>`]),
        ],
      };
    }
    if (!rootSettingsExists) {
      return {
        valid: true,
        reason: 'non_office_dir_allowed',
        checkedFiles: [],
        mismatchedRules: [],
      };
    }
  }

  const filesToCheck: string[] = [];
  if (isRegisteredSeat || seatSettingsExists) {
    filesToCheck.push(seatSettingsPath);
  }
  if (rootSettingsPath !== seatSettingsPath && !filesToCheck.includes(rootSettingsPath)) {
    filesToCheck.push(rootSettingsPath);
  }

  const mismatchedRules: string[] = [];
  for (const settingsFile of filesToCheck) {
    if (!fs.existsSync(settingsFile)) {
      return {
        valid: false,
        reason: `seat_settings_root_mismatch: missing settings file ${settingsFile}`,
        checkedFiles: filesToCheck,
        mismatchedRules: [`<missing:${settingsFile}>`],
      };
    }

    let parsed: { permissions?: { deny?: unknown } };
    try {
      parsed = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    } catch {
      return {
        valid: false,
        reason: `seat_settings_root_mismatch: invalid JSON in ${settingsFile}`,
        checkedFiles: filesToCheck,
        mismatchedRules: [`<invalid_json:${settingsFile}>`],
      };
    }

    const denyList = Array.isArray(parsed?.permissions?.deny)
      ? (parsed.permissions.deny as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];

    const absRules = denyList.filter((r) => /^(?:Edit|Write|Read)\(\/\//.test(r));
    if (absRules.length === 0) {
      mismatchedRules.push(`${settingsFile}:<no_absolute_deny_rules>`);
      continue;
    }

    for (const rule of absRules) {
      const openIdx = rule.indexOf('(//');
      const innerPath = openIdx >= 0 ? rule.slice(openIdx + 1, -1) : '';
      const matchesPrefix = allowedAnchorPrefixes.some((prefix) => innerPath.startsWith(prefix));
      if (!matchesPrefix) {
        mismatchedRules.push(rule);
      }
    }

    for (const suffix of REQUIRED_ANCHORED_DENY_SUFFIXES) {
      const hasRequired = allowedAnchorPrefixes.some((prefix) =>
        denyList.includes(`Edit(${prefix}${suffix})`)
      );
      if (!hasRequired) {
        mismatchedRules.push(`${settingsFile}:missing:Edit(${allowedAnchorPrefixes[0]}${suffix})`);
      }
    }
  }

  if (mismatchedRules.length > 0) {
    return {
      valid: false,
      reason: `seat_settings_root_mismatch: anchored deny rules do not match repo root ${resolvedRoot}`,
      checkedFiles: filesToCheck,
      mismatchedRules,
    };
  }

  return {
    valid: true,
    checkedFiles: filesToCheck,
    mismatchedRules: [],
  };
}

const SEAT_SETTINGS_REMEDIATION_HINT =
  'Kiểm quyền ghi tại .claude/settings.json và departments/**/.claude/settings.json, sau đó chạy: node operations/scripts/gen-seat-files.mjs --check';

/**
 * F7b (S17c) & F17 (S17d): Kiểm tra neo settings ghế trước khi spawn; nếu lệch thì thử sinh lại tại chỗ
 * từ `operations/scripts/gen-seat-files.mjs` rồi kiểm lại; nếu vẫn lệch thì ném lỗi `seat_settings_root_mismatch`
 * kèm stderr của bộ sinh (cắt tối đa 2 KB) và hướng dẫn xử lý quyền ghi (fail-closed).
 */
export function ensureSeatSettingsAnchored(
  thuMucOrInput: string | SeatSettingsAnchorInput,
  repoRootArg?: string,
  options?: { autoRegenerate?: boolean }
): SeatSettingsAnchorVerification {
  const thuMuc =
    typeof thuMucOrInput === 'string'
      ? thuMucOrInput
      : String(thuMucOrInput?.thuMuc ?? thuMucOrInput?.seatDir ?? '');
  const explicitRepoRoot =
    typeof thuMucOrInput === 'string' ? repoRootArg : (thuMucOrInput?.repoRoot ?? repoRootArg);
  const resolvedRoot = path.resolve(explicitRepoRoot ?? findOfficeRootFromDir(thuMuc));
  const firstCheck = verifySeatSettingsRootAnchor(thuMuc, resolvedRoot);
  if (firstCheck.valid) return firstCheck;

  const allowAutoRegen =
    typeof thuMucOrInput === 'object' && thuMucOrInput !== null && 'autoRegenerate' in thuMucOrInput
      ? thuMucOrInput.autoRegenerate !== false
      : options?.autoRegenerate !== false;

  let regenStderr = '';
  if (allowAutoRegen) {
    const genScriptPath = path.join(resolvedRoot, 'operations', 'scripts', 'gen-seat-files.mjs');
    const seatsJsonPath = path.join(resolvedRoot, 'data', 'seats.json');
    if (fs.existsSync(genScriptPath) && fs.existsSync(seatsJsonPath)) {
      try {
        execFileSync(process.execPath, [genScriptPath], {
          cwd: resolvedRoot,
          env: { ...process.env, AIBOSS_OFFICE_ROOT: resolvedRoot },
          stdio: ['ignore', 'pipe', 'pipe'],
          encoding: 'utf8',
        });
      } catch (err: unknown) {
        const rawErr =
          err && typeof err === 'object' && 'stderr' in err && err.stderr
            ? String((err as { stderr?: unknown }).stderr)
            : err instanceof Error
              ? err.message
              : String(err);
        regenStderr = truncateUtf8Bytes(rawErr.trim(), 2048);
      }
      const secondCheck = verifySeatSettingsRootAnchor(thuMuc, resolvedRoot);
      if (secondCheck.valid) return secondCheck;
      const stderrDetail = regenStderr ? ` | gen-seat-files stderr: ${regenStderr}` : '';
      throw new Error(
        `${secondCheck.reason ?? 'seat_settings_root_mismatch'} (${secondCheck.mismatchedRules.slice(0, 4).join(', ')})${stderrDetail} — ${SEAT_SETTINGS_REMEDIATION_HINT}`
      );
    }
  }

  throw new Error(
    `${firstCheck.reason ?? 'seat_settings_root_mismatch'} (${firstCheck.mismatchedRules.slice(0, 4).join(', ')}) — ${SEAT_SETTINGS_REMEDIATION_HINT}`
  );
}

export interface ThamSoDungDoiSoClaude {
  thuMuc: string;
  maNhanSu?: string | null;
  outputFormat?: 'stream-json' | 'json';
  maPhienCu?: string | null;
  forkSession?: boolean;
  loiDan?: string;
  argv?: string[];
  env?: NodeJS.ProcessEnv;
  repoRoot?: string;
  autoRegenerateSettings?: boolean;
}

/**
 * F1b (S17b): Hàm dựng đối số dùng chung cho MỌI điểm gọi `claude` (runner, chat, fork).
 */
export function buildClaudeSeatArgv(ts: ThamSoDungDoiSoClaude): string[] {
  const env = ts.env ?? process.env;
  const argv = ts.argv ?? process.argv;
  const giongTerminal = chayNhuTerminal(env);
  const hanCheMangNgoai = !giongTerminal && ngheRaNgoai(argv);
  const congCuCam = hanCheMangNgoai ? CAM_KHI_HAN_CHE : [];
  const repoRoot = ts.repoRoot ? path.resolve(ts.repoRoot) : findOfficeRootFromDir(ts.thuMuc);
  const mcpConfigArg = resolveSeatMcpConfig(ts.maNhanSu, ts.thuMuc, repoRoot);
  const settingsJson = buildClaudeSeatSettingsJson({ repoRoot, homeDir: env.HOME || os.homedir() });
  const outputFormat = ts.outputFormat ?? 'stream-json';

  const doiSo: string[] = [
    '-p',
    '--output-format', outputFormat,
    ...(outputFormat === 'stream-json' ? ['--include-partial-messages', '--verbose'] : []),
    // 🔑 S17 + S17b: Cô lập ngữ cảnh ghế mặc định (`!giongTerminal`):
    //    - `--setting-sources project`: không nạp ~/.claude/settings.json cấp máy
    //    - `--settings`: chặn Claude Code đi ngược cây thư mục nạp CLAUDE.md cấp cha ngoài repo
    //    - `--strict-mcp-config --mcp-config`: chỉ nạp MCP đã khai của ghế (agent-broker)
    //    - `--disable-slash-commands`: không nạp bộ lệnh gạch chéo cấp máy
    ...(giongTerminal
      ? []
      : [
          '--setting-sources', 'project',
          '--settings', settingsJson,
          '--strict-mcp-config', '--mcp-config', mcpConfigArg,
          '--disable-slash-commands',
        ]),
    '--permission-mode', hanCheMangNgoai ? 'dontAsk' : 'bypassPermissions',
    '--model', CAU_HINH.moHinh,
    '--effort', CAU_HINH.mucNoLuc,
    ...(CAU_HINH.tranTienMoiLuot > 0
      ? ['--max-budget-usd', String(CAU_HINH.tranTienMoiLuot)]
      : []),
  ];

  if (ts.maPhienCu) {
    doiSo.push('--resume', ts.maPhienCu);
  }
  if (ts.forkSession) {
    doiSo.push('--fork-session');
  }
  if (ts.loiDan) {
    doiSo.push('--append-system-prompt', ts.loiDan);
  }
  if (congCuCam.length) {
    doiSo.push('--disallowedTools', ...congCuCam);
  }

  return doiSo;
}

/**
 * F1b & F3b (S17b) & F7b (S17c): Điểm spawn `claude` DUY NHẤT trong toàn bộ mã nguồn `src/`.
 * Luôn kiểm tra neo `.claude/settings.json` theo gốc kho thật trước khi spawn (fail-closed nếu lệch),
 * và đi qua `buildClaudeSeatArgv` cùng `buildClaudeSeatEnv`.
 */
export function spawnClaudeSeatProcess(ts: ThamSoDungDoiSoClaude): {
  tien: ChildProcessWithoutNullStreams;
  doiSo: string[];
  env: NodeJS.ProcessEnv;
} {
  fs.mkdirSync(ts.thuMuc, { recursive: true });
  const repoRoot = ts.repoRoot ? path.resolve(ts.repoRoot) : findOfficeRootFromDir(ts.thuMuc);
  ensureSeatSettingsAnchored(ts.thuMuc, repoRoot, {
    autoRegenerate: ts.autoRegenerateSettings,
  });
  const doiSo = buildClaudeSeatArgv({ ...ts, repoRoot });
  const env = buildClaudeSeatEnv(ts.env ?? process.env, repoRoot);
  const tien = spawn(CAU_HINH.lenhClaude, doiSo, {
    cwd: ts.thuMuc,
    stdio: ['pipe', 'pipe', 'pipe'],
    env,
  });
  return { tien, doiSo, env };
}

export async function* chayAgent(ts: ThamSoChay): AsyncGenerator<MauTraLoi> {
  // spawn KHÔNG qua shell + câu hỏi đi bằng stdin qua điểm gọi dùng chung
  const { tien } = spawnClaudeSeatProcess({
    thuMuc: ts.thuMuc,
    maNhanSu: ts.maNhanSu,
    outputFormat: 'stream-json',
    maPhienCu: ts.maPhienCu,
    loiDan: ts.loiDan,
  });

  /**
   * ⏱️ Đồng hồ đo **IM LẶNG**, ⛔ KHÔNG đo tổng thời gian sống.
   *
   * 🔴 Ca thật 14/08 (đo tại bản ghi ghế `claude-eroca-boss`): hai lượt KHÁC ĐỀ TÀI
   *    — một lượt gọi kỹ năng mở kênh, một lượt là câu MỞ MÀN kịch bản quay — cùng
   *    chết ở **117 giây**. Đó là dấu vân tay của một cái đồng hồ, ⛔ không phải của
   *    công cụ nào cả. Bản cũ hẹn cứng `setTimeout(kill, hanGio)` đếm từ lúc sinh
   *    tiến trình, ⛔ không cần biết ghế đang tuôn chữ hay đã treo — quá 2 phút là chém.
   * 📌 Ghế chạy `opus` + `--effort max` + nạp trọn CLAUDE.md/hook/MCP thì một lượt
   *    "rà tình hình" ăn hàng phút là BÌNH THƯỜNG; chính kịch bản quay ghi *«mỗi ô
   *    mất 30 giây–3 phút»*. Trần cứng 2 phút biến việc-chạy-đúng thành lỗi.
   * ⇒ Còn nhả chữ thì còn sống. Chỉ chém khi **tắt tiếng** quá lâu (= treo thật).
   */
  let biCatVIImLang = false;
  let donGio: ReturnType<typeof setTimeout> | undefined;
  const datLaiDongHo = () => {
    clearTimeout(donGio);
    donGio = setTimeout(() => {
      biCatVIImLang = true;
      tien.kill('SIGTERM');
    }, CAU_HINH.hanGio);
  };
  datLaiDongHo();

  const huy = () => tien.kill('SIGTERM');
  ts.tinHieuHuy?.addEventListener('abort', huy);
  /**
   * 🔴 CHỐT `if (tien.pid)` GIỮ NGUYÊN — @app-pm ghi thành dòng ĐỎ trong đề bài sau khi tôi đo.
   *
   * 🕳 Nó đang che một ca THẬT, và đề bài bản đầu KHÔNG nhắc tới nó nên người làm theo CHỮ sẽ
   *    bỏ mất: spawn một lệnh KHÔNG tồn tại ⇒ `pid = undefined` · `exitCode = null` ·
   *    `signalCode = null` (đo 02/09 14:35). Phép «còn sống» của sổ đọc bộ ba đó ra **TRUE**
   *    ⇒ KHÔNG có chốt này thì ta ghi vào sổ một **DÒNG MA** khai «đang chạy» cho một tiến
   *    trình chưa từng tồn tại. Phải tới sự kiện `error` thì `exitCode` mới thành `-2`.
   * 📌 Cùng hình «xoá theo trí nhớ» mà đề bài tự cảnh báo — chỉ khác: thứ suýt bị xoá nhầm là
   *    một CHỐT, KHÔNG phải một hàm. Và **chốt thì KHÔNG có tên, nên nó dễ mất hơn hàm.**
   */
  if (tien.pid) ts.khiSinh?.(tien);

  /**
   * Người xem đã rời đi hay chưa. Khi rời mà đang CHẠY NỀN thì vẫn phải TIÊU THỤ
   * stdout (⛔ không để ống nghẽn làm tiến trình treo), nhưng ⛔ KHÔNG chất vào hàng đợi
   * — ⛔ không ai kéo thì hàng đợi chỉ phình bộ nhớ vô ích.
   */
  let daRoiDi = false;

  tien.stdin.write(ts.cauHoi);
  tien.stdin.end();

  // Gom stderr để báo lỗi cho ra hồn nếu tiến trình chết.
  let loiChuan = '';
  tien.stderr.on('data', (c: Buffer) => {
    loiChuan += c.toString('utf8');
    if (loiChuan.length > 4000) loiChuan = loiChuan.slice(-4000);
  });

  // Hàng đợi nối stdout (đẩy) với vòng lặp `for await` (kéo).
  const hangDoi: MauTraLoi[] = [];
  let danhThuc: (() => void) | null = null;
  let ketThuc = false;
  let loiTienTrinh: string | null = null;

  const day = (m: MauTraLoi) => {
    if (!daRoiDi) hangDoi.push(m);
    danhThuc?.();
    danhThuc = null;
  };

  let maPhien = '';
  let dem = '';

  tien.stdout.on('data', (c: Buffer) => {
    // ⏱️ Có chữ ra ⇒ ghế còn sống ⇒ đặt lại đồng hồ im-lặng. Đây là chỗ DUY NHẤT
    //    chứng minh được "nó đang làm việc" — ⛔ đừng dời sang nơi khác.
    datLaiDongHo();
    dem += c.toString('utf8');
    const dong = dem.split('\n');
    dem = dong.pop() ?? '';
    for (const d of dong) {
      const s = d.trim();
      if (!s) continue;
      let j: Record<string, unknown>;
      try {
        j = JSON.parse(s);
      } catch {
        continue; // dòng chưa trọn / không phải JSON → bỏ qua
      }
      xuLyMau(j);
    }
  });

  function xuLyMau(j: Record<string, unknown>) {
    const loai = j.type as string;

    if (typeof j.session_id === 'string' && j.session_id && !maPhien) {
      maPhien = j.session_id;
      day({ loai: 'phien', ma_phien: maPhien });
      /**
       * 🏷 GHI SỔ SỞ HỮU — theo `session_id` ĐẦU TIÊN QUAN SÁT ĐƯỢC của lượt, kèm phép so
       *    với `maPhienCu`.
       * 🔴 Cách nói cũ («chỉ khi LƯỢT NÀY THẬT SỰ SINH RA phiên đó») bị bác vòng 2, và bác đúng:
       *    :352 chỉ nhận `session_id` ĐẦU TIÊN của lượt, còn phép so ở dưới đọc đối số `maPhienCu`.
       *    Cả hai đều là QUAN SÁT, chẳng cái nào CHỨNG NHẬN rằng một phiên vừa được sinh ra.
       *
       * 🔴 LỖI CHẶN NGƯỜI SOI BẮT Ở VÒNG 1 (07/09/2026) — giữ nguyên văn để đừng ai lặp:
       *    tôi khai «sổ chỉ ghi ở lượt SINH (điều kiện `!maPhien`)». SAI.
       *    `maPhien` khởi tạo rỗng cho MỖI LƯỢT (:326), nên `!maPhien` chỉ nghĩa là
       *    «mã phiên ĐẦU TIÊN CỦA LƯỢT NÀY», chẳng phải «phiên vừa được sinh ra».
       *    ⇒ Mỗi lần NỐI LẠI, `session_id` cũ quay về và bản cũ ghi THÊM một lời nhận sở hữu,
       *      mang tên GHẾ ĐANG NỐI. Người soi đo ra ba dòng cùng một mã phiên:
       *      seat-A (lượt sinh) · seat-B (lượt nối) · null (nối mà thiếu ghế).
       * 🔑 Nối lại KHÔNG phải sở hữu. Ghi như thế là tự tay đẻ ra đúng thứ dữ liệu gây nhầm chủ
       *    mà cuốn sổ này sinh ra để chống.
       *
       * ⇒ Điều kiện ĐÚNG, đọc thẳng từ đối số của lượt:
       *      KHÔNG có `maPhienCu`            ⇒ lượt này mở phiên MỚI            ⇒ GHI
       *      có `maPhienCu`, mã trả về KHÁC  ⇒ fork: đẻ mã mới                  ⇒ GHI
       *      có `maPhienCu`, mã trả về TRÙNG ⇒ chỉ NỐI LẠI, chẳng sinh gì       ⇒ THÔI
       *
       * ⚠️ `ghiSoHuu` KHÔNG BAO GIỜ NÉM, và ta CỐ Ý KHÔNG đọc giá trị trả về — lượt chạy
       *    KHÔNG được đổi hướng vì một cuốn sổ mà hiện chưa ai đọc.
       * ⚠️ NÓ CÓ LÀM CHẬM. Người soi đo: tiêm 250 ms vào lượt ghi thì lượt đo mất ~315 ms.
       *    `day()` chỉ XẾP mẩu tin vào hàng đợi, nên lời ghi đồng bộ vẫn chặn vòng lặp sự kiện
       *    trước khi bên tiêu thụ chạy tiếp. Câu cũ của tôi («KHÔNG làm chậm») đã bị bác.
       *    ⇒ Thứ bản vá này KHÔNG đổi là LOGIC CHỌN/NỐI PHIÊN. Độ trễ thì CÓ đổi.
       * 🔴 VÀ NHẮC LẠI HAI VẾ Ở `so-so-huu.ts`, đừng đọc bản vá này rộng hơn:
       *      ① sổ này CHƯA AI ĐỌC ⇒ nó KHÔNG chữa gì, app vẫn bốc phiên y như cũ
       *      ② nó mới phủ MỘT trong HAI đường vào — chỉ đường CHẠY NỀN. Phiên sinh từ ô chat
       *        của Owner vẫn vào sổ với chủ `null`.
       */
      const laPhienMoi = !ts.maPhienCu || ts.maPhienCu !== maPhien;
      if (laPhienMoi) ghiSoHuu(maPhien, ts.maNhanSu);
    }

    // Chảy từng chữ
    if (loai === 'stream_event') {
      const sk = j.event as { type?: string; delta?: { type?: string; text?: string } } | undefined;
      if (sk?.type === 'content_block_delta' && sk.delta?.type === 'text_delta' && sk.delta.text) {
        day({ loai: 'chu', chu: sk.delta.text });
      }
      return;
    }

    if (loai === 'result') {
      if (j.is_error) {
        const ds = Array.isArray(j.errors) ? (j.errors as string[]).join(' · ') : '';
        const tho = ds || (typeof j.result === 'string' ? j.result : '');
        const notice = dichLoi(tho);
        day({
          loai: 'loi',
          thong_diep: notice.text,
          code: notice.code,
          ...(notice.params ? { params: notice.params } : {}),
          text: notice.text,
        });
      }
      // ⭐ TOKEN mới là thứ ăn vào cửa sổ 5 giờ + cửa sổ TUẦN (dùng chung với
      //    Claude chat của Owner) — đô-la chỉ là số máy tự quy đổi. Phải hiện token.
      const u = j.usage as Record<string, number> | undefined;
      const token = u
        ? (u.cache_creation_input_tokens ?? 0) +
          (u.cache_read_input_tokens ?? 0) +
          (u.input_tokens ?? 0) +
          (u.output_tokens ?? 0)
        : null;

      day({
        loai: 'xong',
        ma_phien: maPhien,
        chi_phi_usd: typeof j.total_cost_usd === 'number' ? j.total_cost_usd : null,
        token,
        rawResult: j,
      });
    }
  }

  let loiTienTrinhNotice = null as ServerNoticePayload | null;

  tien.on('error', (e) => {
    /**
     * ⚰️ GỠ DÒNG SỔ Ở CẢ ĐƯỜNG NÀY — @app-pm thêm vào đề bài 02/09 cùng lúc với chốt `if (tien.pid)`.
     *
     * 🔑 Hai chốt ấy là HAI VẾ của một việc, đừng làm một vế: chốt kia lo ca «chưa từng có dòng»,
     *    vế này lo ca «đã có dòng rồi mới hỏng». `error` còn bắn cho lỗi KHÁC ngoài spawn hụt
     *    (gửi tín hiệu thất bại chẳng hạn), và ở mấy ca đó dòng sổ ĐÃ tồn tại.
     * 📌 Đúng nếp «một chốt ở cuối, đừng vá từng nhánh»: gọi ở đây thì nhánh lỗi MỚI nào sinh ra
     *    sau này cũng mặc định sạch sổ, KHÔNG phải nhớ thêm.
     */
    ts.khiChet?.(tien, null);
    loiTienTrinhNotice = buildServerNotice('process.spawnError', {
      message: e.message,
    });
    loiTienTrinh = loiTienTrinhNotice.text;
    ketThuc = true;
    danhThuc?.();
    danhThuc = null;
  });

  tien.on('close', (ma, signal) => {
    // ⚰️ Báo NGAY, TRƯỚC mọi xử lý khác: dù nhánh nào chạy tiếp thì con cũng đã chết rồi.
    // 🖐 KHÔNG cần chốt `if (tien.pid)` ở ĐƯỜNG XOÁ (khác đường ghi ở trên, đọc kỹ kẻo chép nhầm):
    //    `xoaViec` so TAY CẦM, nên tay cầm KHÔNG có pid thì cũng KHÔNG khớp dòng nào ⇒ lời gọi
    //    thành vô hại. Còn chốt lại thì ta lại đang dùng một con số để quyết một việc KHÔNG cần số.
    ts.khiChet?.(tien, ma, signal);
    // ⭐ Ghế bị CHÍNH TA chém thì phải nói thẳng là ta chém, kèm con số thật.
    //    ⛔ Đừng để nó rơi xuống nhánh dưới rồi hiện thành "lỗi công cụ" — đó là
    //    cách một phép đo tự nói dối: người dùng đi sửa câu hỏi trong khi thủ phạm
    //    là cái đồng hồ của ta (ca 14/08, hai lượt cùng chết ở giây 117).
    if (biCatVIImLang) {
      const minutes = Math.max(1, Math.round(CAU_HINH.hanGio / 60000));
      loiTienTrinhNotice = buildServerNotice('process.silenceTimeout', {
        minutes,
      });
      loiTienTrinh = loiTienTrinhNotice.text;
    } else if (signal) {
      loiTienTrinhNotice = buildServerNotice('process.signaled', {
        signal,
      });
      loiTienTrinh = loiTienTrinhNotice.text;
    } else if (ma !== 0 && ma !== null) {
      const exitDetail = loiChuan.trim()
        ? `${ma} (${loiChuan.trim().slice(0, 240)})`
        : String(ma);
      loiTienTrinhNotice = buildServerNotice('process.exited', {
        exitCode: exitDetail,
      });
      loiTienTrinh = loiTienTrinhNotice.text;
    }
    ketThuc = true;
    danhThuc?.();
    danhThuc = null;
  });

  try {
    while (true) {
      while (hangDoi.length > 0) yield hangDoi.shift()!;
      if (ketThuc) break;
      await new Promise<void>((giai) => {
        danhThuc = giai;
      });
    }
    while (hangDoi.length > 0) yield hangDoi.shift()!;
    if (loiTienTrinhNotice) {
      yield {
        loai: 'loi',
        thong_diep: loiTienTrinhNotice.text,
        code: loiTienTrinhNotice.code,
        ...(loiTienTrinhNotice.params ? { params: loiTienTrinhNotice.params } : {}),
        text: loiTienTrinhNotice.text,
      };
    } else if (loiTienTrinh) {
      yield { loai: 'loi', thong_diep: loiTienTrinh };
    }
  } finally {
    clearTimeout(donGio);
    ts.tinHieuHuy?.removeEventListener('abort', huy);
    if (ts.chayNen) {
      /**
       * 🔴 ⛔ ĐÃ BỎ `tien.kill('SIGTERM')` Ở ĐÂY (17/08/2026).
       * Khối này chạy cả khi luồng XEM đóng — tức Owner chỉ tắt trình duyệt.
       * Giết ở đây nghĩa là: rời màn hình = mất việc. Owner nói thẳng nó phải
       * chạy tiếp «như terminal».
       * ⇒ Chạy nền thì buông cho tiến trình sống; dọn hàng đợi cho nhẹ bộ nhớ.
       *   Vẫn còn hai phanh: đồng hồ IM LẶNG ở trên, và nút DỪNG qua /api/dung.
       */
      daRoiDi = true;
      hangDoi.length = 0;
    } else if (tien.exitCode === null) {
      tien.kill('SIGTERM');
    }
  }
}
