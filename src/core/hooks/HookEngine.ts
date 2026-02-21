/**
 * HookEngine
 *
 * Singleton coordinator for the Intent-Code Traceability system.
 * Manages intent state, dispatches PreToolUse/PostToolUse hooks,
 * and orchestrates the trace pipeline.
 *
 * State machine: UNINITIALIZED → IDLE → ACTIVE → IDLE
 *
 * Fail-open: if any hook component throws, the tool executes normally
 * and the failure is logged. Governance gaps are preferable to blocked developers.
 */

import * as fs from "fs/promises"
import * as path from "path"

import type { PreToolContext, PostToolContext, HookResult } from "./types"
import { WRITE_TOOLS, EXEMPT_TOOLS, DESTRUCTIVE_TOOLS } from "./types"
import { IntentContextLoader } from "./IntentContextLoader"
import { TraceLogger } from "./TraceLogger"
import { SpatialMapWriter } from "./SpatialMapWriter"
import { IntentIgnore } from "./IntentIgnore"
import { LessonRecorder } from "./LessonRecorder"
import { HITLGate } from "./HITLGate"
import { computeFileHash, isInScope, toRelativePath, classifyMutation } from "./utils"

type EngineState = "UNINITIALIZED" | "IDLE" | "ACTIVE"

export class HookEngine {
	private static instances: Map<string, HookEngine> = new Map()

	private workspacePath: string
	private sessionId: string
	private state: EngineState = "UNINITIALIZED"
	private activeIntentId: string | null = null
	private contextLoader: IntentContextLoader
	private traceLogger: TraceLogger
	private intentIgnore: IntentIgnore
	private lessonRecorder: LessonRecorder
	private fileHashCache = new Map<string, string>()
	private enabledCache: boolean | null = null
	private enabledCacheTimestamp: number = 0
	private readonly enabledCacheTtlMs = 5000

	private constructor(workspacePath: string, sessionId: string) {
		this.workspacePath = workspacePath
		this.sessionId = sessionId
		this.contextLoader = new IntentContextLoader(workspacePath)
		this.traceLogger = new TraceLogger(workspacePath)
		this.intentIgnore = new IntentIgnore(workspacePath)
		this.lessonRecorder = new LessonRecorder(workspacePath)
		this.state = "IDLE"
	}

	/**
	 * Get or create a HookEngine instance keyed by workspace + session.
	 */
	static getInstance(workspacePath: string, sessionId: string): HookEngine {
		const key = `${workspacePath}::${sessionId}`
		let instance = HookEngine.instances.get(key)
		if (!instance) {
			instance = new HookEngine(workspacePath, sessionId)
			HookEngine.instances.set(key, instance)
		}
		return instance
	}

	/**
	 * Clear all instances (for testing).
	 */
	static clearInstances(): void {
		HookEngine.instances.clear()
	}

	/**
	 * Check if the orchestration system is enabled:
	 * 1. .orchestration/ directory exists
	 * 2. active_intents.yaml is present and parseable
	 */
	async isEnabled(): Promise<boolean> {
		const now = Date.now()
		if (this.enabledCache !== null && now - this.enabledCacheTimestamp < this.enabledCacheTtlMs) {
			return this.enabledCache
		}

		try {
			const orchestrationDir = path.join(this.workspacePath, ".orchestration")
			const stat = await fs.stat(orchestrationDir)
			if (!stat.isDirectory()) {
				this.enabledCache = false
				this.enabledCacheTimestamp = now
				return false
			}

			const intentsPath = path.join(orchestrationDir, "active_intents.yaml")
			await fs.access(intentsPath)

			// Load .intentignore on first enable check
			if (this.enabledCache !== true) {
				await this.intentIgnore.load()
			}

			this.enabledCache = true
			this.enabledCacheTimestamp = now
			return true
		} catch {
			this.enabledCache = false
			this.enabledCacheTimestamp = now
			return false
		}
	}

	// --- Intent Management ---

	setActiveIntent(intentId: string): void {
		this.activeIntentId = intentId
		this.state = "ACTIVE"
	}

	getActiveIntent(): string | null {
		return this.activeIntentId
	}

	clearActiveIntent(): void {
		this.activeIntentId = null
		this.state = "IDLE"
	}

	getContextLoader(): IntentContextLoader {
		return this.contextLoader
	}

	getTraceLogger(): TraceLogger {
		return this.traceLogger
	}

	// --- Hook Dispatch ---

