import { readFileSync } from 'fs';
import { join } from 'path';
import { today, ensureDirs, loadHistory, latestVersion, calcChange, saveIfChanged } from './utils/history.js';

const ROOT = process.cwd();
const CONFIG_PATH = join(ROOT, 'config', 'skills.json');
const DATA_DIR = join(ROOT, 'data', 'skills');

ensureDirs(DATA_DIR);

/**
 * Fetch a SKILL.md from GitHub and extract the description from frontmatter.
 */
async function fetchSkillDescription(repo, skillPath) {
  const url = `https://raw.githubusercontent.com/${repo}/main/${skillPath}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
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
    return {
      description: content.split('\n')[0].replace(/^#\s*/, '').slice(0, 200),
      fullLength: content.length,
      hasDisableModelInvocation: false,
    };
  }

  const fm = frontmatterMatch[1];
  const body = content.slice(frontmatterMatch[0].length).trim();

  const description = extractYamlField(fm, 'description') || '';
  const name = extractYamlField(fm, 'name') || '';
  const disableModel = /disable-model-invocation:\s*true/i.test(fm);
  const userInvocable = extractYamlField(fm, 'user-invocable');

  return {
    name,
    description,
    descriptionChars: description.length,
    descriptionTokens: Math.ceil(description.length / 4),
    fullLength: body.length,
    fullTokens: Math.ceil(body.length / 4),
    hasDisableModelInvocation: disableModel,
    userInvocable: userInvocable === 'false' ? false : true,
    alwaysOnTokens: disableModel ? 0 : Math.ceil(description.length / 4),
  };
}

function extractYamlField(yaml, field) {
  const match = yaml.match(new RegExp(`${field}:\\s*["']?(.*?)["']?\\s*$`, 'm'));
  if (match) return match[1].trim();

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
  if (!readFileSync(CONFIG_PATH, 'utf-8')) {
    console.log('No config/skills.json found. Skipping skill crawl.');
    return;
  }

  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  const date = today();

  console.log(`\n🎯 Skill Context Crawl — ${date}\n`);

  for (const pack of config.skillPacks) {
    console.log(`  📦 ${pack.name} (${pack.repo})...`);

    const historyPath = join(DATA_DIR, `${pack.id}.json`);
    const history = loadHistory(historyPath, { name: pack.name, repo: pack.repo });
    const prev = latestVersion(history);

    try {
      const skillPaths = [];

      if (pack.skills) {
        const base = pack.skillsPath || 'skills';
        for (const s of pack.skills) {
          skillPaths.push({ name: s, path: `${base}/${s}/SKILL.md` });
        }
      } else if (pack.layout === 'nested') {
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
          await new Promise(r => setTimeout(r, 50));
        }
      } else {
        const base = pack.skillsPath || 'skills';
        const dirs = await listSkillsInRepo(pack.repo, base);
        for (const name of dirs) {
          skillPaths.push({ name, path: `${base}/${name}/SKILL.md` });
        }
        if (dirs.length === 0) {
          const dirs2 = await listSkillsInRepo(pack.repo, '.claude/skills');
          for (const name of dirs2) {
            skillPaths.push({ name, path: `.claude/skills/${name}/SKILL.md` });
          }
        }
      }

      let totalAlwaysOn = 0;
      let totalFullBody = 0;
      const skillDetails = [];

      for (const { name: skillName, path: skillPath } of skillPaths) {
        const result = await fetchSkillDescription(pack.repo, skillPath);
        if (result) {
          totalAlwaysOn += result.alwaysOnTokens;
          totalFullBody += result.fullTokens || 0;
          skillDetails.push({
            name: result.name || skillName,
            alwaysOnTokens: result.alwaysOnTokens,
            fullTokens: result.fullTokens || 0,
            descriptionChars: result.descriptionChars,
            hasDisableModelInvocation: result.hasDisableModelInvocation,
          });
        }
        await new Promise(r => setTimeout(r, 100));
      }

      const change = calcChange(
        prev ? { tokens: prev.alwaysOnTokens } : null,
        totalAlwaysOn,
        { skills: skillDetails.length - (prev?.skillCount || 0) },
      );

      const entry = {
        date,
        skillCount: skillDetails.length,
        alwaysOnTokens: totalAlwaysOn,
        fullBodyTokens: totalFullBody,
        skills: skillDetails,
        change,
      };

      const hasChanged = !prev || prev.alwaysOnTokens !== totalAlwaysOn || prev.skillCount !== skillDetails.length;
      saveIfChanged(historyPath, history, entry, hasChanged);

      console.log(`  ✓ ${pack.name}: ${skillDetails.length} skills, ${totalAlwaysOn} always-on tokens`);
    } catch (err) {
      console.error(`  ✗ ${pack.name}: ${err.message}`);
    }
  }

  console.log('');
}

main().catch(console.error);
