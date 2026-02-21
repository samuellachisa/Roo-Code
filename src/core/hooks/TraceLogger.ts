/**
 * TraceLogger
 *
 * Append-only writer to .orchestration/agent_trace.jsonl.
 * Implements Constitution Principle 7: "Trust debt is repaid cryptographically."
 *
 * Writes entries in the full Agent Trace specification format, ensuring
 * spatial independence via content hashing and linking abstract Intent
 * to concrete Code Hash.
 *
 * @see https://github.com/entire-io/agent-trace
 */

import * as fs from "fs/promises"
import * as path from "path"
import { v4 as uuidv4 } from "uuid"

import type { TraceEntry, AgentTraceEntry, MutationClass } from "./types"
import { GitUtils } from "./GitUtils"

const TRACE_FILENAME = "agent_trace.jsonl"
const RETRY_DELAY_MS = 100

export class TraceLogger {
	private workspacePath: string
	private gitUtils: GitUtils

	constructor(workspacePath: string) {
		this.workspacePath = workspacePath
		this.gitUtils = new GitUtils(workspacePath)
	}

	private get traceFilePath(): string {
		return path.join(this.workspacePath, ".orchestration", TRACE_FILENAME)
	}

	/**
	 * Create a new internal trace entry with auto-generated ID and timestamp.
	 */
	createEntry(params: {
		intentId: string
		sessionId: string
		toolName: string
		mutationClass: MutationClass
		filePath: string | null
		preHash: string | null
		postHash: string | null
		scopeValidation: "PASS" | "FAIL" | "EXEMPT"
		success: boolean
		error?: string
	}): TraceEntry {
		return {
			id: uuidv4(),
			timestamp: new Date().toISOString(),
			intent_id: params.intentId,
			session_id: params.sessionId,
			tool_name: params.toolName,
			mutation_class: params.mutationClass,
			file: params.filePath
				? {
						relative_path: params.filePath,
						pre_hash: params.preHash,
						post_hash: params.postHash,
					}
				: null,
			scope_validation: params.scopeValidation,
			success: params.success,
			error: params.error,
		}
	}

	/**
	 * Convert an internal TraceEntry to the full Agent Trace specification format.
	 * Fetches git SHA for `vcs.revision_id` and builds the nested
	 * conversations/ranges/related structure.
	 */
	async toAgentTraceEntry(
		entry: TraceEntry,
		opts?: {
			modelIdentifier?: string
			startLine?: number
			endLine?: number
			relatedSpecs?: string[]
		},
	): Promise<AgentTraceEntry> {
		const gitSha = await this.gitUtils.getCurrentSha()

		const related: { type: "specification" | "intent" | "parent_trace"; value: string }[] = [
			{ type: "intent", value: entry.intent_id },
		]

		if (opts?.relatedSpecs) {
			for (const spec of opts.relatedSpecs) {
				related.push({ type: "specification", value: spec })
			}
		}

		const agentTrace: AgentTraceEntry = {
			id: entry.id,
			timestamp: entry.timestamp,
			vcs: { revision_id: gitSha },
			files: [],
		}

		if (entry.file) {
			const contentHash = entry.file.post_hash ?? entry.file.pre_hash ?? ""
			const ranges = contentHash
				? [
						{
							start_line: opts?.startLine ?? 1,
							end_line: opts?.endLine ?? 1,
							content_hash: contentHash,
						},
					]
				: []

			agentTrace.files.push({
				relative_path: entry.file.relative_path,
				conversations: [
					{
						url: entry.session_id,
						contributor: {
							entity_type: "AI" as const,
							model_identifier: opts?.modelIdentifier ?? "unknown",
						},
						ranges,
						related,
					},
				],
			})
		}

		return agentTrace
	}

	/**
	 * Append a trace entry to the JSONL ledger in Agent Trace format.
	 * Never throws — governance gaps are preferable to blocked tool execution.
	 */
	async log(
		entry: TraceEntry,
		opts?: {
			modelIdentifier?: string
			startLine?: number
			endLine?: number
			relatedSpecs?: string[]
		},
	): Promise<void> {
		const agentTraceEntry = await this.toAgentTraceEntry(entry, opts)
		const line = JSON.stringify(agentTraceEntry) + "\n"

		try {
			await fs.appendFile(this.traceFilePath, line, "utf-8")
		} catch (firstErr) {
			try {
				await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
				await fs.appendFile(this.traceFilePath, line, "utf-8")
			} catch (retryErr) {
				console.error("[TraceLogger] Failed to append trace entry after retry:", retryErr)
			}
		}
	}

