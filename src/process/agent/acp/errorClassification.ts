import { AcpErrorType } from '@/common/types/acpTypes';

export type ClassifiedAcpError = {
  type: AcpErrorType;
  retryable: boolean;
};

export function classifyAcpOperationError(errorMessage: string): ClassifiedAcpError {
  const normalized = errorMessage.toLowerCase();

  if (normalized.includes('authentication') || normalized.includes('认证失败') || normalized.includes('[acp-auth-')) {
    return { type: AcpErrorType.AUTHENTICATION_FAILED, retryable: false };
  }

  if (normalized.includes('timeout') || normalized.includes('timed out')) {
    return { type: AcpErrorType.TIMEOUT, retryable: true };
  }

  if (normalized.includes('permission')) {
    return { type: AcpErrorType.PERMISSION_DENIED, retryable: false };
  }

  if (normalized.includes('connection')) {
    return { type: AcpErrorType.NETWORK_ERROR, retryable: true };
  }

  return { type: AcpErrorType.UNKNOWN, retryable: false };
}
