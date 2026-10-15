#!/usr/bin/env node

/**
 * convert-harness-tests.mjs — Chuyển đổi 271 ca test của OPC sang đường dẫn AIBOSS Office
 * theo bảng tên layout.py (CAC-DU-AN -> projects, DAU-VAO -> inputs, v.v.).
 */

import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const SOURCE_DIR = process.env.OPC_HARNESS_DIR 
  ? path.join(process.env.OPC_HARNESS_DIR, 'tests', 'hooks')
  : '/Users/erocathanh/Development/opc-business-harness/tests/hooks';

const TARGET_DIR = path.join(REPO_ROOT, 'tests', 'hooks');

if (!fs.existsSync(SOURCE_DIR)) {
  console.error(`[convert-tests] Không tìm thấy thư mục nguồn: ${SOURCE_DIR}`);
  process.exit(1);
}

// Bảng ánh xạ từ layout.py
const MAPPINGS = [
  // Tên dự án mẫu trước để tránh va chạm chuỗi con
  { from: /DU-AN-MAU-SU-THAT-2/g, to: '_sample-ground-truth-2' },
  { from: /DU-AN-MAU-SU-THAT/g, to: '_sample-ground-truth' },
  { from: /CAC-DU-AN/g, to: 'projects' },
  { from: /DAU-VAO/g, to: 'inputs' },
  { from: /DANG-LAM/g, to: 'wip' },
  { from: /DAU-RA/g, to: 'outputs' },
  { from: /THAM-KHAO/g, to: 'references' },
  { from: /BAN-MAU/g, to: 'templates' },
  { from: /nhat-ky\.md/g, to: 'CHANNEL.md' },
  { from: /BANG-DIEU-KHIEN\.md/g, to: 'PROGRESS.md' },
];

let totalConverted = 0;

const hookDirs = fs.readdirSync(SOURCE_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

for (const hookName of hookDirs) {
  const srcHookDir = path.join(SOURCE_DIR, hookName);
  const dstHookDir = path.join(TARGET_DIR, hookName);
  if (!fs.existsSync(dstHookDir)) {
    fs.mkdirSync(dstHookDir, { recursive: true });
  }

  const files = fs.readdirSync(srcHookDir).filter((f) => f.endsWith('.json') || f.endsWith('.txt'));
  for (const file of files) {
    const srcFile = path.join(srcHookDir, file);
    let content = fs.readFileSync(srcFile, 'utf-8');

    // Chuyển đổi tên thư mục và tệp theo layout
    for (const m of MAPPINGS) {
      content = content.replace(m.from, m.to);
    }

    const targetFileName =
      hookName === 'guard_bulk_send' && file.startsWith('ask-')
        ? file.replace(/^ask-/, 'block-')
        : file;
    const dstFile = path.join(dstHookDir, targetFileName);
    fs.writeFileSync(dstFile, content, 'utf-8');
    totalConverted++;
  }
}

// Thêm 1 ca đối chứng dương vào block_mass_delete
const positiveControlFile = path.join(TARGET_DIR, 'block_mass_delete', 'positive-control-rm-rf.json');
const positiveControlContent = JSON.stringify({
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  tool_input: {
    command: 'rm -rf projects/_sample-ground-truth/wip/tmp_test'
  }
}, null, 2) + '\n';
fs.writeFileSync(positiveControlFile, positiveControlContent, 'utf-8');

console.log(`[convert-tests] Chuyển đổi thành công ${totalConverted} ca test sang ${TARGET_DIR}`);
console.log(`[convert-tests] Đã thêm ca đối chứng dương: ${positiveControlFile}`);
console.log(`[convert-tests] Tổng số ca test trong tests/hooks: ${totalConverted + 1}`);
