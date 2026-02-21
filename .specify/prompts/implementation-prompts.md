# `/speckit.implement` — Implementation Prompts Catalog

**Generated**: 2026-02-20
**Governing Spec**: SPEC-001, SPEC-002, SPEC-003
**Constitution**: `.specify/memory/constitution.md`
**Status**: All 26 tasks complete (161 tests, 0 lint errors)

> Each prompt below is a standalone, copy-pasteable instruction block for an AI agent.
> Prompts are ordered by dependency resolution — execute in sequence.

---

## Phase 0: Archaeological Dig (Research)

---

### PROMPT: TSK-001

```
TASK: TSK-001
INTENT: INT-001
HOOK_PHASE: DataModel
SPECKIT_COMMAND: /speckit.constitution

OBJECTIVE:
Fork Roo Code, run it in the VS Code Extension Host, and document the extension.ts entry point.

SPECKIT CONTEXT:
- Constitution Principle 2: "Hooks Are the Law" — before building hooks, we must understand where they intercept.
- This is the research foundation for every subsequent task.

INPUT REQUIREMENTS:
- Roo Code repository cloned to your workspace
- VS Code or Cursor IDE with Extension Host support
- Node.js 20+ installed

STEP-BY-STEP INSTRUCTIONS:
1. Locate the `extension.ts` file in the `src/` directory. This is the VS Code extension entry point.
2. Read the `activate()` function. Document what it initializes (providers, commands, webview panels).
3. Trace how the extension registers tool handlers — look for `presentAssistantMessage.ts` and how it dispatches tool calls.
4. Document the call hierarchy: extension.ts → Task → presentAssistantMessage → BaseTool.handle() → execute().
5. Run the extension in the Extension Host (F5 in VS Code) to confirm it activates without errors.
6. Record your findings in a markdown file or in .specify/ notes.

VERIFICATION STEPS:
- [ ] Extension activates successfully in Extension Host
- [ ] Entry point path is documented
- [ ] Tool execution flow from agent message to file write is mapped

TRACEABILITY OUTPUT:
- No trace entry needed (research task — no mutations)
- Document findings in .specify/ for future reference

ERROR HANDLING:
- If extension fails to activate: check Node.js version compatibility, run `pnpm install` in the workspace root
- If you cannot find extension.ts: run `find src -name "extension.ts"` to locate it
```

---

### PROMPT: TSK-002

```
TASK: TSK-002
INTENT: INT-001
HOOK_PHASE: PreToolUse
SPECKIT_COMMAND: /speckit.specify

OBJECTIVE:
Trace the execute_command and write_to_file tool implementations to map the complete tool execution loop.

SPECKIT CONTEXT:
- Constitution Principle 2: "Hooks Are the Law" — every tool must pass through the hook chain
- SPEC-001 §3.1 defines BaseTool.handle() as the single integration point

INPUT REQUIREMENTS:
- TSK-001 completed (entry point documented)
- Files to read: `src/core/tools/BaseTool.ts`, `src/core/assistant-message/presentAssistantMessage.ts`

STEP-BY-STEP INSTRUCTIONS:
1. Open `src/core/tools/BaseTool.ts`. Read the `handle()` method end-to-end.
2. Document the method signature: what parameters it receives (Task, ToolUse, ToolCallbacks).
3. Trace how `handle()` calls `this.execute()` — this is where the hook integration wraps around.
4. Open `src/core/assistant-message/presentAssistantMessage.ts`. Find the switch statement that routes tool names to tool instances.
5. List every tool name that appears in the routing logic.
6. Classify each tool as "write" (mutates filesystem) or "read" (observation only). This classification becomes the `WRITE_TOOLS` and `EXEMPT_TOOLS` sets.
7. Confirm that `select_active_intent` is listed in the routing logic. If not, note where it should be added.
8. Document the full call chain: presentAssistantMessage → tool.handle(task, block, callbacks) → tool.execute(params, task, callbacks).

VERIFICATION STEPS:
- [ ] BaseTool.handle() flow documented from entry to exit
- [ ] All tool names listed and classified as WRITE or EXEMPT
- [ ] execute_command and write_to_file traced to their actual filesystem operations
- [ ] Integration point identified (the line where execute() is called inside handle())

TRACEABILITY OUTPUT:
- No trace entry (research task)
- Output a tool classification table for use in TSK-020

ERROR HANDLING:
- If BaseTool.ts has changed since spec was written: re-read and update your notes. The handle() method is the stable integration point.
- If tools have been added since spec: classify them using the same criteria (does it write to the filesystem?)
```

---

### PROMPT: TSK-003

```
TASK: TSK-003
INTENT: INT-001
HOOK_PHASE: PreToolUse
SPECKIT_COMMAND: /speckit.specify

OBJECTIVE:
Locate the system prompt builder and document where intent enforcement instructions should be injected.

SPECKIT CONTEXT:
- Constitution Principle 1: "No Intent, No Write" — the agent must be instructed in its system prompt
- SPEC-001 §2.4 specifies context injection via XML format

INPUT REQUIREMENTS:
- TSK-001 completed
- Files to read: `src/core/prompts/system.ts`, `src/core/prompts/sections/`, `src/core/prompts/tools/native-tools/select_active_intent.ts`

STEP-BY-STEP INSTRUCTIONS:
1. Open `src/core/prompts/system.ts`. Read the `generatePrompt()` function.
2. Identify the sections that compose the system prompt: role definition, markdown formatting, shared tool use, tool use guidelines, capabilities, modes, skills, rules, system info, objective, custom instructions.
3. Note where the `getRulesSection()` is called — this is where workspace-specific rules go.
4. Identify the best injection point for a governance preamble: between rules and system info, or as a new dedicated section.
5. Read `src/core/prompts/tools/native-tools/select_active_intent.ts` to confirm the tool schema exists and its description says "REQUIRED before any file modifications."
6. Document: (a) the file path of the prompt builder, (b) the function that assembles sections, (c) the recommended injection point, (d) the existing tool schema for select_active_intent.

VERIFICATION STEPS:
- [ ] System prompt builder file identified and documented
- [ ] All prompt sections enumerated
- [ ] Injection point for governance preamble identified
- [ ] select_active_intent tool schema confirmed present

TRACEABILITY OUTPUT:
- No trace entry (research task)

ERROR HANDLING:
- If system.ts structure has changed: the key function is whatever generates the full prompt string. Look for the function that concatenates multiple sections.
```

---

### PROMPT: TSK-004

```
TASK: TSK-004
INTENT: INT-001
HOOK_PHASE: DataModel
SPECKIT_COMMAND: /speckit.specify

OBJECTIVE:
Document the existing MCP tool registry and confirm extension points for the select_active_intent tool.

SPECKIT CONTEXT:
- Constitution §IV: Governance Architecture — select_active_intent is the entry gate to governance
- SPEC-001 §3.2: Backward compatibility — select_active_intent is exempt from hook validation

INPUT REQUIREMENTS:
- TSK-001 completed
- Files to read: `src/core/prompts/tools/native-tools/select_active_intent.ts`, `src/core/tools/SelectActiveIntentTool.ts`, `src/core/assistant-message/presentAssistantMessage.ts`

STEP-BY-STEP INSTRUCTIONS:
1. Read `src/core/prompts/tools/native-tools/select_active_intent.ts`. Confirm it exports a function that returns an OpenAI-compatible function call schema with parameters: `intent_id` (required, string) and `reasoning` (optional, string).
2. Read `src/core/tools/SelectActiveIntentTool.ts`. Confirm it extends BaseTool, imports HookEngine, and its `execute()` method calls `hookEngine.setActiveIntent()`.
3. Read `src/core/assistant-message/presentAssistantMessage.ts`. Search for the case that handles "select_active_intent" in the tool routing switch. Confirm the tool is wired into the dispatch logic.
4. Document: (a) tool schema location and shape, (b) tool implementation class, (c) dispatch wiring, (d) whether it's marked as EXEMPT in the tool classification.

VERIFICATION STEPS:
- [ ] Tool schema exports confirmed
- [ ] SelectActiveIntentTool class confirmed to extend BaseTool
- [ ] Tool is dispatched in presentAssistantMessage.ts
- [ ] Tool is in the EXEMPT_TOOLS set (not subject to hook validation)

TRACEABILITY OUTPUT:
- No trace entry (research task)

ERROR HANDLING:
- If SelectActiveIntentTool does not exist: it needs to be created as part of TSK-010
- If it's not wired in presentAssistantMessage: it needs to be added to the routing switch
```

---

## Phase 1: The Handshake (Intent Selection + Reasoning Loop)

---

### PROMPT: TSK-010

