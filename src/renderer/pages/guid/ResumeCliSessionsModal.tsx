/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ILocalCliSessionSummary } from '@/common/adapter/ipcBridge';
import { Button, Empty, Modal, Spin } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

type ResumeCliSessionsModalProps = {
  visible: boolean;
  loading: boolean;
  sessions: ILocalCliSessionSummary[];
  continuingSessionId: string | null;
  onCancel: () => void;
  onRefresh: () => void;
  onContinue: (session: ILocalCliSessionSummary) => void;
};

const ResumeCliSessionsModal: React.FC<ResumeCliSessionsModalProps> = ({
  visible,
  loading,
  sessions,
  continuingSessionId,
  onCancel,
  onRefresh,
  onContinue,
}) => {
  const { t } = useTranslation();

  const renderSessionCard = (session: ILocalCliSessionSummary): React.ReactNode => {
    const backendLabel =
      session.backend === 'codex'
        ? t('conversation.welcome.cliSessionsBackendCodex')
        : t('conversation.welcome.cliSessionsBackendClaude');
    const isContinuing = continuingSessionId === session.id;
    const isBusy = Boolean(continuingSessionId && continuingSessionId !== session.id);

    return (
      <div
        key={`${session.backend}:${session.id}`}
        className='flex items-start gap-12px p-14px rd-12px bg-fill-0 b-1 b-solid border-[var(--color-border-2)]'
      >
        <div className='min-w-0 flex-1'>
          <div className='flex items-center flex-wrap gap-8px min-w-0'>
            <span className='min-w-0 max-w-full truncate text-14px font-medium text-t-primary'>{session.title}</span>
            <span className='shrink-0 text-12px text-t-secondary px-8px py-2px rd-999px bg-fill-1'>{backendLabel}</span>
          </div>
          <div className='mt-6px text-13px leading-20px text-t-secondary whitespace-pre-wrap break-words'>
            {session.preview}
          </div>
          <div className='mt-10px text-12px leading-18px text-t-tertiary break-all'>
            {t('common.workspace')}: {session.workspace}
          </div>
          <div className='mt-4px text-12px leading-18px text-t-tertiary'>
            {t('conversation.welcome.cliSessionsLastActive')}: {new Date(session.updatedAt).toLocaleString()}
          </div>
        </div>
        <Button
          type='primary'
          size='small'
          loading={isContinuing}
          disabled={isBusy}
          onClick={() => onContinue(session)}
        >
          {t('conversation.welcome.cliSessionsContinue')}
        </Button>
      </div>
    );
  };

  return (
    <Modal
      visible={visible}
      footer={null}
      onCancel={onCancel}
      title={
        <div className='flex items-center justify-between gap-12px pr-8px'>
          <div className='min-w-0'>
            <div className='text-16px font-semibold text-t-primary'>{t('conversation.welcome.cliSessionsTitle')}</div>
            <div className='mt-4px text-12px text-t-secondary'>{t('conversation.welcome.cliSessionsDescription')}</div>
          </div>
          <Button size='mini' type='secondary' loading={loading} onClick={onRefresh}>
            {t('common.refresh')}
          </Button>
        </div>
      }
      style={{ width: 720, maxWidth: 'calc(100vw - 32px)', borderRadius: '16px' }}
      alignCenter
      getPopupContainer={() => document.body}
    >
      <Spin loading={loading} block>
        <div className='max-h-520px overflow-y-auto pr-4px'>
          {sessions.length > 0 ? (
            <div className='flex flex-col gap-12px'>{sessions.map(renderSessionCard)}</div>
          ) : (
            <div className='py-36px'>
              <Empty description={t('conversation.welcome.cliSessionsEmpty')} />
            </div>
          )}
        </div>
      </Spin>
    </Modal>
  );
};

export default ResumeCliSessionsModal;
