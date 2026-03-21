import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const CONFIG_PATH = join(ROOT, 'config', 'skills.json');
const DATA_DIR = join(ROOT, 'data', 'skills');
const SNAPSHOT_DIR = join(ROOT, 'data', 'snapshots');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

/**
 * Fetch a SKILL.md from GitHub and extract the description from frontmatter.
 * Only the description is always loaded in context (not the full body).
 */
async function fetchSkillDescription(repo, skillPath) {
  // Try raw GitHub URL
  const url = `https://raw.githubusercontent.com/${repo}/main/${skillPath}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      // Try master branch
      const res2 = await fetch(url.replace('/main/', '/master/'));
      if (!res2.ok) return null;
      return parseSkillMd(await res2.text());
    }
    return parseSkillMd(await res.text());
  } catch {
    return null;
  }
}

/**
 * Parse SKILL.md frontmatter to extract description and metadata.
 */
function parseSkillMd(content) {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    // No frontmatter — entire content is the prompt, description might be first line
    return {
      description: content.split('\n')[0].replace(/^#\s*/, '').slice(0, 200),
      fullLength: content.length,
      hasDisableModelInvocation: false,
    };
  }

  const fm = frontmatterMatch[1];
  const body = content.slice(frontmatterMatch[0].length).trim();

  // Extract fields from YAML-like frontmatter
  const description = extractYamlField(fm, 'description') || '';
  const name = extractYamlField(fm, 'name') || '';
  const disableModel = /disable-model-invocation:\s*true/i.test(fm);
  const userInvocable = extractYamlField(fm, 'user-invocable');

  return {
    name,
    description,
    descriptionChars: description.length,
    descriptionTokens: Math.ceil(description.length / 4), // rough estimate
    fullLength: body.length,
    fullTokens: Math.ceil(body.length / 4),
    hasDisableModelInvocation: disableModel,
    userInvocable: userInvocable === 'false' ? false : true,
    // Always-on cost: 0 if disable-model-invocation is true
    alwaysOnTokens: disableModel ? 0 : Math.ceil(description.length / 4),
  };
}

function extractYamlField(yaml, field) {
  // Handle multi-line descriptions with quotes
  const match = yaml.match(new RegExp(`${field}:\\s*["']?(.*?)["']?\\s*$`, 'm'));
  if (match) return match[1].trim();

  // Handle multi-line with |
  const blockMatch = yaml.match(new RegExp(`${field}:\\s*\\|\\s*\\n([\\s\\S]*?)(?=\\n\\w|$)`));
  if (blockMatch) return blockMatch[1].trim();

  return null;
}

/**
 * List skill directories in a GitHub repo.
 */
async function listSkillsInRepo(repo, basePath = 'skills') {
  const url = `https://api.github.com/repos/${repo}/contents/${basePath}`;
  try {
    const headers = {};
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `token ${process.env.GITHUB_TOKEN}`;
    }
    const res = await fetch(url, { headers });
    if (!res.ok) return [];
    const data = await res.json();
    return data
      .filter(item => item.type === 'dir')
      .map(item => item.name);
  } catch {
    return [];
  }
}

async function main() {
  if (!existsSync(CONFIG_PATH)) {
    console.log('No config/skills.json found. Skipping skill crawl.');
    return;
  }

  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  const today = new Date().toISOString().split('T')[0];

  console.log(`\n🎯 Skill Context Crawl — ${today}\n`);

  for (const pack of config.skillPacks) {
    console.log(`  📦 ${pack.name} (${pack.repo})...`);

    const historyPath = join(DATA_DIR, `${pack.id}.json`);
    const history = existsSync(historyPath)
      ? JSON.parse(readFileSync(historyPath, 'utf-8'))
      : { name: pack.name, repo: pack.repo, versions: [] };

    try {
      // Collect skill paths based on layout
      const skillPaths = []; // array of { name, path }

      if (pack.skills) {
        // Explicit list
        const base = pack.skillsPath || 'skills';
        for (const s of pack.skills) {
          skillPaths.push({ name: s, path: `${base}/${s}/SKILL.md` });
        }
      } else if (pack.layout === 'nested') {
        // Nested: plugins/*/skills/*/SKILL.md (e.g., trailofbits)
        const pluginsBase = pack.pluginsPath || 'plugins';
        const pluginDirs = await listSkillsInRepo(pack.repo, pluginsBase);
        for (const pluginName of pluginDirs) {
          const skillDirs = await listSkillsInRepo(pack.repo, `${pluginsBase}/${pluginName}/skills`);
          for (const skillName of skillDirs) {
            skillPaths.push({
              name: `${pluginName}/${skillName}`,
              path: `${pluginsBase}/${pluginName}/skills/${skillName}/SKILL.md`,
            });
          }
          await new Promise(r => setTimeout(r, 50)); // rate limit
        }
      } else {
        // Flat: skills/*/SKILL.md (default)
        const base = pack.skillsPath || 'skills';
        const dirs = await listSkillsInRepo(pack.repo, base);
        for (const name of dirs) {
          skillPaths.push({ name, path: `${base}/${name}/SKILL.md` });
        }
        // Fallback: try .claude/skills/
        if (dirs.length === 0) {
          const dirs2 = await listSkillsInRepo(pack.repo, '.claude/skills');
          for (const name of dirs2) {
            skillPaths.push({ name, path: `.claude/skills/${name}/SKILL.md` });
          }
        }
      }

      let totalAlwaysOn = 0;
      const skillDetails = [];

      for (const { name: skillName, path: skillPath } of skillPaths) {
        const result = await fetchSkillDescription(pack.repo, skillPath);

        if (result) {
          totalAlwaysOn += result.alwaysOnTokens;
          skillDetails.push({
            name: result.name || skillName,
            alwaysOnTokens: result.alwaysOnTokens,
            descriptionChars: result.descriptionChars,
            hasDisableModelInvocation: result.hasDisableModelInvocation,
          });
        }

        await new Promise(r => setTimeout(r, 100)); // rate limit
      }

      const prev = history.versions[history.versions.length - 1];
      const change = prev
        ? {
            tokens: totalAlwaysOn - prev.alwaysOnTokens,
            pct: prev.alwaysOnTokens > 0
              ? +((totalAlwaysOn - prev.alwaysOnTokens) / prev.alwaysOnTokens * 100).toFixed(1)
              : 0,
            skills: skillDetails.length - (prev.skillCount || 0),
          }
        : { tokens: 0, pct: 0, skills: 0 };

      const entry = {
        date: today,
        skillCount: skillDetails.length,
        alwaysOnTokens: totalAlwaysOn,
        skills: skillDetails,
        change,
      };

      // Only add if changed
      if (!prev || prev.alwaysOnTokens !== totalAlwaysOn || prev.skillCount !== skillDetails.length) {
        history.versions.push(entry);
        writeFileSync(historyPath, JSON.stringify(history, null, 2) + '\n');
      }

      console.log(`  ✓ ${pack.name}: ${skillDetails.length} skills, ${totalAlwaysOn} always-on tokens`);
    } catch (err) {
      console.error(`  ✗ ${pack.name}: ${err.message}`);
    }
  }

  console.log('');
}

main().catch(console.error);