	/**
	 * Read the most recent trace entries for a given intent.
	 * Parses AgentTraceEntry format and filters by intent (via related[].value).
	 * Returns empty array if the file doesn't exist or is unreadable.
	 */
	async getRecentEntries(intentId: string, limit: number = 20): Promise<TraceEntry[]> {
		return this.readJsonlEntries(intentId, limit)
	}

	/**
	 * Read all trace entries (for diagnostics/testing).
	 */
	async getAllEntries(): Promise<TraceEntry[]> {
		return this.readJsonlEntries(undefined, Infinity)
	}

	/**
	 * Read all raw Agent Trace entries from the ledger.
	 */
	async getAllAgentTraceEntries(): Promise<AgentTraceEntry[]> {
		return this.readJsonlAgentTraceEntries()
	}

	// --- Private helpers ---

	private agentTraceToInternal(at: AgentTraceEntry): TraceEntry | null {
		const file = at.files?.[0]
		const conversation = file?.conversations?.[0]
		const related = conversation?.related ?? []
		const entryIntentId = related.find((r) => r.type === "intent")?.value ?? ""
		const range = conversation?.ranges?.[0]

		return {
			id: at.id,
			timestamp: at.timestamp,
			intent_id: entryIntentId,
			session_id: conversation?.url ?? "",
			tool_name: "",
			mutation_class: "INTENT_EVOLUTION",
			file: file
				? {
						relative_path: file.relative_path,
						pre_hash: null,
						post_hash: range?.content_hash ?? null,
					}
				: null,
			scope_validation: "PASS",
			success: true,
		}
	}

	private async readJsonlEntries(intentId: string | undefined, limit: number): Promise<TraceEntry[]> {
		try {
			const content = await fs.readFile(this.traceFilePath, "utf-8")
			const lines = content.trim().split("\n").filter(Boolean)
			const entries: TraceEntry[] = []

			for (const line of lines) {
				try {
					const parsed = JSON.parse(line)
					const entry = this.parseTraceEntry(parsed, intentId)
					if (entry) {
						entries.push(entry)
					}
				} catch {
					// Skip malformed lines
				}
			}

			return entries.slice(-limit)
		} catch {
			return []
		}
	}

	private async readJsonlAgentTraceEntries(): Promise<AgentTraceEntry[]> {
		try {
			const content = await fs.readFile(this.traceFilePath, "utf-8")
			const lines = content.trim().split("\n").filter(Boolean)
			const entries: AgentTraceEntry[] = []

			for (const line of lines) {
				try {
					entries.push(JSON.parse(line) as AgentTraceEntry)
				} catch {
					// Skip malformed lines
				}
			}

			return entries
		} catch {
			return []
		}
	}

	private parseTraceEntry(raw: Record<string, unknown>, intentId?: string): TraceEntry | null {
		if (raw.vcs && Array.isArray(raw.files)) {
			return this.parseAgentTraceFormat(raw as unknown as AgentTraceEntry, intentId)
		}

		if (typeof raw.intent_id === "string") {
			if (intentId && raw.intent_id !== intentId) {
				return null
			}
			return raw as unknown as TraceEntry
		}

		return null
	}

	private parseAgentTraceFormat(at: AgentTraceEntry, intentId?: string): TraceEntry | null {
		const file = at.files?.[0]
		const conversation = file?.conversations?.[0]
		const related = conversation?.related ?? []
		const entryIntentId = related.find((r) => r.type === "intent")?.value ?? ""

		if (intentId && entryIntentId !== intentId) {
			return null
		}

		const range = conversation?.ranges?.[0]

		return {
			id: at.id,
			timestamp: at.timestamp,
			intent_id: entryIntentId,
			session_id: conversation?.url ?? "",
			tool_name: "",
			mutation_class: "INTENT_EVOLUTION",
			file: file
				? {
						relative_path: file.relative_path,
						pre_hash: null,
						post_hash: range?.content_hash ?? null,
					}
				: null,
			scope_validation: "PASS",
			success: true,
		}
	}
}