```
TASK: TSK-010
INTENT: INT-001
HOOK_PHASE: DataModel
SPECKIT_COMMAND: /speckit.specify
DEPENDS_ON: TSK-004

OBJECTIVE:
Define the OpenAI function call schema for select_active_intent(intent_id, reasoning?) tool.

SPECKIT CONTEXT:
- Constitution Principle 1: "No Intent, No Write" — this tool IS the handshake
- SPEC-001 §2.1: select_active_intent is exempt from PreToolUse validation
- SPEC-002 §1.1: intent_id must match pattern /^[A-Z]+-\d{3,}$/

INPUT REQUIREMENTS:
- TSK-004 completed (tool registry documented)
- File: `src/core/prompts/tools/native-tools/select_active_intent.ts`

STEP-BY-STEP INSTRUCTIONS:
1. Open `src/core/prompts/tools/native-tools/select_active_intent.ts`.
2. Confirm it exports a function that returns an object matching the OpenAI function call schema format.
3. Verify the schema includes:
   - `name`: "select_active_intent"
   - `description`: States it is REQUIRED before file modifications. Must reference `.orchestration/active_intents.yaml`.
   - `parameters.intent_id`: type string, required, described as the intent ID from active_intents.yaml
   - `parameters.reasoning`: type string, optional, described as the agent's justification for selecting this intent
4. If the file does not exist, create it with the schema above following the pattern of other files in `src/core/prompts/tools/native-tools/`.
5. Confirm the tool name matches what `presentAssistantMessage.ts` expects in its routing switch.

VERIFICATION STEPS:
- [ ] Schema file exists at the expected path
- [ ] Schema has `intent_id` (required) and `reasoning` (optional) parameters
- [ ] Description explicitly states "REQUIRED before any file modifications"
- [ ] Schema name matches the routing case in presentAssistantMessage

TRACEABILITY OUTPUT:
- Log to agent_trace.jsonl: tool_name="write_to_file", file="src/core/prompts/tools/native-tools/select_active_intent.ts", mutation_class="FILE_CREATION" or "INTENT_EVOLUTION"
- Update intent_map.md: add file reference under INT-001

ERROR HANDLING:
- If another tool file has a different export pattern: follow that pattern exactly for consistency
- If presentAssistantMessage doesn't have a case for this tool: file a note for wiring (TSK-004 should have caught this)
```

---

### PROMPT: TSK-011

```
TASK: TSK-011
INTENT: INT-001
HOOK_PHASE: PreToolUse
SPECKIT_COMMAND: /speckit.implement
DEPENDS_ON: TSK-010

OBJECTIVE:
Implement IntentContextLoader: parse active_intents.yaml, validate intent existence, cache results.

SPECKIT CONTEXT:
- Constitution Principle 6: "Context Is Curated, Not Dumped" — load only the selected intent's spec
- SPEC-001 §2.4: IntentContextLoader interface specification
- SPEC-002 §1.1: Canonical YAML schema (id, name, status, owned_scope, constraints, acceptance_criteria)
- SPEC-002 §1.2: JSON Schema for validation

INPUT REQUIREMENTS:
- `.orchestration/active_intents.yaml` must exist with at least one valid intent
- `src/core/hooks/types.ts` must define IntentSpec, IntentContext, SpatialEntry interfaces
- npm package `yaml` available (or `js-yaml`)

STEP-BY-STEP INSTRUCTIONS:
1. Create `src/core/hooks/IntentContextLoader.ts`.
2. Import `fs/promises`, `path`, `yaml` (for YAML parsing), and types from `./types.ts`.
3. Implement constructor that takes `workspacePath: string` and stores it.
4. Implement `loadIntents(): Promise<IntentSpec[]>` — private method that:
   a. Reads `.orchestration/active_intents.yaml` from the workspace
   b. Parses the YAML content into an object with `intents` or `active_intents` array
   c. Validates each intent against the schema (use IntentValidator if available, or inline checks)
   d. Filters out invalid intents, logging warnings for each
   e. Caches the result with a 5-second TTL to avoid re-reading on every tool call
5. Implement `getIntent(intentId: string): Promise<IntentSpec | null>` — returns the intent matching the ID, or null.
6. Implement `getAllIntents(): Promise<IntentSpec[]>` — returns all valid intents.
7. Implement `buildIntentContext(intentId: string): Promise<IntentContext | null>`:
   a. Call `getIntent(intentId)`. If null, return null.
   b. Build context with: intent spec, related spatial map entries, recent trace entries, constraints, acceptance criteria.
   c. If intent has `related_specs`, resolve them by reading the referenced file contents (truncate each to ~2KB).
   d. Apply context budget: total payload must not exceed ~16KB. Truncate in order: trace entries first, spec excerpts second, related files third.
8. Implement `formatContextForPrompt(context: IntentContext): string`:
   a. Format as XML: `<intent_context id="..." name="..." status="..." version="...">` wrapper
   b. Include `<scope>` with `<pattern>` elements for each owned_scope glob
   c. Include `<constraints>` with `<constraint>` elements
   d. Include `<acceptance_criteria>` with `<criterion>` elements
   e. Include `<related_files>` if present
   f. Include `<related_specs>` with truncated spec excerpts if present
   g. Close `</intent_context>`
9. Implement `reload(): Promise<void>` — clears the cache and forces re-read.
10. Write unit tests in `src/core/hooks/__tests__/IntentContextLoader.test.ts`:
    - Test getIntent returns correct intent by ID
    - Test getIntent returns null for non-existent ID
    - Test getIntent returns null for malformed YAML
    - Test getAllIntents returns full list
    - Test buildIntentContext produces correct structure
    - Test formatContextForPrompt produces valid XML
    - Test reload clears cache
    - Test cache TTL works (second call within 5s uses cache)

VERIFICATION STEPS:
- [ ] IntentContextLoader.ts created with all methods
- [ ] YAML parsing handles both `intents:` and `active_intents:` keys
- [ ] Cache TTL is 5 seconds
- [ ] Context budget truncation implemented (16KB max)
- [ ] formatContextForPrompt produces well-formed XML
- [ ] All unit tests pass (minimum 6 tests)

TRACEABILITY OUTPUT:
- agent_trace.jsonl: mutation_class="FILE_CREATION", file="src/core/hooks/IntentContextLoader.ts"
- agent_trace.jsonl: mutation_class="FILE_CREATION", file="src/core/hooks/__tests__/IntentContextLoader.test.ts"
- Update intent_map.md under INT-001

ERROR HANDLING:
- If `yaml` package is not installed: use the `yaml` package (not `js-yaml`), install via `pnpm --filter roo-cline add yaml`
- If pnpm install fails with ERR_PNPM_UNEXPECTED_STORE: check if the package is already available in node_modules
- If YAML parsing throws: catch the error, log a warning, return empty array / null (fail-open per SPEC-001 §3.3)
- If file doesn't exist: return null / empty array (not an error — workspace may not have .orchestration/)
```

---

### PROMPT: TSK-012

```
TASK: TSK-012
INTENT: INT-001
HOOK_PHASE: PreToolUse
SPECKIT_COMMAND: /speckit.implement
DEPENDS_ON: TSK-011

OBJECTIVE:
Build the <intent_context> XML generator that injects curated context into the agent's prompt.

SPECKIT CONTEXT:
- Constitution Principle 6: "Context Is Curated, Not Dumped" — inject ONLY constraints + scope for the active intent
- SPEC-001 §2.4: Context curation rules (max 16KB, truncate trace first)
- SPEC-002 §4.1: Context injection format specification

INPUT REQUIREMENTS:
- TSK-011 completed (IntentContextLoader exists)
- `src/core/hooks/types.ts` has IntentContext interface
- `src/core/hooks/IntentContextLoader.ts` has formatContextForPrompt stub or method

STEP-BY-STEP INSTRUCTIONS:
1. Open `src/core/hooks/IntentContextLoader.ts`.
2. Locate or create the `formatContextForPrompt(context: IntentContext): string` method.
3. Build the XML string:
   a. Opening tag: `<intent_context id="${intent.id}" name="${intent.name}" status="${intent.status}">`
   b. Add version attribute if present: `version="${intent.version}"`
   c. `<scope>` block: one `<pattern>` per owned_scope glob
   d. `<constraints>` block: one `<constraint>` per constraint string
   e. `<acceptance_criteria>` block: one `<criterion>` per criterion
   f. `<related_files>` block (if any): one `<file path="..." hash="..."/>` per spatial entry
   g. `<related_specs>` block (if any): one `<spec_excerpt>` per resolved spec excerpt (first 5 lines only)
   h. Closing tag: `</intent_context>`
4. Implement the truncation logic in `buildIntentContext()`:
   a. Define MAX_CONTEXT_BYTES = 16384 (16KB)
   b. After building the full context, measure byte size
   c. If over budget: remove recentTraceEntries entries one at a time (newest first)
   d. If still over: remove specExcerpts one at a time
   e. If still over: remove relatedFiles one at a time
   f. Never remove the intent spec itself, constraints, or acceptance criteria
5. Write unit tests:
   - Test XML output contains all sections
   - Test truncation removes trace entries first
   - Test empty related files produces no <related_files> block

VERIFICATION STEPS:
- [ ] formatContextForPrompt produces valid XML with all sections
- [ ] Truncation respects tier order: traces → specs → files
- [ ] Never removes core intent fields (id, name, scope, constraints, criteria)
- [ ] Budget is 16KB max
- [ ] Tests pass

TRACEABILITY OUTPUT:
- agent_trace.jsonl: mutation_class="INTENT_EVOLUTION", file="src/core/hooks/IntentContextLoader.ts"
- Update intent_map.md under INT-001

ERROR HANDLING:
- If XML contains special characters (< > & in constraint text): escape them. Use basic XML escaping.
- If context is empty (no intent loaded): return an empty string, not malformed XML.
```

