# Quick Start: Intent-Code Traceability Hook System

## 5-Minute Setup

### 1. Install Dependencies

```bash
cd Roo-Code
pnpm install
```

### 2. Build the Extension

```bash
pnpm build
```

### 3. Run in Development Mode

Press `F5` in VS Code to launch the extension in a new window.

### 4. Create Test Workspace

In the new VS Code window, open a folder and create the orchestration directory:

```bash
mkdir .orchestration
```

### 5. Create Your First Intent

Create `.orchestration/active_intents.yaml`:

```yaml
active_intents:
    - id: "INT-001"
      name: "Build Calculator App"
      status: "IN_PROGRESS"
      owned_scope:
          - "src/**"
          - "tests/**"
      constraints:
          - "Use TypeScript"
          - "Include unit tests"
      acceptance_criteria:
          - "Calculator can add, subtract, multiply, divide"
          - "All tests pass"
      created_at: "2026-02-18T10:00:00Z"
      updated_at: "2026-02-18T10:00:00Z"
```

### 6. Test the System

Open Roo-Code chat and try:

```
User: "Create a simple calculator with add and subtract functions"
```

The agent should:

1. Call `select_active_intent(intent_id="INT-001")`
2. Receive context about the intent
3. Create the calculator file
4. Log the action to `.orchestration/agent_trace.jsonl`

### 7. Verify Traceability

Check the trace log:

```bash
cat .orchestration/agent_trace.jsonl | jq .
```

You should see entries linking your code changes to INT-001.

## Demo Scenarios

### Scenario 1: Basic Intent Selection

```
User: "I want to build a calculator"
Agent: [Calls select_active_intent(intent_id="INT-001")]
Agent: "I've selected the 'Build Calculator App' intent. I'll create a calculator with the required operations."
Agent: [Creates src/calculator.ts]
```

### Scenario 2: Scope Validation

```
User: "Also create a database connection module"
Agent: [Tries to write to src/database.ts]
System: [Blocks - out of scope]
System: [Shows approval dialog]
User: [Approves or rejects]
```

### Scenario 3: Parallel Agents

Open two Roo-Code chat panels:

**Agent A:**

```
User: "Create the add function"
Agent A: [Selects INT-001, creates add function]
```

**Agent B:**

```
User: "Create the subtract function"
Agent B: [Selects INT-001, creates subtract function]
```

Both work without conflicts due to optimistic locking.

## Troubleshooting

### "Orchestration not enabled"

- Ensure `.orchestration/` directory exists
- Create `active_intents.yaml` file

### "Intent not found"

- Check intent ID matches exactly (case-sensitive)
- Verify YAML syntax is correct

### "Scope violation"

- Add file pattern to intent's `owned_scope`
- Or approve the out-of-scope modification

## Next Steps

1. Read [HOOK_SYSTEM_GUIDE.md](./HOOK_SYSTEM_GUIDE.md) for detailed usage
2. Review [ARCHITECTURE_NOTES.md](../ARCHITECTURE_NOTES.md) for architecture
3. Check [.orchestration/README.md](./.orchestration/README.md) for data model

## Support

- GitHub Issues: https://github.com/RooCodeInc/Roo-Code/issues
- Discord: https://discord.gg/roocode
