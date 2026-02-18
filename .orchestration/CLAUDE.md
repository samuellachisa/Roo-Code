# Shared Brain - Roo-Code Project

This file serves as a persistent knowledge base shared across parallel AI agent sessions.

## Architectural Decisions

### 2026-02-18: Hook System Architecture

- **Decision**: Use middleware interceptor pattern for hooks
- **Rationale**: Clean separation of concerns, composable, fail-safe
- **Impact**: All tool executions pass through HookEngine pre/post hooks

### 2026-02-18: Spatial Independence via Content Hashing

- **Decision**: Use SHA-256 content hashes instead of line numbers
- **Rationale**: Line numbers change when code moves; hashes are stable
- **Impact**: Trace entries remain valid even after refactoring

## Lessons Learned

### Hook System Integration

- The `select_active_intent` tool must be called BEFORE any write operations
- Hooks are opt-in: only active when `.orchestration/` directory exists
- Backward compatibility maintained: existing tasks work without orchestration

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
