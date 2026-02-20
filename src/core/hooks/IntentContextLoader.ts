/**
 * IntentContextLoader
 *
 * Reads active_intents.yaml, resolves intent specifications, and builds
 * curated context for the agent. Implements Constitution Principle 6:
 * "Context is curated, not dumped."
 */

import * as fs from "fs/promises"
import * as path from "path"
import YAML from "yaml"

import type { IntentSpec, IntentContext, ActiveIntentsFile, SpatialEntry, TraceEntry } from "./types"
import { IntentValidator } from "./IntentValidator"

const INTENTS_FILENAME = "active_intents.yaml"
const MAX_RECENT_TRACES = 20
const MAX_CONTEXT_BYTES = 16384 // ~4000 tokens
const MAX_SPEC_EXCERPT_BYTES = 2048

export class IntentContextLoader {
	private workspacePath: string
	private cachedIntents: IntentSpec[] | null = null
	private cacheTimestamp: number = 0
	private readonly cacheTtlMs = 5000

	constructor(workspacePath: string) {
		this.workspacePath = workspacePath
	}

	private get intentsFilePath(): string {
		return path.join(this.workspacePath, ".orchestration", INTENTS_FILENAME)
	}

	/**
	 * Force-reload the intents file from disk.
	 */
	async reload(): Promise<void> {
		this.cachedIntents = null
		this.cacheTimestamp = 0
		await this.loadIntents()
	}

	/**
	 * Load and cache the intents from active_intents.yaml.
	 */
	private async loadIntents(): Promise<IntentSpec[]> {
		const now = Date.now()
		if (this.cachedIntents !== null && now - this.cacheTimestamp < this.cacheTtlMs) {
			return this.cachedIntents
		}

		try {
			const raw = await fs.readFile(this.intentsFilePath, "utf-8")
			const parsed = YAML.parse(raw) as ActiveIntentsFile
			if (!parsed?.active_intents || !Array.isArray(parsed.active_intents)) {
				console.warn("[HookSystem] active_intents.yaml has no valid active_intents array")
				this.cachedIntents = []
			} else {
				const validator = new IntentValidator()
				this.cachedIntents = parsed.active_intents.filter((spec) => {
					const result = validator.validateIntentSpec(spec)
					if (!result.valid) {
						console.warn(`[HookSystem] Skipping invalid intent: ${result.errors.join(", ")}`)
					}
					if (result.warnings.length > 0) {
						console.warn(`[HookSystem] Intent warnings: ${result.warnings.join(", ")}`)
					}
					return result.valid
				})
			}
		} catch (err: unknown) {
			if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
				this.cachedIntents = []
			} else {
				console.error("[HookSystem] Failed to parse active_intents.yaml:", err)
				this.cachedIntents = []
			}
		}

