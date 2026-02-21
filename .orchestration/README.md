# Orchestration Directory

This directory contains the Intent-Code Traceability system for AI-native development.

## Purpose

Traditional version control (Git) tracks **what** changed and **when**, but is blind to **why** (intent) and **structural identity** (AST). This system bridges that gap by:

1. **Intent Formalization**: Defining business requirements as machine-readable specifications
2. **Spatial Traceability**: Linking code changes to intents via content hashing (not line numbers)
3. **Governance**: Enforcing scope validation and human-in-the-loop approval
4. **Parallel Orchestration**: Enabling multiple AI agents to work concurrently without conflicts

## Files

### `active_intents.yaml`

Defines the active business requirements and features being worked on.

**Structure:**

```yaml
active_intents:
    - id: "INT-001" # Unique identifier
      name: "Feature Name" # Human-readable name
      status: "IN_PROGRESS" # PENDING | IN_PROGRESS | COMPLETE | BLOCKED | ARCHIVED
      owned_scope: # File patterns this intent owns
          - "src/auth/**"
          - "src/middleware/jwt.ts"
      constraints: # Business rules and technical constraints
          - "Must maintain backward compatibility"
          - "Must not use external auth providers"
      acceptance_criteria: # Definition of done
          - "Unit tests pass"
          - "Integration tests pass"
      created_at: "2026-02-18T10:00:00Z"
      updated_at: "2026-02-18T12:00:00Z"
```

### `agent_trace.jsonl`

Append-only ledger of all AI agent actions. Each line is a JSON object following the full [Agent Trace specification](https://github.com/entire-io/agent-trace), ensuring spatial independence via content hashing.

**Structure (Agent Trace Spec):**

```json
{
	"id": "uuid-v4",
	"timestamp": "2026-02-18T12:00:00Z",
	"vcs": { "revision_id": "git_sha_hash" },
	"files": [
		{
			"relative_path": "src/auth/middleware.ts",
			"conversations": [
				{
					"url": "session_log_id",
					"contributor": {
						"entity_type": "AI",
						"model_identifier": "claude-3-5-sonnet"
					},
					"ranges": [
						{
							"start_line": 15,
							"end_line": 45,
							"content_hash": "sha256:a8f5f167f44f4964e6c998dee827110c"
						}
					],
					"related": [
						{
							"type": "intent",
							"value": "INT-001"
						},
						{
							"type": "specification",
							"value": ".specify/specs/hook-system.spec.md"
						}
					]
				}
			]
		}
	]
}
```

**Key Fields:**

| Field                         | Purpose                                                                    |
| ----------------------------- | -------------------------------------------------------------------------- |
| `vcs.revision_id`             | Git SHA at time of mutation — links trace to VCS history                   |
| `conversations[].url`         | Session ID — identifies the agent session that performed the mutation      |
| `conversations[].contributor` | Entity type (AI/Human) and model identifier                                |
| `ranges[].content_hash`       | SHA-256 hash of the modified code block — **spatial independence**         |
| `related[]`                   | The "Golden Thread" — links mutation to governing intent and SpecKit specs |

**Content Hashing (Spatial Independence):**

The `content_hash` in each range is computed from the actual file content after mutation, not from line numbers. If lines move during refactoring, the hash remains valid. This is the foundation of the Agent Trace spec's spatial independence guarantee.

### `intent_map.md`

Human-readable spatial map linking intents to files and AST nodes.

### `CLAUDE.md` (Shared Brain)

Persistent knowledge base shared across parallel agent sessions. Contains:

- Lessons learned from failed verification loops
- Project-specific stylistic rules
- Architectural decisions

## Workflow

### 1. Agent Receives Request

User: "Refactor the auth middleware"

### 2. Agent Analyzes and Selects Intent

Agent identifies this relates to `INT-001: JWT Authentication Migration`

```typescript
select_active_intent((intent_id = "INT-001"), (reasoning = "User requested auth middleware refactor"))
```

### 3. System Loads Context

The hook engine:

- Loads intent constraints and scope
- Retrieves recent trace entries for this intent
- Injects context into the agent's prompt

### 4. Agent Performs Work

Agent now has full context and can proceed with modifications:

```typescript
write_to_file((path = "src/auth/middleware.ts"), (content = "..."))
```

### 5. Hook System Validates

**Pre-Hook:**

- Validates file is in `INT-001`'s owned scope
- Checks for concurrent modifications (optimistic locking)
- Requests human approval if out of scope

**Post-Hook:**

- Computes content hash for spatial independence
- Logs to `agent_trace.jsonl`
- Updates `intent_map.md`

## Benefits

### 1. Context Management

Agents receive curated, intent-specific context instead of dumping the entire codebase.

### 2. Governance

- Scope validation prevents agents from modifying unrelated files
- Human-in-the-loop approval for out-of-scope changes
- Audit trail of all modifications

### 3. Traceability

- Every code change is linked to a business intent
- Content hashing enables spatial independence (survives line number changes)
- Can answer: "Why was this code written?" and "What intent does this serve?"

### 4. Parallel Orchestration

- Multiple agents can work concurrently
- Optimistic locking prevents conflicts
- Shared brain (`CLAUDE.md`) prevents drift

## Usage

### For Developers

1. **Create intents** in `active_intents.yaml` before starting work
2. **Let the agent select** the appropriate intent
3. **Review trace logs** to understand what changed and why

### For AI Agents

1. **Always call `select_active_intent`** before modifying files
2. **Respect scope boundaries** defined in the intent
3. **Classify mutations** appropriately (refactor vs. evolution)

## References

- [Agent Trace Specification](https://github.com/entire-io/agent-trace)
- [AISpec - Intent Formalization](https://github.com/cbora/aispec)
- [SpecKit - GitHub Integration](https://github.com/speckit/speckit)
- [Context Engineering for Coding Agents](https://www.anthropic.com/research/context-engineering)

## Troubleshooting

### "Orchestration not enabled"

Create the `.orchestration/` directory and `active_intents.yaml` file.

### "Intent not found"

Check that the intent ID exists in `active_intents.yaml`.

### "Scope violation"

The file you're trying to modify is not in the intent's `owned_scope`. Either:

- Add the file pattern to the intent's scope
- Select a different intent
- Approve the out-of-scope modification when prompted

### "Stale file detected"

Another agent or process modified the file. Re-read the file and try again.
