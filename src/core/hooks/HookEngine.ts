/**
 * Hook Engine
 *
 * Central coordinator for the Intent-Code Traceability system
 * Implements Pre-Hook and Post-Hook execution for all tool calls
 */

import type { ToolName } from "@roo-code/types"
import type { Task } from "../task/Task"
import type {
	HookContext,
	PreHookResult,
	PostHookResult,
	HookEngineConfig,
	FileHashEntry,
	ScopeValidationResult,
	MutationClass,
} from "./types"
import { IntentContextLoader } from "./IntentContextLoader"
import { TraceLogger } from "./TraceLogger"
import { isOrchestrationEnabled, computeFileHash, matchesScope, getRelativePath, isValidIntentId } from "./utils"
import path from "path"
import * as vscode from "vscode"

/**
 * Tools that require intent selection before execution
 */
const WRITE_TOOLS: ToolName[] = ["write_to_file", "edit_file", "apply_diff", "search_replace", "apply_patch"]

/**
 * Tools that are always allowed (read-only)
 */
const READ_TOOLS: ToolName[] = ["read_file", "list_files", "search_files", "codebase_search", "read_command_output"]

export class HookEngine {
	private static instance: HookEngine | null = null

	private config: HookEngineConfig
	private contextLoader: IntentContextLoader
	private traceLogger: TraceLogger
	private fileHashes: Map<string, FileHashEntry> = new Map()
	private activeIntentId: string | undefined
	private sessionId: string

	private constructor(cwd: string, sessionId: string, config?: Partial<HookEngineConfig>) {
		this.sessionId = sessionId
		this.config = {
			enabled: true,
			orchestrationDir: path.join(cwd, ".orchestration"),
			requireIntentSelection: true,
			enableScopeValidation: true,
			enableConcurrencyControl: true,
			enableTraceLogging: true,
			...config,
		}

		this.contextLoader = new IntentContextLoader(cwd)
		this.traceLogger = new TraceLogger(cwd)
	}

	/**
	 * Get or create singleton instance
	 */
	static getInstance(cwd: string, sessionId: string, config?: Partial<HookEngineConfig>): HookEngine {
		if (!HookEngine.instance) {
			HookEngine.instance = new HookEngine(cwd, sessionId, config)
		}
		return HookEngine.instance
	}

	/**
	 * Reset instance (for testing)
	 */
	static resetInstance(): void {
		HookEngine.instance = null
	}

	/**
	 * Check if hooks are enabled for this workspace
	 */
	async isEnabled(): Promise<boolean> {
		if (!this.config.enabled) {
			return false
		}
		return await this.contextLoader.isEnabled()
	}

	/**
	 * Set active intent ID
	 */
	setActiveIntent(intentId: string): void {
		if (!isValidIntentId(intentId)) {
			throw new Error(`Invalid intent ID format: ${intentId}`)
		}
		this.activeIntentId = intentId
	}

	/**
	 * Get active intent ID
	 */
	getActiveIntent(): string | undefined {
		return this.activeIntentId
	}

	/**
	 * Execute pre-hook before tool execution
	 */
	async executePreHook(context: HookContext): Promise<PreHookResult> {
		// If hooks not enabled, allow execution
		if (!(await this.isEnabled())) {
			return { allowed: true, blocked: false }
		}

		const { toolName, params, task } = context

		// Read-only tools are always allowed
		if (READ_TOOLS.includes(toolName)) {
			return { allowed: true, blocked: false }
		}

		// Check if this is a write tool
		if (WRITE_TOOLS.includes(toolName)) {
			return await this.handleWriteToolPreHook(context)
		}

		// Execute command requires special handling
		if (toolName === "execute_command") {
			return await this.handleExecuteCommandPreHook(context)
		}

		// Default: allow
		return { allowed: true, blocked: false }
	}

