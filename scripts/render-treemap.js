import { createCanvas } from 'canvas';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
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

function fitFontSize(ctx, text, blockW, blockH, weight = 'bold', targetRatio = 0.85, maxLines = 2) {
  const maxByHeight = blockH / (maxLines * 1.4);
  let hi = Math.min(blockW * 0.2, maxByHeight, 56);
  let lo = 6;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    setFont(ctx, mid, weight);
    if (ctx.measureText(text).width < blockW * targetRatio) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return Math.max(8, Math.floor(lo));
}

// ── Shared Rendering ─────────────────────────────────────

/**
 * Render treemap header: title, subtitle, and legend boxes.
 */
function renderHeader(ctx, W, { title, subtitle, legend, titleSize = 30 }) {
  ctx.fillStyle = STYLE.bg;
  ctx.fillRect(0, 0, W, 90);

  setFont(ctx, titleSize, 'bold');
  ctx.fillStyle = STYLE.textPrimary;
  ctx.fillText(title, 16, 42);

  setFont(ctx, 13);
  ctx.fillStyle = STYLE.textSecondary;
  ctx.fillText(subtitle, 16, 62);

  if (legend) {
    const spacing = legend.spacing || 90;
    const startX = W - legend.items.length * spacing;
    legend.items.forEach(([color, label], i) => {
      const lx = startX + i * spacing;
      ctx.fillStyle = color;
      roundRect(ctx, lx, 30, 12, 12, 2);
      ctx.fill();
      setFont(ctx, 9);
      ctx.fillStyle = STYLE.textSecondary;
      ctx.fillText(label, lx + 16, 40);
    });
  }
}

/**
 * Render a label (name + optional sub-text) centered in a block area.
 */
function renderLabel(ctx, cx, cy, innerW, innerH, name, opts = {}) {
  const { subText, textColor = STYLE.textPrimary, subColor = STYLE.textSecondary } = opts;

  ctx.textAlign = 'center';

  if (innerH >= 28) {
    const nameFs = fitFontSize(ctx, name, innerW, innerH, 'bold', 0.85, 2);
    const showSub = subText && innerH > nameFs * 1.6;
    const subFs = Math.max(8, nameFs * 0.5);
    const totalH = showSub ? nameFs + subFs * 1.3 : nameFs;
    const startY = cy - totalH / 2;

    setFont(ctx, nameFs, 'bold');
    ctx.fillStyle = textColor;
    ctx.fillText(name, cx, startY + nameFs * 0.85);

    if (showSub) {
      setFont(ctx, subFs);
      ctx.fillStyle = subColor;
      ctx.fillText(subText, cx, startY + nameFs * 0.85 + subFs * 1.4);
    }
  } else {
    const fs = Math.min(innerH * 0.7, fitFontSize(ctx, name, innerW, innerH, 'bold', 0.9, 1));
    if (fs >= 7) {
      setFont(ctx, fs, 'bold');
      ctx.fillStyle = textColor;
      ctx.fillText(name, cx, cy + fs * 0.35);
    }
  }

  ctx.textAlign = 'left';
}

// ── Load Data ────────────────────────────────────────────

function loadLatestSnapshot() {
  const snapshotDir = join(DATA_DIR, 'snapshots');
  if (!existsSync(snapshotDir)) return null;

  const files = readdirSync(snapshotDir).filter(f => f.endsWith('.json')).sort();
  if (files.length === 0) return null;

  return JSON.parse(readFileSync(join(snapshotDir, files[files.length - 1]), 'utf-8'));
}

function loadSkillData() {
  const skillDir = join(DATA_DIR, 'skills');
  if (!existsSync(skillDir)) return [];

  const results = [];
  for (const file of readdirSync(skillDir).filter(f => f.endsWith('.json'))) {
    const data = JSON.parse(readFileSync(join(skillDir, file), 'utf-8'));
    const latest = data.versions?.[data.versions.length - 1];
    if (latest && (latest.alwaysOnTokens > 0 || latest.fullBodyTokens > 0)) {
      results.push({
        name: data.name,
        alwaysOnTokens: latest.alwaysOnTokens || 0,
        fullBodyTokens: latest.fullBodyTokens || 0,
        tokens: (latest.alwaysOnTokens || 0) + (latest.fullBodyTokens || 0),
        skillCount: latest.skillCount,
        change: latest.change || { tokens: 0, pct: 0, skills: 0 },
      });
    }
  }
  return results;
}

