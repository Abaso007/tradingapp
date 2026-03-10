#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ENV_PATH = path.resolve(__dirname, '../config/.env');

const DEFAULTS = {
  // Scheduler tick: avoid overlapping long-running rebalance/sync cycles by default.
  REBALANCE_SCHEDULER_CRON: '*/10 * * * * *',

  // Polymarket CLOB pacing: helps avoid Cloudflare 429 / Error 1015.
  // Tune higher if you still see frequent rate limits.
  POLYMARKET_CLOB_MIN_REQUEST_INTERVAL_MS: '500',
};

const LEGACY_VALUE_MIGRATIONS = {
  REBALANCE_SCHEDULER_CRON: {
    from: '*/1 * * * * *',
    to: DEFAULTS.REBALANCE_SCHEDULER_CRON,
  },
};

const parseExistingKeys = (contents) => {
  const keys = new Set();
  const lines = String(contents || '').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    if (key) keys.add(key);
  }
  return keys;
};

const migrateLegacyDefaults = (contents) => {
  let nextContents = String(contents || '');
  const migratedKeys = [];

  for (const [key, migration] of Object.entries(LEGACY_VALUE_MIGRATIONS)) {
    const from = migration?.from;
    const to = migration?.to;
    if (!from || !to || from === to) {
      continue;
    }
    const pattern = new RegExp(`^(${key}=)${from.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}$`, 'm');
    if (pattern.test(nextContents)) {
      nextContents = nextContents.replace(pattern, `$1${to}`);
      migratedKeys.push(key);
    }
  }

  return {
    contents: nextContents,
    migratedKeys,
  };
};

const main = () => {
  let contents = '';
  try {
    contents = fs.readFileSync(ENV_PATH, 'utf8');
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
      console.warn(`[ensure-env-defaults] ${ENV_PATH} not found; skipping.`);
      process.exit(0);
    }
    console.error(`[ensure-env-defaults] Unable to read ${ENV_PATH}:`, error?.message || error);
    process.exit(1);
  }

  const existingKeys = parseExistingKeys(contents);
  const additions = [];
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (!existingKeys.has(key)) {
      additions.push(`${key}=${value}`);
    }
  }

  const migration = migrateLegacyDefaults(contents);
  contents = migration.contents;

  if (additions.length === 0 && migration.migratedKeys.length === 0) {
    console.log('[ensure-env-defaults] No changes needed.');
    process.exit(0);
  }

  const suffix = `${contents.endsWith('\n') ? '' : '\n'}\n# Added by tradingapp deploy (non-secret defaults)\n${additions.join('\n')}\n`;

  try {
    fs.writeFileSync(ENV_PATH, additions.length > 0 ? `${contents}${suffix}` : contents, 'utf8');
  } catch (error) {
    console.error(`[ensure-env-defaults] Unable to update ${ENV_PATH}:`, error?.message || error);
    process.exit(1);
  }

  if (migration.migratedKeys.length > 0) {
    console.log('[ensure-env-defaults] Migrated:', migration.migratedKeys.join(', '));
  }
  if (additions.length > 0) {
    console.log('[ensure-env-defaults] Added:', additions.map((line) => line.split('=')[0]).join(', '));
  }
};

main();
