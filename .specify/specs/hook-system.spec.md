# Specification: Intent-Code Traceability Hook System

## `/speckit.specify` — Formal Intent Specifications

**Spec ID**: SPEC-001
**Intent**: INT-001
**Status**: DRAFT
**Created**: 2026-02-20
**Constitution**: `.specify/memory/constitution.md`

---

## 1. System Overview

The Hook System is a deterministic middleware layer that intercepts every tool execution in Roo Code's agent pipeline. It enforces the constitutional invariant:

```
intent_id → scope_validation → mutation → content_hash → audit_entry
```

### 1.1 What Exists Today

| Component                  | Path                                                          | Status                                                    |
| -------------------------- | ------------------------------------------------------------- | --------------------------------------------------------- |
| `BaseTool`                 | `src/core/tools/BaseTool.ts`                                  | EXISTS — abstract base with `handle()` → `execute()` flow |
| `SelectActiveIntentTool`   | `src/core/tools/SelectActiveIntentTool.ts`                    | EXISTS — imports `HookEngine` (unresolved)                |
| `select_active_intent` def | `src/core/prompts/tools/native-tools/select_active_intent.ts` | EXISTS — OpenAI tool schema                               |
| `presentAssistantMessage`  | `src/core/assistant-message/presentAssistantMessage.ts`       | EXISTS — tool dispatch switch statement                   |
| `HookEngine`               | `src/core/hooks/HookEngine.ts`                                | MISSING — referenced but not implemented                  |
| `IntentContextLoader`      | `src/core/hooks/IntentContextLoader.ts`                       | MISSING                                                   |
| `TraceLogger`              | `src/core/hooks/TraceLogger.ts`                               | MISSING                                                   |
| `types.ts`                 | `src/core/hooks/types.ts`                                     | MISSING                                                   |
| `utils.ts`                 | `src/core/hooks/utils.ts`                                     | MISSING                                                   |
| `agent_trace.jsonl`        | `.orchestration/agent_trace.jsonl`                            | MISSING — created on first write                          |

### 1.2 Integration Surface

The hook system integrates at **one point**: `BaseTool.handle()` (line 113 of `BaseTool.ts`). This is the single chokepoint through which all tool executions flow. The integration wraps the `execute()` call at line 160 with PreToolUse/PostToolUse hooks.

**Why here and not in `presentAssistantMessage.ts`?**

- `BaseTool.handle()` is the last common ancestor before tool-specific logic
- `presentAssistantMessage.ts` routes by tool name but delegates to `tool.handle()` — intercepting at the routing level would miss tools added in the future
- The `handle()` method already owns parameter parsing; adding hook logic here maintains single responsibility per layer

---

## 2. Component Specifications

### 2.1 SPEC-001-A: HookEngine

**Purpose**: Singleton coordinator that manages intent state, dispatches pre/post hooks, and orchestrates the trace pipeline.

**Interface**:

```typescript
interface IHookEngine {
	// Lifecycle
	isEnabled(): Promise<boolean>

	// Intent management
	setActiveIntent(intentId: string): void
	getActiveIntent(): string | null
	clearActiveIntent(): void

	// Hook dispatch
	preToolUse(context: PreToolContext): Promise<HookResult>
	postToolUse(context: PostToolContext): Promise<HookResult>

	// Accessors
	getContextLoader(): IntentContextLoader
	getTraceLogger(): TraceLogger
}
```

**Singleton Pattern**: `HookEngine.getInstance(workspacePath, sessionId)` — one instance per agent session, keyed by workspace path + session ID.

**`isEnabled()` Logic**:

1. Check if `.orchestration/` directory exists in workspace
2. Check if `active_intents.yaml` is present and parseable
3. Return `false` if either condition fails — hook system degrades gracefully

**State Machine**:

```
UNINITIALIZED → (getInstance) → IDLE → (setActiveIntent) → ACTIVE → (clearActiveIntent) → IDLE
                                                              ↓
                                                      preToolUse / postToolUse
```

When state is `IDLE` (no active intent) and a write tool is invoked:

- `preToolUse` returns `{ allowed: false, reason: "No active intent. Call select_active_intent first." }`
- Read-only tools (`read_file`, `list_files`, `search_files`) are exempt from intent requirement