	/**
	 * Handle pre-hook for write tools
	 */
	private async handleWriteToolPreHook(context: HookContext): Promise<PreHookResult> {
		const { toolName, params, task } = context

		// Require intent selection
		if (this.config.requireIntentSelection && !this.activeIntentId) {
			return {
				allowed: false,
				blocked: true,
				error: `Intent selection required. You must call select_active_intent before using ${toolName}. This ensures proper context and traceability.`,
			}
		}

		// Extract file path from params
		const filePath = this.extractFilePath(toolName, params)
		if (!filePath) {
			// If we can't extract path, allow (tool will handle validation)
			return { allowed: true, blocked: false }
		}

		// Validate scope
		if (this.config.enableScopeValidation && this.activeIntentId) {
			const scopeResult = await this.validateScope(filePath, this.activeIntentId, task)

			if (!scopeResult.valid) {
				if (scopeResult.requiresApproval) {
					// Request human approval
					const approved = await this.requestApproval(
						`Scope Violation`,
						`Intent ${this.activeIntentId} is attempting to modify ${filePath}, which is outside its owned scope.\n\n` +
							`Reason: ${scopeResult.reason}\n\n` +
							`Do you want to allow this operation?`,
					)

					if (!approved) {
						return {
							allowed: false,
							blocked: true,
							error: `Scope violation: ${scopeResult.reason}. Operation denied by user.`,
						}
					}
				} else {
					return {
						allowed: false,
						blocked: true,
						error: `Scope violation: ${scopeResult.reason}`,
					}
				}
			}
		}

		// Concurrency control (optimistic locking)
		if (this.config.enableConcurrencyControl) {
			const absolutePath = path.resolve(task.cwd, filePath)
			const staleCheck = await this.checkStaleFile(absolutePath)

			if (!staleCheck.valid) {
				return {
					allowed: false,
					blocked: true,
					error: `Stale file detected: ${filePath} has been modified by another process. Please re-read the file and try again.`,
				}
			}
		}

		// Inject intent context if available
		let injectedContext: string | undefined
		if (this.activeIntentId) {
			const intentContext = await this.contextLoader.buildIntentContext(this.activeIntentId)
			if (intentContext) {
				injectedContext = this.contextLoader.formatContextForPrompt(intentContext)
			}
		}

		return {
			allowed: true,
			blocked: false,
			injectedContext,
		}
	}

	/**
	 * Handle pre-hook for execute_command
	 */
	private async handleExecuteCommandPreHook(context: HookContext): Promise<PreHookResult> {
		const { params } = context
		const command = params.command || ""

		// Check for destructive commands
		const destructivePatterns = [/rm\s+-rf/, /rm\s+.*\*/, /del\s+\/s/, /format\s+/, /mkfs/, /dd\s+if=/]

		const isDestructive = destructivePatterns.some((pattern) => pattern.test(command))

		if (isDestructive) {
			const approved = await this.requestApproval(
				`Destructive Command`,
				`The agent wants to execute a potentially destructive command:\n\n${command}\n\nDo you want to allow this?`,
			)

			if (!approved) {
				return {
					allowed: false,
					blocked: true,
					error: `Destructive command blocked by user: ${command}`,
				}
			}
		}

		return { allowed: true, blocked: false }
	}

