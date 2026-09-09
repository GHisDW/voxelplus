import { VoxelErrorPayload, VoxelIpcError } from '../../../electron/types';

/**
 * Helpers for consuming structured Voxel+ IPC errors in the renderer.
 *
 * Backend IPC handlers serialize failures into VoxelIpcError objects
 * (see electron/main.ts and electron/backend/diagnostics.ts). These
 * helpers let UI code display user-facing messages, suggested actions
 * and error codes without touching raw exception text.
 */

/** Check whether a caught value is a structured Voxel+ IPC error. */
export function isVoxelIpcError(value: unknown): value is VoxelIpcError {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { isVoxelError?: boolean }).isVoxelError === true &&
    typeof (value as { payload?: unknown }).payload === 'object'
  );
}

/** Extract the structured payload from a caught IPC error, if present. */
export function getVoxelErrorPayload(value: unknown): VoxelErrorPayload | null {
  return isVoxelIpcError(value) ? value.payload : null;
}

/**
 * Build a user-facing toast/log message from any caught error.
 *
 * Structured errors render as "message suggestedAction [CODE]"; raw errors
 * fall back to their message so unexpected failures still surface something.
 */
export function describeIpcError(value: unknown): string {
  const payload = getVoxelErrorPayload(value);
  if (payload) {
    const parts = [payload.message];
    if (payload.suggestedAction) parts.push(payload.suggestedAction);
    const codeSuffix = payload.code ? ` [${payload.code}]` : '';
    return `${parts.join(' ')}${codeSuffix}`;
  }
  if (value instanceof Error) {
    return value.message;
  }
  return String(value);
}