---

### PROMPT: TSK-013

```
TASK: TSK-013
INTENT: INT-001
HOOK_PHASE: PreToolUse
SPECKIT_COMMAND: /speckit.implement
DEPENDS_ON: TSK-012

OBJECTIVE:
Modify the system prompt to enforce "MUST call select_active_intent before code generation" when governance is active.

SPECKIT CONTEXT:
- Constitution Principle 1: "No Intent, No Write" — the agent's instructions must reflect this
- SPEC-003 §5: System prompt injection point
- The governance section is conditional: only injected when .orchestration/active_intents.yaml exists

INPUT REQUIREMENTS:
- TSK-012 completed (XML context generator works)
- Files: `src/core/prompts/system.ts`, `src/core/prompts/sections/index.ts`

STEP-BY-STEP INSTRUCTIONS:
1. Create `src/core/prompts/sections/governance.ts`.
2. Export an async function `getGovernanceSection(cwd: string): Promise<string>`.
3. Inside the function:
   a. Check if `.orchestration/active_intents.yaml` exists at `path.join(cwd, ".orchestration", "active_intents.yaml")` using `fs.access()`.
   b. If it does NOT exist, return an empty string (no governance when not configured).
   c. If it exists, return a multi-line string containing:
      - "INTENT-DRIVEN GOVERNANCE" header
      - "This workspace uses intent-driven development"
      - "MANDATORY: Before modifying ANY file, you MUST call the select_active_intent tool"
      - Explanation that writes will be REJECTED without an active intent
      - The workflow: read intents → call select_active_intent → proceed → only owned_scope files allowed
      - What to do on scope violations
4. Open `src/core/prompts/sections/index.ts`. Add export for `getGovernanceSection`.
5. Open `src/core/prompts/system.ts`. Import `getGovernanceSection`.
6. In the `generatePrompt()` function:
   a. Add `getGovernanceSection(cwd)` to the existing `Promise.all` alongside modesSection and skillsSection
   b. Destructure the result as `governanceSection`
   c. Insert it into the basePrompt template between the rules section and system info section
   d. Only include it if non-empty: `${governanceSection ? '\n' + governanceSection : ''}`
7. Write unit tests in `src/core/hooks/__tests__/governance.test.ts`:
   - Test returns governance text when .orchestration exists
   - Test returns empty string when .orchestration does not exist
   - Test output mentions select_active_intent
   - Test output mentions scope violations

VERIFICATION STEPS:
- [ ] governance.ts exists with getGovernanceSection exported
- [ ] Exported from sections/index.ts
- [ ] Imported and used in system.ts generatePrompt()
- [ ] Section is CONDITIONAL — empty string when .orchestration/ absent
- [ ] Section mentions "select_active_intent", "MANDATORY", "REJECTED"
- [ ] 4 unit tests pass

TRACEABILITY OUTPUT:
- agent_trace.jsonl entries for governance.ts (FILE_CREATION), system.ts (INTENT_EVOLUTION), index.ts (INTENT_EVOLUTION)
- Update intent_map.md under INT-001

ERROR HANDLING:
- If fs.access throws: return empty string (fail-open — don't break system prompt generation)
- If the prompt builder structure has changed: the key is finding the function that concatenates all sections and adding one more async call
```

---

### PROMPT: TSK-014

```
TASK: TSK-014
INTENT: INT-001
HOOK_PHASE: PreToolUse
SPECKIT_COMMAND: /speckit.implement
DEPENDS_ON: TSK-011

OBJECTIVE:
Implement the Pre-Hook gatekeeper in BaseTool.handle() that blocks write tools when no intent is active.

SPECKIT CONTEXT:
- Constitution Principle 1: "No Intent, No Write" — this IS the enforcement mechanism
- Constitution Principle 2: "Hooks Are the Law" — every tool passes through hooks
- SPEC-001 §3.1: BaseTool.handle() integration specification
- SPEC-001 §3.3: Error handling contract (fail-open principle)

INPUT REQUIREMENTS:
- TSK-011 completed (IntentContextLoader works)
- `src/core/hooks/HookEngine.ts` must exist with preToolUse/postToolUse methods
- `src/core/hooks/types.ts` must have WRITE_TOOLS and EXEMPT_TOOLS sets
- `src/core/tools/BaseTool.ts` has the handle() method

STEP-BY-STEP INSTRUCTIONS:
1. Open `src/core/tools/BaseTool.ts`. Locate the `handle()` method.
2. Find the line where `this.execute(params, task, callbacks)` is called.
3. BEFORE that line, add the hook integration:
   a. Import `HookEngine` from `../hooks/HookEngine`
   b. Import `extractFilePathFromParams` and `formatResponse` utilities
   c. Get hook engine instance: `HookEngine.getInstance(task.cwd, task.taskId)`
   d. Check `await hookEngine.isEnabled()` — if false, skip all hook logic (backward compatible)
   e. If enabled, call `hookEngine.preToolUse()` with context: toolName, filePath, intentId, params, sessionId
   f. If `preResult.allowed === false`: call `callbacks.pushToolResult(formatResponse.toolError(preResult.reason))` and return early
   g. If allowed: proceed to execute
4. AFTER `this.execute()`, add PostToolUse:
   a. Call `hookEngine.postToolUse()` with context including preHash from preResult
5. Wrap the entire hook integration in a try-catch:
   a. If preToolUse throws: log error, continue to execute (fail-open per SPEC-001 §3.3)
   b. If postToolUse throws: log error, do NOT roll back (trace gap is acceptable)
6. Ensure backward compatibility: when `hookEngine.isEnabled()` returns false, the code path is identical to the original (no behavior change).
7. Write/update HookEngine unit tests:
   - Test preToolUse rejects write tools without active intent
   - Test preToolUse allows exempt tools without intent
   - Test preToolUse rejects out-of-scope file paths
   - Test preToolUse allows in-scope file paths
   - Test postToolUse logs trace entry
   - Test fail-open: preToolUse exception doesn't block tool

VERIFICATION STEPS:
- [ ] BaseTool.handle() wraps execute() with pre/post hooks
- [ ] Hook is conditional on hookEngine.isEnabled()
- [ ] Write tools without active intent return toolError
- [ ] Exempt tools pass through without intent check
- [ ] Fail-open: exceptions in hooks don't block execution
- [ ] All existing tool tests still pass (no regression)
- [ ] New HookEngine tests pass (minimum 6 tests)

TRACEABILITY OUTPUT:
- agent_trace.jsonl: mutation_class="AST_REFACTOR", file="src/core/tools/BaseTool.ts"
- Update intent_map.md under INT-001

ERROR HANDLING:
- If BaseTool.ts has been modified since spec: re-read handle() and identify the current execute() call site
- If formatResponse utility doesn't exist: look for the existing pattern used by other tools to return errors to the agent
- If existing tests break: the hook integration must be wrapped so that when isEnabled() returns false, no hook code runs at all
```

---

## Phase 2: Hook Middleware & Security

---

### PROMPT: TSK-020

