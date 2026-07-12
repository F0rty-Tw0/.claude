---
name: writer-memory
description: Use when writing fiction and needing to track characters, relationships, scenes, and themes across sessions, when dialogue needs consistency-checking against a character's established voice, when generating a synopsis from tracked story elements, or when a writer asks to remember worldbuilding details, character arcs, speech patterns, or relationship evolution between chapters.
argument-hint: "init|char|rel|scene|query|validate|synopsis|status|export [args]"
---

# Writer Memory - Agentic Memory System for Writers

Persistent memory system designed for creative writers.

## Overview

Writer Memory maintains context across Claude sessions for fiction writers. It tracks:

- **Characters (캐릭터)**: Emotional arcs (감정궤도), attitudes (태도), dialogue tone (대사톤), speech levels
- **World (세계관)**: Settings, rules, atmosphere, constraints
- **Relationships (관계)**: Character dynamics and evolution over time
- **Scenes (장면)**: Cut composition (컷구성), narration tone, emotional tags
- **Themes (테마)**: Emotional themes (정서테마), authorial intent

All data persists in `.writer-memory/memory.json` for git-friendly collaboration.

## Commands

| Command                                            | Action                                                   |
| --------------------------------------------------- | -------------------------------------------------------- |
| `writer-memory init <project-name>`                | Initialize new project memory                            |
| `writer-memory status`                             | Show memory overview (character count, scene count, etc) |
| `writer-memory char add <name>`                    | Add new character                                        |
| `writer-memory char <name>`                        | View character details                                   |
| `writer-memory char update <name> <field> <value>` | Update character field                                   |
| `writer-memory char list`                          | List all characters                                      |
| `writer-memory rel add <char1> <char2> <type>`     | Add relationship                                         |
| `writer-memory rel <char1> <char2>`                | View relationship                                        |
| `writer-memory rel update <char1> <char2> <event>` | Add relationship event                                   |
| `writer-memory scene add <title>`                  | Add new scene                                            |
| `writer-memory scene <id>`                         | View scene details                                       |
| `writer-memory scene list`                         | List all scenes                                          |
| `writer-memory theme add <name>`                   | Add theme                                                |
| `writer-memory world set <field> <value>`          | Set world attribute                                      |
| `writer-memory query <question>`                   | Query memory naturally                                   |
| `writer-memory validate <character> <dialogue>`    | Check if dialogue matches character tone                 |
| `writer-memory synopsis`                           | Generate emotion-focused synopsis                        |
| `writer-memory export`                             | Export full memory as readable markdown                  |
| `writer-memory backup`                             | Create manual backup                                     |

## Memory Types

### Character Memory (캐릭터)

| Field                 | Description                                                    |
| --------------------- | ---------------------------------------------------------------- |
| `arc` (감정궤도)      | Emotional journey (e.g., "체념 -> 욕망자각 -> 선택")             |
| `attitude` (태도)     | Current disposition toward life/others                          |
| `tone` (대사톤)       | Dialogue style (e.g., "담백", "직설적", "회피적")               |
| `speechLevel` (말투)  | Formality: 반말, 존댓말, 해체, 혼합                              |
| `keywords` (핵심 단어) | Characteristic words/phrases they use                           |
| `taboo` (금기어)      | Words/phrases they would never say                              |
| `emotional_baseline`  | Default emotional state (감정 기준선)                            |
| `triggers`            | What provokes emotional reactions (트리거)                       |

```
/writer-memory char add 새랑
/writer-memory char update 새랑 arc "체념 -> 욕망자각 -> 선택"
/writer-memory char update 새랑 tone "담백, 현재충실, 감정억제"
/writer-memory char update 새랑 speechLevel "해체"
```

### World Memory (세계관)

`setting` (배경: time/place/social context), `rules` (규칙: how the world operates), `atmosphere` (분위기), `constraints` (제약: what cannot happen), `history` (역사: relevant backstory).

### Relationship Memory (관계)

| Field            | Description                                                              |
| ---------------- | -------------------------------------------------------------------------- |
| `type`           | Base relationship: romantic, familial, friendship, rivalry, professional |
| `status`         | Current state: budding, stable, strained, broken, healing                |
| `power_dynamic`  | Who has the upper hand, if any                                            |
| `events`         | Timeline of relationship-changing moments                                |
| `tension`        | Current unresolved conflicts                                              |
| `intimacy_level` | Emotional closeness (1-10)                                                |

```
/writer-memory rel add 새랑 해랑 romantic
/writer-memory rel update 새랑 해랑 "첫 키스 - 새랑 회피"
/writer-memory rel update 새랑 해랑 "새랑 먼저 손 잡음"
```

### Scene Memory (장면)

`title` (제목), `characters` (등장인물), `location` (장소), `cuts` (컷 구성: shot-by-shot breakdown), `narration_tone` (내레이션 톤), `emotional_tag` (감정 태그, e.g. "설렘+불안"), `purpose` (목적), `before_after` (전후 변화: what changes for characters).

### Theme Memory (테마)

`name` (이름), `expression` (표현 방식: how it manifests), `scenes` (관련 장면), `character_links` (캐릭터 연결), `author_intent` (작가 의도).

## Synopsis Generation (시놉시스)

The `synopsis` command generates an emotion-focused summary from 5 elements:

1. **주인공 태도 요약** (protagonist attitude) - core emotional stance, e.g. "새랑은 상실을 예방하기 위해 먼저 포기하는 사람"
2. **관계 핵심 구도** (core relationship structure) - the central dynamic and its power imbalance
3. **정서적 테마** (emotional theme) - the feeling the story evokes, not the plot
4. **장르 vs 실제감정 대비** (genre vs real-emotion contrast) - e.g. "로맨스지만 본질은 자기수용 서사"
5. **엔딩 정서 잔상** (ending emotional aftertaste) - the lingering feeling after the story ends