// ── Shared block renderer ────────────────────────────────

function renderBlock(ctx, leaf, HEADER, opts = {}) {
  const d = leaf.data;
  const x = leaf.x0, y = leaf.y0 + HEADER;
  const w = leaf.x1 - leaf.x0, h = leaf.y1 - leaf.y0;
  const changePct = d.change?.pct || 0;

  // Background + border
  ctx.fillStyle = opts.color || changeColor(changePct);
  roundRect(ctx, x + 1, y + 1, w - 2, h - 2, 4);
  ctx.fill();
  ctx.strokeStyle = STYLE.border;
  ctx.lineWidth = 1;
  roundRect(ctx, x + 1, y + 1, w - 2, h - 2, 4);
  ctx.stroke();

  // Label
  const pad = 6;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  if (innerW < 15 || innerH < 10) return;

  const shortName = d.displayName || d.name;
  renderLabel(ctx, x + w / 2, y + h / 2, innerW, innerH, shortName, {
    subText: opts.subText,
    textColor: opts.textColor || STYLE.textPrimary,
    subColor: changePct !== 0 ? changeBadgeColor(changePct) : STYLE.textSecondary,
  });
}

// ── Create canvas + treemap layout helper ────────────────

function createTreemapCanvas(W, H, HEADER, items, PAD = 3) {
  const canvas = createCanvas(W, H + HEADER);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = STYLE.bg;
  ctx.fillRect(0, 0, W, H + HEADER);

  const root = hierarchy({ children: items.map(d => ({ ...d, value: d.value ?? d.tokens })) }).sum(d => d.value);
  treemap().size([W, H]).padding(PAD).tile(treemapSquarify)(root);

  return { canvas, ctx, root };
}

// ── Render MCP Index ─────────────────────────────────────

function renderMcpIndex(snapshot) {
  const W = 1600, H = 900, HEADER = 90;

  const servers = snapshot.servers
    .map(s => ({ ...s, displayName: s.name.replace(' MCP', '').replace(' Server', '') }))
    .sort((a, b) => b.tokens - a.tokens);

  const totalTokens = servers.reduce((s, x) => s + x.tokens, 0);
  const totalTools = servers.reduce((s, x) => s + x.tools, 0);

  const { canvas, ctx, root } = createTreemapCanvas(W, H, HEADER, servers);

  for (const leaf of root.leaves()) {
    const d = leaf.data;
    const changePct = d.change?.pct || 0;
    const changeTxt = changePct > 0 ? `+${changePct}%` : changePct < 0 ? `${changePct}%` : '';
    renderBlock(ctx, leaf, HEADER, { subText: `${formatTokens(d.tokens)}  ${changeTxt}` });
  }

  renderHeader(ctx, W, {
    title: 'MCP Index',
    subtitle: `Total: ${totalTokens.toLocaleString()} tokens (${(totalTokens / 1000000 * 100).toFixed(1)}% of 1M)  ·  ${servers.length} servers  ·  ${totalTools} tools  ·  ${snapshot.date}`,
    legend: {
      spacing: 90,
      items: [['#7f1d1d', '▲ 5%+'], ['#451a1a', '▲ 0~5%'], ['#1e293b', 'No change'], ['#14532d', '▼ Decrease']],
    },
  });

  return canvas;
}

// ── Render Skill Index ───────────────────────────────────

