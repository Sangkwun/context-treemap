import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { extractToolSchemas } from './utils/npm-schema.js';
import { countToolTokens } from './utils/token-counter.js';

const ROOT = process.cwd();
const CONFIG_PATH = join(ROOT, 'config', 'servers.json');
const DATA_DIR = join(ROOT, 'data', 'mcp');
const SNAPSHOT_DIR = join(ROOT, 'data', 'snapshots');

// Ensure dirs
[DATA_DIR, SNAPSHOT_DIR].forEach(d => {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
});

async function main() {
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  const today = new Date().toISOString().split('T')[0];
  const snapshot = { date: today, servers: [] };

  console.log(`\n📊 MCP Context Crawl — ${today}\n`);

  for (const server of config.servers) {
    console.log(`  ⏳ ${server.name} (${server.npm})...`);

    // Load existing history for fallback
    const historyPath = join(DATA_DIR, `${server.id}.json`);
    const history = existsSync(historyPath)
      ? JSON.parse(readFileSync(historyPath, 'utf-8'))
      : { name: server.name, npm: server.npm, repo: server.repo, versions: [] };
    const prev = history.versions[history.versions.length - 1];

    try {
      // Extract tool schemas from npm package
      const result = await extractToolSchemas(server.npm);

      let toolCount, tokens, version, method, toolNames;

      if (result && result.toolCount > 0) {
        // Successfully extracted tools
        const tokenResult = await countToolTokens(result.tools);
        toolCount = result.toolCount;
        tokens = tokenResult.tokens;
        version = result.version;
        method = tokenResult.method;
        toolNames = result.toolNames;
      } else if (result && result.version !== 'unknown') {
        // Got version but no tools — use known tool count if available
        version = result.version;
        if (server.knownTools) {
          toolCount = server.knownTools;
          tokens = toolCount * 750; // estimate
          method = 'estimate';
          toolNames = [];
        } else if (prev) {
          toolCount = prev.tools;
          tokens = prev.tokens;
          method = 'carried';
          toolNames = prev.toolNames || [];
        } else {
          console.log(`  ⚠️  ${server.name}: no tools found, no fallback`);
          continue;
        }
      } else if (prev) {
        // Complete failure — carry forward previous data
        console.log(`  ⚠️  ${server.name}: crawl failed, carrying forward`);
        toolCount = prev.tools;
        tokens = prev.tokens;
        version = prev.version;
        method = 'carried';
        toolNames = prev.toolNames || [];
      } else {
        console.log(`  ✗ ${server.name}: no data available`);
        continue;
      }

      // Calculate change
      const change = prev
        ? {
            tokens: tokens - prev.tokens,
            pct: prev.tokens > 0
              ? +((tokens - prev.tokens) / prev.tokens * 100).toFixed(1)
              : 0,
            tools: toolCount - prev.tools,
          }
        : { tokens: 0, pct: 0, tools: 0 };

      // Only add new version if something changed
      if (!prev || prev.version !== version || prev.tokens !== tokens || prev.tools !== toolCount) {
        history.versions.push({
          version, date: today, tools: toolCount, tokens, method, toolNames, change,
        });
        writeFileSync(historyPath, JSON.stringify(history, null, 2) + '\n');
      }

      const arrow = change.pct > 0 ? `▲ +${change.pct}%` : change.pct < 0 ? `▼ ${change.pct}%` : '—';
      console.log(`  ✓ ${server.name}: ${toolCount} tools, ${tokens.toLocaleString()} tokens ${arrow} [${method}]`);

      snapshot.servers.push({
        id: server.id, name: server.name, version, tools: toolCount,
        tokens, method, change,
      });
    } catch (err) {
      console.error(`  ✗ ${server.name}: ${err.message}`);
      // Carry forward if possible
      if (prev) {
        snapshot.servers.push({
          id: server.id, name: server.name, version: prev.version,
          tools: prev.tools, tokens: prev.tokens, method: 'carried',
          change: { tokens: 0, pct: 0, tools: 0 },
        });
      }
    }
  }

  // Save snapshot
  writeFileSync(
    join(SNAPSHOT_DIR, `${today}.json`),
    JSON.stringify(snapshot, null, 2) + '\n'
  );

  // Summary
  const totalTokens = snapshot.servers.reduce((sum, s) => sum + s.tokens, 0);
  const totalTools = snapshot.servers.reduce((sum, s) => sum + s.tools, 0);
  console.log(`\n📋 Summary: ${snapshot.servers.length} servers, ${totalTools} tools, ${totalTokens.toLocaleString()} tokens`);
  console.log(`   1M context: ${(totalTokens / 1000000 * 100).toFixed(1)}% consumed by MCP alone\n`);
}

main().catch(console.error);
