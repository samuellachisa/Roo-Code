/**
 * Intent Context Loader
 *
 * Loads and manages intent context from .orchestration/active_intents.yaml
 */

import fs from "fs/promises"
import path from "path"
import type { ActiveIntent, ActiveIntentsDocument, IntentContext, AgentTraceEntry } from "./types"
import { parseYAML, readJSONL, isOrchestrationEnabled } from "./utils"

export class IntentContextLoader {
	private cwd: string
	private orchestrationDir: string
	private cachedIntents: Map<string, ActiveIntent> = new Map()
	private cacheTimestamp: number = 0
	private readonly CACHE_TTL = 5000 // 5 seconds

	constructor(cwd: string) {
		this.cwd = cwd
		this.orchestrationDir = path.join(cwd, ".orchestration")
	}

	/**
	 * Check if orchestration is enabled
	 */
	async isEnabled(): Promise<boolean> {
		return isOrchestrationEnabled(this.cwd)
	}

	/**
	 * Load all active intents from YAML
	 */
	async loadActiveIntents(): Promise<ActiveIntent[]> {
		const now = Date.now()

		// Return cached if still valid
		if (this.cachedIntents.size > 0 && now - this.cacheTimestamp < this.CACHE_TTL) {
			return Array.from(this.cachedIntents.values())
		}

		const intentsPath = path.join(this.orchestrationDir, "active_intents.yaml")

		try {
			const content = await fs.readFile(intentsPath, "utf-8")
			const doc: ActiveIntentsDocument = parseYAML(content)

			// Update cache
			this.cachedIntents.clear()
			for (const intent of doc.active_intents || []) {
				this.cachedIntents.set(intent.id, intent)
			}
			this.cacheTimestamp = now

			return doc.active_intents || []
		} catch (error: any) {
			if (error.code === "ENOENT") {
				// File doesn't exist yet - return empty array
				return []
			}
			throw new Error(`Failed to load active intents: ${error.message}`)
		}
	}

	/**
	 * Get a specific intent by ID
	 */
	async getIntent(intentId: string): Promise<ActiveIntent | undefined> {
		const intents = await this.loadActiveIntents()
		return intents.find((intent) => intent.id === intentId)
	}

	/**
	 * Get intents that own a specific file path
	 */
	async getIntentsForFile(filePath: string): Promise<ActiveIntent[]> {
		const intents = await this.loadActiveIntents()
		const { matchesScope } = await import("./utils")

		return intents.filter((intent) => matchesScope(filePath, intent.owned_scope))
	}

	/**
	 * Get recent trace entries for an intent
	 */
	async getRecentTraces(intentId: string, limit: number = 10): Promise<AgentTraceEntry[]> {
		const tracePath = path.join(this.orchestrationDir, "agent_trace.jsonl")

		try {
			const allTraces = await readJSONL(tracePath)

			// Filter by intent_id and get most recent
			const intentTraces = allTraces
				.filter((trace: AgentTraceEntry) => trace.intent_id === intentId)
				.sort(
					(a: AgentTraceEntry, b: AgentTraceEntry) =>
						new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
				)
				.slice(0, limit)

			return intentTraces
		} catch (error: any) {
			if (error.code === "ENOENT") {
				return []
			}
			throw new Error(`Failed to load trace entries: ${error.message}`)
		}
	}

	/**
	 * Get files related to an intent from trace history
	 */
	async getRelatedFiles(intentId: string): Promise<string[]> {
		const traces = await this.getRecentTraces(intentId, 50)
		const files = new Set<string>()

		for (const trace of traces) {
			for (const file of trace.files) {
				files.add(file.relative_path)
			}
		}

		return Array.from(files)
	}

	/**
	 * Build complete intent context for injection
	 */
	async buildIntentContext(intentId: string): Promise<IntentContext | undefined> {
		const intent = await this.getIntent(intentId)
		if (!intent) {
			return undefined
		}

		const [relatedFiles, recentTraces] = await Promise.all([
			this.getRelatedFiles(intentId),
			this.getRecentTraces(intentId, 5),
		])

		return {
			intent,
			relatedFiles,
			recentTraces,
			constraints: intent.constraints,
			acceptanceCriteria: intent.acceptance_criteria,
		}
	}

	/**
	 * Format intent context as XML for prompt injection
	 */
	formatContextForPrompt(context: IntentContext): string {
		const { intent, relatedFiles, recentTraces, constraints, acceptanceCriteria } = context

		let xml = `<intent_context>\n`
		xml += `  <intent_id>${intent.id}</intent_id>\n`
		xml += `  <intent_name>${intent.name}</intent_name>\n`
		xml += `  <status>${intent.status}</status>\n`

		xml += `  <owned_scope>\n`
		for (const pattern of intent.owned_scope) {
			xml += `    <pattern>${pattern}</pattern>\n`
		}
		xml += `  </owned_scope>\n`

		if (constraints.length > 0) {
			xml += `  <constraints>\n`
			for (const constraint of constraints) {
				xml += `    <constraint>${escapeXml(constraint)}</constraint>\n`
			}
			xml += `  </constraints>\n`
		}

		if (acceptanceCriteria.length > 0) {
			xml += `  <acceptance_criteria>\n`
			for (const criterion of acceptanceCriteria) {
				xml += `    <criterion>${escapeXml(criterion)}</criterion>\n`
			}
			xml += `  </acceptance_criteria>\n`
		}

		if (relatedFiles.length > 0) {
			xml += `  <related_files>\n`
			for (const file of relatedFiles.slice(0, 10)) {
				xml += `    <file>${file}</file>\n`
			}
			xml += `  </related_files>\n`
		}

		if (recentTraces.length > 0) {
			xml += `  <recent_changes>\n`
			for (const trace of recentTraces) {
				xml += `    <change>\n`
				xml += `      <timestamp>${trace.timestamp}</timestamp>\n`
				xml += `      <mutation_class>${trace.mutation_class}</mutation_class>\n`
				xml += `      <files>${trace.files.map((f) => f.relative_path).join(", ")}</files>\n`
				xml += `    </change>\n`
			}
			xml += `  </recent_changes>\n`
		}

		xml += `</intent_context>`

		return xml
	}

	/**
	 * Update intent status
	 */
	async updateIntentStatus(intentId: string, status: string): Promise<void> {
		const intents = await this.loadActiveIntents()
		const intent = intents.find((i) => i.id === intentId)

		if (!intent) {
			throw new Error(`Intent ${intentId} not found`)
		}

		intent.status = status as any
		intent.updated_at = new Date().toISOString()

		await this.saveActiveIntents(intents)
	}

	/**
	 * Save active intents back to YAML
	 */
	private async saveActiveIntents(intents: ActiveIntent[]): Promise<void> {
		const { stringifyYAML } = await import("./utils")
		const doc: ActiveIntentsDocument = { active_intents: intents }
		const yaml = stringifyYAML(doc)

		const intentsPath = path.join(this.orchestrationDir, "active_intents.yaml")
		await fs.writeFile(intentsPath, yaml, "utf-8")

		// Invalidate cache
		this.cachedIntents.clear()
		this.cacheTimestamp = 0
	}

	/**
	 * Clear cache (for testing)
	 */
	clearCache(): void {
		this.cachedIntents.clear()
		this.cacheTimestamp = 0
	}
}

/**
 * Escape XML special characters
 */
function escapeXml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;")
}
