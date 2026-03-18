import { describe, expect, it } from 'vitest';
import { normalizeTaskNotificationBody } from '@/process/services/taskNotificationUtils';

describe('normalizeTaskNotificationBody', () => {
  it('collapses whitespace for notification body previews', () => {
    expect(normalizeTaskNotificationBody('hello\n\nworld   from\tAionUi', 'fallback')).toBe('hello world from AionUi');
  });

  it('truncates long notification body previews', () => {
    const longText = 'a'.repeat(220);
    const result = normalizeTaskNotificationBody(longText, 'fallback');

    expect(result.length).toBeLessThanOrEqual(180);
    expect(result.endsWith('…')).toBe(true);
  });

  it('uses fallback when preview is empty after cleanup', () => {
    expect(normalizeTaskNotificationBody('<think>hidden</think>', 'fallback body')).toBe('fallback body');
  });
});
