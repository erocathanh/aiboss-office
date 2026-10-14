// Test-only seams, never set from production code.

let _disableViewerGoneGuardForTest = false;
export function setDisableViewerGoneGuardForTest(disabled: boolean): void {
  _disableViewerGoneGuardForTest = disabled;
}
export function isViewerGoneGuardDisabledForTest(): boolean {
  return _disableViewerGoneGuardForTest;
}

let _bypassSlotGateForTest = false;
export function setBypassSlotGateForTest(bypass: boolean): void {
  _bypassSlotGateForTest = bypass;
}
export function isBypassSlotGateForTest(): boolean {
  return _bypassSlotGateForTest;
}