```
TASK: TSK-020
INTENT: INT-001
HOOK_PHASE: PreToolUse
SPECKIT_COMMAND: /speckit.implement
DEPENDS_ON: TSK-014

OBJECTIVE:
Classify all existing tools as WRITE (requires intent) or EXEMPT (read-only / meta), and codify in types.ts.

SPECKIT CONTEXT:
- Constitution Principle 2: "Hooks Are the Law" — every tool must be classified
- SPEC-001 §2.1: Write tools vs read-only tools listing

INPUT REQUIREMENTS:
- TSK-002 completed (tool names cataloged)
- `src/core/hooks/types.ts` exists

STEP-BY-STEP INSTRUCTIONS:
1. Open `src/core/hooks/types.ts`.
2. Create a `WRITE_TOOLS` constant as `ReadonlySet<string>` containing every tool that mutates files:
   - write_to_file, apply_diff, edit, search_and_replace, search_replace, edit_file, apply_patch, insert_code_block
3. Create an `EXEMPT_TOOLS` constant as `ReadonlySet<string>` containing every read-only or meta tool:
   - read_file, read_command_output, list_files, search_files, codebase_search, ask_followup_question, attempt_completion, switch_mode, new_task, update_todo_list, run_slash_command, select_active_intent, use_mcp_tool, access_mcp_resource, browser_action, skill, generate_image, custom_tool
4. Note: tools not in either set (like `execute_command`) pass through hook checks but aren't gated by scope validation. They may be subject to HITL (TSK-021).
5. Export both constants.

VERIFICATION STEPS:
- [ ] WRITE_TOOLS contains 8+ file-mutating tools
- [ ] EXEMPT_TOOLS contains 15+ read-only/meta tools
- [ ] Both are ReadonlySet<string> (immutable)
- [ ] select_active_intent is in EXEMPT_TOOLS
- [ ] No tool appears in both sets

TRACEABILITY OUTPUT:
- agent_trace.jsonl: mutation_class="INTENT_EVOLUTION", file="src/core/hooks/types.ts"

ERROR HANDLING:
- If new tools have been added to the codebase: classify them by asking "does this tool write to the filesystem?"
- If unsure about a tool: put it in EXEMPT_TOOLS (fail-open principle)
```

---

### PROMPT: TSK-021

```
TASK: TSK-021
INTENT: INT-001
HOOK_PHASE: PreToolUse
SPECKIT_COMMAND: /speckit.implement
DEPENDS_ON: TSK-020

OBJECTIVE:
Implement Human-in-the-Loop (HITL) authorization that shows a VS Code warning dialog before executing destructive commands.

SPECKIT CONTEXT:
- Constitution §III Prohibition 2: "No direct file writes that bypass the hook engine"
- SPEC-003 §4: HITL gate for destructive operations
- Destructive tools = execute_command (arbitrary shell), delete_file (permanent removal)

INPUT REQUIREMENTS:
- TSK-020 completed (tool classification exists)
- `vscode` API available (extension runs inside VS Code)
- `src/core/hooks/HookEngine.ts` exists with preToolUse method

STEP-BY-STEP INSTRUCTIONS:
1. Create `src/core/hooks/HITLGate.ts`.
2. Import `vscode` for the warning dialog API.
3. Define a `DESTRUCTIVE_TOOLS` set containing: "execute_command", "delete_file".
4. Export class `HITLGate` with static methods:
   a. `setEnabled(enabled: boolean)`: global on/off switch (off for testing)
   b. `isEnabled(): boolean`: returns current state
   c. `isDestructive(toolName: string): boolean`: checks if tool is in DESTRUCTIVE_TOOLS
   d. `requestApproval(params: { toolName, intentId, filePath?, description? }): Promise<HITLDecision>`:
      - If disabled: return { approved: true } immediately
      - Build a message string: "[Governance] Intent {intentId}: {toolName} on {filePath}"
      - Call `vscode.window.showWarningMessage(message, { modal: true }, "Allow", "Reject")`
      - If user clicks "Allow": return { approved: true }
      - If user clicks "Reject" or dismisses: return { approved: false, reason: "Human rejected..." }
5. Define `HITLDecision` interface: `{ approved: boolean, reason?: string }`
6. Integrate into HookEngine.preToolUse():
   a. After scope validation passes, before computing preHash
   b. Check `HITLGate.isDestructive(toolName)`
   c. If destructive: call `HITLGate.requestApproval()`, return rejection if not approved
7. Write unit tests in `src/core/hooks/__tests__/HITLGate.test.ts`:
   - Test isDestructive returns true for execute_command
   - Test isDestructive returns true for delete_file
   - Test isDestructive returns false for write_to_file
   - Test requestApproval auto-approves when disabled
   - Test requestApproval shows dialog when enabled (mock vscode.window)
   - Test rejection when user clicks Reject
   - Test rejection when user dismisses dialog

VERIFICATION STEPS:
- [ ] HITLGate.ts created with all methods
- [ ] DESTRUCTIVE_TOOLS contains execute_command and delete_file
- [ ] setEnabled(false) bypasses dialog (for testing)
- [ ] Integrated into HookEngine.preToolUse() AFTER scope validation
- [ ] Dialog is modal (blocks agent until human responds)
- [ ] 5+ unit tests pass

TRACEABILITY OUTPUT:
- agent_trace.jsonl: FILE_CREATION for HITLGate.ts
- agent_trace.jsonl: INTENT_EVOLUTION for HookEngine.ts
- Update intent_map.md

ERROR HANDLING:
- If vscode API is not available (running in tests): setEnabled(false) should be called in test setup
- If showWarningMessage throws: catch error, log warning, auto-approve (fail-open)
- If agent bypasses by using a non-destructive tool: that's by design — scope validation still applies
```

---

### PROMPT: TSK-022

```
TASK: TSK-022
INTENT: INT-001
HOOK_PHASE: PreToolUse
SPECKIT_COMMAND: /speckit.implement
DEPENDS_ON: TSK-014

OBJECTIVE:
Build ScopeMatcher with glob pattern matching for owned_scope enforcement.

SPECKIT CONTEXT:
- Constitution Principle 4: "Scope Is a Fence, Not a Guideline"
- SPEC-001 §2.2: Scope matching rules — ** for any depth, must match at least one pattern

INPUT REQUIREMENTS:
- TSK-014 completed (PreToolUse hook exists)
- `src/core/hooks/utils.ts` exists (or create it)

STEP-BY-STEP INSTRUCTIONS:
1. Open or create `src/core/hooks/utils.ts`.
2. Implement `globToRegExp(pattern: string): RegExp`:
   a. Replace `**` with a placeholder (e.g., `<<<GLOBSTAR>>>`)
   b. Escape regex special characters in the remaining string
   c. Replace `*` (single) with `[^/]*` (matches within one directory)
   d. Replace `<<<GLOBSTAR>>>` with `.*` (matches any depth)
   e. Replace `?` with `[^/]` (single character, not separator)
   f. Handle dotfiles: patterns should match files starting with `.`
   g. Return new RegExp with `^` anchor and `$` anchor
3. Implement `isInScope(relativePath: string, scopePatterns: string[]): boolean`:
   a. Normalize the path: replace backslashes with forward slashes
   b. For each pattern in scopePatterns: convert to regex via globToRegExp, test against normalized path
   c. Return true if ANY pattern matches (OR logic)
4. Do NOT use external dependencies like `minimatch` or `micromatch`. The custom implementation avoids pnpm store conflicts.
5. Write unit tests in `src/core/hooks/__tests__/utils.test.ts`:
   - Test exact file path match
   - Test ** glob matches deeply nested paths
   - Test * matches single directory level only
   - Test rejection of paths not matching any pattern
   - Test any-match semantics (match if any pattern matches)
   - Test backslash normalization on Windows paths
   - Test dotfile matching (e.g., `.orchestration/foo`)

VERIFICATION STEPS:
- [ ] globToRegExp handles **, *, and ? wildcards
- [ ] isInScope returns true when ANY pattern matches
- [ ] No external dependencies added
- [ ] Backslashes normalized to forward slashes
- [ ] Dotfiles are matched correctly
- [ ] 8+ unit tests pass

TRACEABILITY OUTPUT:
- agent_trace.jsonl: FILE_CREATION or INTENT_EVOLUTION for utils.ts
- Update intent_map.md

ERROR HANDLING:
- If a pattern is malformed (empty string, just "//"): treat as no-match, don't throw
- If relativePath is absolute: strip the workspace prefix first (utility function `toRelativePath`)
```

---

### PROMPT: TSK-023

