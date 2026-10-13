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
    if (err.code === 'ERR_MODULE_NOT_FOUND') {
      for (const ext of ['.ts', '.tsx', '.mjs', '.js', '.json']) {
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

export async function load(url, context, nextLoad) {
  if (url.endsWith('.json')) {
    const raw = fs.readFileSync(fileURLToPath(url), 'utf-8');
    return {
      format: 'module',
      shortCircuit: true,
      source: `export default ${raw};`,
    };
  }
  return nextLoad(url, context);
}
