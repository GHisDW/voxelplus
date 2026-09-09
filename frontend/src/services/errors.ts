import { VoxelErrorPayload, VoxelIpcError, VOXEL_IPC_ERROR_MARKER } from '../../../electron/types';

/**
 * Helpers for consuming structured Voxel+ IPC errors in the renderer.
 *
 * When an IPC handler fails, Electron delivers the rejection as an Error
 * whose text is `Error invoking remote method '<channel>': <error>` — the
 * only part of the main-process error that survives the trip is its message
 * string. The main process therefore embeds the structured payload in the
 * message as `...VOXEL_ERROR::{json}` (see electron/main.ts /
 * electron/backend/diagnostics.ts), and this module reconstructs a
 * structured VoxelIpcError from that text.
 */

/**
 * Parse a caught value into a structured VoxelIpcError.
 * Returns null when the value is not a marker-encoded IPC error
 * (e.g. a plain renderer-side exception).
 */
export function parseVoxelIpcError(value: unknown): VoxelIpcError | null {
  if (!(value instanceof Error)) return null;
  const message = typeof value.message === 'string' ? value.message : '';

  // The payload can sit anywhere in the message because Electron prefixes it
  // with `Error invoking remote method '<channel>': `, so search instead of
  // checking the prefix. Use the FIRST marker: an outer payload may legally
  // contain an inner marker string inside its `details` (double-wrapped
  // errors), and the outer JSON starts right after the first marker.
  const markerIndex = message.indexOf(VOXEL_IPC_ERROR_MARKER);
  if (markerIndex === -1) return null;

  const rawJson = message.slice(markerIndex + VOXEL_IPC_ERROR_MARKER.length).trim();
  if (!rawJson) return null;

  try {
    const payload = JSON.parse(rawJson) as VoxelErrorPayload;
    if (
      typeof payload !== 'object' ||
      payload === null ||
      typeof payload.category !== 'string' ||
      typeof payload.severity !== 'string'
    ) {
      return null;
    }
    return {
      isVoxelError: true,
      // Preserve the raw Electron text for debugging via `e.message`.
      message,
      payload
    };
  } catch {
    return null;
  }
}

/** Check whether a caught value is a structured Voxel+ IPC error. */
export function isVoxelIpcError(value: unknown): boolean {
  return parseVoxelIpcError(value) !== null;
}

/** Extract the structured payload from a caught IPC error, if present. */
export function getVoxelErrorPayload(value: unknown): VoxelErrorPayload | null {
  return parseVoxelIpcError(value)?.payload ?? null;
}

/**
 * Build a user-facing toast/log message from any caught error.
 *
 * Structured errors render as "message suggestedAction [CODE]"; raw errors
 * fall back to their message so unexpected failures still surface something.
 */
export function describeIpcError(value: unknown): string {
  const parsed = parseVoxelIpcError(value);
  if (parsed) {
    const { payload } = parsed;
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