		this.cacheTimestamp = now
		return this.cachedIntents
	}

	/**
	 * Retrieve a single intent by ID. Returns null if not found.
	 */
	async getIntent(intentId: string): Promise<IntentSpec | null> {
		const intents = await this.loadIntents()
		return intents.find((i) => i.id === intentId) ?? null
	}

	/**
	 * List all active intents.
	 */
	async getAllIntents(): Promise<IntentSpec[]> {
		return this.loadIntents()
	}

	/**
	 * Build the full curated context for a given intent.
	 * Loads intent spec, related files from the spatial map, and recent trace entries.
	 */
	async buildIntentContext(intentId: string, traceEntries: TraceEntry[] = []): Promise<IntentContext | null> {
		const intent = await this.getIntent(intentId)
		if (!intent) {
			return null
		}

		const relatedFiles = await this.loadSpatialEntries(intentId)
		const specExcerpts = await this.resolveRelatedSpecs(intent)

		const recentTraces = traceEntries.filter((e) => e.intent_id === intentId).slice(-MAX_RECENT_TRACES)

		const context: IntentContext = {
			intent,
			relatedFiles,
			recentTraceEntries: recentTraces,
			constraints: intent.constraints,
			acceptanceCriteria: intent.acceptance_criteria,
			specExcerpts: specExcerpts.length > 0 ? specExcerpts : undefined,
		}

		return this.truncateContext(context)
	}

	/**
	 * Resolve related_specs entries of type "speckit" or "constitution" by reading the files.
	 * Each excerpt is capped at MAX_SPEC_EXCERPT_BYTES.
	 */
	private async resolveRelatedSpecs(intent: IntentSpec): Promise<string[]> {
		if (!intent.related_specs || intent.related_specs.length === 0) {
			return []
		}

		const excerpts: string[] = []
		for (const ref of intent.related_specs) {
			if (ref.type !== "speckit" && ref.type !== "constitution") {
				continue
			}
			try {
				const specPath = path.join(this.workspacePath, ref.ref)
				const content = await fs.readFile(specPath, "utf-8")
				const truncated =
					content.length > MAX_SPEC_EXCERPT_BYTES
						? content.slice(0, MAX_SPEC_EXCERPT_BYTES) + "\n[...truncated]"
						: content
				excerpts.push(truncated)
			} catch {
				// Spec file not found — skip silently
			}
		}
		return excerpts
	}

	/**
	 * Load spatial entries for an intent from intent_map.md.
	 * Parses the markdown to extract file references under the intent's section.
	 */
	private async loadSpatialEntries(intentId: string): Promise<SpatialEntry[]> {
		const mapPath = path.join(this.workspacePath, ".orchestration", "intent_map.md")
		try {
			const content = await fs.readFile(mapPath, "utf-8")
			return this.parseSpatialMap(content, intentId)
		} catch {
			return []
		}
	}

	/**
	 * Parse intent_map.md and extract file references for a specific intent.
	 */
	private parseSpatialMap(content: string, intentId: string): SpatialEntry[] {
		const entries: SpatialEntry[] = []
		const lines = content.split("\n")
		let inSection = false

		for (const line of lines) {
			if (line.startsWith("## ") && line.includes(intentId)) {
				inSection = true
				continue
			}
			if (inSection && line.startsWith("## ")) {
				break
			}
			if (inSection && line.startsWith("- `")) {
				const match = line.match(/^- `([^`]+)`/)
				if (match) {
					entries.push({
						filePath: match[1],
						intentId,
						lastHash: "",
						lastModified: "",
					})
				}
			}
		}

		return entries
	}

	/**
	 * Truncate context to stay within token budget.
	 * Drops trace entries first, then related files.
	 */
	private truncateContext(context: IntentContext): IntentContext {
		let serialized = JSON.stringify(context)
		if (serialized.length <= MAX_CONTEXT_BYTES) {
			return context
		}

		// Tier 1: Truncate trace entries first
		while (context.recentTraceEntries.length > 0 && serialized.length > MAX_CONTEXT_BYTES) {
			context.recentTraceEntries.shift()
			serialized = JSON.stringify(context)
		}

		// Tier 2: Truncate spec excerpts
		if (context.specExcerpts) {
			while (context.specExcerpts.length > 0 && serialized.length > MAX_CONTEXT_BYTES) {
				context.specExcerpts.shift()
				serialized = JSON.stringify(context)
			}
			if (context.specExcerpts.length === 0) {
				context.specExcerpts = undefined
			}
		}

		// Tier 3: Truncate related files
		while (context.relatedFiles.length > 0 && serialized.length > MAX_CONTEXT_BYTES) {
			context.relatedFiles.shift()
			serialized = JSON.stringify(context)
		}

		return context
	}

	/**
	 * Format intent context as XML for injection into the agent's system prompt.
	 */
	formatContextForPrompt(context: IntentContext): string {
		const { intent, relatedFiles, constraints, acceptanceCriteria, specExcerpts } = context

		const parts = [
			`<intent_context id="${intent.id}" name="${intent.name}" status="${intent.status}"${intent.version ? ` version="${intent.version}"` : ""}>`,
			`  <scope>`,
			...intent.owned_scope.map((s) => `    <pattern>${s}</pattern>`),
			`  </scope>`,
			`  <constraints>`,
			...constraints.map((c) => `    <constraint>${c}</constraint>`),
			`  </constraints>`,
			`  <acceptance_criteria>`,
			...acceptanceCriteria.map((a) => `    <criterion>${a}</criterion>`),
			`  </acceptance_criteria>`,
		]

		if (relatedFiles.length > 0) {
			parts.push(`  <related_files>`)
			for (const f of relatedFiles) {
				parts.push(`    <file path="${f.filePath}" />`)
			}
			parts.push(`  </related_files>`)
		}

		if (specExcerpts && specExcerpts.length > 0) {
			parts.push(`  <related_specs>`)
			for (const excerpt of specExcerpts) {
				parts.push(`    <spec_excerpt>`)
				parts.push(`      ${excerpt.split("\n").slice(0, 5).join("\n      ")}`)
				parts.push(`    </spec_excerpt>`)
			}
			parts.push(`  </related_specs>`)
		}

		parts.push(`</intent_context>`)
		return parts.join("\n")
	}
}
