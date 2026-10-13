export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND') {
      for (const ext of ['.ts', '.tsx', '.mjs', '.js']) {
        try {
          return await nextResolve(specifier + ext, context);
        } catch {
          /* try next extension */
        }
      }
    }
    throw err;
  }
}
