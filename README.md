# context-treemap

Track and visualize the context window cost of MCP servers, skill packs, and coding agents.

Your 1M context window isn't unlimited. Before you type a single message, system prompts, built-in tools, MCP servers, and skills have already consumed a portion — and it adds up fast.

**context-treemap** tracks how much each component costs and visualizes it as a treemap — updated daily, with version-by-version change tracking like a stock ticker.

## Latest Snapshot

### MCP Index

> Tool schema token costs — the same regardless of which coding agent you use.

![MCP Index](images/mcp-index-latest.png)

### Skill Index

> Skill packs visualized with two regions: **dark** = always-on cost (description metadata, loaded just by installing), **light** = on-invoke cost (full body, loaded only when called). The divider shows how much is "free until you use it."

![Skill Index](images/skill-index-latest.png)

### Claude Code — Context Window (1M)

> System + tools + MCP + skills — what's left for your conversation?

![Claude Code Context](images/claude-code-latest.png)

### Codex — Context Window (1M)

![Codex Context](images/codex-latest.png)

## What's Tracked

### MCP Servers (agent-agnostic)

| Server | Tools | Tokens | % of 1M |
|--------|-------|--------|---------|
| GitHub | 84 | 20,444 | 2.0% |
| Playwright | 56 | ~15,000 | 1.5% |
| Supabase | 30 | ~10,000 | 1.0% |
| Notion | 22 | ~10,000 | 1.0% |
| Firecrawl | 14 | ~6,000 | 0.6% |
| Slack | 8 | ~5,000 | 0.5% |
| Sentry | 16 | ~5,000 | 0.5% |
| Linear | 5 | ~2,000 | 0.2% |
| Filesystem | 13 | 1,841 | 0.2% |
| Context7 | 2 | ~1,500 | 0.2% |
| Figma | 2 | ~1,500 | 0.2% |
| Seq. Thinking | 1 | 976 | 0.1% |
| Memory | 9 | 975 | 0.1% |
| PostgreSQL | 1 | ~800 | 0.1% |
| **Total** | **263** | **~81K** | **8.1%** |

### Skill Packs (Claude Code)

Skills have two cost layers:
- **Always-on** (description metadata): loaded into system context just by installing — this is the treemap block size
- **On invoke** (full SKILL.md body): loaded only when the skill is called — shown in sub-text for reference

| Skill Pack | Skills | Always-on | On Invoke |
|-----------|--------|-----------|-----------|
| Everything Claude Code | 116 | 4,515 | ~143K |
| Trail of Bits Security | 60 | 2,470 | ~82K |
| Superpowers Lab | 4 | 196 | ~6K |

### Agent System Overhead

| Agent | Model | Context | System Prompt | Built-in Tools | Autocompact Buffer | Total |
|-------|-------|---------|--------------|----------------|-------------------|-------|
| Claude Code | Opus 4.6 | 1M | 3,000 | 16,821 | 33,000 | 52,821 (5.3%) |
| Codex | GPT-5.4 | 1M | 2,500 | 8,000 | — | 10,500 (1.1%) |

## How It Works

1. **Crawl**: GitHub Actions crawls MCP server npm packages daily and extracts tool schemas
2. **Crawl Skills**: Fetches SKILL.md files from GitHub repos and parses description metadata
3. **Measure**: Token counts via [Anthropic's count_tokens API](https://docs.anthropic.com/en/docs/build-with-claude/token-counting) (free, accurate)
4. **Render**: D3.js treemap + node-canvas generates PNG images (4 images)
5. **Track**: Version history is committed to `data/`, enabling change detection (▲▼%)

Images are auto-generated daily at 09:00 KST via GitHub Actions.

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

- **MCP tool schemas**: Extracted from npm packages at runtime
- **Skill metadata**: Parsed from SKILL.md frontmatter on GitHub
- **Token counts**: [Anthropic count_tokens API](https://docs.anthropic.com/en/docs/build-with-claude/token-counting)
- **Claude Code internals**: [Piebald-AI/claude-code-system-prompts](https://github.com/Piebald-AI/claude-code-system-prompts)
- **Community reports**: [SEP-1576](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1576), [MCP Tax analysis](https://www.mmntm.net/articles/mcp-context-tax)

## Contributing

- **Add an MCP server**: Edit [`config/servers.json`](config/servers.json) and submit a PR
- **Add a skill pack**: Edit [`config/skills.json`](config/skills.json) and submit a PR
- **Update agent data**: Edit `data/agents/*.json` with verified measurements
- **Report inaccuracies**: Open an issue with `/context` command output

## License

MIT
