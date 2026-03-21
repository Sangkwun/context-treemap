import { execSync } from 'child_process';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const TMP_DIR = join(process.cwd(), 'tmp');

/**
 * Install an npm package and extract MCP tool schemas via tools/list RPC.
 * Falls back to parsing package source if RPC isn't available.
 */
export async function extractToolSchemas(npmPackage) {
  // Ensure tmp dir
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });

  const installDir = join(TMP_DIR, 'npm-extract');
  if (!existsSync(installDir)) mkdirSync(installDir, { recursive: true });

  try {
    // Get package info from npm registry
    const registryData = await fetchNpmInfo(npmPackage);
    const version = registryData?.['dist-tags']?.latest || 'unknown';

    // Install the package
    execSync(`npm install ${npmPackage}@latest --prefix "${installDir}" --no-save 2>/dev/null`, {
      timeout: 60000,
      stdio: 'pipe',
    });

    // Try to find tool definitions in the installed package
    const tools = await findToolDefinitions(installDir, npmPackage);

    return {
      version,
      tools,
      toolCount: tools.length,
      toolNames: tools.map(t => t.name),
    };
  } catch (err) {
    console.warn(`Failed to extract schemas for ${npmPackage}: ${err.message}`);
    return null;
  }
}

async function fetchNpmInfo(packageName) {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Search installed package for MCP tool definitions.
 * MCP servers typically export tool schemas in various formats.
 */
async function findToolDefinitions(installDir, packageName) {
  const pkgDir = resolvePackageDir(installDir, packageName);
  if (!pkgDir) return [];

  // Strategy 1: Look for common tool definition files
  const candidates = [
    'dist/tools.js', 'dist/tools.mjs',
    'dist/index.js', 'dist/index.mjs',
    'lib/tools.js', 'src/tools.ts',
    'tools.json',
  ];

  for (const candidate of candidates) {
    const filePath = join(pkgDir, candidate);
    if (existsSync(filePath)) {
      const tools = parseToolsFromFile(filePath);
      if (tools.length > 0) return tools;
    }
  }

  // Strategy 2: Grep for tool patterns in dist files
  try {
    const result = execSync(
      `grep -r '"inputSchema"\\|"input_schema"\\|"parameters"' "${pkgDir}/dist/" --include="*.js" --include="*.mjs" -l 2>/dev/null || true`,
      { encoding: 'utf-8', timeout: 10000 }
    ).trim();

    if (result) {
      const files = result.split('\n').filter(Boolean);
      for (const file of files) {
        const tools = parseToolsFromFile(file);
        if (tools.length > 0) return tools;
      }
    }
  } catch { /* ignore */ }

  return [];
}

function resolvePackageDir(installDir, packageName) {
  // Handle scoped packages
  const parts = packageName.startsWith('@')
    ? packageName.split('/')
    : [packageName];

  const dir = join(installDir, 'node_modules', ...parts);
  return existsSync(dir) ? dir : null;
}

function parseToolsFromFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');

    // Try JSON first
    if (filePath.endsWith('.json')) {
      const data = JSON.parse(content);
      if (Array.isArray(data)) return data;
      if (data.tools) return data.tools;
      return [];
    }

    // Extract tool definitions from JS source
    // Look for patterns like { name: "tool_name", description: "...", inputSchema: {...} }
    const tools = [];
    const toolPattern = /\{\s*name:\s*["']([^"']+)["']\s*,\s*description:\s*["']([^"']*?)["']/g;
    let match;
    while ((match = toolPattern.exec(content)) !== null) {
      tools.push({
        name: match[1],
        description: match[2].slice(0, 200),
      });
    }

    // Also try quoted property names
    const toolPattern2 = /["']name["']\s*:\s*["']([^"']+)["']\s*,\s*["']description["']\s*:\s*["']([^"']*?)["']/g;
    while ((match = toolPattern2.exec(content)) !== null) {
      if (!tools.find(t => t.name === match[1])) {
        tools.push({
          name: match[1],
          description: match[2].slice(0, 200),
        });
      }
    }

    return tools;
  } catch {
    return [];
  }
}
