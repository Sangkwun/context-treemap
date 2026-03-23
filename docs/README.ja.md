# context-treemap

[English](../README.md) | [한국어](README.ko.md) | [中文](README.zh.md)

MCPサーバー、スキルパック、コーディングエージェントのコンテキストウィンドウコストを追跡し、treemapで可視化します。

1Mのコンテキストウィンドウは無制限ではありません。最初のメッセージを入力する前に、システムプロンプト、ビルトインツール、MCPサーバー、スキルがすでにかなりの部分を占有しています。

**context-treemap**は各コンポーネントのコストを追跡し、treemapとして可視化します。毎日自動更新され、株価チャートのようにバージョンごとの変動を追跡します。

## 最新スナップショット

### MCP Index

> ツールスキーマのトークンコスト - どのコーディングエージェントを使っても同じです。

![MCP Index](../images/mcp-index-latest.png)

### Skill Index

> ブロックサイズ = 合計コスト（always-on + on-invoke）。色 = バージョン変化率（▲▼%）。

![Skill Index](../images/skill-index-latest.png)

### Claude Code コンテキストウィンドウ (1M)

> システム + ツール + MCP + スキル - 会話に残るスペースは？

![Claude Code Context](../images/claude-code-latest.png)

### Codex コンテキストウィンドウ (1M)

> システム + ツール + MCP + スキル

![Codex Context](../images/codex-latest.png)

## 追跡対象

### MCPサーバー（エージェント非依存）

| サーバー | ツール数 | トークン | 1M比 % |
|---------|---------|---------|--------|
| GitHub | 84 | 20,444 | 2.0% |
| Playwright | 56 | ~15,000 | 1.5% |
| Supabase | 30 | ~10,000 | 1.0% |
| Notion | 22 | ~10,000 | 1.0% |
| 他10個 | | | |
| **合計** | **263** | **~81K** | **8.1%** |

### スキルパック (Claude Code)

スキルには2つのコスト層があります：
- **Always-on**（説明メタデータ）: インストールするだけでシステムコンテキストにロード
- **On invoke**（SKILL.md本文）: 呼び出し時のみロード

| スキルパック | スキル数 | Always-on | On Invoke |
|------------|---------|-----------|-----------|
| Everything Claude Code | 116 | 4,515 | ~143K |
| Trail of Bits Security | 60 | 2,470 | ~82K |
| Superpowers Lab | 4 | 196 | ~6K |

### エージェントシステムオーバーヘッド

| エージェント | モデル | コンテキスト | システムプロンプト | ビルトインツール | Autocompactバッファ | 合計 |
|------------|-------|------------|----------------|----------------|-------------------|------|
| Claude Code | Opus 4.6 | 1M | 3,000 | 16,821 | 33,000 | 52,821 (5.3%) |
| Codex | GPT-5.4 | 1M | 2,500 | 8,000 | - | 10,500 (1.1%) |

## 仕組み

1. **クロール**: GitHub Actionsが毎日MCPサーバーのnpmパッケージからツールスキーマを抽出
2. **スキルクロール**: GitHubリポからSKILL.mdファイルを取得し、説明メタデータをパース
3. **測定**: [Anthropic count_tokens API](https://docs.anthropic.com/en/docs/build-with-claude/token-counting)で正確なトークン数を測定（無料）
4. **レンダー**: D3.js treemap + node-canvasでPNG画像4枚を生成
5. **追跡**: バージョン履歴を`data/`にコミットし、変動を検出（▲▼%）

毎日09:00 KSTにGitHub Actionsで自動生成されます。

## 使用方法

```bash
npm install
npm run update    # クロール + レンダーを一括実行
```

## コントリビュート

- **MCPサーバー追加**: [`config/servers.json`](../config/servers.json)を編集してPR
- **スキルパック追加**: [`config/skills.json`](../config/skills.json)を編集してPR
- **エージェントデータ更新**: `data/agents/*.json`を編集
- **不正確さの報告**: `/context`コマンドの出力と一緒にIssueを作成

## ライセンス

MIT
