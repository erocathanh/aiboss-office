#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

/**
 * Documented exceptions allowed as literal strings in JSX text or placeholder/title/aria-label.
 * Every exception has an explicit technical/brand rationale as required by DE-UI-2.
 */
export const DOCUMENTED_I18N_EXCEPTIONS = [
  {
    text: 'AIBOSS Office',
    category: 'Product / Brand Name',
    reason: 'Official product brand name remains invariant across English and Vietnamese interfaces.',
  },
  {
    text: 'Claude Code',
    category: 'Upstream Tool Proper Noun',
    reason: 'Proper noun of the underlying CLI runtime executing AI seat sessions.',
  },
  {
    text: 'config/office.json',
    category: 'Technical File Path',
    reason: 'Canonical repository configuration file path displayed in monospace code badges.',
  },
  {
    text: 'operations/data/costs/',
    category: 'Technical File Path',
    reason: 'Canonical monthly cost ledger directory path displayed in monospace code badges.',
  },
  {
    text: 'du-lieu/nhan-su.json',
    category: 'Technical File Path',
    reason: 'Canonical seat roster data file path displayed in monospace code badges.',
  },
  {
    text: 'resume.erocathanh.com',
    category: 'Domain / External Link',
    reason: 'Canonical external profile hostname link displayed verbatim.',
  },
  {
    text: 'claude --resume &lt;id&gt;',
    category: 'CLI Command Syntax',
    reason: 'Literal Claude CLI flag syntax displayed inside <code> badge.',
  },
  {
    text: 'cd &quot;…&quot;',
    category: 'CLI Command Syntax',
    reason: 'Literal shell command syntax displayed inside <code> badge.',
  },
  {
    text: 'claude --resume 4766aa5e-…',
    category: 'CLI Command Syntax',
    reason: 'Literal Claude CLI command example in session paste input placeholder.',
  },
];

const EXCEPTION_MAP = new Map(
  DOCUMENTED_I18N_EXCEPTIONS.map((item) => [item.text, item]),
);

const TARGET_ATTRS = new Set(['placeholder', 'title', 'aria-label']);

function collectSourceFiles(dirPath, excludeDirs = new Set()) {
  const results = [];
  if (!fs.existsSync(dirPath)) return results;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (excludeDirs.has(fullPath)) continue;
      results.push(...collectSourceFiles(fullPath, excludeDirs));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) &&
      !entry.name.endsWith('.d.ts') &&
      !entry.name.includes('.test.')
    ) {
      results.push(fullPath);
    }
  }
  return results.sort();
}

function countWords(str) {
  const normalized = str.replace(/\s+/g, ' ').trim();
  if (!normalized) return 0;
  // Match word tokens containing at least 2 alphabetic characters (Latin + Vietnamese)
  const words = normalized.match(/\p{L}{2,}/gu);
  return words ? words.length : 0;
}

function isInteractiveButtonOrLabelElement(jsxOpeningNode, sourceFile) {
  if (!jsxOpeningNode || !jsxOpeningNode.tagName) return false;
  const tagName = jsxOpeningNode.tagName.getText(sourceFile);
  if (tagName === 'button' || tagName === 'label') {
    return true;
  }
  const props = jsxOpeningNode.attributes?.properties ?? [];
  for (const prop of props) {
    if (ts.isJsxAttribute(prop) && prop.name.getText(sourceFile) === 'role' && prop.initializer) {
      if (ts.isStringLiteral(prop.initializer) && prop.initializer.text === 'button') {
        return true;
      }
      if (
        ts.isJsxExpression(prop.initializer) &&
        prop.initializer.expression &&
        ts.isStringLiteral(prop.initializer.expression) &&
        prop.initializer.expression.text === 'button'
      ) {
        return true;
      }
    }
  }
  return false;
}

