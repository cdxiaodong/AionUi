/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { ICreateHookParams, IHookConfig, IHookJob, IHookKind } from '@/common/ipcBridge';
import { useLayoutContext } from '@/renderer/context/LayoutContext';
import { Drawer, Form, Input, Select, Switch, Message, Button, Popconfirm, InputNumber, Checkbox, Tag, Space, Divider } from '@arco-design/web-react';
import { Lightning, DeleteOne, Copy, AddOne, EditOne } from '@icon-park/react';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';

const FormItem = Form.Item;
const TextArea = Input.TextArea;

interface HookDrawerProps {
  visible: boolean;
  conversationId: string;
  conversationTitle?: string;
  agentType: string;
  hooks: IHookJob[];
  onClose: () => void;
  onRefresh: () => void;
}

/**
 * Hook kind display config
 */
const HOOK_KINDS: { value: IHookKind; labelKey: string }[] = [
  { value: 'webhook', labelKey: 'hooks.types.webhook' },
  { value: 'rss', labelKey: 'hooks.types.rss' },
  { value: 'file', labelKey: 'hooks.types.file' },
];

const POLL_INTERVALS = [
  { value: 60000, labelKey: 'hooks.intervals.1min' },
  { value: 300000, labelKey: 'hooks.intervals.5min' },
  { value: 900000, labelKey: 'hooks.intervals.15min' },
  { value: 3600000, labelKey: 'hooks.intervals.1hour' },
];

const FILE_EVENTS = ['create', 'change', 'delete'] as const;

/**
 * HookDrawer - Create and manage hooks for a conversation
 * Supports creating multiple hooks (unlike cron which limits to one per conversation)
 */
