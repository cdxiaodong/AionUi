import { AcpErrorType, createAcpError, type AcpError, type AcpResponse } from '@/common/types/acpTypes';

type AcpResponseError = NonNullable<AcpResponse['error']>;

function toLowercaseTokens(value: unknown, depth = 0): string[] {
  if (depth > 10) return [];

  if (typeof value === 'string') {
    return [value.toLowerCase()];
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return [String(value).toLowerCase()];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => toLowercaseTokens(item, depth + 1));
  }

  if (value && typeof value === 'object') {
    const result: string[] = [];
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      result.push(key.toLowerCase());
      result.push(...toLowercaseTokens(nestedValue, depth + 1));
    }
    return result;
  }

  return [];
}

function hasAnyToken(tokens: string[], candidates: string[]): boolean {
  return candidates.some((candidate) => tokens.some((token) => token.includes(candidate)));
}

function extractRetryable(data: unknown): boolean | undefined {
  if (!data || typeof data !== 'object') return undefined;

  const retryable = (data as { retryable?: unknown }).retryable;
  return typeof retryable === 'boolean' ? retryable : undefined;
}

export class AcpProtocolError extends Error {
  readonly code: number;
  readonly data?: unknown;
  readonly method?: string;

  constructor(error: AcpResponseError, method?: string) {
    super(error.message || 'Unknown ACP error');
    this.name = 'AcpProtocolError';
    this.code = error.code;
    this.data = error.data;
    this.method = method;
  }
}

export function classifyAcpProtocolError(error: unknown): AcpError {
  const message = error instanceof Error ? error.message : String(error);
  const protocolError = error instanceof AcpProtocolError ? error : undefined;
  const tokens = toLowercaseTokens([message, protocolError?.data]);
  const retryable =
    extractRetryable(protocolError?.data) ??
    hasAnyToken(tokens, ['timeout', 'timed out', 'deadline', 'network', 'connection', 'disconnect']);

  if (hasAnyToken(tokens, ['authentication', 'auth', 'unauthorized', 'unauthenticated', 'credential', '[acp-auth-'])) {
    return createAcpError(AcpErrorType.AUTHENTICATION_FAILED, message, false, {
      protocolCode: protocolError?.code,
      protocolData: protocolError?.data,
      protocolMethod: protocolError?.method,
    });
  }

  if (hasAnyToken(tokens, ['permission', 'forbidden', 'denied', 'permission_denied'])) {
    return createAcpError(AcpErrorType.PERMISSION_DENIED, message, false, {
      protocolCode: protocolError?.code,
      protocolData: protocolError?.data,
      protocolMethod: protocolError?.method,
    });
  }

  if (hasAnyToken(tokens, ['session_expired', 'session expired', 'invalid session', 'session invalid'])) {
    return createAcpError(AcpErrorType.SESSION_EXPIRED, message, false, {
      protocolCode: protocolError?.code,
      protocolData: protocolError?.data,
      protocolMethod: protocolError?.method,
    });
  }

  if (hasAnyToken(tokens, ['timeout', 'timed out', 'deadline'])) {
    return createAcpError(AcpErrorType.TIMEOUT, message, retryable, {
      protocolCode: protocolError?.code,
      protocolData: protocolError?.data,
      protocolMethod: protocolError?.method,
    });
  }

  if (hasAnyToken(tokens, ['network', 'connection', 'disconnect', 'econnrefused', 'econnreset'])) {
    return createAcpError(AcpErrorType.NETWORK_ERROR, message, retryable, {
      protocolCode: protocolError?.code,
      protocolData: protocolError?.data,
      protocolMethod: protocolError?.method,
    });
  }

  return createAcpError(AcpErrorType.UNKNOWN, message, retryable, {
    protocolCode: protocolError?.code,
    protocolData: protocolError?.data,
    protocolMethod: protocolError?.method,
  });
}