**Write tools requiring active intent**: `write_to_file`, `apply_diff`, `edit`, `search_replace`, `execute_command` (when command modifies files), `insert_code_block`

**Read-only tools (exempt)**: `read_file`, `list_files`, `search_files`, `list_code_definition_names`, `browser_action`, `select_active_intent`

---

### 2.2 SPEC-001-B: PreToolUse Hook

**Purpose**: Gate that runs before every mutating tool execution. Validates intent, scope, and acquires optimistic lock.

**Input**:

```typescript
interface PreToolContext {
	toolName: string
	filePath: string | null // null for non-file tools (e.g., execute_command)
	intentId: string | null // currently active intent
	params: Record<string, any> // raw tool parameters
	sessionId: string // agent session identifier
}
```

**Output**:

```typescript
interface HookResult {
	allowed: boolean
	reason?: string // human-readable explanation if rejected
	preHash?: string // SHA-256 of file content before mutation (null if file doesn't exist)
	metadata?: Record<string, any>
}
```

**Validation Chain** (executed in order, short-circuits on first failure):

1. **Intent Check**: If `intentId` is null and tool is a write tool → REJECT
2. **Intent Validity**: Resolve `intentId` from `active_intents.yaml` → if not found or status is `COMPLETED`/`ABANDONED` → REJECT
3. **Scope Validation**: If `filePath` is not null, match against intent's `owned_scope` globs using `micromatch` or `minimatch`. No match → REJECT with scope violation message
4. **Optimistic Lock Acquisition**: If file exists, compute SHA-256 of current file content. Store as `preHash` in hook result. If file doesn't exist (new file creation), `preHash` is null.
5. **All checks pass** → ALLOW, return `preHash` for PostToolUse comparison

**Scope Matching Rules**:

- Glob patterns from `owned_scope` are relative to workspace root
- `**` matches any depth of directories
- Patterns are matched using `minimatch` with `{ dot: true }` option
- A file must match **at least one** pattern to be in scope

---

### 2.3 SPEC-001-C: PostToolUse Hook

**Purpose**: Records the mutation to the audit ledger after tool execution completes.

**Input**:

```typescript
interface PostToolContext {
	toolName: string
	filePath: string | null
	intentId: string
	params: Record<string, any>
	sessionId: string
	preHash: string | null // from PreToolUse result
	success: boolean // did the tool execution succeed?
	error?: string // error message if failed
}
```

**Processing Chain**:

1. **Compute Post-Hash**: If `filePath` is not null and file exists, compute SHA-256 of file content after mutation
2. **Optimistic Lock Verification**: Compare `preHash` (from PreToolUse) with the expected pre-mutation state. If another agent modified the file between PreToolUse and PostToolUse (preHash at read-time ≠ content hash at lock-time), flag as concurrent modification warning in trace entry
3. **Build Trace Entry**: Construct `TraceEntry` object
4. **Append to Ledger**: Write to `.orchestration/agent_trace.jsonl` (append, not overwrite)
5. **Update Spatial Index**: If mutation succeeded, update `.orchestration/intent_map.md` with new file reference under the active intent

---

### 2.4 SPEC-001-D: IntentContextLoader

**Purpose**: Reads `active_intents.yaml`, resolves intent specifications, and builds curated context for the agent.

**Interface**:

```typescript
interface IIntentContextLoader {
	getIntent(intentId: string): Promise<IntentSpec | null>
	buildIntentContext(intentId: string): Promise<IntentContext | null>
	formatContextForPrompt(context: IntentContext): string
	reload(): Promise<void>
}
```

**Data Types**:

```typescript
interface IntentSpec {
	id: string
	name: string
	status: "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "BLOCKED" | "ABANDONED"
	owned_scope: string[]
	constraints: string[]
	acceptance_criteria: string[]
	created_at: string
	updated_at: string
}

interface IntentContext {
	intent: IntentSpec
	relatedFiles: SpatialEntry[]
	recentTraceEntries: TraceEntry[]
	constraints: string[]
	acceptanceCriteria: string[]
}

interface SpatialEntry {
	filePath: string
	intentId: string
	lastHash: string
	lastModified: string
}
```

**Context Curation Rules** (Constitution Principle 6):

