# Shared Brain - Roo-Code Project

This file serves as a persistent knowledge base shared across parallel AI agent sessions (Architect/Builder/Tester). It is the canonical location for automated lesson recording.

**Update Pattern**: `LessonRecorder` auto-appends entries to the "Lessons Learned" section below when verification loops fail, scope violations occur, or hash mismatches are detected. Architectural decisions are appended manually or when significant design choices are made.

## Architectural Decisions

### 2026-02-18: Hook System Architecture

- **Decision**: Use middleware interceptor pattern for hooks
- **Rationale**: Clean separation of concerns, composable, fail-safe
- **Impact**: All tool executions pass through HookEngine pre/post hooks

### 2026-02-18: Spatial Independence via Content Hashing

- **Decision**: Use SHA-256 content hashes instead of line numbers
- **Rationale**: Line numbers change when code moves; hashes are stable
- **Impact**: Trace entries remain valid even after refactoring

### 2026-02-20: Full Agent Trace Specification for Ledger

- **Decision**: Adopt the [Agent Trace spec](https://github.com/entire-io/agent-trace) format for `agent_trace.jsonl`
- **Rationale**: Standard format enables spatial independence via `content_hash` in ranges, links to VCS via `revision_id`, and provides the golden thread to SpecKit via `related[]` entries
- **Impact**: Every trace entry now includes `vcs.revision_id` (git SHA), `files[].conversations[].contributor` (AI model identifier), `ranges[].content_hash` (SHA-256), and `related[]` (intent + specification links)

### 2026-02-20: Spatial Map Evolution Tracking

- **Decision**: On `INTENT_EVOLUTION` mutations, the spatial map (`intent_map.md`) appends an evolution log entry with timestamp
- **Rationale**: When a manager asks "When did billing logic change?", the evolution log in the spatial map answers directly
- **Impact**: `SpatialMapWriter.addFileToIntent()` now accepts `mutationClass` and creates `### Evolution Log` subsections

## Lessons Learned

### Hook System Integration

- The `select_active_intent` tool must be called BEFORE any write operations
- Hooks are opt-in: only active when `.orchestration/` directory exists
- Backward compatibility maintained: existing tasks work without orchestration

### Trace Format Migration

- The ledger now writes in Agent Trace spec format; `getRecentEntries()` handles both legacy flat format and new nested format for backward compatibility
- `GitUtils.getCurrentSha()` is called per trace entry for `vcs.revision_id` — acceptable latency (<5ms) but consider caching if trace volume increases

## Project-Specific Rules

### Code Style

- Use TypeScript strict mode
- Prefer async/await over promises
- Use descriptive variable names

### Testing

- Unit tests for all hook system components
- Integration tests for tool execution flow
- E2E tests for parallel orchestration

## Known Issues

None currently.

## Future Enhancements

1. SQLite backend for better performance
2. Web UI for intent management
3. Integration with GitHub Issues/PRs
4. Automatic intent inference from commit messages
5. Cache `GitUtils.getCurrentSha()` per postToolUse batch for high-volume operations
6. Optional high-performance storage (SQLite, vector DB) for large trace volumes
