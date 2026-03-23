<div align="center">

# context-treemap

**Track and visualize the context window cost of MCP servers, skill packs, and coding agents.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Updated Daily](https://img.shields.io/badge/Updated-Daily%2009%3A00%20KST-brightgreen.svg)](#how-it-works)

[English](README.md) | [한국어](docs/README.ko.md) | [日本語](docs/README.ja.md) | [中文](docs/README.zh.md)

</div>

---

Your 1M context window isn't unlimited. Before you type a single message, system prompts, built-in tools, MCP servers, and skills have already consumed a portion — and it adds up fast.

**context-treemap** tracks how much each component costs and visualizes it as a treemap — updated daily, with version-by-version change tracking like a stock ticker.

## Latest Snapshot

<table>
<tr>
<td width="50%">

**MCP Index**
> Tool schema token costs — agent-agnostic.

![MCP Index](images/mcp-index-latest.png)

</td>
<td width="50%">

**Skill Index**
> Block size = total cost (always-on + on-invoke). Color = version change (▲▼%).

![Skill Index](images/skill-index-latest.png)

</td>
</tr>
<tr>
<td width="50%">

**Claude Code — Context Window (1M)**
> System + tools + MCP + skills

![Claude Code Context](images/claude-code-latest.png)

</td>
<td width="50%">

**Codex — Context Window (1M)**

![Codex Context](images/codex-latest.png)

</td>
</tr>
</table>

## What's Tracked

<details>
<summary><strong>MCP Servers (agent-agnostic)</strong></summary>

| Server | Tools | Tokens | % of 1M |
|--------|------:|-------:|--------:|
| Playwright | 56 | 42,000 | 4.2% |
| GitHub | 26 | 19,500 | 2.0% |
| Notion | 22 | 16,500 | 1.7% |
| Sentry | 16 | 12,000 | 1.2% |
| Filesystem | 13 | 9,750 | 1.0% |
| Memory | 9 | 6,750 | 0.7% |
| Firecrawl | 8 | 6,000 | 0.6% |
| Slack | 8 | 6,000 | 0.6% |
| Supabase | 7 | 5,250 | 0.5% |
| Linear | 6 | 4,500 | 0.5% |
| Context7 | 2 | 1,500 | 0.2% |
| Figma | 2 | 1,500 | 0.2% |
| Seq. Thinking | 1 | 750 | 0.1% |
| PostgreSQL | 1 | 750 | 0.1% |
| **Total** | **177** | **~133K** | **13.3%** |

</details>

<details>
<summary><strong>Skill Packs (Claude Code)</strong></summary>

Skills have two cost layers:
- **Always-on** (description metadata) — loaded into system context just by installing
- **On invoke** (full SKILL.md body) — loaded only when the skill is called

| Skill Pack | Skills | Always-on | On Invoke |
|-----------|-------:|----------:|----------:|
| Alireza Claude Skills | 165 | 14,419 | ~379K |
| Everything Claude Code | 118 | 4,639 | ~287K |
| Trail of Bits Security | 60 | 2,470 | ~170K |
| Daymade Claude Skills | 45 | 3,879 | ~112K |
| Jeffallan Claude Skills | 66 | 7,247 | ~82K |
| Anthropic Frontend Design | 17 | 1,690 | ~44K |
| Superpowers Lab | 4 | 196 | ~5K |

</details>

<details>
<summary><strong>Agent System Overhead</strong></summary>

| Agent | Model | Context | System Prompt | Built-in Tools | Autocompact | Response Buffer | Total |
|-------|-------|--------:|--------------:|---------------:|------------:|----------------:|------:|
| Claude Code | Opus 4.6 | 1M | 3,000 | 16,821 | 33,000 | 8,000 | 60,821 (6.1%) |
| Codex | GPT-5.4 | 1M | 2,500 | 8,000 | — | 100,000 | 110,500 (11.1%) |

</details>

## How It Works

1. **Crawl** — GitHub Actions crawls MCP server npm packages daily and extracts tool schemas
2. **Crawl Skills** — Fetches SKILL.md files from GitHub repos and parses description metadata
3. **Measure** — Token counts via [Anthropic's count_tokens API](https://docs.anthropic.com/en/docs/build-with-claude/token-counting) (free, accurate)
4. **Render** — D3.js treemap + node-canvas generates PNG images
5. **Track** — Version history is committed to `data/`, enabling change detection (▲▼%)

## Usage

```bash
# Install
npm install

# Run everything: crawl MCP + crawl skills + render images
npm run update

# Or run individually
ANTHROPIC_API_KEY=sk-... npm run crawl        # MCP servers
GITHUB_TOKEN=ghp-... npm run crawl:skills     # Skill packs
npm run render                                 # Generate images
```

## Data Sources

- **MCP tool schemas** — Extracted from npm packages at runtime
- **Skill metadata** — Parsed from SKILL.md frontmatter on GitHub
- **Token counts** — [Anthropic count_tokens API](https://docs.anthropic.com/en/docs/build-with-claude/token-counting)
- **Claude Code internals** — [Piebald-AI/claude-code-system-prompts](https://github.com/Piebald-AI/claude-code-system-prompts)
- **Community reports** — [SEP-1576](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1576), [MCP Tax analysis](https://www.mmntm.net/articles/mcp-context-tax)

## Contributing

- **Add an MCP server** — Edit [`config/servers.json`](config/servers.json) and submit a PR
- **Add a skill pack** — Edit [`config/skills.json`](config/skills.json) and submit a PR
- **Update agent data** — Edit `data/agents/*.json` with verified measurements
- **Report inaccuracies** — Open an issue with `/context` command output

## License

MIT