- Load ONLY the selected intent's spec — no other intents
- Load ONLY `relatedFiles` that match the intent's `owned_scope` globs
- Load at most the 20 most recent trace entries for this intent
- Total context payload must not exceed 4000 tokens (approximately 16KB of text)
- If payload exceeds limit, truncate `recentTraceEntries` first, then `relatedFiles`

**YAML Parsing**: Use `js-yaml` library. If parsing fails, `getIntent()` returns null and hook system degrades gracefully.

---

### 2.5 SPEC-001-E: TraceLogger

**Purpose**: Append-only writer to `.orchestration/agent_trace.jsonl`.

**Interface**:

```typescript
interface ITraceLogger {
	log(entry: TraceEntry): Promise<void>
	getRecentEntries(intentId: string, limit: number): Promise<TraceEntry[]>
}
```

**Trace Entry Schema**:

```typescript
interface TraceEntry {
	id: string // UUID v4
	timestamp: string // ISO 8601
	intent_id: string
	session_id: string
	tool_name: string
	mutation_class: MutationClass
	file: {
		relative_path: string
		pre_hash: string | null // SHA-256 before mutation
		post_hash: string | null // SHA-256 after mutation
	} | null // null for non-file tools
	scope_validation: "PASS" | "FAIL" | "EXEMPT"
	success: boolean
	error?: string
}

type MutationClass =
	| "AST_REFACTOR" // Structure change, same behavior
	| "INTENT_EVOLUTION" // New behavior
	| "BUG_FIX" // Defect correction
	| "DOCUMENTATION" // Comments/docs only
	| "CONFIGURATION" // Config file changes
	| "FILE_CREATION" // New file
	| "FILE_DELETION" // File removed
```

**Write Semantics**:

- Append one JSON line per entry (JSONL format)
- Each line is a self-contained JSON object followed by `\n`
- File is created on first write if it doesn't exist
- Writes are atomic: use `fs.appendFile` (not read-modify-write)
- No rotation or truncation — the ledger is append-only

**Read Semantics**:

- `getRecentEntries` reads the file, filters by `intent_id`, returns last N entries
- Reads are best-effort — if file doesn't exist, return empty array

---

### 2.6 SPEC-001-F: Content Hashing Utility

**Purpose**: Deterministic SHA-256 hashing for file contents.

```typescript
function computeContentHash(content: string | Buffer): string
function computeFileHash(absolutePath: string): Promise<string | null>
```

**Rules**:

- Uses Node.js `crypto.createHash("sha256")`
- Input is raw file content (no normalization of line endings)
- Output is lowercase hex string prefixed with `sha256:` (e.g., `sha256:a8f5f167...`)
- If file doesn't exist, `computeFileHash` returns `null`
- Empty files produce the hash of an empty string (not null)

---

## 3. Integration Specification

### 3.1 BaseTool.handle() Integration

The `handle()` method in `BaseTool.ts` is modified to wrap `execute()` with hook calls:

```typescript
async handle(task: Task, block: ToolUse<TName>, callbacks: ToolCallbacks): Promise<void> {
  // ... existing partial handling and parameter parsing (unchanged) ...

  // Hook integration point
  const hookEngine = HookEngine.getInstance(task.cwd, task.taskId)
  const enabled = await hookEngine.isEnabled()

  if (enabled) {
    const preResult = await hookEngine.preToolUse({
      toolName: this.name,
      filePath: this.extractFilePath(params),
      intentId: hookEngine.getActiveIntent(),
      params,
      sessionId: task.taskId,
    })

    if (!preResult.allowed) {
      callbacks.pushToolResult(
        formatResponse.toolError(`Hook rejected: ${preResult.reason}`)
      )
      return
    }

    // Execute tool
    await this.execute(params, task, callbacks)

    // Post-hook
    await hookEngine.postToolUse({
      toolName: this.name,
      filePath: this.extractFilePath(params),
      intentId: hookEngine.getActiveIntent()!,
      params,
      sessionId: task.taskId,
      preHash: preResult.preHash ?? null,
      success: true,
    })
  } else {
    // No hooks — execute directly (backward compatible)
    await this.execute(params, task, callbacks)
  }
}
```

**`extractFilePath` helper**: Each tool subclass can override to extract the file path from its typed params. Default returns `params.path ?? params.file_path ?? null`.

