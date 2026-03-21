import { createCanvas, registerFont } from 'canvas';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { treemap, hierarchy, treemapSquarify } from 'd3-hierarchy';

const ROOT = process.cwd();
const DATA_DIR = join(ROOT, 'data');
const IMAGES_DIR = join(ROOT, 'images');
const ARCHIVE_DIR = join(IMAGES_DIR, 'archive');

// ── Style ────────────────────────────────────────────────
const STYLE = {
  bg: '#0d1117',
  border: '#21262d',
  textPrimary: '#e6edf3',
  textSecondary: '#8b949e',
  textMuted: '#6b7280',
  green: '#4ade80',
  red: '#f87171',
  orange: '#fb923c',
  blue: '#60a5fa',
};

function changeColor(pct) {
  if (pct > 5) return '#7f1d1d';
  if (pct > 0) return '#451a1a';
  if (pct < -3) return '#14532d';
  if (pct < 0) return '#1a3a2a';
  return '#1e293b';
}

function changeBadgeColor(pct) {
  if (pct > 0) return STYLE.red;
  if (pct < 0) return STYLE.green;
  return STYLE.textMuted;
}

function formatTokens(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

// ── Canvas Helpers ───────────────────────────────────────

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function setFont(ctx, size, weight = 'normal') {
  const w = weight === 'bold' ? 'bold' : weight === 'semibold' ? '600' : 'normal';
  ctx.font = `${w} ${size}px "Inter", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
}

/**
 * Calculate font size that makes text fill ~targetRatio of the block width.
 * Uses canvas measureText for accuracy.
 */
function fitFontSize(ctx, text, blockW, blockH, weight = 'bold', targetRatio = 0.85, maxLines = 3) {
  const maxByHeight = blockH / (maxLines * 1.6);
  let fs = Math.min(blockW * 0.15, maxByHeight, 48);

  // Binary search for best fit
  let lo = 8, hi = fs;
  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) / 2;
    setFont(ctx, mid, weight);
    const measured = ctx.measureText(text).width;
    if (measured < blockW * targetRatio) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return Math.max(10, Math.floor(lo));
}

// ── Load Data ────────────────────────────────────────────

function loadLatestSnapshot() {
  const snapshotDir = join(DATA_DIR, 'snapshots');
  if (!existsSync(snapshotDir)) return null;

  const files = readdirSync(snapshotDir).filter(f => f.endsWith('.json')).sort();
  if (files.length === 0) return null;

  return JSON.parse(readFileSync(join(snapshotDir, files[files.length - 1]), 'utf-8'));
}

function loadMcpHistory() {
  const mcpDir = join(DATA_DIR, 'mcp');
  if (!existsSync(mcpDir)) return {};

  const history = {};
  for (const file of readdirSync(mcpDir).filter(f => f.endsWith('.json'))) {
    const id = file.replace('.json', '');
    history[id] = JSON.parse(readFileSync(join(mcpDir, file), 'utf-8'));
  }
  return history;
}

// ── Render MCP Treemap ───────────────────────────────────

function renderMcpTreemap(snapshot) {
  const W = 1600, H = 900;
  const HEADER = 90;
  const PAD = 3;

  const canvas = createCanvas(W, H + HEADER);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = STYLE.bg;
  ctx.fillRect(0, 0, W, H + HEADER);

  const servers = snapshot.servers.sort((a, b) => b.tokens - a.tokens);
  const totalTokens = servers.reduce((s, x) => s + x.tokens, 0);
  const totalTools = servers.reduce((s, x) => s + x.tools, 0);

  // D3 treemap layout
  const root = hierarchy({
    children: servers.map(s => ({ ...s, value: s.tokens })),
  }).sum(d => d.value);

  treemap()
    .size([W, H])
    .padding(PAD)
    .tile(treemapSquarify)
    (root);

  // Draw blocks
  for (const leaf of root.leaves()) {
    const d = leaf.data;
    const x = leaf.x0, y = leaf.y0 + HEADER;
    const w = leaf.x1 - leaf.x0, h = leaf.y1 - leaf.y0;

    const changePct = d.change?.pct || 0;

    // Block background
    ctx.fillStyle = changeColor(changePct);
    roundRect(ctx, x + 1, y + 1, w - 2, h - 2, 4);
    ctx.fill();

    // Border
    ctx.strokeStyle = STYLE.border;
    ctx.lineWidth = 1;
    roundRect(ctx, x + 1, y + 1, w - 2, h - 2, 4);
    ctx.stroke();

    // Stock-style centered label: NAME big + sub-info below
    const pad = 6;
    const innerW = w - pad * 2;
    const innerH = h - pad * 2;
    if (innerW < 15 || innerH < 12) continue;

    ctx.textAlign = 'center';
    const cx = x + w / 2;
    const cy = y + h / 2;

    // Short name for fitting
    const shortName = d.name.replace(' MCP', '').replace(' Server', '');

    // Line 1: Name (big, bold) — fit to block width
    const nameFs = fitFontSize(ctx, shortName, innerW, innerH, 'bold', 0.85, 2);

    // Line 2: sub info — tokens or change
    const changeTxt = changePct > 0 ? `+${changePct}%` : changePct < 0 ? `${changePct}%` : '';
    const subText = innerH > nameFs * 2
      ? `${formatTokens(d.tokens)}  ${changeTxt}`
      : changeTxt || formatTokens(d.tokens);
    const subFs = Math.max(8, nameFs * 0.5);

    // Calculate vertical centering
    const totalTextH = innerH > nameFs * 1.8 ? nameFs + subFs * 1.2 : nameFs;
    const startY = cy - totalTextH / 2;

    // Draw name
    setFont(ctx, nameFs, 'bold');
    ctx.fillStyle = STYLE.textPrimary;
    ctx.fillText(shortName, cx, startY + nameFs * 0.85);

    // Draw sub-info if space
    if (innerH > nameFs * 1.8) {
      setFont(ctx, subFs);
      ctx.fillStyle = changePct !== 0 ? changeBadgeColor(changePct) : STYLE.textSecondary;
      ctx.fillText(subText, cx, startY + nameFs * 0.85 + subFs * 1.4);
    }

    ctx.textAlign = 'left';
  }

  // ── Header ──
  ctx.fillStyle = STYLE.bg;
  ctx.fillRect(0, 0, W, HEADER);

  // Title
  setFont(ctx, 30, 'bold');
  ctx.fillStyle = STYLE.textPrimary;
  ctx.fillText('MCP Context Index', 16, 42);

  // Subtitle
  setFont(ctx, 13);
  ctx.fillStyle = STYLE.textSecondary;
  ctx.fillText(
    `Total: ${totalTokens.toLocaleString()} tokens (${(totalTokens / 1000000 * 100).toFixed(1)}% of 1M)  ·  ${servers.length} servers  ·  ${totalTools} tools  ·  ${snapshot.date}`,
    16, 62
  );

  // Legend
  const legendX = W - 380;
  const legends = [
    ['#7f1d1d', '▲ 5%+'], ['#451a1a', '▲ 0~5%'],
    ['#1e293b', 'No change'], ['#14532d', '▼ Decrease'],
  ];
  legends.forEach(([color, label], i) => {
    const lx = legendX + i * 90;
    ctx.fillStyle = color;
    roundRect(ctx, lx, 30, 12, 12, 2);
    ctx.fill();
    setFont(ctx, 9);
    ctx.fillStyle = STYLE.textSecondary;
    ctx.fillText(label, lx + 16, 40);
  });

  return canvas;
}

// ── Render Agent Context Treemap ─────────────────────────

function renderAgentContext(agentName, agentData, mcpSnapshot) {
  const W = 1600, H = 900;
  const HEADER = 90;
  const PAD = 3;
  const TOTAL = agentData?.contextWindow || 1000000;
  const totalLabel = TOTAL >= 1000000 ? '1M' : `${(TOTAL / 1000).toFixed(0)}K`;

  const canvas = createCanvas(W, H + HEADER);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = STYLE.bg;
  ctx.fillRect(0, 0, W, H + HEADER);

  // Build items: agent system + MCP servers + free space
  const items = [];

  // Agent system overhead
  if (agentData) {
    const latest = agentData.versions[agentData.versions.length - 1];
    if (latest.autocompactBuffer) {
      items.push({ name: 'Autocompact Buffer', tokens: latest.autocompactBuffer, color: '#1e293b', change: 0, category: 'buffer' });
    }
    if (latest.builtinTools) {
      items.push({ name: `Built-in Tools`, tokens: latest.builtinTools, color: '#4c1d95', change: 0, category: 'system' });
    }
    // Response buffer excluded — managed internally by the agent
    if (latest.systemPrompt) {
      items.push({ name: 'System Prompt', tokens: latest.systemPrompt, color: '#312e81', change: 0, category: 'system' });
    }
  }

  // MCP servers
  if (mcpSnapshot) {
    for (const server of mcpSnapshot.servers) {
      items.push({
        name: server.name,
        tokens: server.tokens,
        color: changeColor(server.change?.pct || 0),
        change: server.change?.pct || 0,
        category: 'mcp',
      });
    }
  }

  // Free space
  const used = items.reduce((s, x) => s + x.tokens, 0);
  const free = Math.max(0, TOTAL - used);
  items.push({ name: 'Available', tokens: free, color: '#0f2e1a', change: 0, category: 'free' });

  // D3 treemap
  const root = hierarchy({ children: items.map(d => ({ ...d, value: d.tokens })) }).sum(d => d.value);
  treemap().size([W, H]).padding(PAD).tile(treemapSquarify)(root);

  for (const leaf of root.leaves()) {
    const d = leaf.data;
    const x = leaf.x0, y = leaf.y0 + HEADER;
    const w = leaf.x1 - leaf.x0, h = leaf.y1 - leaf.y0;

    ctx.fillStyle = d.color;
    roundRect(ctx, x + 1, y + 1, w - 2, h - 2, 4);
    ctx.fill();
    ctx.strokeStyle = STYLE.border;
    ctx.lineWidth = 1;
    roundRect(ctx, x + 1, y + 1, w - 2, h - 2, 4);
    ctx.stroke();

    const isFree = d.category === 'free';
    const pct = (d.tokens / TOTAL * 100).toFixed(1);
    const pad = 6;
    const innerW = w - pad * 2;
    const innerH = h - pad * 2;
    if (innerW < 15 || innerH < 12) continue;

    ctx.textAlign = 'center';
    const cx = x + w / 2;
    const cy = y + h / 2;

    const shortName = d.name.replace(' MCP', '').replace(' Server', '').replace(' Buffer', '\nBuffer');
    const nameFs = fitFontSize(ctx, shortName.split('\n')[0], innerW, innerH, 'bold', 0.85, 2);
    const subText = `${formatTokens(d.tokens)} (${pct}%)`;
    const subFs = Math.max(8, nameFs * 0.5);
    const totalTextH = innerH > nameFs * 1.8 ? nameFs + subFs * 1.2 : nameFs;
    const startY = cy - totalTextH / 2;

    setFont(ctx, nameFs, 'bold');
    ctx.fillStyle = isFree ? STYLE.green : STYLE.textPrimary;
    ctx.fillText(shortName.split('\n')[0], cx, startY + nameFs * 0.85);

    if (innerH > nameFs * 1.8) {
      setFont(ctx, subFs);
      ctx.fillStyle = isFree ? '#22c55eaa' : STYLE.textSecondary;
      ctx.fillText(subText, cx, startY + nameFs * 0.85 + subFs * 1.4);
    }

    ctx.textAlign = 'left';
  }

  // Header
  ctx.fillStyle = STYLE.bg;
  ctx.fillRect(0, 0, W, HEADER);

  const freePct = (free / TOTAL * 100).toFixed(1);
  setFont(ctx, 28, 'bold');
  ctx.fillStyle = STYLE.textPrimary;
  ctx.fillText(`${agentName} — Context Window (${totalLabel})`, 16, 42);

  setFont(ctx, 13);
  ctx.fillStyle = STYLE.textSecondary;
  ctx.fillText(
    `System: ${formatTokens(used)} (${(used / TOTAL * 100).toFixed(1)}%)  ·  Available: ${formatTokens(free)} (${freePct}%)  ·  ${mcpSnapshot?.servers?.length || 0} MCP servers  ·  ${mcpSnapshot?.date || ''}`,
    16, 60
  );

  // Category legend
  const cats = [
    ['#312e81', 'System'], ['#4c1d95', 'Tools'], ['#7f1d1d', 'MCP ▲'],
    ['#1e293b', 'Buffer'], ['#0f2e1a', 'Free'],
  ];
  const legX = W - 400;
  cats.forEach(([c, l], i) => {
    const lx = legX + i * 75;
    ctx.fillStyle = c;
    roundRect(ctx, lx, 28, 12, 12, 2);
    ctx.fill();
    setFont(ctx, 9);
    ctx.fillStyle = STYLE.textSecondary;
    ctx.fillText(l, lx + 16, 38);
  });

  return canvas;
}

// ── Main ─────────────────────────────────────────────────

(async () => {
  const snapshot = loadLatestSnapshot();
  if (!snapshot) {
    console.log('No snapshot data found. Run `npm run crawl` first.');
    process.exit(1);
  }

  const today = snapshot.date;
  const archiveDir = join(ARCHIVE_DIR, today);

  const { mkdirSync } = await import('fs');
  const { mkdirSync: mkdirSyncFn } = await import('fs');
  if (!existsSync(archiveDir)) mkdirSyncFn(archiveDir, { recursive: true });

  // 1. MCP Treemap
  console.log('  Rendering MCP treemap...');
  const mcpCanvas = renderMcpTreemap(snapshot);
  const mcpBuf = mcpCanvas.toBuffer('image/png');
  writeFileSync(join(IMAGES_DIR, 'mcp-treemap-latest.png'), mcpBuf);
  writeFileSync(join(archiveDir, 'mcp-treemap.png'), mcpBuf);

  // 2. Claude Code
  const claudeDataPath = join(DATA_DIR, 'agents', 'claude-code.json');
  if (existsSync(claudeDataPath)) {
    console.log('  Rendering Claude Code context...');
    const claudeData = JSON.parse(readFileSync(claudeDataPath, 'utf-8'));
    const claudeCanvas = renderAgentContext('Claude Code', claudeData, snapshot);
    const claudeBuf = claudeCanvas.toBuffer('image/png');
    writeFileSync(join(IMAGES_DIR, 'claude-code-latest.png'), claudeBuf);
    writeFileSync(join(archiveDir, 'claude-code.png'), claudeBuf);
  }

  // 3. Codex
  const codexDataPath = join(DATA_DIR, 'agents', 'codex.json');
  if (existsSync(codexDataPath)) {
    console.log('  Rendering Codex context...');
    const codexData = JSON.parse(readFileSync(codexDataPath, 'utf-8'));
    const codexCanvas = renderAgentContext('Codex', codexData, snapshot);
    const codexBuf = codexCanvas.toBuffer('image/png');
    writeFileSync(join(IMAGES_DIR, 'codex-latest.png'), codexBuf);
    writeFileSync(join(archiveDir, 'codex.png'), codexBuf);
  }

  console.log(`\n✓ Images saved to ${IMAGES_DIR}/`);
})();
