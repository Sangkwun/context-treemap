import { execSync } from 'child_process';
import { readFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';

const TMP_DIR = join(process.cwd(), 'tmp');

/**
 * Install an npm package and extract MCP tool schemas.
 * Strategy: install → grep compiled source for tool name/description patterns.
 */
export async function extractToolSchemas(npmPackage) {
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });

  const installDir = join(TMP_DIR, 'npm-extract');
  if (!existsSync(installDir)) mkdirSync(installDir, { recursive: true });

  try {
    // Get version from npm registry
    const registryData = await fetchNpmInfo(npmPackage);
    const version = registryData?.['dist-tags']?.latest || 'unknown';

    // Install
    execSync(`npm install ${npmPackage}@latest --prefix "${installDir}" --no-save 2>&1 || true`, {
      timeout: 120000,
      stdio: 'pipe',
    });

    // Find tools
    const tools = findToolDefinitions(installDir, npmPackage);

    if (tools.length === 0) {
      // Fallback: check if we have known tool count from config
      return { version, tools: [], toolCount: 0, toolNames: [] };
    }

    return {
      version,
      tools,
      toolCount: tools.length,
      toolNames: tools.map(t => t.name),
    };
  } catch (err) {
    console.warn(`  ⚠️  Extract failed for ${npmPackage}: ${err.message}`);
    return null;
  }
}

async function fetchNpmInfo(packageName) {
  try {
    // Handle scoped packages in URL
    const encoded = packageName.startsWith('@')
      ? `@${encodeURIComponent(packageName.slice(1))}`
      : encodeURIComponent(packageName);
    const res = await fetch(`https://registry.npmjs.org/${encoded}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function findToolDefinitions(installDir, packageName) {
  const pkgDir = resolvePackageDir(installDir, packageName);
  if (!pkgDir) return [];

  // Collect all JS/MJS files in dist/, lib/, src/
  const jsFiles = [];
  for (const subdir of ['dist', 'lib', 'build', 'src', '.']) {
    const dir = join(pkgDir, subdir);
    if (existsSync(dir)) {
      collectJsFiles(dir, jsFiles, 3); // max 3 levels deep
    }
  }

  // Parse each file for tool definitions
  const allTools = new Map();
  for (const file of jsFiles) {
    const tools = parseToolsFromFile(file);
    for (const tool of tools) {
      if (!allTools.has(tool.name)) {
        allTools.set(tool.name, tool);
      }
    }
  }

  return [...allTools.values()];
}

function collectJsFiles(dir, result, depth) {
  if (depth <= 0) return;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        collectJsFiles(full, result, depth - 1);
      } else if (/\.(js|mjs|cjs|json)$/.test(entry.name)) {
        result.push(full);
      }
    }
  } catch { /* permission error etc */ }
}

function resolvePackageDir(installDir, packageName) {
  const parts = packageName.startsWith('@')
    ? packageName.split('/')
    : [packageName];
  const dir = join(installDir, 'node_modules', ...parts);
  return existsSync(dir) ? dir : null;
}

function parseToolsFromFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    if (content.length > 2_000_000) return []; // skip huge files

    if (filePath.endsWith('.json')) {
      try {
        const data = JSON.parse(content);
        if (Array.isArray(data)) return data.filter(t => t.name);
        if (data.tools) return data.tools.filter(t => t.name);
      } catch { /* not valid JSON */ }
      return [];
    }

    // Regex patterns for MCP tool definitions (various formats)
    const tools = new Map();
    const patterns = [
      // name: "x", description: "y"
      /\{\s*name:\s*["']([^"']+)["']\s*,\s*description:\s*["']([^"']*?)["']/g,
      // "name": "x", "description": "y"
      /["']name["']\s*:\s*["']([^"']+)["']\s*,\s*["']description["']\s*:\s*["']([^"']*?)["']/g,
      // name: "x" ... description: "y" (multiline, within 500 chars)
      /name:\s*["']([a-z_][a-z0-9_-]*)["'][^}]{0,500}?description:\s*["']([^"']{0,300})["']/gs,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const name = match[1];
        // Filter out non-tool names
        if (name.length < 2 || name.length > 60) continue;
        if (/^(type|version|model|id|key|value|name|test)$/i.test(name)) continue;
        if (!tools.has(name)) {
          tools.set(name, {
            name,
            description: (match[2] || '').slice(0, 300),
          });
        }
      }
    }

    return [...tools.values()];
  } catch {
    return [];
  }
}
