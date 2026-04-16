/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ILocalCliSessionSummary } from '@/common/adapter/ipcBridge';
import { DatabaseSync } from 'node:sqlite';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';

const MAX_CODEX_SESSIONS = 100;
const MAX_CLAUDE_SESSION_FILES = 150;
const MAX_TITLE_LENGTH = 96;
const MAX_PREVIEW_LENGTH = 180;

type LocalCliSessionServiceOptions = {
  homeDir?: string;
};

type CodexThreadRow = {
  id: string;
  title: string;
  first_user_message: string;
  cwd: string;
  updated_at: number;
  rollout_path: string;
};

type ClaudeSessionEntry = {
  cwd?: string;
  sessionId?: string;
  timestamp?: string;
  type?: string;
  message?: {
    content?: string | Array<{ type?: string; text?: string; thinking?: string }>;
  };
  content?: string;
};

function normalizeTimestamp(value: number | string | undefined): number {
  if (typeof value === 'number') {
    return value > 1_000_000_000_000 ? value : value * 1000;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function toSingleLine(value: string | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function normalizeTitle(primary: string | undefined, fallback: string | undefined): string {
  const raw = toSingleLine(primary) || toSingleLine(fallback) || 'Untitled session';
  return truncate(raw, MAX_TITLE_LENGTH);
}

function normalizePreview(value: string | undefined, title: string): string {
  const raw = toSingleLine(value) || title;
  return truncate(raw, MAX_PREVIEW_LENGTH);
}

function extractClaudeContent(entry: ClaudeSessionEntry): string {
  if (typeof entry.message?.content === 'string') {
    return entry.message.content;
  }
  if (Array.isArray(entry.message?.content)) {
    const textPart = entry.message.content.find((part) => part.type === 'text' && typeof part.text === 'string');
    if (textPart?.text) return textPart.text;
    const thinkingPart = entry.message.content.find(
      (part) => part.type === 'thinking' && typeof part.thinking === 'string'
    );
    if (thinkingPart?.thinking) return thinkingPart.thinking;
  }
  if (typeof entry.content === 'string') {
    return entry.content;
  }
  return '';
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export class LocalCliSessionService {
  private readonly homeDir: string;

  constructor(options: LocalCliSessionServiceOptions = {}) {
    this.homeDir = options.homeDir || os.homedir();
  }

  async listSessions(): Promise<ILocalCliSessionSummary[]> {
    const [codexSessions, claudeSessions] = await Promise.all([this.listCodexSessions(), this.listClaudeSessions()]);
    return [...codexSessions, ...claudeSessions].sort((left, right) => right.updatedAt - left.updatedAt);
  }

  private async listCodexSessions(): Promise<ILocalCliSessionSummary[]> {
    const databasePath = path.join(this.homeDir, '.codex', 'state_5.sqlite');
    if (!(await pathExists(databasePath))) {
      return [];
    }

    let database: DatabaseSync | null = null;
    try {
      database = new DatabaseSync(databasePath);
      const rows = database
        .prepare(
          `SELECT id, title, first_user_message, cwd, updated_at, rollout_path
           FROM threads
           WHERE archived = 0
           ORDER BY updated_at DESC
           LIMIT ?`
        )
        .all(MAX_CODEX_SESSIONS) as CodexThreadRow[];

      return rows
        .filter((row) => Boolean(row.id) && Boolean(row.cwd))
        .map((row) => {
          const title = normalizeTitle(row.title, row.first_user_message);
          return {
            id: row.id,
            backend: 'codex',
            title,
            preview: normalizePreview(row.first_user_message, title),
            workspace: row.cwd,
            updatedAt: normalizeTimestamp(row.updated_at),
            sourcePath: row.rollout_path,
          } satisfies ILocalCliSessionSummary;
        });
    } catch (error) {
      console.warn('[LocalCliSessionService] Failed to read Codex sessions:', error);
      return [];
    } finally {
      database?.close();
    }
  }

  private async listClaudeSessions(): Promise<ILocalCliSessionSummary[]> {
    const projectsRoot = path.join(this.homeDir, '.claude', 'projects');
    if (!(await pathExists(projectsRoot))) {
      return [];
    }

    try {
      const projectEntries = await fs.readdir(projectsRoot, { withFileTypes: true });
      const sessionFiles: Array<{ filePath: string; updatedAt: number }> = [];

      for (const projectEntry of projectEntries) {
        if (!projectEntry.isDirectory()) continue;
        const projectPath = path.join(projectsRoot, projectEntry.name);
        const childEntries = await fs.readdir(projectPath, { withFileTypes: true });
        for (const childEntry of childEntries) {
          if (!childEntry.isFile() || !childEntry.name.endsWith('.jsonl')) continue;
          const filePath = path.join(projectPath, childEntry.name);
          const stat = await fs.stat(filePath);
          sessionFiles.push({ filePath, updatedAt: stat.mtimeMs });
        }
      }

      const latestFiles = sessionFiles
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .slice(0, MAX_CLAUDE_SESSION_FILES);

      const summaries = await Promise.all(
        latestFiles.map(async ({ filePath, updatedAt }) => this.readClaudeSession(filePath, updatedAt))
      );
      return summaries.filter((session): session is ILocalCliSessionSummary => Boolean(session));
    } catch (error) {
      console.warn('[LocalCliSessionService] Failed to read Claude sessions:', error);
      return [];
    }
  }

  private async readClaudeSession(
    filePath: string,
    fallbackUpdatedAt: number
  ): Promise<ILocalCliSessionSummary | null> {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const lines = raw.split(/\r?\n/);
      let firstMeaningfulEntry: ClaudeSessionEntry | null = null;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const entry = JSON.parse(trimmed) as ClaudeSessionEntry;
        if (entry.type === 'file-history-snapshot') continue;
        firstMeaningfulEntry = entry;
        break;
      }

      if (!firstMeaningfulEntry) {
        return null;
      }

      const sessionId = firstMeaningfulEntry.sessionId || path.basename(filePath, '.jsonl');
      const previewSource = extractClaudeContent(firstMeaningfulEntry);
      const title = normalizeTitle(previewSource, sessionId);
      const workspace = toSingleLine(firstMeaningfulEntry.cwd) || this.homeDir;
      return {
        id: sessionId,
        backend: 'claude',
        title,
        preview: normalizePreview(previewSource, title),
        workspace,
        updatedAt: normalizeTimestamp(firstMeaningfulEntry.timestamp) || fallbackUpdatedAt,
        sourcePath: filePath,
      };
    } catch (error) {
      console.warn('[LocalCliSessionService] Failed to parse Claude session:', filePath, error);
      return null;
    }
  }
}

export const localCliSessionService = new LocalCliSessionService();