function renderSkillIndex() {
  const W = 1600, H = 900, HEADER = 90;

  const skills = loadSkillData().filter(s => s.alwaysOnTokens > 0 || s.fullBodyTokens > 0);
  if (skills.length === 0) return null;

  const items = skills.map(s => ({
    ...s,
    displayName: s.name,
    value: s.alwaysOnTokens + (s.fullBodyTokens || 0),
    tokens: s.alwaysOnTokens + (s.fullBodyTokens || 0),
  }));

  const totalAlwaysOn = items.reduce((s, x) => s + x.alwaysOnTokens, 0);
  const totalFull = items.reduce((s, x) => s + (x.fullBodyTokens || 0), 0);
  const totalSkills = items.reduce((s, x) => s + (x.skillCount || 0), 0);

  const { canvas, ctx, root } = createTreemapCanvas(W, H, HEADER, items);

  for (const leaf of root.leaves()) {
    const d = leaf.data;
    const changePct = d.change?.pct || 0;
    const changeTxt = changePct > 0 ? `+${changePct}%` : changePct < 0 ? `${changePct}%` : '';
    const subText = `${formatTokens(d.alwaysOnTokens)} always-on · ${formatTokens(d.fullBodyTokens || 0)} on invoke · ${d.skillCount || 0} skills  ${changeTxt}`;
    renderBlock(ctx, leaf, HEADER, { subText });
  }

  renderHeader(ctx, W, {
    title: 'Skill Index',
    subtitle: `Always-on: ${totalAlwaysOn.toLocaleString()} tokens  ·  On invoke: ${totalFull.toLocaleString()} tokens  ·  ${items.length} skill packs  ·  ${totalSkills} skills`,
    legend: {
      spacing: 90,
      items: [['#7f1d1d', '▲ 5%+'], ['#451a1a', '▲ 0~5%'], ['#1e293b', 'No change'], ['#14532d', '▼ Decrease']],
    },
  });

  return canvas;
}

// ── Render Agent Context Treemap ─────────────────────────

