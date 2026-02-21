/**
 * Verify Acceptance Criteria Tool
 *
 * Transitions an intent to COMPLETE when acceptance criteria have been verified.
 * Implements the IN_PROGRESS → COMPLETE lifecycle transition.
 */

import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import { HookEngine } from "../hooks/HookEngine"
import { IntentLifecycleManager } from "../hooks/IntentLifecycleManager"

interface VerifyAcceptanceCriteriaParams {
	intent_id: string
	summary?: string
}

export class VerifyAcceptanceCriteriaTool extends BaseTool<"verify_acceptance_criteria"> {
	readonly name = "verify_acceptance_criteria" as const

	async execute(params: VerifyAcceptanceCriteriaParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { pushToolResult } = callbacks
		const { intent_id, summary } = params

		if (!intent_id) {
			task.consecutiveMistakeCount++
			task.recordToolError("verify_acceptance_criteria")
			pushToolResult(await task.sayAndCreateMissingParamError("verify_acceptance_criteria", "intent_id"))
			return
		}

		try {
			const hookEngine = HookEngine.getInstance(task.cwd, task.taskId)
			const enabled = await hookEngine.isEnabled()

			if (!enabled) {
				await task.say(
					"text",
					`⚠️ Orchestration system is not enabled. Create .orchestration/ directory to use intent lifecycle.`,
				)
				pushToolResult(
					formatResponse.toolError("Orchestration not enabled. Cannot verify acceptance criteria."),
				)
				return
			}

			const contextLoader = hookEngine.getContextLoader()
			const intent = await contextLoader.getIntent(intent_id)

			if (!intent) {
				task.consecutiveMistakeCount++
				task.recordToolError("verify_acceptance_criteria")
				pushToolResult(formatResponse.toolError(`Intent ${intent_id} not found in active_intents.yaml.`))
				return
			}

			if (intent.status !== "IN_PROGRESS") {
				task.consecutiveMistakeCount++
				task.recordToolError("verify_acceptance_criteria")
				pushToolResult(
					formatResponse.toolError(
						`Intent ${intent_id} has status "${intent.status}". Only IN_PROGRESS intents can be verified.`,
					),
				)
				return
			}

			await IntentLifecycleManager.transitionIntent(intent_id, "COMPLETE", task.cwd)
			await contextLoader.reload()

			// Clear active intent if it was this one
			if (hookEngine.getActiveIntent() === intent_id) {
				hookEngine.clearActiveIntent()
			}

			task.consecutiveMistakeCount = 0
			task.recordToolUsage("verify_acceptance_criteria")

			const summaryText = summary ? `\n\nSummary: ${summary}` : ""
			const criteriaList = intent.acceptance_criteria.map((c, i) => `  ${i + 1}. ${c}`).join("\n")

			await task.say(
				"text",
				`✅ Intent ${intent_id} (${intent.name}) marked COMPLETE.\n\n` +
					`Verified acceptance criteria:\n${criteriaList}${summaryText}`,
			)

			pushToolResult(
				formatResponse.toolResult(
					`Intent ${intent_id} verified and transitioned to COMPLETE. No further writes allowed for this intent.`,
					[],
				),
			)
		} catch (error: any) {
			task.consecutiveMistakeCount++
			task.recordToolError("verify_acceptance_criteria")
			await task.say("text", `❌ Error verifying intent: ${error.message}`)
			pushToolResult(formatResponse.toolError(`Failed to verify acceptance criteria: ${error.message}`))
		}
	}
}

export const verifyAcceptanceCriteriaTool = new VerifyAcceptanceCriteriaTool()