### 3.2 Backward Compatibility Contract

- If `.orchestration/` directory does not exist → all hooks are no-ops, tools execute normally
- If `active_intents.yaml` is malformed → `isEnabled()` returns false, hooks degrade
- Existing tool behavior is unchanged when hooks are disabled
- No new dependencies are required by tools that don't opt into orchestration
- The `select_active_intent` tool itself is exempt from hook validation (it IS the handshake)

### 3.3 Error Handling Contract

| Failure                                 | Behavior                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------- |
| `active_intents.yaml` parse error       | `isEnabled()` returns false, log warning, tools execute normally                      |
| `HookEngine` throws during `preToolUse` | Catch, log error, allow tool to execute (fail-open for reliability)                   |
| `TraceLogger` fails to append           | Log error, do NOT block tool execution. Trace gap is acceptable; blocking work is not |
| `agent_trace.jsonl` file locked         | Retry once with 100ms delay, then log warning and skip trace entry                    |
| File hash computation fails             | Use `null` hash, log warning, continue execution                                      |

**Fail-Open Principle**: The hook system must never prevent legitimate work. If any hook component fails, the tool executes normally and the failure is logged. Governance gaps are preferable to blocked developers.

---

## 4. Data Flow Diagrams

### 4.1 Happy Path: Write with Active Intent

```
Agent calls write_to_file(path="src/core/hooks/HookEngine.ts", content="...")
    │
    ▼
BaseTool.handle()
    │
    ├── hookEngine.isEnabled() → true
    │
    ├── hookEngine.preToolUse({
    │       toolName: "write_to_file",
    │       filePath: "src/core/hooks/HookEngine.ts",
    │       intentId: "INT-001",
    │       ...
    │   })
    │   ├── Intent exists? ✓ (INT-001 is IN_PROGRESS)
    │   ├── Scope match? ✓ (matches "src/core/hooks/**")
    │   ├── Compute preHash → sha256:abc123...
    │   └── Return { allowed: true, preHash: "sha256:abc123..." }
    │
    ├── this.execute(params, task, callbacks)  ← actual file write
    │
    └── hookEngine.postToolUse({
            preHash: "sha256:abc123...",
            success: true,
            ...
        })
        ├── Compute postHash → sha256:def456...
        ├── Append to agent_trace.jsonl
        └── Update intent_map.md
```

### 4.2 Rejection: No Active Intent

```
Agent calls write_to_file(...) WITHOUT calling select_active_intent first
    │
    ▼
BaseTool.handle()
    │
    ├── hookEngine.isEnabled() → true
    │
    ├── hookEngine.preToolUse({
    │       intentId: null,   ← no intent selected
    │       ...
    │   })
    │   └── Intent check: null → REJECT
    │       Return { allowed: false, reason: "No active intent..." }
    │
    └── pushToolResult("Hook rejected: No active intent...")
        ← tool does NOT execute
```

### 4.3 Rejection: Scope Violation

```
Agent (intent INT-002) calls write_to_file(path="src/core/hooks/HookEngine.ts", ...)
    │
    ▼
BaseTool.handle()
    │
    ├── hookEngine.preToolUse({
    │       intentId: "INT-002",
    │       filePath: "src/core/hooks/HookEngine.ts",
    │       ...
    │   })
    │   ├── Intent exists? ✓
    │   ├── Scope match? ✗ (INT-002 owns "src/api/weather/**", not "src/core/hooks/**")
    │   └── Return { allowed: false, reason: "Scope violation: src/core/hooks/HookEngine.ts
    │                is not in INT-002's owned_scope" }
    │
    └── pushToolResult("Hook rejected: Scope violation...")
        ← tool does NOT execute
```

---

## 5. File Manifest

Files to be created or modified, grouped by operation:

### New Files (Create)

