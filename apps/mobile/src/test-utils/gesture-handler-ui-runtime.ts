/**
 * Jest stand-in for Gesture Handler's `installUIRuntimeBindings`: the Jest worklets runtime (web
 * implementation) has no UI runtime, so nothing is installed (mapped in jest.config.js).
 */
export function installUIRuntimeBindings(): void {}
