# Intent-Code Spatial Map

This file maps business intents to physical files and AST nodes.

## INT-001: Intent-Code Traceability Hook System

### Core Components

- `src/core/hooks/HookEngine.ts` - Central coordinator
- `src/core/hooks/IntentContextLoader.ts` - Context management
- `src/core/hooks/TraceLogger.ts` - Audit logging
- `src/core/hooks/types.ts` - Type definitions
- `src/core/hooks/utils.ts` - Utility functions

### Tool Integration

- `src/core/tools/SelectActiveIntentTool.ts` - Intent selection tool
- `src/core/prompts/tools/native-tools/select_active_intent.ts` - Tool definition
- `src/core/assistant-message/presentAssistantMessage.ts` - Tool execution

### Data Model

- `.orchestration/active_intents.yaml` - Intent specifications
- `.orchestration/agent_trace.jsonl` - Audit ledger
- `.orchestration/intent_map.md` - This file
- `.orchestration/CLAUDE.md` - Shared brain

## INT-002: Example Feature - Weather API

### Planned Structure

- `src/api/weather/` - API client
- `src/services/weather/` - Business logic
- `tests/weather/` - Test suite

---

_This file is automatically updated by the hook system as intents evolve._
