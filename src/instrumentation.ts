/**
 * Next.js Instrumentation hook (Pha 5A-2)
 *
 * Runs once when the Next.js server instance starts.
 * Initializes the server-side office-runner scheduler on Node.js runtime.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startOfficeRunner } = await import('@/lib/office-runner');
    startOfficeRunner();
  }
}
