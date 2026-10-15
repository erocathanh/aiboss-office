import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  let target = specifier;
  if (target.startsWith('@/')) {
    target = pathToFileURL(path.join(process.cwd(), 'src', target.slice(2))).href;
  }

  try {
    return await nextResolve(target, context);
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND' || err.code === 'ERR_UNSUPPORTED_DIR_IMPORT') {
      for (const ext of ['.ts', '.tsx', '.mjs', '.js', '.json', '/index.ts', '/index.tsx', '/index.js']) {
        try {
          return await nextResolve(target + ext, context);
        } catch {
          /* try next extension */
        }
      }
    }
    throw err;
  }
}

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export async function load(url, context, nextLoad) {
  if (url.endsWith('.json')) {
    const raw = fs.readFileSync(fileURLToPath(url), 'utf-8');
    return {
      format: 'module',
      shortCircuit: true,
      source: `export default ${raw};`,
    };
  }
  if (url.endsWith('.tsx')) {
    const raw = fs.readFileSync(fileURLToPath(url), 'utf-8');
    const result = ts.transpileModule(raw, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    });
    return {
      format: 'module',
      shortCircuit: true,
      source: result.outputText,
    };
  }
  return nextLoad(url, context);
}
