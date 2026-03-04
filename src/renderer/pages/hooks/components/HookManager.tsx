/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { iconColors } from '@/renderer/theme/colors';
import { Button, Tooltip } from '@arco-design/web-react';
import { Lightning } from '@icon-park/react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHooks } from '../hooks/useHooks';
import HookDrawer from './HookDrawer';

interface HookManagerProps {
  conversationId: string;
  conversationTitle?: string;
  agentType?: string;
}

/**
 * Hook manager component for ChatLayout headerExtra
 * Shows hook status and opens drawer for management
 */
const HookManager: React.FC<HookManagerProps> = ({ conversationId, conversationTitle, agentType }) => {
  const { t } = useTranslation();
  const { hooks, loading, hasHooks, hasError, activeHooksCount, refetch } = useHooks(conversationId);
  const [drawerVisible, setDrawerVisible] = useState(false);

  if (loading) return null;

  const isPaused = hasHooks && activeHooksCount === 0;

  const statusColor = hasError ? '#f53f3f' : isPaused ? '#ff7d00' : hasHooks ? '#00b42a' : '#86909c';
  const iconFill = hasHooks ? iconColors.primary : iconColors.disabled;

  const tooltipContent = !hasHooks
    ? t('hooks.empty')
    : hasError
      ? t('hooks.status.error')
      : isPaused
        ? t('hooks.status.paused')
        : t('hooks.status.active') + ` (${activeHooksCount})`;

  return (
    <>
      <Tooltip content={tooltipContent}>
        <Button
          type='text'
          size='small'
          className='hook-manager-button'
          onClick={() => setDrawerVisible(true)}
          icon={
            <span className='inline-flex items-center gap-2px rounded-full px-8px py-2px bg-2'>
              <Lightning theme='outline' size={16} fill={iconFill} />
              <span className={`ml-4px w-8px h-8px rounded-full`} style={{ backgroundColor: statusColor }} />
            </span>
          }
        />
      </Tooltip>
      <HookDrawer
        visible={drawerVisible}
        conversationId={conversationId}
        conversationTitle={conversationTitle}
        agentType={agentType || 'acp'}
        hooks={hooks}
        onClose={() => setDrawerVisible(false)}
        onRefresh={refetch}
      />
    </>
  );
};

export default HookManager;