export function scanUiLiterals({ repoRoot = REPO_ROOT } = {}) {
  const componentsDir = path.join(repoRoot, 'src/components');
  const appDir = path.join(repoRoot, 'src/app');
  const apiDir = path.join(repoRoot, 'src/app/api');

  const files = [
    ...collectSourceFiles(componentsDir),
    ...collectSourceFiles(appDir, new Set([apiDir])),
  ];

  const violations = [];
  const allowedHits = [];

  for (const filePath of files) {
    const relPath = path.relative(repoRoot, filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const scriptKind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      scriptKind,
    );

    const recordCandidate = (rawText, kind, node, minWords = 2) => {
      const normalized = rawText.replace(/\s+/g, ' ').trim();
      if (countWords(normalized) < minWords) return;

      const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      const exception = EXCEPTION_MAP.get(normalized);
      if (exception) {
        allowedHits.push({
          file: relPath,
          line: line + 1,
          column: character + 1,
          kind,
          text: normalized,
          category: exception.category,
          reason: exception.reason,
        });
        return;
      }

      violations.push({
        file: relPath,
        line: line + 1,
        column: character + 1,
        kind,
        text: normalized,
      });
    };

    const visit = (node, insideButtonOrLabel = false) => {
      let nextInside = insideButtonOrLabel;
      if (ts.isJsxElement(node)) {
        if (isInteractiveButtonOrLabelElement(node.openingElement, sourceFile)) {
          nextInside = true;
        }
      } else if (ts.isJsxSelfClosingElement(node)) {
        if (isInteractiveButtonOrLabelElement(node, sourceFile)) {
          nextInside = true;
        }
      }

      if (ts.isJsxText(node)) {
        const minWords = nextInside ? 1 : 2;
        const kind = nextInside ? 'JSXText(button/label)' : 'JSXText';
        recordCandidate(node.getText(sourceFile), kind, node, minWords);
      } else if (ts.isJsxAttribute(node)) {
        const attrName = node.name.getText(sourceFile);
        if (TARGET_ATTRS.has(attrName) && node.initializer) {
          const minWords = nextInside ? 1 : 2;
          if (ts.isStringLiteral(node.initializer)) {
            recordCandidate(
              node.initializer.text,
              `JSXAttribute(${attrName})`,
              node.initializer,
              minWords,
            );
          } else if (
            ts.isJsxExpression(node.initializer) &&
            node.initializer.expression &&
            (ts.isStringLiteral(node.initializer.expression) ||
              ts.isNoSubstitutionTemplateLiteral(node.initializer.expression))
          ) {
            recordCandidate(
              node.initializer.expression.text,
              `JSXAttribute(${attrName})`,
              node.initializer.expression,
              minWords,
            );
          }
        }
      }
      ts.forEachChild(node, (child) => visit(child, nextInside));
    };

    visit(sourceFile, false);
  }

  return {
    scannedFilesCount: files.length,
    violations,
    allowedHits,
    exceptions: DOCUMENTED_I18N_EXCEPTIONS,
  };
}


const VI_DIACRITIC_RE = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

const SERVER_PIPELINE_FILES = new Set([
  "src/lib/chay-agent.ts",
  "src/lib/chay-mot-luot.ts",
  "src/lib/chan-muc-dung.ts",
  "src/lib/kho-danh-thuc.ts",
  "src/lib/khoi-dong-nen.ts",
  "src/lib/server-notices.ts",
]);

export const SERVER_NOTICE_LINE_WHITELIST = [
  {
    file: "src/lib/chay-agent.ts",
    lineHint: 90,
    text: "cờ dòng lệnh",
    reason: "Server-only CLI startup host binding diagnostic log (ngheRaNgoai).",
  },
  {
    file: "src/lib/chay-agent.ts",
    lineHint: 95,
    text: "không ai khai",
    reason: "Server-only CLI startup host binding diagnostic log (ngheRaNgoai).",
  },
  {
    file: "src/lib/chay-agent.ts",
    lineHint: 195,
    text: "${...} — host «${...}» từ ${...}",
    reason: "Server-only console diagnostic banner on startup.",
  },
  {
    file: "src/lib/chay-agent.ts",
    lineHint: 195,
    text: "nghe ra ngoài",
    reason: "Server-only console diagnostic banner on startup.",
  },
  {
    file: "src/lib/chay-agent.ts",
    lineHint: 195,
    text: "chỉ máy này",
    reason: "Server-only console diagnostic banner on startup.",
  },
  {
    file: "src/lib/chay-agent.ts",
    lineHint: 195,
    text: "rỗng",
    reason: "Server-only console diagnostic banner on startup.",
  },
  {
    file: "src/lib/chay-agent.ts",
    lineHint: 197,
    text: "[chay-agent] giọng terminal: ${...}",
    reason: "Server-only console diagnostic banner on startup.",
  },
  {
    file: "src/lib/chay-agent.ts",
    lineHint: 197,
    text: "BẬT",
    reason: "Server-only console diagnostic banner on startup.",
  },
  {
    file: "src/lib/chay-agent.ts",
    lineHint: 197,
    text: "TẮT",
    reason: "Server-only console diagnostic banner on startup.",
  },
  {
    file: "src/lib/chay-agent.ts",
    lineHint: 198,
    text: " · lý do: ${...} · số công cụ bị cấm: ${...}",
    reason: "Server-only console diagnostic banner on startup.",
  },
  {
    file: "src/lib/chay-agent.ts",
    lineHint: 670,
    text: "Kiểm quyền ghi tại .claude/settings.json và departments/**/.claude/settings.json, sau đó chạy: node operations/scripts/gen-seat-files.mjs --check",
    reason: "Server-internal S17c/S17d seat settings anchor remediation hint.",
  },
];

const CLIENT_PAYLOAD_PROPS = new Set(["loi", "thong_diep", "text", "error", "message", "ly_do"]);
const CLIENT_PAYLOAD_CALLS = new Set([
  "json",
  "serverNoticeJson",
  "buildServerNotice",
  "formatServerNotice",
  "classifyAgentError",
  "dichLoi",
  "day",
  "nhan",
  "goi",
]);