const HookDrawer: React.FC<HookDrawerProps> = ({ visible, conversationId, conversationTitle, agentType, hooks, onClose, onRefresh }) => {
  const { t } = useTranslation();
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingHook, setEditingHook] = useState<IHookJob | null>(null);
  const [form] = Form.useForm();

  // Reset create form when drawer opens/closes
  useEffect(() => {
    if (!visible) {
      setShowCreateForm(false);
      setEditingHook(null);
      form.resetFields();
    }
  }, [visible, form]);

  // Prefill form when editing a hook
  const handleEdit = useCallback(
    (hook: IHookJob) => {
      setEditingHook(hook);
      setShowCreateForm(true);

      const formValues: Record<string, unknown> = {
        name: hook.name,
        kind: hook.kind,
        message: hook.message,
      };

      switch (hook.config.kind) {
        case 'webhook':
          formValues.webhookSecret = hook.config.secret || '';
          break;
        case 'rss':
          formValues.feedUrl = hook.config.feedUrl;
          formValues.pollInterval = hook.config.pollIntervalMs;
          break;
        case 'file':
          formValues.watchPath = hook.config.watchPath;
          formValues.fileEvents = hook.config.events;
          break;
      }

      // Use setTimeout to ensure form is rendered before setting values
      setTimeout(() => {
        form.setFieldsValue(formValues);
      }, 0);
    },
    [form]
  );

  const handleCreate = async () => {
    try {
      const values = await form.validate();
      setCreating(true);

      const kind: IHookKind = editingHook ? editingHook.kind : values.kind;
      let config: IHookConfig;

      switch (kind) {
        case 'webhook':
          config = { kind: 'webhook', path: `/webhook/${conversationId}`, secret: values.webhookSecret || undefined };
          break;
        case 'rss':
          config = { kind: 'rss', feedUrl: values.feedUrl, pollIntervalMs: values.pollInterval || 300000 };
          break;
        case 'file':
          config = { kind: 'file', watchPath: values.watchPath, events: values.fileEvents || ['change'] };
          break;
        default:
          throw new Error('Invalid hook kind');
      }

      if (editingHook) {
        // Edit mode: update existing hook
        await ipcBridge.hooks.updateHook.invoke({
          hookId: editingHook.id,
          updates: {
            name: values.name,
            config,
            message: values.message,
          },
        });
        Message.success(t('hooks.updateSuccess'));
      } else {
        // Create mode
        const params: ICreateHookParams = {
          name: values.name,
          kind,
          config,
          message: values.message,
          conversationId,
          conversationTitle,
          agentType: agentType as ICreateHookParams['agentType'],
          createdBy: 'user',
        };
        await ipcBridge.hooks.addHook.invoke(params);
        Message.success(t('hooks.createSuccess'));
      }

      setShowCreateForm(false);
      setEditingHook(null);
      form.resetFields();
      onRefresh();
    } catch (err) {
      if (err instanceof Error) {
        Message.error(err.message);
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = useCallback(
    async (hookId: string) => {
      try {
        await ipcBridge.hooks.removeHook.invoke({ hookId });
        Message.success(t('hooks.deleteSuccess'));
        onRefresh();
      } catch (err) {
        Message.error(String(err));
      }
    },
    [t, onRefresh]
  );

  const handleToggle = useCallback(
    async (hookId: string, enabled: boolean) => {
      try {
        await ipcBridge.hooks.updateHook.invoke({ hookId, updates: { enabled } });
        onRefresh();
      } catch (err) {
        Message.error(String(err));
      }
    },
    [onRefresh]
  );

  const handleCopyUrl = useCallback(
    async (hookId: string) => {
      try {
        const port = await ipcBridge.hooks.getWebhookPort.invoke();
        const url = `http://localhost:${port}/api/hooks/webhook/${hookId}`;
        await navigator.clipboard.writeText(url);
        Message.success(t('hooks.copyUrlSuccess'));
      } catch {
        // Fallback to default port
        const url = `http://localhost:9880/api/hooks/webhook/${hookId}`;
        await navigator.clipboard.writeText(url);
        Message.success(t('hooks.copyUrlSuccess'));
      }
    },
    [t]
  );

  const kindLabel = useMemo(
    () => (kind: IHookKind) => {
      switch (kind) {
        case 'webhook':
          return t('hooks.types.webhook');
        case 'rss':
          return t('hooks.types.rss');
        case 'file':
          return t('hooks.types.file');
        default:
          return kind;
      }
    },
    [t]
  );

  return (
    <Drawer
      placement={isMobile ? 'bottom' : 'right'}
      width={isMobile ? 'calc(100vw - 12px)' : 420}
      height={isMobile ? 'min(84vh, 760px)' : undefined}
      title={
        <div className='inline-flex items-center gap-8px'>
          <Lightning theme='outline' size={18} strokeWidth={4} fill='currentColor' className='flex items-center' />
          <span className='leading-none'>{t('hooks.title')}</span>
        </div>
      }
      visible={visible}
      onCancel={onClose}
      bodyStyle={{
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: isMobile ? '14px 14px 18px' : undefined,
      }}
      footer={null}
    >
      {/* Existing hooks list */}
      {hooks.length > 0 && (
        <div className='space-y-8px mb-16px'>
          {hooks.map((hook) => (
            <div key={hook.id} className='bg-2 rd-12px px-14px py-12px'>
              <div className='flex items-center justify-between mb-8px'>
                <div className='flex items-center gap-6px'>
                  <Tag size='small' color={hook.kind === 'webhook' ? 'blue' : hook.kind === 'rss' ? 'orange' : 'green'}>
                    {kindLabel(hook.kind)}
                  </Tag>
                  <span className='text-14px font-medium truncate max-w-180px'>{hook.name}</span>
                </div>
                <Switch size='small' checked={hook.enabled} onChange={(checked) => void handleToggle(hook.id, checked)} />
              </div>

              {/* Status */}
              <div className='flex items-center justify-between text-12px text-text-3 mb-6px'>
                <span>
                  {t('hooks.triggerCount')}: {hook.state.triggerCount}
                </span>
                {hook.state.lastTriggeredAt && <span>{dayjs(hook.state.lastTriggeredAt).format('MM-DD HH:mm')}</span>}
              </div>

              {hook.state.lastStatus === 'error' && hook.state.lastError && <div className='text-12px text-red-500 mb-6px truncate'>{hook.state.lastError}</div>}

              {/* Actions */}
              <div className='flex items-center gap-8px'>
                {hook.kind === 'webhook' && (
                  <Button size='mini' type='text' icon={<Copy theme='outline' size={12} />} onClick={() => handleCopyUrl(hook.id)}>
                    {t('hooks.copyUrl')}
                  </Button>
                )}
                <Button size='mini' type='text' icon={<EditOne theme='outline' size={12} />} onClick={() => handleEdit(hook)}>
                  {t('hooks.actions.edit')}
                </Button>
                <div className='flex-1' />
                <Popconfirm title={t('hooks.confirmDelete')} onOk={() => void handleDelete(hook.id)}>
                  <Button size='mini' type='text' status='danger' icon={<DeleteOne theme='outline' size={12} />}>
                    {t('hooks.actions.delete')}
                  </Button>
                </Popconfirm>
              </div>
            </div>
          ))}
        </div>
      )}

      {hooks.length === 0 && !showCreateForm && <div className='text-center text-text-3 py-32px text-14px'>{t('hooks.empty')}</div>}

      {/* Create new hook */}
      {!showCreateForm ? (
        <Button type='primary' long shape='round' icon={<AddOne theme='outline' size={14} />} onClick={() => setShowCreateForm(true)}>
          {t('hooks.add')}
        </Button>
      ) : (
        <>
          <Divider>{editingHook ? t('hooks.drawer.editTitle') : t('hooks.add')}</Divider>
          <Form form={form} layout='vertical' initialValues={{ kind: 'webhook', pollInterval: 300000, fileEvents: ['change'] }}>
            <FormItem label={t('hooks.drawer.name')} field='name' rules={[{ required: true }]}>
              <Input placeholder={t('hooks.drawer.namePlaceholder')} />
            </FormItem>

            <FormItem label={t('hooks.drawer.kind')} field='kind' rules={[{ required: true }]}>
              <Select disabled={!!editingHook}>
                {HOOK_KINDS.map((k) => (
                  <Select.Option key={k.value} value={k.value}>
                    {t(k.labelKey)}
                  </Select.Option>
                ))}
              </Select>
            </FormItem>

            {/* Webhook config */}
            <Form.Item shouldUpdate noStyle>
              {(values) => {
                if (values.kind !== 'webhook') return null;
                return (
                  <FormItem label={t('hooks.config.webhookSecret')} field='webhookSecret'>
                    <Input placeholder={t('hooks.config.webhookSecretPlaceholder')} />
                  </FormItem>
                );
              }}
            </Form.Item>

            {/* RSS config */}
            <Form.Item shouldUpdate noStyle>
              {(values) => {
                if (values.kind !== 'rss') return null;
                return (
                  <>
                    <FormItem label={t('hooks.config.feedUrl')} field='feedUrl' rules={[{ required: true }]}>
                      <Input placeholder='https://example.com/feed.xml' />
                    </FormItem>
                    <FormItem label={t('hooks.config.pollInterval')} field='pollInterval'>
                      <Select>
                        {POLL_INTERVALS.map((p) => (
                          <Select.Option key={p.value} value={p.value}>
                            {t(p.labelKey)}
                          </Select.Option>
                        ))}
                      </Select>
                    </FormItem>
                  </>
                );
              }}
            </Form.Item>

            {/* File config */}
            <Form.Item shouldUpdate noStyle>
              {(values) => {
                if (values.kind !== 'file') return null;
                return (
                  <>
                    <FormItem label={t('hooks.config.watchPath')} field='watchPath' rules={[{ required: true }]}>
                      <Input placeholder='/path/to/watch' />
                    </FormItem>
                    <FormItem label={t('hooks.config.events')} field='fileEvents'>
                      <Checkbox.Group>
                        {FILE_EVENTS.map((e) => (
                          <Checkbox key={e} value={e}>
                            {t(`hooks.config.event_${e}`)}
                          </Checkbox>
                        ))}
                      </Checkbox.Group>
                    </FormItem>
                  </>
                );
              }}
            </Form.Item>

            <FormItem label={t('hooks.message')} field='message' rules={[{ required: true }]}>
              <TextArea placeholder={t('hooks.messagePlaceholder')} autoSize={{ minRows: 3, maxRows: 8 }} />
            </FormItem>

            <Space className='w-full' direction='vertical'>
              <Button type='primary' long shape='round' loading={creating} onClick={() => void handleCreate()}>
                {t('hooks.drawer.save')}
              </Button>
              <Button
                long
                shape='round'
                onClick={() => {
                  setShowCreateForm(false);
                  setEditingHook(null);
                  form.resetFields();
                }}
              >
                {t('common.cancel')}
              </Button>
            </Space>
          </Form>
        </>
      )}
    </Drawer>
  );
};

export default HookDrawer;