```
TASK: TSK-023
INTENT: INT-001
HOOK_PHASE: PreToolUse
SPECKIT_COMMAND: /speckit.implement
DEPENDS_ON: TSK-014

OBJECTIVE:
Implement the standardized error protocol so rejected tool calls provide actionable, LLM-parseable error messages.

SPECKIT CONTEXT:
- Constitution Principle 2: "Hooks Are the Law" — rejections must be actionable, not opaque
- SPEC-001 §3.3: Error handling contract — structured HookResult for self-correction

INPUT REQUIREMENTS:
- TSK-014 completed (PreToolUse returns HookResult)
- `src/core/hooks/types.ts` has HookResult interface

STEP-BY-STEP INSTRUCTIONS:
1. Open `src/core/hooks/types.ts`. Confirm `HookResult` has: `allowed: boolean`, `reason?: string`, `preHash?: string | null`, `metadata?: Record<string, unknown>`.
2. Review all rejection paths in HookEngine.preToolUse():
   a. No active intent: reason should say "No active intent. Call select_active_intent(intent_id) with an intent from .orchestration/active_intents.yaml before modifying files."
   b. Intent not found: reason should say "Intent '{id}' not found in active_intents.yaml. Verify the intent ID."
   c. Intent wrong status: reason should include the current status and what action to take (e.g., "Intent is PENDING. Call select_active_intent() to activate it.")
   d. Scope violation: reason should include the file path, the intent's owned_scope list, and suggest "Amend the intent's owned_scope in active_intents.yaml to include this path."
3. Confirm BaseTool.handle() passes the reason to `formatResponse.toolError()` so the LLM receives it.
4. Each error message must:
   a. State WHAT failed
   b. State WHY it failed
   c. State HOW to fix it (actionable instruction)
5. Write tests confirming each rejection path produces a message containing all three elements.

VERIFICATION STEPS:
- [ ] HookResult interface has all required fields
- [ ] Every rejection path has a reason with WHAT, WHY, HOW
- [ ] BaseTool.handle() passes reason to toolError()
- [ ] Tests verify each rejection message pattern

TRACEABILITY OUTPUT:
- agent_trace.jsonl: INTENT_EVOLUTION for types.ts and HookEngine.ts if modified
- Update intent_map.md

ERROR HANDLING:
- If a rejection reason is undefined: default to "Hook rejected this operation. No additional details available."
- The LLM should be able to self-correct from any rejection message without human intervention
```

---

### PROMPT: TSK-024

```
TASK: TSK-024
INTENT: INT-001
HOOK_PHASE: PreToolUse
SPECKIT_COMMAND: /speckit.implement
DEPENDS_ON: TSK-022

OBJECTIVE:
Create an .intentignore parser that excludes specified files from intent scope enforcement.

SPECKIT CONTEXT:
- This is an ergonomic escape hatch: lockfiles, build artifacts, and editor config shouldn't require intent scope
- Follows gitignore syntax conventions for developer familiarity
- File lives at `.orchestration/.intentignore`

INPUT REQUIREMENTS:
- TSK-022 completed (scope matching works)
- `.orchestration/` directory exists

STEP-BY-STEP INSTRUCTIONS:
1. Create `src/core/hooks/IntentIgnore.ts`.
2. Export class `IntentIgnore` with constructor taking `workspacePath: string`.
3. Implement `load(): Promise<void>`:
   a. Read `.orchestration/.intentignore` from workspace
   b. Split into lines
   c. Filter out blank lines and comment lines (starting with #)
   d. Convert each pattern to a RegExp using a `patternToRegExp()` private method
   e. If file doesn't exist, set patterns to empty array (no exclusions)
4. Implement `patternToRegExp(pattern: string): RegExp`:
   a. Support `**` (any depth), `*` (single level), `?` (single char)
   b. Handle trailing `/` (directory patterns — append `**`)
   c. Handle negation `!` prefix (skip for now — v2 feature)
   d. Escape regex special characters
   e. Anchor with `^` and `$`
5. Implement `isIgnored(relativePath: string): boolean`:
   a. Normalize backslashes to forward slashes
   b. Test against all loaded patterns
   c. Return true if any pattern matches
6. Integrate into HookEngine:
   a. Add `intentIgnore: IntentIgnore` as a private member
   b. Call `intentIgnore.load()` during the first `isEnabled()` check
   c. In preToolUse, BEFORE scope validation: check `intentIgnore.isIgnored(relativePath)`
   d. If ignored: return `{ allowed: true, metadata: { intentIgnored: true } }` — skip all further validation
7. Write unit tests in `src/core/hooks/__tests__/IntentIgnore.test.ts`:
   - Test loading from .intentignore file
   - Test missing file handled gracefully
   - Test comments and blank lines skipped
   - Test simple filename matching
   - Test ** glob patterns
   - Test * single wildcard
   - Test trailing / directory patterns
   - Test backslash normalization
   - Test isIgnored returns false when not loaded

VERIFICATION STEPS:
- [ ] IntentIgnore.ts created
- [ ] Supports **, *, ?, trailing /, comments (#), blank lines
- [ ] Integrated into HookEngine preToolUse (before scope validation)
- [ ] Ignored files skip scope validation entirely
- [ ] Missing .intentignore = no exclusions (not an error)
- [ ] 9+ unit tests pass

TRACEABILITY OUTPUT:
- agent_trace.jsonl: FILE_CREATION for IntentIgnore.ts
- agent_trace.jsonl: INTENT_EVOLUTION for HookEngine.ts

ERROR HANDLING:
- If .intentignore has invalid patterns: skip the invalid line, log warning, continue with remaining patterns
- If load() fails for any reason: treat as empty (no exclusions)
```

---

## Phase 3: AI-Native Git Layer (Traceability)

---

### PROMPT: TSK-030

```
TASK: TSK-030
INTENT: INT-001
HOOK_PHASE: PostToolUse
SPECKIT_COMMAND: /speckit.implement
DEPENDS_ON: TSK-014

OBJECTIVE:
Implement SHA-256 content hashing utilities for spatial independence.

SPECKIT CONTEXT:
- Constitution Principle 3: "Spatial Independence via Content Hashing" — hashes are permanent, line numbers are ephemeral
- SPEC-001 §2.6: computeContentHash and computeFileHash specifications

INPUT REQUIREMENTS:
- Node.js `crypto` built-in available
- `src/core/hooks/utils.ts` exists

STEP-BY-STEP INSTRUCTIONS:
1. Open `src/core/hooks/utils.ts`.
2. Implement `computeContentHash(content: string | Buffer): string`:
   a. Use `crypto.createHash("sha256")`
   b. Update with the raw content (no line ending normalization)
   c. Return `"sha256:" + digest.toString("hex")` (lowercase)
3. Implement `computeFileHash(absolutePath: string): Promise<string | null>`:
   a. Try to read the file with `fs.readFile(absolutePath)`
   b. If file exists: return `computeContentHash(content)`
   c. If file doesn't exist (ENOENT): return `null`
   d. If any other error: log warning, return `null`
4. Write unit tests:
   - Test computeContentHash returns sha256-prefixed hex string
   - Test deterministic output (same input = same hash)
   - Test different content produces different hashes
   - Test empty string produces a valid hash (not null)
   - Test Buffer input works

VERIFICATION STEPS:
- [ ] computeContentHash returns "sha256:" + 64 hex chars
- [ ] computeFileHash returns null for missing files
- [ ] Empty files produce valid hash (not null)
- [ ] No line-ending normalization (raw content hashed)
- [ ] 5 unit tests pass

TRACEABILITY OUTPUT:
- agent_trace.jsonl: INTENT_EVOLUTION for utils.ts

ERROR HANDLING:
- File read errors (permissions, etc.): return null, log warning
- Never throw from these functions — callers depend on null being the "missing/error" signal
```

---

### PROMPT: TSK-031

```
TASK: TSK-031
INTENT: INT-001
HOOK_PHASE: PostToolUse
SPECKIT_COMMAND: /speckit.implement
DEPENDS_ON: TSK-030

OBJECTIVE:
Build a mutation classifier that categorizes each code change into one of 7 MutationClass values.

SPECKIT CONTEXT:
- SPEC-001 §2.5: MutationClass enum definition
- Trace entries require a mutation_class field for audit analysis

INPUT REQUIREMENTS:
- TSK-030 completed (hashing works)
- `src/core/hooks/types.ts` has MutationClass type

STEP-BY-STEP INSTRUCTIONS:
1. Open `src/core/hooks/utils.ts`.
2. Implement `classifyMutation(toolName: string, filePath: string | null, preHash: string | null): MutationClass`:
   a. If `preHash` is null and filePath is not null → `FILE_CREATION` (file didn't exist before)
   b. If toolName is "delete_file" → `FILE_DELETION`
   c. If toolName is "apply_diff" or "edit" or "search_and_replace" → `AST_REFACTOR` (structural change)
   d. If toolName is "write_to_file" and preHash exists → `INTENT_EVOLUTION` (new content to existing file)
   e. If toolName is "execute_command" → `CONFIGURATION` (command execution)
   f. If filePath ends with `.md` or `.txt` or `.json` → `DOCUMENTATION` or `CONFIGURATION` based on extension
   g. Default → `INTENT_EVOLUTION`
3. The classification is heuristic, not semantic. It provides a best-effort categorization without AST parsing.
4. Write unit tests:
   - Test new file creation (preHash is null)
   - Test write_to_file with existing file = INTENT_EVOLUTION
   - Test apply_diff = AST_REFACTOR
   - Test edit = AST_REFACTOR
   - Test execute_command = CONFIGURATION

VERIFICATION STEPS:
- [ ] classifyMutation handles all 7 MutationClass values
- [ ] FILE_CREATION when preHash is null
- [ ] FILE_DELETION for delete_file tool
- [ ] AST_REFACTOR for structural editing tools
- [ ] 5 unit tests pass

TRACEABILITY OUTPUT:
- agent_trace.jsonl: INTENT_EVOLUTION for utils.ts

ERROR HANDLING:
- Unknown tool names: default to INTENT_EVOLUTION (safe default)
- Null filePath: still classify based on toolName alone
```

