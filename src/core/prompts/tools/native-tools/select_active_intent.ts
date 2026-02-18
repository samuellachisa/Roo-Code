/**
 * Select Active Intent Tool Definition
 *
 * Native tool definition for intent selection
 */

import type OpenAI from "openai"

const selectActiveIntent: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "select_active_intent",
		description: `Select an active intent before performing work. This is REQUIRED before any file modifications.

An intent represents a business requirement or feature you are working on. By selecting an intent:
1. You load the relevant context (constraints, scope, acceptance criteria)
2. Your work is traced to the intent for governance
3. File scope is validated against the intent's owned scope

You MUST call this tool before using write_to_file, edit_file, or other modification tools.

Available intents are defined in .orchestration/active_intents.yaml. Each intent has:
- id: Unique identifier (e.g., "INT-001", "REQ-042")
- name: Human-readable name
- status: Current status (PLANNED, IN_PROGRESS, COMPLETED, etc.)
- owned_scope: File patterns this intent is allowed to modify
- constraints: Business rules and technical constraints
- acceptance_criteria: Definition of done

Example workflow:
1. User asks: "Refactor the auth middleware"
2. You analyze and identify this relates to intent "INT-001: JWT Authentication Migration"
3. You call: select_active_intent(intent_id="INT-001", reasoning="User requested auth middleware refactor")
4. System loads context and validates your subsequent file modifications against INT-001's scope
5. You proceed with write_to_file, knowing the context and constraints`,
		parameters: {
			type: "object",
			properties: {
				intent_id: {
					type: "string",
					description: `The ID of the intent to select (e.g., "INT-001", "REQ-042"). Must match an intent defined in .orchestration/active_intents.yaml.`,
				},
				reasoning: {
					type: "string",
					description: `Optional: Your reasoning for selecting this intent. Explain how the user's request maps to this intent.`,
				},
			},
			required: ["intent_id"],
		},
	},
}

export default selectActiveIntent
