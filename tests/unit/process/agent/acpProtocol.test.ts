import { describe, expect, it } from 'vitest';
import { AcpErrorType } from '@/common/types/acpTypes';
import { AcpProtocolError, classifyAcpProtocolError } from '@process/agent/acp/protocol';

describe('ACP protocol error classification', () => {
  it('classifies structured authentication failures from JSON-RPC errors', () => {
    const error = new AcpProtocolError(
      {
        code: -32001,
        message: 'Request rejected by remote ACP runtime',
        data: { type: 'authentication_failed', retryable: false },
      },
      'session/prompt'
    );

    const result = classifyAcpProtocolError(error);

    expect(result.type).toBe(AcpErrorType.AUTHENTICATION_FAILED);
    expect(result.retryable).toBe(false);
    expect(result.details).toEqual(
      expect.objectContaining({
        protocolCode: -32001,
        protocolMethod: 'session/prompt',
      })
    );
  });

  it('classifies permission errors from structured protocol data', () => {
    const error = new AcpProtocolError({
      code: -32002,
      message: 'Tool request rejected',
      data: { category: 'permission_denied' },
    });

    expect(classifyAcpProtocolError(error).type).toBe(AcpErrorType.PERMISSION_DENIED);
  });

  it('keeps timeout errors retryable even without structured data', () => {
    const result = classifyAcpProtocolError(new Error('LLM request timed out after 300 seconds'));

    expect(result.type).toBe(AcpErrorType.TIMEOUT);
    expect(result.retryable).toBe(true);
  });

  it('classifies session expiry from structured session tokens', () => {
    const error = new AcpProtocolError({
      code: -32003,
      message: 'Resume failed',
      data: { reason: 'session_expired' },
    });

    expect(classifyAcpProtocolError(error).type).toBe(AcpErrorType.SESSION_EXPIRED);
  });
});
