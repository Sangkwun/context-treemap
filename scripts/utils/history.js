import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

/**
 * Get today's date as YYYY-MM-DD.
 */
export function today() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Ensure directories exist.
 */
export function ensureDirs(...dirs) {
  for (const d of dirs) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  }
}

/**
 * Load a JSON history file, or create a new one with defaults.
 */
export function loadHistory(path, defaults = {}) {
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, 'utf-8'));
  }
  return { ...defaults, versions: [] };
}

/**
 * Get the latest version entry from a history object.
 */
export function latestVersion(history) {
  return history.versions[history.versions.length - 1] || null;
}

/**
 * Calculate change between previous and current numeric values.
 * Returns { tokens, pct, ...extra }.
 */
export function calcChange(prev, current, extra = {}) {
  if (!prev) return { tokens: 0, pct: 0, ...extra };
  const prevTokens = prev.tokens ?? prev.alwaysOnTokens ?? 0;
  const diff = current - prevTokens;
  return {
    tokens: diff,
    pct: prevTokens > 0 ? +((diff / prevTokens) * 100).toFixed(1) : 0,
    ...extra,
  };
}

/**
 * Append a version entry to history and save, only if data changed.
 */
export function saveIfChanged(path, history, entry, hasChanged) {
  if (hasChanged) {
    history.versions.push(entry);
    writeFileSync(path, JSON.stringify(history, null, 2) + '\n');
  }
}
