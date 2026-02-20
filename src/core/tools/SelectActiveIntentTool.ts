/**
 * Select Active Intent Tool
 *
 * Allows the agent to select an active intent before performing work.
 * This is the "handshake" that loads intent context and enables traceability.
 */

import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import { HookEngine } from "../hooks/HookEngine"
import { IntentLifecycleManager } from "../hooks/IntentLifecycleManager"

interface SelectActiveIntentParams {
	intent_id: string
	reasoning?: string
}

export class SelectActiveIntentTool extends BaseTool<"select_active_intent"> {
	readonly name = "select_active_intent" as const

	async execute(params: SelectActiveIntentParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { pushToolResult } = callbacks
		const { intent_id, reasoning } = params

		if (!intent_id) {
			task.consecutiveMistakeCount++
			task.recordToolError("select_active_intent")
			pushToolResult(await task.sayAndCreateMissingParamError("select_active_intent", "intent_id"))
			return
		}

		try {
			// Get hook engine instance
			const hookEngine = HookEngine.getInstance(task.cwd, task.taskId)

			// Check if orchestration is enabled
			const enabled = await hookEngine.isEnabled()
			if (!enabled) {
				await task.say(
					"text",
					`⚠️ Orchestration system is not enabled. Create .orchestration/ directory to enable intent tracking.`,
				)
				pushToolResult(formatResponse.toolResult(`Orchestration not enabled. Intent selection skipped.`, []))
				return
			}

			// Load intent context
			const contextLoader = hookEngine.getContextLoader()
			const intent = await contextLoader.getIntent(intent_id)

			if (!intent) {
				task.consecutiveMistakeCount++
				task.recordToolError("select_active_intent")
				await task.say("text", `❌ Intent ${intent_id} not found in active_intents.yaml`)
				pushToolResult(
					formatResponse.toolError(
						`Intent ${intent_id} not found. Available intents can be found in .orchestration/active_intents.yaml`,
					),
				)
				return
			}

			// Transition PENDING → IN_PROGRESS if needed
			if (intent.status === "PENDING") {
				try {
					await IntentLifecycleManager.transitionIntent(intent_id, "IN_PROGRESS", task.cwd)
					await contextLoader.reload()
				} catch (transitionErr: any) {
					console.warn(`[HookSystem] Failed to transition intent to IN_PROGRESS: ${transitionErr.message}`)
				}
			}

			// Set active intent in hook engine
			hookEngine.setActiveIntent(intent_id)

			// Build full context
			const intentContext = await contextLoader.buildIntentContext(intent_id)
			if (!intentContext) {
				throw new Error("Failed to build intent context")
			}

			// Format context for display
			const contextXml = contextLoader.formatContextForPrompt(intentContext)

			// Success message
			task.consecutiveMistakeCount = 0
			task.recordToolUsage("select_active_intent")

			await task.say(
				"text",
				`✅ Selected Intent: ${intent.name} (${intent_id})\n\n` +
					`Status: ${intent.status}\n` +
					`Scope: ${intent.owned_scope.join(", ")}\n` +
					`Constraints: ${intent.constraints.length} active\n` +
					`Related Files: ${intentContext.relatedFiles.length} tracked\n\n` +
					(reasoning ? `Reasoning: ${reasoning}\n\n` : "") +
					`You now have full context for this intent. All file modifications will be traced to ${intent_id}.`,
			)

			// Return context as tool result
			pushToolResult(
				formatResponse.toolResult(
					`Intent ${intent_id} selected successfully. Context loaded:\n\n${contextXml}`,
					[],
				),
			)
		} catch (error: any) {
			task.consecutiveMistakeCount++
			task.recordToolError("select_active_intent")
			await task.say("text", `❌ Error selecting intent: ${error.message}`)
			pushToolResult(formatResponse.toolError(`Failed to select intent: ${error.message}`))
		}
	}
}

export const selectActiveIntentTool = new SelectActiveIntentTool()
