/**
 * Hook System Types
 *
 * Defines the type system for the Intent-Code Traceability Hook Engine
 */

import type { ToolName } from "@roo-code/types"
import type { Task } from "../task/Task"

/**
 * Mutation classification for semantic tracking
 */
export type MutationClass =
	| "AST_REFACTOR" // Syntax change, same intent
	| "INTENT_EVOLUTION" // New feature or behavior change
	| "BUG_FIX" // Defect correction
	| "DOCUMENTATION" // Comment/doc changes only
	| "CONFIGURATION" // Config file changes

/**
 * Intent status lifecycle
 */
export type IntentStatus = "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "BLOCKED" | "ABANDONED"

/**
 * Active Intent specification
 */
export interface ActiveIntent {
	id: string
	name: string
	status: IntentStatus
	owned_scope: string[] // Glob patterns for files this intent owns
	constraints: string[] // Business rules and technical constraints
	acceptance_criteria: string[] // Definition of done
	created_at: string
	updated_at: string
	parent_intent_id?: string // For hierarchical intents
	related_intents?: string[] // Cross-references
}

/**
 * Active intents collection
 */
export interface ActiveIntentsDocument {
	active_intents: ActiveIntent[]
}

/**
 * Agent trace entry (follows Agent Trace specification)
 */
export interface AgentTraceEntry {
	id: string // UUID v4
	timestamp: string // ISO 8601
	intent_id: string // Reference to active intent
	mutation_class: MutationClass
	vcs: {
		revision_id: string // Git SHA
	}
	files: AgentTraceFile[]
}

export interface AgentTraceFile {
	relative_path: string
	conversations: AgentTraceConversation[]
}

export interface AgentTraceConversation {
	url: string // Session/task ID
	contributor: {
		entity_type: "AI" | "HUMAN"
		model_identifier?: string
	}
	ranges: AgentTraceRange[]
	related: AgentTraceRelation[]
}

export interface AgentTraceRange {
	start_line: number
	end_line: number
	content_hash: string // SHA-256 for spatial independence
}

export interface AgentTraceRelation {
	type: "specification" | "issue" | "pr" | "commit"
	value: string
}

/**
 * Hook execution context
 */
export interface HookContext {
	toolName: ToolName
	params: any
	task: Task
	intentId?: string // Currently active intent
	sessionId: string // Task/conversation ID
}

/**
 * Pre-hook execution result
 */
export interface PreHookResult {
	allowed: boolean // Whether to proceed with execution
	blocked: boolean // Whether execution was blocked
	error?: string // Error message if blocked
	injectedContext?: string // Context to inject into prompt
	modifiedParams?: any // Modified parameters
	requiresApproval?: boolean // Whether HITL approval is needed
}

/**
 * Post-hook execution result
 */
export interface PostHookResult {
	success: boolean
	traceEntry?: AgentTraceEntry
	error?: string
}

/**
 * Hook engine configuration
 */
export interface HookEngineConfig {
	enabled: boolean
	orchestrationDir: string // Path to .orchestration/
	requireIntentSelection: boolean // Enforce intent selection before writes
	enableScopeValidation: boolean // Validate file scope against intent
	enableConcurrencyControl: boolean // Optimistic locking
	enableTraceLogging: boolean // Write to agent_trace.jsonl
}

/**
 * File hash entry for concurrency control
 */
export interface FileHashEntry {
	path: string
	hash: string
	timestamp: number
}

/**
 * Scope validation result
 */
export interface ScopeValidationResult {
	valid: boolean
	intent?: ActiveIntent
	reason?: string
	requiresApproval: boolean
}

/**
 * Intent context for injection
 */
export interface IntentContext {
	intent: ActiveIntent
	relatedFiles: string[]
	recentTraces: AgentTraceEntry[]
	constraints: string[]
	acceptanceCriteria: string[]
}
