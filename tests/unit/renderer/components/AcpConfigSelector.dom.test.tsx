import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { AcpSessionConfigOption } from '@/common/types/acpTypes';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      getConfigOptions: { invoke: vi.fn() },
      setConfigOption: { invoke: vi.fn() },
      responseStream: { on: vi.fn(() => vi.fn()) },
    },
  },
}));

vi.mock('@/common/config/storage', () => ({
  ConfigStorage: {
    get: vi.fn(() => Promise.resolve({})),
    set: vi.fn(() => Promise.resolve()),
  },
}));

import AcpConfigSelector from '@/renderer/components/agent/AcpConfigSelector';

const reasoningEffortOption: AcpSessionConfigOption = {
  id: 'reasoning_effort',
  name: 'Reasoning Effort',
  type: 'select',
  currentValue: 'medium',
  options: [
    { value: 'low', name: 'Low' },
    { value: 'medium', name: 'Medium' },
    { value: 'high', name: 'High' },
  ],
};

describe('AcpConfigSelector', () => {
  it('renders a compact pill by default for toolbar usage', () => {
    render(<AcpConfigSelector backend='codex' initialConfigOptions={[reasoningEffortOption]} />);

    expect(screen.getByRole('button', { name: /medium/i })).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('renders a full-width select when compact is false for settings-style layouts', () => {
    render(<AcpConfigSelector backend='codex' compact={false} initialConfigOptions={[reasoningEffortOption]} />);

    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /medium/i })).toBeNull();
  });
});
