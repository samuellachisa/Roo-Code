/**
 * TraceLogger
 *
 * Append-only writer to .orchestration/agent_trace.jsonl.
 * Implements Constitution Principle 7: "Trust debt is repaid cryptographically."
 *
 * Write semantics: one JSON line per entry, atomic append, no rotation.
 * Read semantics: best-effort, returns empty array if file is missing.
 */

import * as fs from "fs/promises"
import * as path from "path"
import { v4 as uuidv4 } from "uuid"

import type { TraceEntry, MutationClass } from "./types"

const TRACE_FILENAME = "agent_trace.jsonl"
const RETRY_DELAY_MS = 100

export class TraceLogger {
	private workspacePath: string

	constructor(workspacePath: string) {
		this.workspacePath = workspacePath
	}

	private get traceFilePath(): string {
		return path.join(this.workspacePath, ".orchestration", TRACE_FILENAME)
	}

	/**
	 * Create a new trace entry with auto-generated ID and timestamp.
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
	 * Append a trace entry to the JSONL ledger.
	 * Retries once on write failure. Never throws — governance gaps
	 * are preferable to blocked tool execution.
	 */
	async log(entry: TraceEntry): Promise<void> {
		const line = JSON.stringify(entry) + "\n"

		try {
			await fs.appendFile(this.traceFilePath, line, "utf-8")
		} catch (firstErr) {
			// Retry once after a short delay (file lock, etc.)
			try {
				await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
				await fs.appendFile(this.traceFilePath, line, "utf-8")
			} catch (retryErr) {
				console.error("[HookSystem] Failed to append trace entry after retry:", retryErr)
			}
		}
	}

	/**
	 * Read the most recent trace entries for a given intent.
	 * Returns empty array if the file doesn't exist or is unreadable.
	 */
	async getRecentEntries(intentId: string, limit: number = 20): Promise<TraceEntry[]> {
		try {
			const content = await fs.readFile(this.traceFilePath, "utf-8")
			const lines = content.trim().split("\n").filter(Boolean)
			const entries: TraceEntry[] = []

			for (const line of lines) {
				try {
					const entry = JSON.parse(line) as TraceEntry
					if (entry.intent_id === intentId) {
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

	/**
	 * Read all trace entries (for diagnostics/testing).
	 */
	async getAllEntries(): Promise<TraceEntry[]> {
		try {
			const content = await fs.readFile(this.traceFilePath, "utf-8")
			const lines = content.trim().split("\n").filter(Boolean)
			const entries: TraceEntry[] = []

			for (const line of lines) {
				try {
					entries.push(JSON.parse(line) as TraceEntry)
				} catch {
					// Skip malformed lines
				}
			}

			return entries
		} catch {
			return []
		}
	}
}
