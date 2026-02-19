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

// Secondary token paths — second Claude Max subscription
const CREDENTIAL_PATHS_2 = [
  path.join(os.homedir(), '.claude', '.credentials-2.json'),
  path.join(os.homedir(), '.claude', 'credentials-2.json'),
];

if (process.env.APPDATA) {
  CREDENTIAL_PATHS.push(path.join(process.env.APPDATA, 'Claude', 'credentials.json'));
  CREDENTIAL_PATHS_2.push(path.join(process.env.APPDATA, 'Claude', 'credentials-2.json'));
}
if (process.env.LOCALAPPDATA) {
  CREDENTIAL_PATHS.push(path.join(process.env.LOCALAPPDATA, 'Claude', 'credentials.json'));
  CREDENTIAL_PATHS_2.push(path.join(process.env.LOCALAPPDATA, 'Claude', 'credentials-2.json'));
}

function isValidTokenFormat(token: string): boolean {
  return token.startsWith('sk-ant-oat01-');
}

function isTokenExpired(expiresAt?: number): boolean {
  if (!expiresAt) return false;
  const EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes
  return Date.now() >= (expiresAt - EXPIRY_BUFFER_MS);
}

function readTokenFromPaths(paths: string[]): string | null {
  for (const credPath of paths) {
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

export function readOAuthToken(): string | null {
  return readTokenFromPaths(CREDENTIAL_PATHS);
}

// ---------------------------------------------------------------------------
// Multi-Token Pool — Round-robin across multiple Claude Max subscriptions
// ---------------------------------------------------------------------------

let tokenPool: string[] = [];
let tokenIndex = 0;
let tokenPoolInitialized = false;

function initTokenPool(): void {
  if (tokenPoolInitialized) return;
  tokenPoolInitialized = true;

  const tokens: string[] = [];

  // Primary token
  const t1 = process.env.CLAUDE_CODE_OAUTH_TOKEN || readTokenFromPaths(CREDENTIAL_PATHS);
  if (t1) tokens.push(t1);

  // Secondary token (second Claude Max subscription)
  const t2 = process.env.PHANTOMX_OAUTH_TOKEN_2 || readTokenFromPaths(CREDENTIAL_PATHS_2);
  if (t2 && t2 !== t1) tokens.push(t2);

  tokenPool = tokens;
  console.log(`[PhantomX] Token pool initialized with ${tokens.length} token(s)`);
}

/**
 * Get the next OAuth token via round-robin. Each call rotates to the next
 * available token, distributing load across Claude Max subscriptions.
 */
export function getNextOAuthToken(): string | null {
  initTokenPool();
  if (tokenPool.length === 0) return null;
  const token = tokenPool[tokenIndex % tokenPool.length];
  tokenIndex++;
  return token;
}

/**
 * Get the total number of available tokens.
 */
export function getTokenCount(): number {
  initTokenPool();
  return tokenPool.length;
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
