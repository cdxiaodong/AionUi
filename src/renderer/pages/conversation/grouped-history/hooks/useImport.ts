/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { emitter } from '@/renderer/utils/emitter';
import { Message } from '@arco-design/web-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

export const useImport = () => {
  const [importLoading, setImportLoading] = useState(false);
  const { t } = useTranslation();

  const handleImport = useCallback(async () => {
    const files = await ipcBridge.dialog.showOpen.invoke({
      properties: ['openFile'],
      filters: [{ name: 'Supported Files', extensions: ['zip', 'json'] }],
    });
    if (!files || files.length === 0) return;

    setImportLoading(true);
    try {
      const result = await ipcBridge.conversation.importFromFile.invoke({
        filePath: files[0],
      });
      if (result.imported > 0) {
        Message.success(t('conversation.history.importSuccess', { count: result.imported }));
        emitter.emit('chat.history.refresh');
      }
      if (result.errors.length > 0) {
        if (result.imported === 0) {
          Message.error(t('conversation.history.importFailed'));
        } else {
          Message.warning(t('conversation.history.importPartialFail'));
        }
      }
    } catch {
      Message.error(t('conversation.history.importFailed'));
    } finally {
      setImportLoading(false);
    }
  }, [t]);

  return { importLoading, handleImport };
};