| File                                                   | Purpose                                                 |
| ------------------------------------------------------ | ------------------------------------------------------- |
| `src/core/hooks/HookEngine.ts`                         | Singleton coordinator                                   |
| `src/core/hooks/IntentContextLoader.ts`                | YAML parser + context builder                           |
| `src/core/hooks/TraceLogger.ts`                        | JSONL append-only writer                                |
| `src/core/hooks/types.ts`                              | All interfaces and types from this spec                 |
| `src/core/hooks/utils.ts`                              | `computeContentHash`, `computeFileHash`, scope matching |
| `src/core/hooks/__tests__/HookEngine.test.ts`          | Unit tests for HookEngine                               |
| `src/core/hooks/__tests__/IntentContextLoader.test.ts` | Unit tests for context loading                          |
| `src/core/hooks/__tests__/TraceLogger.test.ts`         | Unit tests for trace logging                            |
| `src/core/hooks/__tests__/utils.test.ts`               | Unit tests for hashing + scope matching                 |

### Modified Files (Edit)

| File                                       | Change                                                   |
| ------------------------------------------ | -------------------------------------------------------- |
| `src/core/tools/BaseTool.ts`               | Wrap `execute()` call with pre/post hooks in `handle()`  |
| `src/core/tools/SelectActiveIntentTool.ts` | Remove direct `HookEngine` import if constructor changes |

### Unchanged (Reference Only)

| File                                                          | Reason                                                |
| ------------------------------------------------------------- | ----------------------------------------------------- |
| `src/core/assistant-message/presentAssistantMessage.ts`       | No changes needed — hooks integrate at BaseTool level |
| `src/core/prompts/tools/native-tools/select_active_intent.ts` | Tool schema is complete                               |
| `.orchestration/active_intents.yaml`                          | Data file, not code                                   |

---

## 6. Dependencies

### New npm Dependencies

| Package     | Purpose                            | Version Constraint |
| ----------- | ---------------------------------- | ------------------ |
| `js-yaml`   | Parse `active_intents.yaml`        | `^4.x`             |
| `minimatch` | Glob matching for scope validation | `^9.x`             |
| `uuid`      | Generate trace entry IDs           | `^9.x`             |

### Existing Dependencies (Already Available)

| Package                          | Usage           |
| -------------------------------- | --------------- |
| `crypto` (Node.js built-in)      | SHA-256 hashing |
| `fs/promises` (Node.js built-in) | File I/O        |
| `path` (Node.js built-in)        | Path resolution |

---

## 7. Acceptance Criteria (from INT-001)

Each criterion maps to a verifiable test:

| #    | Criterion                                                    | Verification                                                                                                     |
| ---- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| AC-1 | Hook engine intercepts all write tool executions             | Unit test: mock BaseTool.handle() confirms preToolUse/postToolUse called for write tools                         |
| AC-2 | Agent can select active intent via select_active_intent tool | Integration test: call tool, verify HookEngine state changes                                                     |
| AC-3 | File modifications are logged to agent_trace.jsonl           | Unit test: after postToolUse, verify JSONL entry appended with correct schema                                    |
| AC-4 | Scope validation prevents out-of-scope modifications         | Unit test: preToolUse rejects file not matching owned_scope globs                                                |
| AC-5 | Parallel agent sessions can work without conflicts           | Unit test: two HookEngine instances with different sessionIds, overlapping file write detected via hash mismatch |

---

## 8. Non-Functional Requirements

| Requirement                             | Target                                                             |
| --------------------------------------- | ------------------------------------------------------------------ |
| Hook overhead per tool call             | < 10ms for scope validation, < 50ms including hash computation     |
| agent_trace.jsonl write latency         | < 5ms per append (async, non-blocking)                             |
| YAML parse (cold)                       | < 100ms for typical active_intents.yaml                            |
| YAML parse (cached)                     | < 1ms (in-memory cache, invalidate on file change)                 |
| Maximum trace file size before rotation | No rotation (append-only), but recommend archival at > 10MB        |
| Backward compatibility                  | 100% — existing tools work identically when .orchestration/ absent |

---

## 9. Security Considerations

- `agent_trace.jsonl` is append-only by convention. The TraceLogger does not expose delete/truncate operations.
- Content hashes use SHA-256, which is collision-resistant for integrity verification (not used for cryptographic authentication).
- `active_intents.yaml` is the authority for scope permissions. If an attacker can modify this file, they can expand scope. Mitigated by: the file itself must be in an intent's owned_scope to be modifiable through hooks.
- The hook system runs in the same process as the extension. It is not a security boundary — it is a governance boundary. A malicious extension could bypass it. The threat model assumes the extension code itself is trusted.

---

_End of specification. Awaiting approval to proceed to `/speckit.plan`._
