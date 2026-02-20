# Constitution

## Project: Governed AI-Native IDE Extension

### Vision: Intent-Driven Development with Cryptographic Traceability

**Ratified**: 2026-02-20
**Status**: IMMUTABLE — amendments require explicit human ratification

---

## I. Project Vision

Transform Roo Code from an AI coding assistant into a **governed AI-Native IDE** where every code mutation is traceable to a declared business intent, every file write is cryptographically verifiable, and no agent can operate outside its sanctioned scope.

This is not a chatbot. This is a **deterministic hook system** that enforces the invariant:

```
intent_id → scope_validation → mutation → content_hash → audit_entry
```

Development without declared intent is not development. It is noise.

---

## II. Immutable Engineering Principles

### Principle 1: No Intent, No Write

> **The agent CANNOT write code until it calls `select_active_intent(intent_id)`.**

Every tool execution that mutates the workspace requires a valid `intent_id` resolved from `.orchestration/active_intents.yaml`. If no intent is active, the write is rejected. There are no exceptions. Exploratory work that produces no file mutations is exempt; the moment a mutation is attempted, governance activates.

### Principle 2: Hooks Are the Law, Not a Suggestion

> **Every tool execution MUST pass through PreToolUse/PostToolUse hooks.**

The hook engine is not optional middleware. It is the execution boundary. No tool bypasses it. No "fast path" skips validation. The hook chain is: authenticate intent → validate scope → execute tool → hash result → log trace. A tool that does not pass through hooks does not exist in this system.

### Principle 3: Spatial Independence via Content Hashing

> **All code mutations require SHA-256 content hashes. Line numbers are ephemeral; hashes are permanent.**

Trace entries reference content by its cryptographic hash, not by line number or file offset. When code moves during refactoring, the hash remains valid. When two agents touch the same file, hash comparison — not timestamp comparison — determines conflict. This is the foundation of spatial independence.

### Principle 4: Scope Is a Fence, Not a Guideline

> **Each intent declares `owned_scope` globs. Writes outside that scope are rejected.**

An intent that owns `src/core/hooks/**` cannot write to `src/api/weather/**`. Scope enforcement is not advisory. The PreToolUse hook performs glob matching against the intent's `owned_scope` array before any file I/O reaches the filesystem. Scope violations produce hard failures, not warnings.

### Principle 5: Optimistic Locking for Parallel Agents

> **Parallel agent writes require optimistic locking via file hash comparison.**

Multiple agent sessions may operate concurrently on non-overlapping scopes. When scopes overlap or the same file is touched, the system compares the content hash at read-time against the hash at write-time. If they diverge, the write is rejected and the agent must re-read. This eliminates silent overwrites without requiring pessimistic locks.

### Principle 6: Context Is Curated, Not Dumped

> **Inject only constraints + scope for the active intent. Never flood the agent with the entire codebase.**

When an intent is selected, the `IntentContextLoader` injects precisely: the intent's constraints, acceptance criteria, owned scope globs, and the spatial map entries for affected files. It does not inject unrelated intents, unrelated files, or historical context beyond what the current intent requires. Curated context produces deterministic behavior; dumped context produces hallucination.

### Principle 7: Trust Debt Is Repaid Cryptographically

> **Verification is not "trust me, I ran the tests." Verification is a hash chain in `agent_trace.jsonl`.**

Every mutation produces an entry in the append-only audit ledger containing: timestamp, intent_id, tool_name, file_path, pre-mutation hash, post-mutation hash, and scope validation result. Trust is not a social contract between developer and agent. Trust is a cryptographic proof that the declared intent, the validated scope, and the observed mutation are consistent.

---

## III. Explicit Prohibitions

1. **No implementation begins without `intent_id` declaration.** Code produced without a governing intent is unauthorized and will be rejected by the hook system.

2. **No direct file writes that bypass the hook engine.** Any code path that writes to the filesystem without passing through `PreToolUse` → tool → `PostToolUse` is a security violation.

3. **No scope escalation without intent amendment.** If an intent needs files outside its `owned_scope`, the intent specification in `active_intents.yaml` must be amended first. The agent does not get to decide its own scope.

4. **No blind acceptance of agent output.** Every agent-produced artifact must be verifiable against its trace entry. If the post-mutation hash in the trace does not match the file on disk, the mutation is considered corrupted.

5. **No timestamp-based conflict resolution.** Last-write-wins is prohibited. All conflict resolution uses content hash comparison. Time is unreliable across distributed agent sessions; content hashes are not.

---

## IV. Governance Architecture

```
┌─────────────────────────────────────────────────┐
│                 Agent Session                    │
│                                                  │
│  1. select_active_intent(intent_id)              │
│  2. IntentContextLoader injects scope+constraints│
│  3. Agent plans mutations within scope           │
│                                                  │
│  ┌─────────────────────────────────────────┐     │
│  │          Tool Execution Request         │     │
│  └──────────────┬──────────────────────────┘     │
│                 │                                 │
│  ┌──────────────▼──────────────────────────┐     │
│  │  PreToolUse Hook                        │     │
│  │  - Verify active intent exists          │     │
│  │  - Validate file path against scope     │     │
│  │  - Compute pre-mutation content hash    │     │
│  │  - Acquire optimistic lock (hash)       │     │
│  └──────────────┬──────────────────────────┘     │
│                 │                                 │
│  ┌──────────────▼──────────────────────────┐     │
│  │  Tool Executes (write_to_file, etc.)    │     │
│  └──────────────┬──────────────────────────┘     │
│                 │                                 │
│  ┌──────────────▼──────────────────────────┐     │
│  │  PostToolUse Hook                       │     │
│  │  - Compute post-mutation content hash   │     │
│  │  - Compare pre-hash to lock hash        │     │
│  │  - Append entry to agent_trace.jsonl    │     │
│  │  - Update intent_map.md spatial index   │     │
│  └─────────────────────────────────────────┘     │
│                                                  │
└─────────────────────────────────────────────────┘
```

---

## V. Ratification

This constitution governs all development on the Governed AI-Native IDE Extension. It is not a suggestion. It is not a guideline. It is the law of this codebase.

Amendments require:

1. A declared intent with `id` and `owned_scope` covering `.specify/memory/constitution.md`
2. Human review and explicit approval
3. A trace entry recording the amendment with pre/post hashes

**No code is written until intent is declared. No intent is valid until scope is defined. No mutation is trusted until it is hashed.**
