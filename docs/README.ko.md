# context-treemap

[English](../README.md) | [日本語](README.ja.md) | [中文](README.zh.md)

MCP 서버, 스킬 팩, 코딩 에이전트의 컨텍스트 윈도우 비용을 추적하고 treemap으로 시각화합니다.

1M 컨텍스트 윈도우는 무제한이 아닙니다. 첫 메시지를 입력하기 전에 시스템 프롬프트, 빌트인 도구, MCP 서버, 스킬이 이미 상당 부분을 차지하고 있습니다.

**context-treemap**은 각 구성요소의 비용을 추적하고 treemap으로 시각화합니다. 매일 자동 업데이트되며, 주가 차트처럼 버전별 변동을 추적합니다.

## 최신 스냅샷

### MCP Index

> 도구 스키마 토큰 비용 - 어떤 코딩 에이전트를 쓰든 동일합니다.

![MCP Index](../images/mcp-index-latest.png)

### Skill Index

> 스킬 팩의 두 가지 비용 영역: **진한색** = always-on 비용 (설명 메타데이터, 설치만 해도 로드), **연한색** = on-invoke 비용 (본문, 호출 시에만 로드). 구분선이 "사용하기 전까지는 무료"인 영역을 보여줍니다.

![Skill Index](../images/skill-index-latest.png)

### Claude Code 컨텍스트 윈도우 (1M)

> 시스템 + 도구 + MCP + 스킬 - 대화에 남는 공간은?

![Claude Code Context](../images/claude-code-latest.png)

### Codex 컨텍스트 윈도우 (1M)

![Codex Context](../images/codex-latest.png)

## 추적 대상

### MCP 서버 (에이전트 무관)

| 서버 | 도구 수 | 토큰 | 1M 대비 % |
|------|---------|------|----------|
| GitHub | 84 | 20,444 | 2.0% |
| Playwright | 56 | ~15,000 | 1.5% |
| Supabase | 30 | ~10,000 | 1.0% |
| Notion | 22 | ~10,000 | 1.0% |
| 외 10개 | | | |
| **합계** | **263** | **~81K** | **8.1%** |

### 스킬 팩 (Claude Code)

스킬은 두 가지 비용 계층이 있습니다:
- **Always-on** (설명 메타데이터): 설치만 해도 시스템 컨텍스트에 로드
- **On invoke** (SKILL.md 본문): 호출 시에만 로드

| 스킬 팩 | 스킬 수 | Always-on | On Invoke |
|---------|---------|-----------|-----------|
| Everything Claude Code | 116 | 4,515 | ~143K |
| Trail of Bits Security | 60 | 2,470 | ~82K |
| Superpowers Lab | 4 | 196 | ~6K |

### 에이전트 시스템 오버헤드

| 에이전트 | 모델 | 컨텍스트 | 시스템 프롬프트 | 빌트인 도구 | Autocompact 버퍼 | 합계 |
|---------|------|---------|--------------|------------|-----------------|------|
| Claude Code | Opus 4.6 | 1M | 3,000 | 16,821 | 33,000 | 52,821 (5.3%) |
| Codex | GPT-5.4 | 1M | 2,500 | 8,000 | - | 10,500 (1.1%) |

## 작동 방식

1. **크롤**: GitHub Actions가 매일 MCP 서버 npm 패키지에서 도구 스키마를 추출
2. **스킬 크롤**: GitHub 레포에서 SKILL.md 파일을 가져와 설명 메타데이터를 파싱
3. **측정**: [Anthropic count_tokens API](https://docs.anthropic.com/en/docs/build-with-claude/token-counting)로 정확한 토큰 수 측정 (무료)
4. **렌더**: D3.js treemap + node-canvas로 PNG 이미지 4장 생성
5. **추적**: 버전 히스토리를 `data/`에 커밋하여 변동 감지 (▲▼%)

매일 09:00 KST에 GitHub Actions로 자동 생성됩니다.

## 사용법

```bash
npm install
npm run update    # 크롤 + 렌더 한번에 실행
```

## 기여하기

- **MCP 서버 추가**: [`config/servers.json`](../config/servers.json) 수정 후 PR
- **스킬 팩 추가**: [`config/skills.json`](../config/skills.json) 수정 후 PR
- **에이전트 데이터 업데이트**: `data/agents/*.json` 수정
- **오류 보고**: `/context` 명령 출력과 함께 이슈 등록

## 라이선스

MIT
