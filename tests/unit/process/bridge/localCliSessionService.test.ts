/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { LocalCliSessionService } from '../../../../src/process/bridge/services/LocalCliSessionService';

const tempDirs: string[] = [];

function createTempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'aionui-cli-sessions-'));
  tempDirs.push(dir);
  return dir;
}

describe('LocalCliSessionService', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('lists locally stored codex and claude sessions in descending activity order', async () => {
    const homeDir = createTempHome();

    const codexDir = join(homeDir, '.codex');
    mkdirSync(codexDir, { recursive: true });
    const codexDbPath = join(codexDir, 'state_5.sqlite');
    const database = new DatabaseSync(codexDbPath);
    database.exec(`
      CREATE TABLE threads (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        first_user_message TEXT NOT NULL,
        cwd TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        rollout_path TEXT NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0
      );
    `);
    database
      .prepare(
        'INSERT INTO threads (id, title, first_user_message, cwd, updated_at, rollout_path, archived) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        'codex-session-1',
        'Codex thread title',
        'Summarize the issue backlog',
        '/workspace/codex',
        1_767_225_600,
        '/Users/test/.codex/sessions/codex-session-1.jsonl',
        0
      );
    database.close();

    const claudeProjectDir = join(homeDir, '.claude', 'projects', 'demo-project');
    mkdirSync(claudeProjectDir, { recursive: true });
    writeFileSync(
      join(claudeProjectDir, 'claude-session-1.jsonl'),
      [
        JSON.stringify({ type: 'file-history-snapshot', snapshot: {} }),
        JSON.stringify({
          type: 'user',
          sessionId: 'claude-session-1',
          cwd: '/workspace/claude',
          timestamp: '2026-01-02T00:00:00.000Z',
          message: { role: 'user', content: 'Continue the audit and export the notes' },
        }),
      ].join('\n')
    );

    const service = new LocalCliSessionService({ homeDir });
    const sessions = await service.listSessions();

    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toMatchObject({
      id: 'claude-session-1',
      backend: 'claude',
      title: 'Continue the audit and export the notes',
      workspace: '/workspace/claude',
    });
    expect(sessions[1]).toMatchObject({
      id: 'codex-session-1',
      backend: 'codex',
      title: 'Codex thread title',
      preview: 'Summarize the issue backlog',
      workspace: '/workspace/codex',
    });
  });

  it('returns an empty list when no local session stores exist', async () => {
    const service = new LocalCliSessionService({ homeDir: createTempHome() });
    await expect(service.listSessions()).resolves.toEqual([]);
  });
});