	/**
	 * PreToolUse: gate that validates intent, scope, and acquires optimistic lock.
	 *
	 * Validation chain (short-circuits on first failure):
	 * 1. Exempt tool check → allow without intent
	 * 2. Intent existence check
	 * 3. Intent validity (not COMPLETED/ABANDONED)
	 * 4. Scope validation (file path matches owned_scope globs)
	 * 5. Optimistic lock acquisition (compute pre-mutation hash)
	 */
	async preToolUse(context: PreToolContext): Promise<HookResult> {
		const { toolName, filePath, intentId } = context

		// Step 1: Exempt tools pass through without validation
		if (EXEMPT_TOOLS.has(toolName)) {
			return { allowed: true, metadata: { exempt: true } }
		}

		// Step 2: Destructive tools (execute_command, delete_file) require intent + HITL
		if (DESTRUCTIVE_TOOLS.has(toolName)) {
			if (!intentId) {
				return {
					allowed: false,
					reason:
						`No active intent. Call select_active_intent(intent_id) before using ${toolName}. ` +
						`Destructive commands require intent context for auditability.`,
				}
			}
			const intent = await this.contextLoader.getIntent(intentId)
			if (!intent) {
				return { allowed: false, reason: `Intent "${intentId}" not found in active_intents.yaml.` }
			}
			if (intent.status !== "IN_PROGRESS") {
				return {
					allowed: false,
					reason: `Intent "${intentId}" has status "${intent.status}". Only IN_PROGRESS intents can run destructive commands.`,
				}
			}
			const decision = await HITLGate.requestApproval({
				toolName,
				intentId,
				filePath,
			})
			if (!decision.approved) {
				return { allowed: false, reason: decision.reason }
			}
			return { allowed: true, metadata: { destructive: true } }
		}

		// Step 3: Write tools require an active intent
		if (WRITE_TOOLS.has(toolName) && !intentId) {
			return {
				allowed: false,
				reason:
					`No active intent. Call select_active_intent(intent_id) before using ${toolName}. ` +
					`Available intents are defined in .orchestration/active_intents.yaml.`,
			}
		}

		// Non-write, non-exempt tools — allow but log
		if (!WRITE_TOOLS.has(toolName)) {
			return { allowed: true, metadata: { unclassified: true } }
		}

		// Step 4: Validate intent exists and is actionable
		const intent = await this.contextLoader.getIntent(intentId!)
		if (!intent) {
			return {
				allowed: false,
				reason: `Intent "${intentId}" not found in active_intents.yaml.`,
			}
		}

		if (intent.status !== "IN_PROGRESS") {
			const statusMessages: Record<string, string> = {
				PENDING: `Intent "${intentId}" is PENDING. Call select_active_intent() to activate it.`,
				BLOCKED: `Intent "${intentId}" is BLOCKED. Resolve the blocker before continuing.`,
				COMPLETE: `Intent "${intentId}" is COMPLETE. No further mutations allowed.`,
				ARCHIVED: `Intent "${intentId}" is ARCHIVED and cannot be selected.`,
			}
			return {
				allowed: false,
				reason: statusMessages[intent.status] ?? `Intent "${intentId}" has status "${intent.status}".`,
			}
		}

		// Step 5: Scope validation (skip for .intentignore'd files)
		if (filePath) {
			const relativePath = path.isAbsolute(filePath) ? toRelativePath(filePath, this.workspacePath) : filePath

			if (this.intentIgnore.isIgnored(relativePath)) {
				return { allowed: true, metadata: { intentIgnored: true } }
			}

			if (!isInScope(relativePath, intent.owned_scope)) {
				this.lessonRecorder
					.recordScopeViolation(intentId!, toolName, relativePath)
					.catch((err) => console.error("[HookSystem] Failed to record lesson:", err))
				return {
					allowed: false,
					reason:
						`Scope violation: "${relativePath}" is not in ${intentId}'s owned_scope ` +
						`[${intent.owned_scope.join(", ")}]. ` +
						`Amend the intent's owned_scope in active_intents.yaml to include this path.`,
				}
			}
		}

		// Step 6: HITL gate (for delete_file if ever added to WRITE_TOOLS)
		if (HITLGate.isDestructive(toolName)) {
			const decision = await HITLGate.requestApproval({
				toolName,
				intentId: intentId!,
				filePath,
			})
			if (!decision.approved) {
				return { allowed: false, reason: decision.reason }
			}
		}

		// Step 7: Optimistic lock — compute pre-mutation hash + stale file detection
		let preHash: string | null = null
		if (filePath) {
			const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(this.workspacePath, filePath)
			preHash = await computeFileHash(absolutePath)

			const relativePath2 = path.isAbsolute(filePath) ? toRelativePath(filePath, this.workspacePath) : filePath

			if (preHash && WRITE_TOOLS.has(toolName)) {
				const cachedHash = this.fileHashCache.get(relativePath2)
				if (cachedHash && cachedHash !== preHash) {
					this.lessonRecorder
						.recordHashMismatch(intentId!, toolName, relativePath2)
						.catch((err) => console.error("[HookSystem] Failed to record lesson:", err))
					return {
						allowed: false,
						reason:
							`Stale file: "${relativePath2}" was modified since last read. ` +
							`Expected hash ${cachedHash.slice(0, 12)}... but found ${preHash.slice(0, 12)}... ` +
							`Re-read the file before writing.`,
					}
				}
				this.fileHashCache.set(relativePath2, preHash)
			}
		}

		return { allowed: true, preHash }
	}