function renderAgentContext(agentName, agentData, mcpSnapshot) {
  const W = 1600, H = 900, HEADER = 90;
  const TOTAL = agentData?.contextWindow || 1000000;
  const totalLabel = TOTAL >= 1000000 ? '1M' : `${(TOTAL / 1000).toFixed(0)}K`;

  const items = [];

  // Agent system overhead
  if (agentData) {
    const latest = agentData.versions[agentData.versions.length - 1];
    if (latest.autocompactBuffer) {
      items.push({ name: 'Autocompact Buffer', tokens: latest.autocompactBuffer, color: '#1e293b', category: 'buffer' });
    }
    if (latest.responseBuffer) {
      items.push({ name: 'Response Buffer', tokens: latest.responseBuffer, color: '#1e3a5f', category: 'buffer' });
    }
    if (latest.builtinTools) {
      items.push({ name: 'Built-in Tools', tokens: latest.builtinTools, color: '#4c1d95', category: 'system' });
    }
    if (latest.systemPrompt) {
      items.push({ name: 'System Prompt', tokens: latest.systemPrompt, color: '#312e81', category: 'system' });
    }
  }

  // MCP servers
  if (mcpSnapshot) {
    for (const server of mcpSnapshot.servers) {
      items.push({
        name: server.name,
        tokens: server.tokens,
        color: changeColor(server.change?.pct || 0),
        category: 'mcp',
      });
    }
  }

  // Skills (always-on metadata only)
  for (const skill of loadSkillData()) {
    if (skill.alwaysOnTokens > 0) {
      items.push({ name: skill.name, tokens: skill.alwaysOnTokens, color: '#164e63', category: 'skill' });
    }
  }

  // Free space
  const used = items.reduce((s, x) => s + x.tokens, 0);
  const free = Math.max(0, TOTAL - used);
  items.push({ name: 'Available', tokens: free, color: '#0f2e1a', category: 'free' });

  const { canvas, ctx, root } = createTreemapCanvas(W, H, HEADER, items);

  for (const leaf of root.leaves()) {
    const d = leaf.data;
    const x = leaf.x0, y = leaf.y0 + HEADER;
    const w = leaf.x1 - leaf.x0, h = leaf.y1 - leaf.y0;
    const isFree = d.category === 'free';

    // Background + border
    ctx.fillStyle = d.color;
    roundRect(ctx, x + 1, y + 1, w - 2, h - 2, 4);
    ctx.fill();
    ctx.strokeStyle = STYLE.border;
    ctx.lineWidth = 1;
    roundRect(ctx, x + 1, y + 1, w - 2, h - 2, 4);
    ctx.stroke();

    // Label
    const pad = 6;
    const innerW = w - pad * 2;
    const innerH = h - pad * 2;
    if (innerW < 15 || innerH < 10) continue;

    const shortName = d.name.replace(' MCP', '').replace(' Server', '');
    const pct = (d.tokens / TOTAL * 100).toFixed(1);
    renderLabel(ctx, x + w / 2, y + h / 2, innerW, innerH, shortName, {
      subText: `${formatTokens(d.tokens)} (${pct}%)`,
      textColor: isFree ? STYLE.green : STYLE.textPrimary,
      subColor: isFree ? '#22c55eaa' : STYLE.textSecondary,
    });
  }

  const freePct = (free / TOTAL * 100).toFixed(1);
  renderHeader(ctx, W, {
    title: `${agentName} — Context Window (${totalLabel})`,
    titleSize: 28,
    subtitle: `Used: ${formatTokens(used)} (${(used / TOTAL * 100).toFixed(1)}%)  ·  Available: ${formatTokens(free)} (${freePct}%)  ·  ${mcpSnapshot?.servers?.length || 0} MCP servers  ·  ${mcpSnapshot?.date || ''}`,
    legend: {
      spacing: 80,
      items: [['#312e81', 'System'], ['#4c1d95', 'Tools'], ['#7f1d1d', 'MCP ▲'], ['#164e63', 'Skills'], ['#1e293b', 'Autocompact'], ['#1e3a5f', 'Response'], ['#0f2e1a', 'Free']],
    },
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
  if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true });

  // 1. MCP Index
  console.log('  Rendering MCP Index...');
  const mcpBuf = renderMcpIndex(snapshot).toBuffer('image/png');
  writeFileSync(join(IMAGES_DIR, 'mcp-index-latest.png'), mcpBuf);
  writeFileSync(join(archiveDir, 'mcp-index.png'), mcpBuf);

  // 2. Skill Index
  console.log('  Rendering Skill Index...');
  const skillCanvas = renderSkillIndex();
  if (skillCanvas) {
    const skillBuf = skillCanvas.toBuffer('image/png');
    writeFileSync(join(IMAGES_DIR, 'skill-index-latest.png'), skillBuf);
    writeFileSync(join(archiveDir, 'skill-index.png'), skillBuf);
  }

  // 3. Claude Code
  const claudeDataPath = join(DATA_DIR, 'agents', 'claude-code.json');
  if (existsSync(claudeDataPath)) {
    console.log('  Rendering Claude Code context...');
    const claudeData = JSON.parse(readFileSync(claudeDataPath, 'utf-8'));
    const claudeBuf = renderAgentContext('Claude Code', claudeData, snapshot).toBuffer('image/png');
    writeFileSync(join(IMAGES_DIR, 'claude-code-latest.png'), claudeBuf);
    writeFileSync(join(archiveDir, 'claude-code.png'), claudeBuf);
  }

  // 4. Codex
  const codexDataPath = join(DATA_DIR, 'agents', 'codex.json');
  if (existsSync(codexDataPath)) {
    console.log('  Rendering Codex context...');
    const codexData = JSON.parse(readFileSync(codexDataPath, 'utf-8'));
    const codexBuf = renderAgentContext('Codex', codexData, snapshot).toBuffer('image/png');
    writeFileSync(join(IMAGES_DIR, 'codex-latest.png'), codexBuf);
    writeFileSync(join(archiveDir, 'codex.png'), codexBuf);
  }

  console.log(`\n✓ Images saved to ${IMAGES_DIR}/`);
})();