function isInsideConsoleCall(node, sourceFile) {
  let cur = node.parent;
  while (cur) {
    if (ts.isCallExpression(cur)) {
      const exprText = cur.expression.getText(sourceFile);
      if (/^console\.(log|warn|error|info|debug)$/.test(exprText)) {
        return true;
      }
    }
    cur = cur.parent;
  }
  return false;
}

function getClientPayloadContext(node, sourceFile) {
  let cur = node.parent;
  while (cur) {
    if (ts.isPropertyAssignment(cur)) {
      const propName = cur.name.getText(sourceFile).replace(/^["']|["']$/g, "");
      if (CLIENT_PAYLOAD_PROPS.has(propName)) {
        return `ObjectProperty(${propName})`;
      }
    }
    if (ts.isCallExpression(cur)) {
      const exprText = cur.expression.getText(sourceFile);
      const baseName = exprText.split(".").pop();
      if (
        CLIENT_PAYLOAD_CALLS.has(baseName) ||
        exprText === "Response.json" ||
        exprText === "NextResponse.json"
      ) {
        return `Call(${exprText})`;
      }
    }
    if (ts.isFunctionDeclaration(cur) && cur.name && cur.name.text === "dichLoi") {
      return "Function(dichLoi)";
    }
    cur = cur.parent;
  }
  return null;
}

export function scanServerSourceText(content, relPath = "synthetic.ts") {
  const scriptKind = relPath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    relPath,
    content,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const violations = [];
  const whitelistedHits = [];
  const isStrictServerFile =
    relPath.startsWith("src/app/api/") || SERVER_PIPELINE_FILES.has(relPath);

  const checkLiteral = (rawText, node) => {
    if (!VI_DIACRITIC_RE.test(rawText)) return;
    if (isInsideConsoleCall(node, sourceFile)) return;

    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const wl = SERVER_NOTICE_LINE_WHITELIST.find(
      (item) => item.file === relPath && item.text === rawText,
    );
    if (wl) {
      whitelistedHits.push({
        file: relPath,
        line: line + 1,
        column: character + 1,
        text: rawText,
        reason: wl.reason,
      });
      return;
    }

    const payloadCtx = getClientPayloadContext(node, sourceFile);
    if (payloadCtx || isStrictServerFile) {
      violations.push({
        file: relPath,
        line: line + 1,
        column: character + 1,
        kind: payloadCtx ?? "ServerNoticePipelineLiteral",
        text: rawText.replace(/\s+/g, " ").trim(),
      });
    }
  };

  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      checkLiteral(node.text, node);
    } else if (ts.isTemplateExpression(node)) {
      const joined = [
        node.head.text,
        ...node.templateSpans.map((span) => span.literal.text),
      ].join("${...}");
      checkLiteral(joined, node);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return { violations, whitelistedHits };
}

export function scanServerNoticeLiterals({ repoRoot = REPO_ROOT } = {}) {
  const libDir = path.join(repoRoot, "src/lib");
  const apiDir = path.join(repoRoot, "src/app/api");
  const files = [...collectSourceFiles(libDir), ...collectSourceFiles(apiDir)];

  const violations = [];
  const whitelistedHits = [];

  for (const filePath of files) {
    const relPath = path.relative(repoRoot, filePath).replace(/\\/g, "/");
    const content = fs.readFileSync(filePath, "utf8");
    const res = scanServerSourceText(content, relPath);
    violations.push(...res.violations);
    whitelistedHits.push(...res.whitelistedHits);
  }

  return {
    scannedFilesCount: files.length,
    violations,
    whitelistedHits,
    whitelist: SERVER_NOTICE_LINE_WHITELIST,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = scanUiLiterals();
  console.log(`[i18n-scanner] Scanned ${report.scannedFilesCount} files under src/components/** and src/app/** (excluding src/app/api/**).`);
  console.log(`[i18n-scanner] Documented exceptions matched: ${report.allowedHits.length}`);
  for (const hit of report.allowedHits) {
    console.log(`  - [ALLOW] ${hit.file}:${hit.line} (${hit.kind}) "${hit.text}" -> [${hit.category}] ${hit.reason}`);
  }
  console.log(`[i18n-scanner] Untranslated UI literal violations (>= 2 words, or >= 1 word in button/label): ${report.violations.length}`);
  const serverReport = scanServerNoticeLiterals();
  console.log(`[i18n-scanner] Scanned ${serverReport.scannedFilesCount} server files under src/lib/** and src/app/api/**.`);
  console.log(`[i18n-scanner] Server internal whitelist matched: ${serverReport.whitelistedHits.length}`);
  console.log(`[i18n-scanner] Hardcoded Vietnamese server notice violations: ${serverReport.violations.length}`);
  if (report.violations.length > 0 || serverReport.violations.length > 0) {
    for (const v of report.violations) {
      console.error(`  - [UI-VIOLATION] ${v.file}:${v.line}:${v.column} (${v.kind}): "${v.text}"`);
    }
    for (const v of serverReport.violations) {
      console.error(`  - [SERVER-VIOLATION] ${v.file}:${v.line}:${v.column} (${v.kind}): "${v.text}"`);
    }
    process.exit(1);
  }
}
