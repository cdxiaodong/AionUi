/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { listLocalCliSessions } from '../../src/process/agent/acp/utils';

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aionui-cli-sessions-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('listLocalCliSessions', () => {
  it('discovers recent top-level Claude and Codex sessions', async () => {
    const root = await createTempDir();
    const claudeProjectsDir = path.join(root, '.claude', 'projects', '-tmp-workspace');
    const codexSessionsDir = path.join(root, '.codex', 'sessions', '2026', '04', '17');
    await fs.mkdir(claudeProjectsDir, { recursive: true });
    await fs.mkdir(path.join(claudeProjectsDir, 'subagents'), { recursive: true });
    await fs.mkdir(codexSessionsDir, { recursive: true });

    const claudeSession = path.join(claudeProjectsDir, 'claude-main.jsonl');
    await fs.writeFile(
      claudeSession,
      [
        JSON.stringify({ type: 'queue-operation', operation: 'enqueue', sessionId: 'claude-main' }),
        JSON.stringify({
          sessionId: 'claude-main',
          cwd: '/tmp/claude-workspace',
          type: 'user',
          isSidechain: false,
          message: { role: 'user', content: [{ type: 'text', text: 'Investigate workspace sync' }] },
          timestamp: '2026-04-17T03:00:00.000Z',
        }),
      ].join('\n')
    );
    await fs.writeFile(
      path.join(claudeProjectsDir, 'subagents', 'claude-sidechain.jsonl'),
      JSON.stringify({
        sessionId: 'claude-sidechain',
        cwd: '/tmp/claude-sidechain',
        isSidechain: true,
        message: { role: 'user', content: [{ type: 'text', text: 'Ignore me' }] },
      })
    );

    const codexSession = path.join(codexSessionsDir, 'rollout-2026-04-17T04-00-00-sample.jsonl');
    await fs.writeFile(
      codexSession,
      [
        JSON.stringify({
          timestamp: '2026-04-17T04:00:00.000Z',
          type: 'session_meta',
          payload: { id: 'codex-main', cwd: '/tmp/codex-workspace', timestamp: '2026-04-17T04:00:00.000Z' },
        }),
        JSON.stringify({ type: 'last-prompt', lastPrompt: 'Continue Codex rollout', sessionId: 'codex-main' }),
      ].join('\n')
    );

    const now = new Date();
    await fs.utimes(claudeSession, now, new Date('2026-04-17T03:00:00.000Z'));
    await fs.utimes(codexSession, now, new Date('2026-04-17T04:00:00.000Z'));

    const sessions = await listLocalCliSessions(10, {
      claudeProjectsDir: path.join(root, '.claude', 'projects'),
      codexSessionsDir: path.join(root, '.codex', 'sessions'),
    });

    expect(sessions).toHaveLength(2);
    expect(sessions.map((session) => session.backend)).toEqual(['codex', 'claude']);
    expect(sessions[0]).toMatchObject({
      backend: 'codex',
      sessionId: 'codex-main',
      cwd: '/tmp/codex-workspace',
      title: 'Continue Codex rollout',
    });
    expect(sessions[1]).toMatchObject({
      backend: 'claude',
      sessionId: 'claude-main',
      cwd: '/tmp/claude-workspace',
      title: 'Investigate workspace sync',
    });
  });
});