	/**
	 * Execute post-hook after tool execution
	 */
	async executePostHook(context: HookContext, result: any, mutationClass?: MutationClass): Promise<PostHookResult> {
		// If hooks not enabled, skip
		if (!(await this.isEnabled())) {
			return { success: true }
		}

		const { toolName, params, task } = context

		// Only log write operations
		if (!WRITE_TOOLS.includes(toolName)) {
			return { success: true }
		}

		// Skip if no active intent
		if (!this.activeIntentId) {
			return { success: true }
		}

		// Skip if trace logging disabled
		if (!this.config.enableTraceLogging) {
			return { success: true }
		}

		try {
			const filePath = this.extractFilePath(toolName, params)
			if (!filePath) {
				return { success: true }
			}

			const absolutePath = path.resolve(task.cwd, filePath)

			// Read the file content to compute hash
			const fs = await import("fs/promises")
			const content = await fs.readFile(absolutePath, "utf-8")

			// Determine mutation class
			const finalMutationClass = mutationClass || this.inferMutationClass(toolName, params)

			// Get model identifier
			const modelId = task.api.getModel().id

			// Log to trace
			const traceEntry = await this.traceLogger.logFileModification({
				intentId: this.activeIntentId,
				mutationClass: finalMutationClass,
				filePath: absolutePath,
				content,
				startLine: 1,
				endLine: content.split("\n").length,
				sessionId: this.sessionId,
				modelIdentifier: modelId,
			})

			return { success: true, traceEntry }
		} catch (error: any) {
			console.error("Post-hook error:", error)
			return { success: false, error: error.message }
		}
	}

	/**
	 * Validate file scope against intent
	 */
	private async validateScope(filePath: string, intentId: string, task: Task): Promise<ScopeValidationResult> {
		const intent = await this.contextLoader.getIntent(intentId)

		if (!intent) {
			return {
				valid: false,
				reason: `Intent ${intentId} not found`,
				requiresApproval: false,
			}
		}

		const relativePath = getRelativePath(task.cwd, filePath)
		const inScope = matchesScope(relativePath, intent.owned_scope)

		if (!inScope) {
			return {
				valid: false,
				intent,
				reason: `File ${relativePath} is not in the owned scope of intent ${intentId}`,
				requiresApproval: true,
			}
		}

		return { valid: true, intent, requiresApproval: false }
	}

	/**
	 * Check if file has been modified (optimistic locking)
	 */
	private async checkStaleFile(absolutePath: string): Promise<{ valid: boolean }> {
		const cached = this.fileHashes.get(absolutePath)

		if (!cached) {
			// No cached hash, file is fresh
			return { valid: true }
		}

		try {
			const currentHash = await computeFileHash(absolutePath)

			if (currentHash !== cached.hash) {
				// File has been modified
				return { valid: false }
			}

			return { valid: true }
		} catch {
			// File doesn't exist or can't be read
			return { valid: true }
		}
	}

	/**
	 * Track file hash for concurrency control
	 */
	async trackFileHash(absolutePath: string): Promise<void> {
		try {
			const hash = await computeFileHash(absolutePath)
			this.fileHashes.set(absolutePath, {
				path: absolutePath,
				hash,
				timestamp: Date.now(),
			})
		} catch {
			// File doesn't exist yet, skip
		}
	}

	/**
	 * Request human approval via VS Code dialog
	 */
	private async requestApproval(title: string, message: string): Promise<boolean> {
		const result = await vscode.window.showWarningMessage(message, { modal: true }, "Approve", "Reject")
		return result === "Approve"
	}

	/**
	 * Extract file path from tool parameters
	 */
	private extractFilePath(toolName: ToolName, params: any): string | undefined {
		if (params.path) return params.path
		if (params.filePath) return params.filePath
		if (params.file_path) return params.file_path
		return undefined
	}

	/**
	 * Infer mutation class from tool and params
	 */
	private inferMutationClass(toolName: ToolName, params: any): MutationClass {
		// Simple heuristic - can be enhanced
		if (toolName === "write_to_file" && params.content?.includes("TODO")) {
			return "DOCUMENTATION"
		}

		if (toolName === "apply_diff" || toolName === "search_replace") {
			return "AST_REFACTOR"
		}

		return "INTENT_EVOLUTION"
	}

	/**
	 * Get context loader (for external access)
	 */
	getContextLoader(): IntentContextLoader {
		return this.contextLoader
	}

	/**
	 * Get trace logger (for external access)
	 */
	getTraceLogger(): TraceLogger {
		return this.traceLogger
	}
}
