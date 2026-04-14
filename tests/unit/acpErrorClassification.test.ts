import { describe, expect, it } from 'vitest';
import { AcpErrorType } from '../../src/common/types/acpTypes';
import { classifyAcpOperationError } from '../../src/process/agent/acp/errorClassification';

describe('classifyAcpOperationError', () => {
  it('detects authentication failures', () => {
    expect(classifyAcpOperationError('authentication failed for current session')).toEqual({
      type: AcpErrorType.AUTHENTICATION_FAILED,
      retryable: false,
    });
  });

  it('detects timeouts as retryable', () => {
    expect(classifyAcpOperationError('LLM request timed out after 60 seconds')).toEqual({
      type: AcpErrorType.TIMEOUT,
      retryable: true,
    });
  });

  it('detects permission errors', () => {
    expect(classifyAcpOperationError('Permission denied for tool call')).toEqual({
      type: AcpErrorType.PERMISSION_DENIED,
      retryable: false,
    });
  });

  it('detects connection errors as retryable', () => {
    expect(classifyAcpOperationError('Connection reset by peer')).toEqual({
      type: AcpErrorType.NETWORK_ERROR,
      retryable: true,
    });
  });

  it('falls back to unknown for unmatched errors', () => {
    expect(classifyAcpOperationError('something unexpected happened')).toEqual({
      type: AcpErrorType.UNKNOWN,
      retryable: false,
    });
  });
});
