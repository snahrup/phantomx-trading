// ============================================================================
// PhantomX — Claude Agent SDK OAuth Token Reader
// Reads credentials from ~/.claude/.credentials.json (Claude Max subscription)
// ============================================================================

import fs from 'fs';
import path from 'path';
import os from 'os';

interface ClaudeCredentials {
  claudeAiOauth?: {
    accessToken: string;
    accountEmailAddress?: string;
    accountDisplayName?: string;
    expiresAt?: number;
  };
}

const CREDENTIAL_PATHS = [
  path.join(os.homedir(), '.claude', '.credentials.json'),
  path.join(os.homedir(), '.claude', 'credentials.json'),
];

if (process.env.APPDATA) {
  CREDENTIAL_PATHS.push(path.join(process.env.APPDATA, 'Claude', 'credentials.json'));
}
if (process.env.LOCALAPPDATA) {
  CREDENTIAL_PATHS.push(path.join(process.env.LOCALAPPDATA, 'Claude', 'credentials.json'));
}

function isValidTokenFormat(token: string): boolean {
  return token.startsWith('sk-ant-oat01-');
}

function isTokenExpired(expiresAt?: number): boolean {
  if (!expiresAt) return false;
  const EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes
  return Date.now() >= (expiresAt - EXPIRY_BUFFER_MS);
}

export function readOAuthToken(): string | null {
  for (const credPath of CREDENTIAL_PATHS) {
    try {
      if (!fs.existsSync(credPath)) continue;

      const raw = fs.readFileSync(credPath, 'utf-8');
      const creds: ClaudeCredentials = JSON.parse(raw);

      const token = creds.claudeAiOauth?.accessToken;
      if (!token) continue;

      if (!isValidTokenFormat(token)) {
        console.warn(`[PhantomX] Token at ${credPath} has invalid format, skipping`);
        continue;
      }

      if (isTokenExpired(creds.claudeAiOauth?.expiresAt)) {
        console.warn(`[PhantomX] Token at ${credPath} is expired, skipping`);
        continue;
      }

      return token;
    } catch {
      // Skip unreadable files
    }
  }

  return null;
}

export function ensureOAuthEnv(): void {
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) return;

  const token = readOAuthToken();
  if (token) {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = token;
    // Prevent accidental API billing
    delete process.env.ANTHROPIC_API_KEY;
    console.log('[PhantomX] OAuth token loaded from credentials file');
  } else {
    console.warn('[PhantomX] No valid OAuth token found in credential paths');
  }
}

export function getClaudeCodePath(): string {
  if (process.env.CLAUDE_CODE_PATH) return process.env.CLAUDE_CODE_PATH;

  const candidates: string[] = [];

  // npm global on Windows
  if (process.env.APPDATA) {
    candidates.push(
      path.join(process.env.APPDATA, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js')
    );
  }

  // Local node_modules
  candidates.push(
    path.resolve(process.cwd(), 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js')
  );

  // Walk up from __dirname
  candidates.push(
    path.resolve(__dirname, '..', '..', '..', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'),
    path.resolve(__dirname, '..', '..', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'),
  );

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // skip
    }
  }

  // Fallback: assume `claude` is on PATH
  return 'claude';
}
