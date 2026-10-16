/**
 * Next.js Instrumentation hook (Pha 5A-2)
 *
 * Runs once when the Next.js server instance starts.
 * Initializes the server-side office-runner scheduler on Node.js runtime.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.CHAY_NEN === '1') {
      console.warn('[chay-nen] CHAY_NEN ignored: office-runner is the single engine');
    }
    const { scheduleInstanceNonceStartup } = await import('@/lib/instance-nonce');
    scheduleInstanceNonceStartup();
    const { startOfficeRunner } = await import('@/lib/office-runner');
    await startOfficeRunner();
    scheduleInstanceNonceStartup();
  }
}
