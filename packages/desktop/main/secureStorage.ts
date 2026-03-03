/**
 * Secure Token Storage — encrypts JWT tokens via Electron safeStorage (OS keychain).
 * Falls back to plain JSON if encryption unavailable.
 */

import { app, safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';

const TOKENS_FILE = 'secure-tokens.enc';

function getTokensPath(): string {
  return path.join(app.getPath('userData'), TOKENS_FILE);
}

export function storeTokens(accessToken: string, refreshToken: string): void {
  const json = JSON.stringify({ accessToken, refreshToken });
  const tokensPath = getTokensPath();

  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(json);
    fs.writeFileSync(tokensPath, encrypted);
  } else {
    // Fallback: plain text (dev environments without keychain)
    fs.writeFileSync(tokensPath, json, 'utf-8');
  }
}

export function loadTokens(): { accessToken: string; refreshToken: string } | null {
  const tokensPath = getTokensPath();
  if (!fs.existsSync(tokensPath)) return null;

  try {
    let json: string;

    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = fs.readFileSync(tokensPath);
      json = safeStorage.decryptString(encrypted);
    } else {
      json = fs.readFileSync(tokensPath, 'utf-8');
    }

    const parsed = JSON.parse(json);
    if (typeof parsed.accessToken === 'string' && typeof parsed.refreshToken === 'string') {
      return parsed;
    }
  } catch {
    // Corrupted or wrong encryption — clear and return null
    clearTokens();
  }
  return null;
}

export function clearTokens(): void {
  const tokensPath = getTokensPath();
  if (fs.existsSync(tokensPath)) {
    fs.unlinkSync(tokensPath);
  }
}