	/**
	 * PostToolUse: records the mutation to the audit ledger in full Agent Trace format.
	 *
	 * Processing chain:
	 * 1. Compute post-mutation hash (spatial independence via content hashing)
	 * 2. Classify mutation
	 * 3. Build internal trace entry
	 * 4. Append to agent_trace.jsonl as AgentTraceEntry (with vcs, conversations, ranges)
	 * 5. Update spatial map on INTENT_EVOLUTION
	 */
	async postToolUse(context: PostToolContext): Promise<HookResult> {
		const {
			toolName,
			filePath,
			intentId,
			preHash,
			success,
			error,
			sessionId,
			modelIdentifier,
			startLine,
			endLine,
			relatedSpecs,
			params,
		} = context

		// Exempt tools don't get traced
		if (EXEMPT_TOOLS.has(toolName)) {
			return { allowed: true }
		}

		let postHash: string | null = null
		let relativePath: string | null = null

		if (filePath) {
			const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(this.workspacePath, filePath)
			postHash = await computeFileHash(absolutePath)
			relativePath = path.isAbsolute(filePath) ? toRelativePath(filePath, this.workspacePath) : filePath
		}

		// Use agent-provided mutation_class if valid, otherwise infer
		const validMutationClasses = [
			"AST_REFACTOR",
			"INTENT_EVOLUTION",
			"BUG_FIX",
			"DOCUMENTATION",
			"CONFIGURATION",
			"FILE_CREATION",
			"FILE_DELETION",
		] as const
		const agentClass = params?.mutation_class
		const mutationClass =
			typeof agentClass === "string" &&
			validMutationClasses.includes(agentClass as (typeof validMutationClasses)[number])
				? (agentClass as (typeof validMutationClasses)[number])
				: classifyMutation(toolName, relativePath, preHash)
		const scopeValidation = WRITE_TOOLS.has(toolName) ? "PASS" : "EXEMPT"

		const entry = this.traceLogger.createEntry({
			intentId,
			sessionId,
			toolName,
			mutationClass,
			filePath: relativePath,
			preHash,
			postHash,
			scopeValidation,
			success,
			error,
		})

		// Resolve related spec IDs from the active intent
		let resolvedRelatedSpecs = relatedSpecs
		if (!resolvedRelatedSpecs) {
			try {
				const intent = await this.contextLoader.getIntent(intentId)
				if (intent?.related_specs) {
					resolvedRelatedSpecs = intent.related_specs.filter((s) => s.type === "speckit").map((s) => s.ref)
				}
			} catch {
				// Non-critical — proceed without spec links
			}
		}

		try {
			await this.traceLogger.log(entry, {
				modelIdentifier,
				startLine,
				endLine,
				relatedSpecs: resolvedRelatedSpecs,
			})
		} catch (logErr) {
			console.error("[HookSystem] Failed to log trace entry:", logErr)
		}

		// Detect stale file (concurrent modification by another session)
		if (preHash && postHash && preHash === postHash && success && WRITE_TOOLS.has(toolName)) {
			console.warn(`[HookSystem] Suspicious: preHash == postHash after write to ${relativePath}`)
		}

		// Update spatial map for successful write operations
		if (success && relativePath && WRITE_TOOLS.has(toolName)) {
			try {
				const intent = await this.contextLoader.getIntent(intentId)
				await SpatialMapWriter.addFileToIntent(
					intentId,
					relativePath,
					this.workspacePath,
					intent?.name,
					mutationClass,
				)
			} catch (mapErr) {
				console.error("[HookSystem] Failed to update spatial map:", mapErr)
			}
		}

		// Update hash cache for stale file detection
		if (postHash && relativePath) {
			this.fileHashCache.set(relativePath, postHash)
		}

		// Record lesson on failure
		if (!success && error && relativePath) {
			this.lessonRecorder
				.recordLesson({
					intentId,
					toolName,
					description: `Tool execution failed on \`${relativePath}\`: ${error}`,
					category: "Tool Execution Failure",
				})
				.catch((err) => console.error("[HookSystem] Failed to record lesson:", err))
		}

		return { allowed: true, preHash: postHash }
	}
}