---

### PROMPT: TSK-032

```
TASK: TSK-032
INTENT: INT-001
HOOK_PHASE: PostToolUse
SPECKIT_COMMAND: /speckit.implement
DEPENDS_ON: TSK-031

OBJECTIVE:
Implement the TraceSerializer that constructs agent_trace.jsonl entries conforming to the TraceEntry schema.

SPECKIT CONTEXT:
- Constitution Principle 7: "Trust Debt Is Repaid Cryptographically" — every trace entry is a cryptographic proof
- SPEC-001 §2.5: TraceEntry schema specification

INPUT REQUIREMENTS:
- TSK-031 completed (mutation classification works)
- `src/core/hooks/types.ts` has TraceEntry interface
- `uuid` package available for UUID v4 generation

STEP-BY-STEP INSTRUCTIONS:
1. Create `src/core/hooks/TraceLogger.ts`.
2. Import `uuid/v4`, `fs/promises`, `path`, and types from `./types.ts`.
3. Constructor takes `workspacePath: string`.
4. Implement `createEntry(params): TraceEntry`:
   a. Generate UUID v4 for the `id` field
   b. Set `timestamp` to `new Date().toISOString()`
   c. Map all params to the TraceEntry interface:
      - intent_id, session_id, tool_name, mutation_class
      - file: { relative_path, pre_hash, post_hash } — or null if no file
      - scope_validation: "PASS", "FAIL", or "EXEMPT"
      - success: boolean
      - error: string (optional)
5. Write unit tests:
   - Test createEntry produces all required fields
   - Test file is null when filePath is null
   - Test error field included on failure

VERIFICATION STEPS:
- [ ] createEntry returns a complete TraceEntry
- [ ] id is a valid UUID v4
- [ ] timestamp is ISO 8601
- [ ] file is null when no file path provided
- [ ] 3 unit tests pass

TRACEABILITY OUTPUT:
- agent_trace.jsonl: FILE_CREATION for TraceLogger.ts

ERROR HANDLING:
- If uuid package is not available: use crypto.randomUUID() (Node.js 19+) as fallback
```

---

### PROMPT: TSK-033

```
TASK: TSK-033
INTENT: INT-001
HOOK_PHASE: PostToolUse
SPECKIT_COMMAND: /speckit.implement
DEPENDS_ON: TSK-032

OBJECTIVE:
Build the append-only JSONL writer that persists trace entries to agent_trace.jsonl.

SPECKIT CONTEXT:
- Constitution Principle 7: "Trust Debt Is Repaid Cryptographically"
- SPEC-001 §2.5: Write semantics — append one JSON line, create on first write, atomic via fs.appendFile
- SPEC-001 §3.3: Retry once on failure, fail-open on double failure

INPUT REQUIREMENTS:
- TSK-032 completed (TraceEntry can be created)
- `src/core/hooks/TraceLogger.ts` exists with createEntry()

STEP-BY-STEP INSTRUCTIONS:
1. Open `src/core/hooks/TraceLogger.ts`.
2. Implement `log(entry: TraceEntry): Promise<void>`:
   a. Serialize entry to JSON: `JSON.stringify(entry)`
   b. Compute path: `path.join(workspacePath, ".orchestration", "agent_trace.jsonl")`
   c. Ensure directory exists (create .orchestration/ if needed)
   d. Call `fs.appendFile(tracePath, jsonLine + "\n")`
   e. If appendFile throws: wait 100ms, retry once
   f. If retry also throws: log error to console, do NOT throw (fail-open)
3. Implement `getRecentEntries(intentId: string, limit: number): Promise<TraceEntry[]>`:
   a. Read the JSONL file
   b. Split into lines, parse each as JSON
   c. Filter by `intent_id === intentId`
   d. Return the last `limit` entries (most recent)
   e. Skip malformed lines (don't throw)
   f. If file doesn't exist: return empty array
4. Write unit tests:
   - Test log appends JSONL line
   - Test log retries once on first failure
   - Test log does not throw on double failure
   - Test getRecentEntries filters by intent
   - Test getRecentEntries returns empty for missing file
   - Test getRecentEntries skips malformed lines
   - Test getRecentEntries respects limit

VERIFICATION STEPS:
- [ ] log() is append-only (fs.appendFile, not read-modify-write)
- [ ] Retry once after 100ms on failure
- [ ] Fail-open on double failure (no throw)
- [ ] getRecentEntries filters and limits correctly
- [ ] Malformed JSONL lines are skipped
- [ ] 7 unit tests pass

TRACEABILITY OUTPUT:
- agent_trace.jsonl: INTENT_EVOLUTION for TraceLogger.ts

ERROR HANDLING:
- fs.appendFile fails: retry once with 100ms delay
- Double failure: log to console.error, continue (fail-open per SPEC-001 §3.3)
- JSONL parse errors in getRecentEntries: skip the line, don't throw
```

---

### PROMPT: TSK-034

```
TASK: TSK-034
INTENT: INT-001
HOOK_PHASE: PostToolUse
SPECKIT_COMMAND: /speckit.implement
DEPENDS_ON: TSK-033

OBJECTIVE:
Implement the SpatialMapWriter that auto-updates intent_map.md when files are mutated.

SPECKIT CONTEXT:
- SPEC-003 §1: Spatial index connecting intents to modified files
- Called from HookEngine.postToolUse() after successful write operations

INPUT REQUIREMENTS:
- TSK-033 completed (trace logging works)
- `.orchestration/intent_map.md` exists or will be created

STEP-BY-STEP INSTRUCTIONS:
1. Create `src/core/hooks/SpatialMapWriter.ts`.
2. Export class with static methods (no instance state needed).
3. Implement `addFileToIntent(intentId, filePath, workspacePath, intentName?): Promise<void>`:
   a. Read `.orchestration/intent_map.md`
   b. Find the section for this intent: `## {intentId}: {intentName}`
   c. If section exists: check if filePath is already listed (deduplicate), add if not
   d. If section doesn't exist: create it at the end of the file
   e. If the file doesn't exist: create it with a header and the new section
   f. Write the updated content back
4. Implement `removeFileFromIntent(intentId, filePath, workspacePath): Promise<void>`:
   a. Read the file, find the intent section, remove the line containing filePath
   b. If file or section doesn't exist: do nothing
5. Integrate into HookEngine.postToolUse():
   a. After trace logging, if success is true and tool is a write tool:
   b. Call `SpatialMapWriter.addFileToIntent(intentId, relativePath, workspacePath, intentName)`
   c. Wrap in try-catch (spatial map update failure should not block tool execution)