## Character Validation (캐릭터 검증)

The `validate` command checks whether dialogue matches a character's established voice, checking speech level (반말/존댓말/해체 match), tone match, keyword usage, taboo violations, emotional range vs baseline, and fit with the current relationship/scene. Results are **PASS**, **WARN** (minor, may be intentional), or **FAIL** (significant deviation).

```
/writer-memory validate 새랑 "사랑해, 해랑아. 너무 보고싶었어."
```

```
[FAIL] 새랑 validation failed:
- TABOO: "사랑해" - character avoids direct declarations
- TABOO: "보고싶었어" - character suppresses longing expressions
- TONE: Too emotionally direct for 새랑's 담백 style

Suggested alternatives:
- "...왔네." (minimal acknowledgment)
- "밥 먹었어?" (care expressed through practical concern)
```

## Context Query (맥락 질의)

Natural language queries synthesized from all relevant memory types:

```
/writer-memory query "새랑은 이 상황에서 뭐라고 할까?"
/writer-memory query "해랑과 새랑의 관계는 어디까지 왔나?"
/writer-memory query "새랑이 먼저 연락하는 게 맞아?"
```

## Behavior

1. **On Init**: Creates `.writer-memory/memory.json` with project metadata and empty collections
2. **Auto-Backup**: Changes are backed up before modification to `.writer-memory/backups/`
3. **Localized Vocabulary**: Emotion vocabulary uses localized terms throughout
4. **Session Loading**: Memory is loaded on session start for immediate context
5. **Git-Friendly**: JSON formatted for clean diffs and collaboration

## Integration

**With notepad**: `.claude/local/notepad.md` can capture scene ideas and character insights; cross-reference with memory.

**With architect agent** for complex character analysis:

```
Agent(subagent_type="architect", model="opus", prompt="Analyze 새랑's arc across all scenes...")
```

**Character validation pipeline** pulls context from character memory (tone, keywords, taboo), relationship memory (dynamics with dialogue partner), scene memory (current emotional context), and theme memory (authorial intent).

**Synopsis builder** aggregates all character arcs, key relationship events, scene emotional tags, and theme expressions.

## Example Workflow

```
/writer-memory init 봄의 끝자락

/writer-memory char add 새랑
/writer-memory char update 새랑 arc "체념 -> 욕망자각 -> 선택"
/writer-memory char update 새랑 speechLevel "해체"

/writer-memory rel add 새랑 해랑 romantic
/writer-memory rel update 새랑 해랑 "첫 만남 - 해랑 일방적 호감"

/writer-memory world set setting "서울, 현대, 20대 후반 직장인"

/writer-memory scene add "옥상 재회"

/writer-memory query "새랑은 이별 장면에서 어떤 톤으로 말할까?"
/writer-memory validate 새랑 "해랑아, 그만하자."
/writer-memory synopsis
/writer-memory export
```

**Quick character check** (`/writer-memory char 새랑`):

```
## 새랑

**Arc (감정궤도):** 체념 -> 욕망자각 -> 선택
**Tone (대사톤):** 담백, 현재충실
**Speech Level (말투):** 해체
**Taboo (금기어):** 사랑해, 보고싶어

**Relationships:**
- 해랑: romantic (intimacy: 6/10, status: healing)

**Scenes Appeared:** 옥상 재회, 카페 대화, 마지막 선택
```

## Storage Schema

Essential shape of `.writer-memory/memory.json` (one example entry per collection - real files hold many):

```json
{
  "version": "1.0",
  "project": { "name": "봄의 끝자락", "genre": "로맨스", "created": "...", "lastModified": "..." },
  "characters": {
    "새랑": {
      "arc": "체념 -> 욕망자각 -> 선택",
      "tone": "담백, 현재충실",
      "speechLevel": "해체",
      "keywords": ["그냥", "뭐", "괜찮아"],
      "taboo": ["사랑해", "보고싶어"]
    }
  },
  "world": { "setting": "서울, 현대, 20대 후반 직장인", "atmosphere": "도시의 건조함 속 미묘한 온기" },
  "relationships": [
    { "id": "rel_001", "from": "새랑", "to": "해랑", "type": "romantic",
      "evolution": [{ "timestamp": "...", "change": "첫 만남 - 해랑 일방적 호감" }] }
  ],
  "scenes": [
    { "id": "scene-001", "title": "옥상 재회", "characters": ["새랑", "해랑"],
      "emotional_tag": "긴장+그리움", "purpose": "재회의 어색함과 남은 감정 암시" }
  ],
  "themes": [
    { "name": "포기하지 않는 사랑", "scenes": ["옥상 재회"], "character_links": ["해랑"] }
  ],
  "synopsis": { "protagonist_attitude": "...", "relationship_structure": "...", "emotional_theme": "..." }
}
```

## File Structure

```
.writer-memory/
├── memory.json          # Main memory file
├── backups/             # Auto-backups before changes
└── exports/             # Markdown exports
```

## Tips for Writers

1. Start with characters before scenes
2. Update relationships after key scenes to track evolution
3. Use validation while writing to catch voice inconsistencies early
4. Query before difficult scenes for context
5. Generate synopsis periodically to check thematic coherence
6. Backup before major story pivots

## Troubleshooting

**Memory not loading?** Check `.writer-memory/memory.json` exists and has valid JSON; run `writer-memory status` to diagnose.

**Validation too strict?** Review the taboo list for unintended entries - a character's growth (arc progression) or a deliberate dramatic break from pattern can be valid exceptions.

**Query not finding context?** Ensure relevant data is in memory, try more specific queries, and check character names match exactly.
