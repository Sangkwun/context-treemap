import { writeFileSync } from 'fs';
import { join } from 'path';
import { extractToolSchemas } from './utils/npm-schema.js';
import { countToolTokens } from './utils/token-counter.js';
import { today, ensureDirs, loadHistory, latestVersion, calcChange, saveIfChanged } from './utils/history.js';
import { readFileSync } from 'fs';

const ROOT = process.cwd();
const CONFIG_PATH = join(ROOT, 'config', 'servers.json');
const DATA_DIR = join(ROOT, 'data', 'mcp');
const SNAPSHOT_DIR = join(ROOT, 'data', 'snapshots');

ensureDirs(DATA_DIR, SNAPSHOT_DIR);

async function main() {
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  const date = today();
  const snapshot = { date, servers: [] };

  console.log(`\n📊 MCP Context Crawl — ${date}\n`);

  for (const server of config.servers) {
    console.log(`  ⏳ ${server.name} (${server.npm})...`);

    const historyPath = join(DATA_DIR, `${server.id}.json`);
    const history = loadHistory(historyPath, { name: server.name, npm: server.npm, repo: server.repo });
    const prev = latestVersion(history);

    try {
      const result = await extractToolSchemas(server.npm);

      let toolCount, tokens, version, method, toolNames;

      if (result && result.toolCount > 0) {
        const tokenResult = await countToolTokens(result.tools);
        toolCount = result.toolCount;
        tokens = tokenResult.tokens;
        version = result.version;
        method = tokenResult.method;
        toolNames = result.toolNames;
      } else if (result && result.version !== 'unknown') {
        version = result.version;
        if (server.knownTools) {
          toolCount = server.knownTools;
          tokens = toolCount * 750;
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
      } else if (server.knownTools) {
        // Extraction failed (null) but knownTools configured — use estimate
        console.log(`  ⚠️  ${server.name}: crawl failed, using knownTools estimate`);
        version = prev?.version || 'unknown';
        toolCount = server.knownTools;
        tokens = toolCount * 750;
        method = 'estimate';
        toolNames = prev?.toolNames || [];
      } else if (prev) {
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

      const change = calcChange(prev, tokens, { tools: prev ? toolCount - prev.tools : 0 });

      const entry = { version, date, tools: toolCount, tokens, method, toolNames, change };
      const hasChanged = !prev || prev.version !== version || prev.tokens !== tokens || prev.tools !== toolCount;
      saveIfChanged(historyPath, history, entry, hasChanged);

      const arrow = change.pct > 0 ? `▲ +${change.pct}%` : change.pct < 0 ? `▼ ${change.pct}%` : '—';
      console.log(`  ✓ ${server.name}: ${toolCount} tools, ${tokens.toLocaleString()} tokens ${arrow} [${method}]`);

      snapshot.servers.push({
        id: server.id, name: server.name, version, tools: toolCount,
        tokens, method, change,
      });
    } catch (err) {
      console.error(`  ✗ ${server.name}: ${err.message}`);
      if (prev) {
        snapshot.servers.push({
          id: server.id, name: server.name, version: prev.version,
          tools: prev.tools, tokens: prev.tokens, method: 'carried',
          change: { tokens: 0, pct: 0, tools: 0 },
        });
      }
    }
  }

  writeFileSync(
    join(SNAPSHOT_DIR, `${date}.json`),
    JSON.stringify(snapshot, null, 2) + '\n'
  );

  const totalTokens = snapshot.servers.reduce((sum, s) => sum + s.tokens, 0);
  const totalTools = snapshot.servers.reduce((sum, s) => sum + s.tools, 0);
  console.log(`\n📋 Summary: ${snapshot.servers.length} servers, ${totalTools} tools, ${totalTokens.toLocaleString()} tokens`);
  console.log(`   1M context: ${(totalTokens / 1000000 * 100).toFixed(1)}% consumed by MCP alone\n`);
}

main().catch(console.error);
