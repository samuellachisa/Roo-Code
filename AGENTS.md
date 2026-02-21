# AGENTS.md — The Shared Brain

This file is a persistent knowledge base shared across parallel agent sessions (Architect/Builder/Tester). It contains "Lessons Learned", project-specific stylistic rules, and architectural decisions that all agents must respect.

**Update Pattern**: Incrementally appended when verification loops fail or architectural decisions are made. The `LessonRecorder` in `src/core/hooks/LessonRecorder.ts` auto-appends to `.orchestration/CLAUDE.md` on scope violations, hash mismatches, and tool failures. Humans append architectural decisions here manually.

---

## Project-Specific Rules

- Settings View Pattern: When working on `SettingsView`, inputs must bind to the local `cachedState`, NOT the live `useExtensionState()`. The `cachedState` acts as a buffer for user edits, isolating them from the `ContextProxy` source-of-truth until the user explicitly clicks "Save". Wiring inputs directly to the live state causes race conditions.

## Orchestration System

- **Intent Required**: Before any write operation, call `select_active_intent(intent_id)`. The HookEngine enforces this — writes without an active intent are rejected.
- **Scope Is a Fence**: Each intent declares `owned_scope` globs. Writes outside that scope are hard-rejected, not warned. Expand scope in `active_intents.yaml` if needed.
- **Content Hashing**: All mutations are tracked via SHA-256 content hashes. Line numbers are ephemeral; hashes survive refactoring.
- **Trace Ledger**: Every mutation appends to `.orchestration/agent_trace.jsonl` in the [Agent Trace specification](https://github.com/entire-io/agent-trace) format. Entries link Intent → Code Hash → VCS revision.
- **Spatial Map**: `.orchestration/intent_map.md` maps intents to files. Auto-updated on successful writes. On `INTENT_EVOLUTION`, an evolution log entry is added.
- **Parallel Sessions**: Multiple agents can work concurrently on disjoint scopes. Optimistic locking via hash comparison prevents silent overwrites. The `.orchestration/CLAUDE.md` shared brain prevents architectural drift.
- **Fail-Open**: The hook system never blocks legitimate work. If any hook component throws, the tool executes normally and the failure is logged.

## Lessons Learned

_Lessons are auto-recorded by `LessonRecorder` to `.orchestration/CLAUDE.md`. Summarize critical ones here for cross-session visibility._

## Architectural Decisions

_Record decisions that affect multiple agents/sessions here._

### 2026-02-18: Hook System Architecture

- **Decision**: Use middleware interceptor pattern for hooks at `BaseTool.handle()` level
- **Rationale**: Single chokepoint; clean separation of concerns; composable; fail-safe
- **Impact**: All tool executions pass through HookEngine pre/post hooks

### 2026-02-18: Spatial Independence via Content Hashing

- **Decision**: Use SHA-256 content hashes instead of line numbers for traceability
- **Rationale**: Line numbers change when code moves; hashes are stable
- **Impact**: Trace entries remain valid even after refactoring

### 2026-02-20: Agent Trace Specification Adoption

- **Decision**: Write trace entries in the full [Agent Trace spec](https://github.com/entire-io/agent-trace) format
- **Rationale**: Interoperability with external tools; content hashing for spatial independence; `vcs.revision_id` links to git; `conversations[].related[]` provides the golden thread to SpecKit
- **Impact**: `agent_trace.jsonl` entries include `vcs`, `files[].conversations[]` with contributor, ranges, and related specs
