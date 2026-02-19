/**
 * Trace Logger
 *
 * Logs agent actions to .orchestration/agent_trace.jsonl
 * Implements the Agent Trace specification for spatial independence
 */

import path from "path"
import type { AgentTraceEntry, AgentTraceFile, AgentTraceConversation, AgentTraceRange, MutationClass } from "./types"
import {
	generateUUID,
	getCurrentTimestamp,
	getGitRevision,
	computeContentHash,
	appendToJSONL,
	getRelativePath,
} from "./utils"

export interface TraceLogEntry {
	intentId: string
	mutationClass: MutationClass
	filePath: string
	content: string
	startLine: number
	endLine: number
	sessionId: string
	modelIdentifier: string
}

export class TraceLogger {
	private cwd: string
	private orchestrationDir: string

	constructor(cwd: string) {
		this.cwd = cwd
		this.orchestrationDir = path.join(cwd, ".orchestration")
	}

	/**
	 * Log a file modification to the trace
	 */
	async logFileModification(entry: TraceLogEntry): Promise<AgentTraceEntry> {
		const { intentId, mutationClass, filePath, content, startLine, endLine, sessionId, modelIdentifier } = entry

		// Compute content hash for spatial independence
		const contentHash = computeContentHash(content)

		// Get Git revision
		const gitRevision = await getGitRevision(this.cwd)

		// Get relative path
		const relativePath = getRelativePath(this.cwd, filePath)

		// Build trace entry
		const traceEntry: AgentTraceEntry = {
			id: generateUUID(),
			timestamp: getCurrentTimestamp(),
			intent_id: intentId,
			mutation_class: mutationClass,
			vcs: {
				revision_id: gitRevision,
			},
			files: [
				{
					relative_path: relativePath,
					conversations: [
						{
							url: sessionId,
							contributor: {
								entity_type: "AI",
								model_identifier: modelIdentifier,
							},
							ranges: [
								{
									start_line: startLine,
									end_line: endLine,
									content_hash: contentHash,
								},
							],
							related: [
								{
									type: "specification",
									value: intentId,
								},
							],
						},
					],
				},
			],
		}

		// Append to JSONL
		const tracePath = path.join(this.orchestrationDir, "agent_trace.jsonl")
		await appendToJSONL(tracePath, traceEntry)

		return traceEntry
	}

	/**
	 * Log multiple file modifications in a single trace entry
	 */
	async logMultiFileModification(
		intentId: string,
		mutationClass: MutationClass,
		files: Array<{
			filePath: string
			content: string
			startLine: number
			endLine: number
		}>,
		sessionId: string,
		modelIdentifier: string,
	): Promise<AgentTraceEntry> {
		const gitRevision = await getGitRevision(this.cwd)

		const traceFiles: AgentTraceFile[] = []

		for (const file of files) {
			const contentHash = computeContentHash(file.content)
			const relativePath = getRelativePath(this.cwd, file.filePath)

			traceFiles.push({
				relative_path: relativePath,
				conversations: [
					{
						url: sessionId,
						contributor: {
							entity_type: "AI",
							model_identifier: modelIdentifier,
						},
						ranges: [
							{
								start_line: file.startLine,
								end_line: file.endLine,
								content_hash: contentHash,
							},
						],
						related: [
							{
								type: "specification",
								value: intentId,
							},
						],
					},
				],
			})
		}

		const traceEntry: AgentTraceEntry = {
			id: generateUUID(),
			timestamp: getCurrentTimestamp(),
			intent_id: intentId,
			mutation_class: mutationClass,
			vcs: {
				revision_id: gitRevision,
			},
			files: traceFiles,
		}

		const tracePath = path.join(this.orchestrationDir, "agent_trace.jsonl")
		await appendToJSONL(tracePath, traceEntry)

		return traceEntry
	}

	/**
	 * Query traces by intent ID
	 */
	async getTracesByIntent(intentId: string): Promise<AgentTraceEntry[]> {
		const { readJSONL } = await import("./utils")
		const tracePath = path.join(this.orchestrationDir, "agent_trace.jsonl")

		const allTraces = await readJSONL(tracePath)
		return allTraces.filter((trace: AgentTraceEntry) => trace.intent_id === intentId)
	}

	/**
	 * Query traces by file path
	 */
	async getTracesByFile(filePath: string): Promise<AgentTraceEntry[]> {
		const { readJSONL } = await import("./utils")
		const tracePath = path.join(this.orchestrationDir, "agent_trace.jsonl")
		const relativePath = getRelativePath(this.cwd, filePath)

		const allTraces = await readJSONL(tracePath)
		return allTraces.filter((trace: AgentTraceEntry) =>
			trace.files.some((file) => file.relative_path === relativePath),
		)
	}

	/**
	 * Get trace statistics
	 */
	async getTraceStats(): Promise<{
		totalTraces: number
		byIntent: Record<string, number>
		byMutationClass: Record<string, number>
		filesModified: number
	}> {
		const { readJSONL } = await import("./utils")
		const tracePath = path.join(this.orchestrationDir, "agent_trace.jsonl")

		const allTraces = await readJSONL(tracePath)

		const byIntent: Record<string, number> = {}
		const byMutationClass: Record<string, number> = {}
		const filesSet = new Set<string>()

		for (const trace of allTraces) {
			// Count by intent
			byIntent[trace.intent_id] = (byIntent[trace.intent_id] || 0) + 1

			// Count by mutation class
			byMutationClass[trace.mutation_class] = (byMutationClass[trace.mutation_class] || 0) + 1

			// Track unique files
			for (const file of trace.files) {
				filesSet.add(file.relative_path)
			}
		}

		return {
			totalTraces: allTraces.length,
			byIntent,
			byMutationClass,
			filesModified: filesSet.size,
		}
	}
}
