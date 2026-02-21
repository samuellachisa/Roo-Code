/**
 * Type definitions for the Intent-Code Traceability Hook System.
 *
 * These types govern the contract between the HookEngine, IntentContextLoader,
 * TraceLogger, and BaseTool integration layer.
 */

export type IntentStatus = "PENDING" | "IN_PROGRESS" | "COMPLETE" | "BLOCKED" | "ARCHIVED"

export interface SpecReference {
	type: "speckit" | "github_issue" | "github_pr" | "constitution" | "external"
	ref: string
}

export type MutationClass =
	| "AST_REFACTOR"
	| "INTENT_EVOLUTION"
	| "BUG_FIX"
	| "DOCUMENTATION"
	| "CONFIGURATION"
	| "FILE_CREATION"
	| "FILE_DELETION"

export interface IntentSpec {
	id: string
	name: string
	status: IntentStatus
	version?: number
	owned_scope: string[]
	constraints: string[]
	acceptance_criteria: string[]
	related_specs?: SpecReference[]
	parent_intent?: string | null
	tags?: string[]
	created_at: string
	updated_at: string
}

export interface ActiveIntentsFile {
	active_intents: IntentSpec[]
}

export interface SpatialEntry {
	filePath: string
	intentId: string
	lastHash: string
	lastModified: string
}

export interface IntentContext {
	intent: IntentSpec
	relatedFiles: SpatialEntry[]
	recentTraceEntries: TraceEntry[]
	constraints: string[]
	acceptanceCriteria: string[]
	specExcerpts?: string[]
}

export interface PreToolContext {
	toolName: string
	filePath: string | null
	intentId: string | null
	params: Record<string, unknown>
	sessionId: string
}

export interface PostToolContext {
	toolName: string
	filePath: string | null
	intentId: string
	params: Record<string, unknown>
	sessionId: string
	preHash: string | null
	success: boolean
	error?: string
	modelIdentifier?: string
	startLine?: number
	endLine?: number
	relatedSpecs?: string[]
}

export interface HookResult {
	allowed: boolean
	reason?: string
	preHash?: string | null
	metadata?: Record<string, unknown>
}

/**
 * Full Agent Trace specification entry.
 * Implements spatial independence via content hashing and links
 * abstract Intent to concrete Code Hash.
 *
 * @see https://github.com/entire-io/agent-trace
 */
export interface AgentTraceEntry {
	id: string
	timestamp: string
	vcs: { revision_id: string | null }
	files: AgentTraceFile[]
}

export interface AgentTraceFile {
	relative_path: string
	conversations: AgentTraceConversation[]
}

export interface AgentTraceConversation {
	url: string
	contributor: {
		entity_type: "AI" | "Human"
		model_identifier: string
	}
	ranges: AgentTraceRange[]
	related: AgentTraceRelation[]
}

export interface AgentTraceRange {
	start_line: number
	end_line: number
	content_hash: string
}

export interface AgentTraceRelation {
	type: "specification" | "intent" | "parent_trace"
	value: string
}

/**
 * Internal trace entry used by the hook system pipeline.
 * Converted to AgentTraceEntry before being written to the ledger.
 */
export interface TraceEntry {
	id: string
	timestamp: string
	intent_id: string
	session_id: string
	tool_name: string
	mutation_class: MutationClass
	file: {
		relative_path: string
		pre_hash: string | null
		post_hash: string | null
	} | null
	scope_validation: "PASS" | "FAIL" | "EXEMPT"
	success: boolean
	error?: string
}

/**
 * Tools that mutate the workspace and require an active intent.
 */
export const WRITE_TOOLS: ReadonlySet<string> = new Set([
	"write_to_file",
	"apply_diff",
	"edit",
	"search_and_replace",
	"search_replace",
	"edit_file",
	"apply_patch",
	"insert_code_block",
])

/**
 * Destructive tools that require active intent + Human-in-the-Loop approval.
 * Arbitrary shell execution and file deletion can cause irreversible damage.
 */
export const DESTRUCTIVE_TOOLS: ReadonlySet<string> = new Set(["execute_command", "delete_file"])

/**
 * Tools exempt from intent validation (read-only or meta-tools).
 */
export const EXEMPT_TOOLS: ReadonlySet<string> = new Set([
	"read_file",
	"read_command_output",
	"list_files",
	"search_files",
	"codebase_search",
	"ask_followup_question",
	"attempt_completion",
	"switch_mode",
	"new_task",
	"update_todo_list",
	"run_slash_command",
	"select_active_intent",
	"use_mcp_tool",
	"access_mcp_resource",
	"browser_action",
	"skill",
	"generate_image",
	"custom_tool",
])