6. Write unit tests:
   - Test adding a new file to existing section
   - Test deduplication (don't add same file twice)
   - Test creating new section when intent not found
   - Test creating map file from scratch
   - Test removing a file entry
   - Test no-op when file doesn't exist

VERIFICATION STEPS:
- [ ] SpatialMapWriter.ts created with addFileToIntent and removeFileFromIntent
- [ ] Deduplicates file entries
- [ ] Creates section if intent not found
- [ ] Creates file if intent_map.md doesn't exist
- [ ] Integrated into HookEngine.postToolUse()
- [ ] 6 unit tests pass

TRACEABILITY OUTPUT:
- agent_trace.jsonl: FILE_CREATION for SpatialMapWriter.ts

ERROR HANDLING:
- If intent_map.md is malformed: create a new section at the end (don't try to fix existing content)
- If write fails: log warning, don't throw (spatial map is informational, not critical)
```

---

## Phase 4: Parallel Orchestration (Master Thinker)

---

### PROMPT: TSK-040

```
TASK: TSK-040
INTENT: INT-001
HOOK_PHASE: PreToolUse
SPECKIT_COMMAND: /speckit.implement
DEPENDS_ON: TSK-030

OBJECTIVE:
Implement optimistic locking by computing preHash in PreToolUse and logging preHash→postHash in PostToolUse.

SPECKIT CONTEXT:
- Constitution Principle 5: "Optimistic Locking for Parallel Agents"
- SPEC-001 §2.2 step 4: Compute SHA-256 of current file content before mutation
- SPEC-001 §2.3 step 1: Compute SHA-256 after mutation

INPUT REQUIREMENTS:
- TSK-030 completed (computeFileHash works)
- HookEngine.preToolUse() and postToolUse() exist

STEP-BY-STEP INSTRUCTIONS:
1. In HookEngine.preToolUse(), after scope validation passes:
   a. If filePath is not null, compute `preHash = await computeFileHash(absolutePath)`
   b. If file doesn't exist (new file), preHash is null
   c. Include preHash in the returned HookResult: `{ allowed: true, preHash }`
2. In HookEngine.postToolUse():
   a. If filePath is not null, compute `postHash = await computeFileHash(absolutePath)`
   b. Include both preHash (from input) and postHash in the trace entry
   c. The trace entry's `file.pre_hash` and `file.post_hash` fields make hash divergence auditable
3. The preHash→postHash pair enables:
   - Detecting if a file was unchanged (preHash === postHash — tool was a no-op)
   - Detecting if another agent modified the file between pre and post (TSK-041 builds on this)
   - Cryptographic verification that the agent's mutation matches what was expected

VERIFICATION STEPS:
- [ ] preToolUse computes and returns preHash for file-based tools
- [ ] preHash is null for new files (no prior content)
- [ ] postToolUse computes postHash after mutation
- [ ] Both hashes appear in the trace entry
- [ ] Tests confirm preHash is included in HookResult

TRACEABILITY OUTPUT:
- agent_trace.jsonl: INTENT_EVOLUTION for HookEngine.ts

ERROR HANDLING:
- If hash computation fails: use null (per computeFileHash contract)
- This is defense in depth — a missing hash is logged but doesn't block execution
```

---

### PROMPT: TSK-041

```
TASK: TSK-041
INTENT: INT-001
HOOK_PHASE: PreToolUse
SPECKIT_COMMAND: /speckit.implement
DEPENDS_ON: TSK-040

OBJECTIVE:
Build the "Stale File" error protocol that rejects writes when the file has been modified since the agent last read it.

SPECKIT CONTEXT:
- Constitution Principle 5: "Optimistic Locking for Parallel Agents"
- Constitution §III Prohibition 5: "No timestamp-based conflict resolution"
- SPEC-001 §2.3 step 2: Compare preHash at read-time vs hash at write-time

INPUT REQUIREMENTS:
- TSK-040 completed (preHash computation works)
- HookEngine has preToolUse with hash computation

STEP-BY-STEP INSTRUCTIONS:
1. Add a `fileHashCache: Map<string, string>` to HookEngine as a private member.
2. In preToolUse, AFTER computing preHash:
   a. If this is a write tool and preHash is not null:
   b. Check if `fileHashCache` has an entry for this file
   c. If it does, and the cached hash differs from the current preHash: the file was modified by another session
   d. Return rejection: `{ allowed: false, reason: 'Stale file: "{path}" was modified since last read. Expected hash {cached}... but found {current}... Re-read the file before writing.' }`
   e. Record the mismatch via LessonRecorder (if TSK-042 is done) for cross-session learning
   f. If no cached hash or hashes match: update cache with current preHash
3. In postToolUse, AFTER computing postHash:
   a. Update `fileHashCache` with the postHash (the new "known good" hash)
4. The cache is per-session (lives on the HookEngine instance). Different sessions have independent caches, which means the first write from each session always succeeds. Conflicts are only detected within a session when it re-reads a file that was concurrently modified.

VERIFICATION STEPS:
- [ ] fileHashCache exists as Map<string, string> on HookEngine
- [ ] Stale file detected when cached hash doesn't match current hash
- [ ] Rejection message includes truncated hashes for debugging
- [ ] Cache updated after preToolUse (for next comparison) and postToolUse (new state)
- [ ] LessonRecorder called on stale file detection (if available)

TRACEABILITY OUTPUT:
- agent_trace.jsonl: INTENT_EVOLUTION for HookEngine.ts

ERROR HANDLING:
- If LessonRecorder is not yet available: log to console.warn instead
- If hash comparison fails: allow the write (fail-open) and log warning
- The "Re-read the file before writing" instruction enables LLM self-correction
```

---

### PROMPT: TSK-042

```
TASK: TSK-042
INTENT: INT-001
HOOK_PHASE: PostToolUse
SPECKIT_COMMAND: /speckit.implement
DEPENDS_ON: TSK-034

OBJECTIVE:
Implement LessonRecorder that appends "Lessons Learned" entries to CLAUDE.md on verification failures.

SPECKIT CONTEXT:
- .orchestration/CLAUDE.md is the "Shared Brain" for cross-session knowledge
- Lessons from hash mismatches, scope violations, and tool failures are recorded for future sessions
- Append-only semantics — never modify existing content

INPUT REQUIREMENTS:
- TSK-034 completed (spatial map writer works)
- `.orchestration/CLAUDE.md` exists (or will be created)

STEP-BY-STEP INSTRUCTIONS:
1. Create `src/core/hooks/LessonRecorder.ts`.
2. Constructor takes `workspacePath: string`.
3. Implement `recordLesson(params: { intentId, toolName, description, category? }): Promise<void>`:
   a. Read `.orchestration/CLAUDE.md`
   b. If file doesn't exist: create it with a basic header and "## Lessons Learned" section
   c. Find the "## Lessons Learned" section in the content
   d. If section doesn't exist: append it
   e. Build the entry: `### {date}: {category} ({intentId})`, then bullet points for tool, issue, and intent
   f. Insert the entry at the end of the Lessons Learned section (but before the next ## section if one exists)
   g. Write the file back
4. Implement `recordHashMismatch(intentId, toolName, filePath): Promise<void>`:
   a. Calls recordLesson with category="Optimistic Lock Failure" and description about hash mismatch
5. Implement `recordScopeViolation(intentId, toolName, filePath): Promise<void>`:
   a. Calls recordLesson with category="Scope Violation" and description about out-of-scope write
6. Integrate into HookEngine:
   a. On scope violation rejection: call `lessonRecorder.recordScopeViolation()` (fire-and-forget, catch errors)
   b. On stale file rejection: call `lessonRecorder.recordHashMismatch()` (fire-and-forget)
   c. On tool execution failure in postToolUse: call `lessonRecorder.recordLesson()` with failure details
7. Write unit tests:
   - Test appending to existing Lessons Learned section
   - Test creating section when missing
   - Test creating CLAUDE.md from scratch
   - Test inserting before next section
   - Test recordHashMismatch formats correctly
   - Test recordScopeViolation formats correctly

VERIFICATION STEPS:
- [ ] LessonRecorder.ts created with all methods
- [ ] Creates CLAUDE.md if absent
- [ ] Creates "## Lessons Learned" section if absent
- [ ] Appends entries without modifying existing content
- [ ] Integrated into HookEngine for scope violations, hash mismatches, tool failures
- [ ] All calls are fire-and-forget (never blocks tool execution)
- [ ] 6 unit tests pass

TRACEABILITY OUTPUT:
- agent_trace.jsonl: FILE_CREATION for LessonRecorder.ts
- agent_trace.jsonl: INTENT_EVOLUTION for HookEngine.ts

ERROR HANDLING:
- If CLAUDE.md write fails: log error, do not throw (lesson recording is informational)
- If CLAUDE.md is locked by another process: skip this entry (append-only is best-effort)
```

---

### PROMPT: TSK-043

```
TASK: TSK-043
INTENT: INT-001
HOOK_PHASE: DataModel
SPECKIT_COMMAND: /speckit.implement
DEPENDS_ON: TSK-042

OBJECTIVE:
Build a parallel session coordinator that registers sessions in CLAUDE.md for cross-session awareness.

SPECKIT CONTEXT:
- Constitution Principle 5: "Optimistic Locking for Parallel Agents" — sessions must know about each other
- CLAUDE.md is the shared memory plane: lessons, architecture decisions, AND session presence

INPUT REQUIREMENTS:
- TSK-042 completed (LessonRecorder can write to CLAUDE.md)
- `.orchestration/CLAUDE.md` exists

STEP-BY-STEP INSTRUCTIONS:
1. Create `src/core/hooks/SessionCoordinator.ts`.
2. Constructor takes `workspacePath: string`.
3. Implement `heartbeat(sessionId, intentId): Promise<void>`:
   a. Read CLAUDE.md
   b. If CLAUDE.md doesn't exist: return early (no shared memory to coordinate with)
   c. Find or create "## Active Sessions" section
   d. The section contains a markdown table: `| Session | Intent | Last Heartbeat |`
   e. If session already exists in table: update its row with new intentId and timestamp
   f. If session is new: add a new row to the table
   g. Write the file back
4. Implement `listSessions(): Promise<SessionInfo[]>`:
   a. Read CLAUDE.md
   b. Parse the Active Sessions table
   c. Return an array of { sessionId, intentId, startedAt, lastHeartbeat }
   d. Skip header/separator rows
5. Implement `isIntentClaimedByOther(sessionId, intentId): Promise<boolean>`:
   a. Call listSessions()
   b. Return true if any OTHER session has the same intentId
6. Implement `cleanupStaleSessions(): Promise<number>`:
   a. Read the table, parse heartbeat timestamps
   b. Remove rows where lastHeartbeat is older than 5 minutes
   c. Return count of removed sessions
   d. If no stale sessions: don't write the file (avoid unnecessary I/O)
7. Write unit tests:
   - Test creating session table when none exists
   - Test updating existing session entry
   - Test handling missing CLAUDE.md
   - Test parsing session table
   - Test empty file returns empty sessions
   - Test isIntentClaimedByOther detects conflicts
   - Test cleanupStaleSessions removes old entries

VERIFICATION STEPS:
- [ ] SessionCoordinator.ts created with all methods
- [ ] Session table is a proper markdown table
- [ ] Updates existing rows, adds new rows
- [ ] Stale threshold is 5 minutes
- [ ] Cleanup only writes when there are changes
- [ ] 7 unit tests pass

TRACEABILITY OUTPUT:
- agent_trace.jsonl: FILE_CREATION for SessionCoordinator.ts

ERROR HANDLING:
- If CLAUDE.md doesn't exist: return early / return empty (don't create it — that's LessonRecorder's job)
- If table parsing fails: return empty sessions (don't throw)
- If write fails: log error, don't throw
```

---

## Cross-Cutting Tasks

---

### PROMPT: TSK-090

```
TASK: TSK-090
INTENT: INT-001
HOOK_PHASE: DataModel
SPECKIT_COMMAND: /speckit.implement
DEPENDS_ON: none

OBJECTIVE:
Implement a lightweight GitUtils wrapper for git operations needed by the trace system.

SPECKIT CONTEXT:
- Trace entries benefit from git SHA context to link agent mutations to git history
- No git library dependency — use child_process.exec for simplicity

INPUT REQUIREMENTS:
- Git installed on the system
- `child_process` and `util` Node.js built-ins available

STEP-BY-STEP INSTRUCTIONS:
1. Create `src/core/hooks/GitUtils.ts`.
2. Constructor takes `workspacePath: string`.
3. Use `const execAsync = promisify(exec)` with a 5-second timeout on all commands.
4. Implement `getCurrentSha(): Promise<string | null>`:
   a. Run `git rev-parse HEAD` in the workspace directory
   b. Return trimmed stdout, or null on error
5. Implement `getShortSha(): Promise<string | null>`:
   a. Run `git rev-parse --short HEAD`
6. Implement `hasUncommittedChanges(): Promise<boolean>`:
   a. Run `git status --porcelain`
   b. Return true if stdout has content, false if empty
7. Implement `isGitRepo(): Promise<boolean>`:
   a. Run `git rev-parse --is-inside-work-tree`
   b. Return true on success, false on error
8. Implement `getCurrentBranch(): Promise<string | null>`:
   a. Run `git rev-parse --abbrev-ref HEAD`
9. All methods: catch errors, return null/false (never throw).
10. Write unit tests:
    - Test getCurrentSha returns SHA
    - Test getCurrentSha returns null on error
    - Test empty stdout returns null
    - Test getShortSha returns short SHA
    - Test hasUncommittedChanges true/false
    - Test isGitRepo true/false
    - Test getCurrentBranch returns branch name

VERIFICATION STEPS:
- [ ] GitUtils.ts created with all 5 methods
- [ ] All methods return null/false on error (never throw)
- [ ] 5-second timeout on all commands
- [ ] Uses child_process.exec (no git library dependency)
- [ ] 7 unit tests pass

TRACEABILITY OUTPUT:
- agent_trace.jsonl: FILE_CREATION for GitUtils.ts

ERROR HANDLING:
- Non-git directory: all methods return null/false
- Command timeout: treated as error, return null/false
- When mocking in tests: mock child_process.exec, not the GitUtils methods
```

---

### PROMPT: TSK-091

```
TASK: TSK-091
INTENT: INT-001
HOOK_PHASE: PreToolUse
SPECKIT_COMMAND: /speckit.implement
DEPENDS_ON: TSK-012

OBJECTIVE:
Build the XML context injector that safely embeds <intent_context> into the agent prompt without breaking XML parsing.

SPECKIT CONTEXT:
- Constitution Principle 6: "Context Is Curated, Not Dumped"
- This is the formatContextForPrompt() method in IntentContextLoader

INPUT REQUIREMENTS:
- TSK-012 completed (XML generator exists in IntentContextLoader)

STEP-BY-STEP INSTRUCTIONS:
1. This task is implemented as part of TSK-012 (formatContextForPrompt method).
2. Verify that the XML output is well-formed:
   a. All opening tags have closing tags
   b. Special characters in constraint text are escaped (< > & " ')
   c. The output can be embedded in a larger prompt string without breaking
3. Verify that the truncation budget (16KB) is respected:
   a. Generate a context with many trace entries and verify truncation kicks in
   b. Verify core fields (scope, constraints, criteria) are never truncated
4. Existing tests in IntentContextLoader.test.ts should cover this.

VERIFICATION STEPS:
- [ ] XML is well-formed (verified by test)
- [ ] Special characters escaped
- [ ] Truncation respects 16KB budget
- [ ] Core fields never removed during truncation
- [ ] IntentContextLoader tests cover XML output

TRACEABILITY OUTPUT:
- No separate trace entry (covered by TSK-012)

ERROR HANDLING:
- If intent has no constraints: produce <constraints></constraints> (empty, not missing)
- If formatContextForPrompt receives null context: return empty string
```

---

### PROMPT: TSK-092

```
TASK: TSK-092
INTENT: INT-001
HOOK_PHASE: DataModel
SPECKIT_COMMAND: /speckit.implement
DEPENDS_ON: none

OBJECTIVE:
Create a demo workspace setup script that generates a sample .orchestration/ directory for the Weather API intent.

SPECKIT CONTEXT:
- Developer experience: new users need a quick way to see governance in action
- The script generates all sidecar files needed for a working demo

INPUT REQUIREMENTS:
- None (standalone script)

STEP-BY-STEP INSTRUCTIONS:
1. Create `scripts/setup-demo-workspace.sh`.
2. Accept an optional target directory argument (default: current directory).
3. Check if `.orchestration/` already exists — abort with message if so (idempotent safety).
4. Create `.orchestration/` directory.
5. Generate `active_intents.yaml` with 2 demo intents:
   a. INT-DEMO-001: "Weather API Integration" — PENDING, scope: src/weather/**, src/api/weather.ts, tests/weather/**
   b. INT-DEMO-002: "Bug Fix: Null Pointer in User Profile" — PENDING, scope: src/user/profile.ts, src/user/types.ts, tests/user/**
   c. Include realistic constraints and acceptance criteria
6. Generate `CLAUDE.md` with:
   a. "# Shared Brain - Demo Project" header
   b. "## Architecture Decisions" with placeholder entries
   c. "## Lessons Learned" section (empty, for future auto-append)
   d. "## Active Sessions" section with table header
7. Generate `intent_map.md` with:
   a. Section headers for both demo intents
   b. "(No files modified yet)" placeholder under each
8. Touch `agent_trace.jsonl` (empty file, created for first write).
9. Generate `.intentignore` with common exclusions:
   a. package-lock.json, pnpm-lock.yaml, yarn.lock
   b. dist/**, build/**, .next/**
   c. .vscode/**, .idea/**
   d. .orchestration/** (meta-files exempt from scope enforcement)
10. Generate `README.md` explaining the purpose of each file.
11. Make the script executable: `chmod +x scripts/setup-demo-workspace.sh`
12. Print summary of created files and next steps.

VERIFICATION STEPS:
- [ ] Script creates all 6 files in .orchestration/
- [ ] Aborts if .orchestration/ already exists
- [ ] active_intents.yaml has valid YAML with 2 intents
- [ ] All intents have required fields (id, name, status, owned_scope, constraints, acceptance_criteria, created_at, updated_at)
- [ ] Script is executable
- [ ] Running the script then running the extension shows governance working

TRACEABILITY OUTPUT:
- agent_trace.jsonl: FILE_CREATION for scripts/setup-demo-workspace.sh

ERROR HANDLING:
- If target directory doesn't exist: show error and exit
- If mkdir fails: show error and exit
- Script uses `set -euo pipefail` for strict error handling
```

---

## Execution Protocol

When executing these prompts:

1. **Declare intent first**: Before any file mutation, call `select_active_intent("INT-001")`.
2. **Execute in dependency order**: Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Cross-Cutting.
3. **Run tests after each task**: `pnpm --filter roo-cline exec vitest run core/hooks/__tests__/ --reporter=verbose` (from the `src/` directory).
4. **Check lints after each task**: Verify zero new linter errors in modified files.
5. **Verify test count progression**: TSK-011: ~8 → TSK-014: ~19 → TSK-022: ~27 → ... → Final: 161.
6. **If a task fails**: Read the error message (WHAT/WHY/HOW). Self-correct. Do not skip to the next task.
7. **Cross-reference constitution**: Every mutation must trace back to a principle. If you can't name the principle, question the change.
