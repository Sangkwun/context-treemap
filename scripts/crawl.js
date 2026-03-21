import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { extractToolSchemas } from './utils/npm-schema.js';
import { countToolTokens } from './utils/token-counter.js';

const ROOT = process.cwd();
const CONFIG_PATH = join(ROOT, 'config', 'servers.json');
const DATA_DIR = join(ROOT, 'data', 'mcp');
const SNAPSHOT_DIR = join(ROOT, 'data', 'snapshots');

async function main() {
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  const today = new Date().toISOString().split('T')[0];
  const snapshot = { date: today, servers: [] };

  console.log(`\n📊 MCP Context Crawl — ${today}\n`);

  for (const server of config.servers) {
    console.log(`  ⏳ ${server.name} (${server.npm})...`);

    try {
      // Extract tool schemas from npm package
      const result = await extractToolSchemas(server.npm);

      if (!result) {
        console.log(`  ⚠️  Skipped: could not extract schemas`);
        continue;
      }

      // Count tokens
      const tokenResult = await countToolTokens(result.tools);

      // Load existing history
      const historyPath = join(DATA_DIR, `${server.id}.json`);
      const history = existsSync(historyPath)
        ? JSON.parse(readFileSync(historyPath, 'utf-8'))
        : { name: server.name, npm: server.npm, repo: server.repo, versions: [] };

      // Calculate change from previous version
      const prev = history.versions[history.versions.length - 1];
      const change = prev
        ? {
            tokens: tokenResult.tokens - prev.tokens,
            pct: prev.tokens > 0
              ? +((tokenResult.tokens - prev.tokens) / prev.tokens * 100).toFixed(1)
              : 0,
            tools: result.toolCount - prev.tools,
          }
        : { tokens: 0, pct: 0, tools: 0 };

      // Skip if nothing changed
      if (prev && prev.version === result.version && prev.tokens === tokenResult.tokens) {
        console.log(`  ✓ ${server.name}: no change (${result.toolCount} tools, ${tokenResult.tokens} tokens)`);
        snapshot.servers.push({
          id: server.id,
          name: server.name,
          version: result.version,
          tools: result.toolCount,
          tokens: tokenResult.tokens,
          method: tokenResult.method,
          change,
        });
        continue;
      }

      // Add new version entry
      const entry = {
        version: result.version,
        date: today,
        tools: result.toolCount,
        tokens: tokenResult.tokens,
        method: tokenResult.method,
        toolNames: result.toolNames,
        change,
      };

      history.versions.push(entry);
      writeFileSync(historyPath, JSON.stringify(history, null, 2) + '\n');

      const arrow = change.pct > 0 ? `▲ +${change.pct}%` : change.pct < 0 ? `▼ ${change.pct}%` : '—';
      console.log(`  ✓ ${server.name}: ${result.toolCount} tools, ${tokenResult.tokens} tokens ${arrow}`);

      snapshot.servers.push({
        id: server.id,
        name: server.name,
        version: result.version,
        tools: result.toolCount,
        tokens: tokenResult.tokens,
        method: tokenResult.method,
        change,
      });
    } catch (err) {
      console.error(`  ✗ ${server.name}: ${err.message}`);
    }
  }

  // Save snapshot
  const snapshotPath = join(SNAPSHOT_DIR, `${today}.json`);
  writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2) + '\n');

  // Summary
  const totalTokens = snapshot.servers.reduce((sum, s) => sum + s.tokens, 0);
  const totalTools = snapshot.servers.reduce((sum, s) => sum + s.tools, 0);
  console.log(`\n📋 Summary: ${snapshot.servers.length} servers, ${totalTools} tools, ${totalTokens.toLocaleString()} tokens`);
  console.log(`   1M context: ${(totalTokens / 1000000 * 100).toFixed(1)}% consumed by MCP alone\n`);
}

main().catch(console.error);
