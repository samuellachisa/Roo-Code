/**
 * Verify Acceptance Criteria Tool Definition
 *
 * Transitions an intent to COMPLETE when all acceptance criteria have been verified.
 * Used when work is done and the agent/human confirms the Definition of Done is met.
 */

import type OpenAI from "openai"

const verifyAcceptanceCriteria: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "verify_acceptance_criteria",
		description: `Mark an intent as COMPLETE when all acceptance criteria have been verified.

Call this tool when:
1. You have finished the work for an intent
2. All acceptance_criteria from active_intents.yaml have been satisfied (tests pass, features work, etc.)
3. You want to transition the intent from IN_PROGRESS to COMPLETE

The intent must be IN_PROGRESS. After verification, the intent status becomes COMPLETE and no further writes are allowed for that intent.`,
		parameters: {
			type: "object",
			properties: {
				intent_id: {
					type: "string",
					description: `The ID of the intent to mark complete (e.g., "INT-001"). Must be in IN_PROGRESS status.`,
				},
				summary: {
					type: "string",
					description: `Optional: Brief summary of what was accomplished and how acceptance criteria were met.`,
				},
			},
			required: ["intent_id"],
		},
	},
}

export default verifyAcceptanceCriteria
