export type TraceLogosErrorCode =
  | 'NETWORK'
  | 'HTTP'
  | 'PARSE'
  | 'NOT_FOUND'
  | 'FORBIDDEN_HOST'
  | 'TOO_LARGE'
  | 'INVALID_ASSET';

export class TraceLogosError extends Error {
  readonly code: TraceLogosErrorCode;
  readonly status?: number;

  constructor(code: TraceLogosErrorCode, message: string, options?: { status?: number; cause?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'TraceLogosError';
    this.code = code;
    if (options?.status !== undefined) this.status = options.status;
  }
}

export function isTraceLogosError(e: unknown): e is TraceLogosError {
  return e instanceof TraceLogosError;
}
