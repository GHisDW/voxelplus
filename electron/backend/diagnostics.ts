import {
  VoxelErrorCategory,
  VoxelErrorPayload,
  VoxelErrorSeverity
} from '../types';
import { LogStreamer } from './processes/logStreamer';

/**
 * Centralized, structured error type for Voxel+.
 *
 * Every significant backend failure should be thrown (or reported) as a
 * VoxelError so that user-facing messages, technical details, error codes,
 * categories and severity stay consistent across subsystems.
 */
export class VoxelError extends Error {
  public readonly title: string;
  public readonly code?: string;
  public readonly category: VoxelErrorCategory;
  public readonly severity: VoxelErrorSeverity;
  public readonly causeHint?: string;
  public readonly suggestedAction?: string;
  /** Technical/debug details kept out of the user-facing message. */
  public readonly technicalDetails?: string;

  constructor(options: {
    title: string;
    message: string;
    cause?: string;
    suggestedAction?: string;
    code?: string;
    category?: VoxelErrorCategory;
    severity?: VoxelErrorSeverity;
    details?: string;
    /** Optional underlying error/exception to chain for debugging. */
    originalError?: unknown;
  }) {
    super(options.message);
    this.name = 'VoxelError';
    this.title = options.title || 'Unexpected Error';
    this.code = options.code;
    this.category = options.category || 'UNKNOWN';
    this.severity = options.severity || 'ERROR';
    this.causeHint = options.cause;
    this.suggestedAction = options.suggestedAction;
    this.technicalDetails = buildTechnicalDetails(options.details, options.originalError);

    // Maintain a proper prototype chain when compiled down (ES5 targets).
    Object.setPrototypeOf(this, VoxelError.prototype);
  }

  /** Convert to the IPC-safe payload sent to the renderer. */
  public toPayload(): VoxelErrorPayload {
    return {
      title: this.title,
      message: this.message,
      cause: this.causeHint,
      suggestedAction: this.suggestedAction,
      code: this.code,
      category: this.category,
      severity: this.severity,
      details: this.technicalDetails
    };
  }

  /**
   * Structured, filterable log line through the standard LogStreamer.
   * Tags look like: [Voxel+][ERROR][JAVA] JAVA_VERSION_MISMATCH: ...
   */
  public log(instanceId?: string, instanceName?: string): void {
    const tag = `[Voxel+][${this.severity}][${this.category}]`;
    const codeSuffix = this.code ? ` (${this.code})` : '';
    LogStreamer.addLog(`${tag} ${this.message}${codeSuffix}`, logLevelFor(this.severity), instanceId, instanceName);
    if (this.technicalDetails) {
      LogStreamer.addLog(`${tag} ${this.technicalDetails}`, 'DEBUG', instanceId, instanceName);
    }
  }
}

/**
 * Coerce an arbitrary thrown value (Error, VoxelError, string, whatever IPC
 * handlers may receive) into a VoxelError so callers never need to guess.
 */
export function toVoxelError(
  error: unknown,
  fallback?: {
    title?: string;
    category?: VoxelErrorCategory;
    severity?: VoxelErrorSeverity;
    code?: string;
    suggestedAction?: string;
  }
): VoxelError {
  if (error instanceof VoxelError) {
    return error;
  }

  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : safeStringify(error);

  return new VoxelError({
    title: fallback?.title || 'Unexpected Error',
    message: rawMessage || 'An unexpected error occurred.',
    category: fallback?.category || 'UNKNOWN',
    severity: fallback?.severity || 'ERROR',
    code: fallback?.code,
    suggestedAction: fallback?.suggestedAction,
    details: error instanceof Error ? error.stack : undefined,
    originalError: error instanceof Error ? undefined : error
  });
}

/**
 * Serialize any thrown value into an IPC-safe VoxelErrorPayload.
 * Guarantees the renderer never receives raw Error objects or stacks,
 * while technical details are preserved inside the payload for logs.
 */
export function serializeErrorForIpc(
  error: unknown,
  fallback?: Parameters<typeof toVoxelError>[1]
): VoxelErrorPayload {
  const voxelError = toVoxelError(error, fallback);
  const payload = voxelError.toPayload();
  // Log centrally so every IPC failure leaves a consistent trace.
  voxelError.log();
  return payload;
}

function logLevelFor(severity: VoxelErrorSeverity): 'INFO' | 'WARN' | 'ERROR' {
  if (severity === 'INFO') return 'INFO';
  if (severity === 'WARNING') return 'WARN';
  return 'ERROR';
}

function buildTechnicalDetails(details: string | undefined, originalError: unknown): string | undefined {
  const parts: string[] = [];
  if (details) parts.push(details);
  if (originalError instanceof Error && originalError.stack) {
    parts.push(originalError.stack);
  } else if (originalError !== undefined) {
    parts.push(safeStringify(originalError));
  }
  return parts.length > 0 ? parts.join('\n') : undefined;
}

/**
 * JSON-stringify that never throws, even on circular structures or exotic
 * thrown values (numbers, DOM-ish objects, class instances without toJSON).
 */
function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return (
      JSON.stringify(value, (_key, val) => {
        if (typeof val === 'object' && val !== null) {
          if (seen.has(val)) return '[Circular]';
          seen.add(val);
        }
        if (typeof val === 'function') return '[Function]';
        if (typeof val === 'bigint') return val.toString();
        return val;
      }) ?? String(value)
    );
  } catch {
    try {
      return String(value);
    } catch {
      return '[Unserializable thrown value]';
    }
  }
}
