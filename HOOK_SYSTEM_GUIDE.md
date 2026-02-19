# Hook System Implementation Guide

## Overview

This guide explains the Intent-Code Traceability Hook System implemented in Roo-Code.

## Architecture

### Components

1. **HookEngine** (`src/core/hooks/HookEngine.ts`)

    - Central coordinator for all hook operations
    - Manages pre-hook and post-hook execution
    - Enforces scope validation and concurrency control

2. **IntentContextLoader** (`src/core/hooks/IntentContextLoader.ts`)

    - Loads intent specifications from `active_intents.yaml`
    - Builds context for prompt injection
    - Manages intent lifecycle

3. **TraceLogger** (`src/core/hooks/TraceLogger.ts`)

    - Logs all file modifications to `agent_trace.jsonl`
    - Implements spatial independence via content hashing
    - Provides query interface for trace history

4. **SelectActiveIntentTool** (`src/core/tools/SelectActiveIntentTool.ts`)
    - Allows agent to select an active intent
    - Loads and injects intent context
    - Required before any write operations

### Execution Flow

```
User Request
    ↓
Agent Analysis
    ↓
select_active_intent(intent_id="INT-001")
    ↓
[PRE-HOOK]
  - Load intent context
  - Inject into prompt
    ↓
Agent receives context
    ↓
write_to_file(path="...", content="...")
    ↓
[PRE-HOOK]
  - Validate scope
  - Check concurrency
  - Request approval if needed
    ↓
Tool Execution
    ↓
[POST-HOOK]
  - Compute content hash
  - Log to agent_trace.jsonl
  - Update intent_map.md
    ↓
Success
```

## Installation

### 1. Install Dependencies

The hook system requires the `yaml` package for parsing YAML files:

```bash
cd Roo-Code/src
pnpm add yaml
pnpm add -D @types/node
```

Also ensure `minimatch` is installed (should already be present):

```bash
pnpm add minimatch
```

### 2. Enable Orchestration

Create the `.orchestration/` directory in your workspace:

```bash
mkdir -p .orchestration
```

### 3. Create Initial Intent

Create `.orchestration/active_intents.yaml`:

```yaml
active_intents:
    - id: "INT-001"
      name: "My First Feature"
      status: "IN_PROGRESS"
      owned_scope:
          - "src/**"
      constraints:
          - "Follow project coding standards"
      acceptance_criteria:
          - "Code compiles without errors"
          - "Tests pass"
      created_at: "2026-02-18T10:00:00Z"
      updated_at: "2026-02-18T10:00:00Z"
```

## Usage

### For AI Agents

1. **Analyze the user request** to identify which intent it relates to

2. **Select the intent** before any modifications:

    ```typescript
    select_active_intent((intent_id = "INT-001"), (reasoning = "User requested feature implementation"))
    ```

3. **Proceed with modifications** - the hook system will:
    - Validate scope
    - Request approval if needed
    - Log all changes

### For Developers

1. **Define intents** in `active_intents.yaml` before starting work

2. **Review traces** to understand what changed:

    ```bash
    cat .orchestration/agent_trace.jsonl | jq .
    ```

3. **Query by intent**:
    ```bash
    cat .orchestration/agent_trace.jsonl | jq 'select(.intent_id == "INT-001")'
    ```

## Configuration

The HookEngine can be configured via `HookEngineConfig`:

```typescript
{
  enabled: true,                      // Enable/disable hooks
  orchestrationDir: ".orchestration", // Directory path
  requireIntentSelection: true,       // Enforce intent selection
  enableScopeValidation: true,        // Validate file scope
  enableConcurrencyControl: true,     // Optimistic locking
  enableTraceLogging: true            // Write to agent_trace.jsonl
}
```

## Testing

### Unit Tests

Test individual components:

```bash
cd Roo-Code/src
pnpm test src/core/hooks
```

### Integration Tests

Test the full flow:

```bash
pnpm test src/core/tools/SelectActiveIntentTool
```

### Manual Testing

1. Start Roo-Code in development mode (F5)
2. Create `.orchestration/active_intents.yaml` in a test workspace
3. Ask the agent to select an intent
4. Verify context is loaded
5. Ask the agent to modify a file
6. Verify trace is logged

## Troubleshooting

### "Cannot find module 'yaml'"

Install the yaml package:

```bash
cd Roo-Code/src
pnpm add yaml
```

### "Orchestration not enabled"

Create the `.orchestration/` directory and `active_intents.yaml` file.

### "Intent not found"

Check that the intent ID exists in `active_intents.yaml` and matches exactly.

### "Scope violation"

The file is outside the intent's `owned_scope`. Either:

- Add the file pattern to the intent
- Select a different intent
- Approve when prompted

## Advanced Features

### Parallel Orchestration

Multiple agents can work concurrently:

1. Each agent selects its own intent
2. Optimistic locking prevents conflicts
3. Shared brain (`CLAUDE.md`) prevents drift

### Mutation Classification

The system distinguishes between:

- `AST_REFACTOR`: Syntax changes (same intent)
- `INTENT_EVOLUTION`: New features
- `BUG_FIX`: Defect corrections
- `DOCUMENTATION`: Doc changes
- `CONFIGURATION`: Config changes

### Content Hashing

Spatial independence via SHA-256:

- Hashes remain valid even after line number changes
- Enables precise change tracking
- Supports code movement and refactoring

## API Reference

### HookEngine

```typescript
const engine = HookEngine.getInstance(cwd, sessionId)

// Set active intent
engine.setActiveIntent("INT-001")

// Execute pre-hook
const result = await engine.executePreHook(context)

// Execute post-hook
await engine.executePostHook(context, result, mutationClass)
```

### IntentContextLoader

```typescript
const loader = new IntentContextLoader(cwd)

// Load all intents
const intents = await loader.loadActiveIntents()

// Get specific intent
const intent = await loader.getIntent("INT-001")

// Build context
const context = await loader.buildIntentContext("INT-001")
```

### TraceLogger

```typescript
const logger = new TraceLogger(cwd)

// Log modification
await logger.logFileModification({
	intentId: "INT-001",
	mutationClass: "AST_REFACTOR",
	filePath: "/path/to/file.ts",
	content: "...",
	startLine: 1,
	endLine: 100,
	sessionId: "task-123",
	modelIdentifier: "claude-3-5-sonnet",
})

// Query traces
const traces = await logger.getTracesByIntent("INT-001")
```

## Future Enhancements

1. **SQLite Backend**: Better performance for large trace files
2. **Web UI**: Visual intent management
3. **GitHub Integration**: Sync with Issues/PRs
4. **Auto-inference**: Infer intents from commit messages
5. **Conflict Resolution**: Advanced merge strategies
6. **Intent Hierarchy**: Parent-child intent relationships

## References

- [ARCHITECTURE_NOTES.md](./ARCHITECTURE_NOTES.md) - Detailed architecture
- [.orchestration/README.md](./.orchestration/README.md) - Orchestration guide
- [Agent Trace Spec](https://github.com/entire-io/agent-trace)
- [AISpec](https://github.com/cbora/aispec)
