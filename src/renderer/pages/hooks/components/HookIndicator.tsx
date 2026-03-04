/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Tooltip } from '@arco-design/web-react';
import { Lightning, Attention, PauseOne } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

export type HookStatus = 'none' | 'active' | 'paused' | 'error' | 'unread';

interface HookIndicatorProps {
  status: HookStatus;
  size?: number;
  className?: string;
}

/**
 * Simple indicator icon for conversations with hooks
 * Used in ChatHistory to show hook status alongside CronJobIndicator
 */
const HookIndicator: React.FC<HookIndicatorProps> = ({ status, size = 14, className = '' }) => {
  const { t } = useTranslation();

  if (status === 'none') {
    return null;
  }

  const getIcon = () => {
    const iconProps = {
      theme: 'outline' as const,
      size,
      strokeWidth: 3,
      fill: '#000000',
      className: 'flex items-center',
    };

    switch (status) {
      case 'unread':
        return (
          <span className='relative inline-flex'>
            <Lightning {...iconProps} />
            <span
              className='absolute rounded-full bg-red-500'
              style={{
                width: Math.max(6, size * 0.4),
                height: Math.max(6, size * 0.4),
                top: -1,
                right: -1,
              }}
            />
          </span>
        );
      case 'active':
        return <Lightning {...iconProps} />;
      case 'paused':
        return <PauseOne {...iconProps} />;
      case 'error':
        return <Attention {...iconProps} />;
      default:
        return null;
    }
  };

  const getTooltip = () => {
    switch (status) {
      case 'unread':
        return t('hooks.status.unread');
      case 'active':
        return t('hooks.status.active');
      case 'paused':
        return t('hooks.status.paused');
      case 'error':
        return t('hooks.status.error');
      default:
        return '';
    }
  };

  return (
    <Tooltip content={getTooltip()} mini>
      <span className={`inline-flex items-center justify-center ${className}`}>{getIcon()}</span>
    </Tooltip>
  );
};

export default HookIndicator;
