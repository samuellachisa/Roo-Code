/**
 * Utility functions for the hook system: content hashing and scope matching.
 */

import * as crypto from "crypto"
import * as fs from "fs/promises"
import * as path from "path"

import type { MutationClass } from "./types"

const HASH_PREFIX = "sha256:"

/**
 * Compute a deterministic SHA-256 hash of content.
 * Returns lowercase hex prefixed with "sha256:".
 */
export function computeContentHash(content: string | Buffer): string {
	const hash = crypto.createHash("sha256").update(content).digest("hex")
	return `${HASH_PREFIX}${hash}`
}

/**
 * Compute the SHA-256 hash of a file's contents.
 * Returns null if the file does not exist.
 */
export async function computeFileHash(absolutePath: string): Promise<string | null> {
	try {
		const content = await fs.readFile(absolutePath)
		return computeContentHash(content)
	} catch (err: unknown) {
		if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
			return null
		}
		console.error(`[HookSystem] Failed to hash file ${absolutePath}:`, err)
		return null
	}
}

/**
 * Convert a glob pattern to a RegExp. Supports:
 *   ** — matches any number of path segments (including zero)
 *   *  — matches anything except path separators
 *
 * This avoids a runtime dependency on minimatch/picomatch for the
 * simple patterns used in owned_scope declarations.
 */
function globToRegExp(pattern: string): RegExp {
	const normalized = pattern.replace(/\\/g, "/")
	let regexStr = ""
	let i = 0
	while (i < normalized.length) {
		const ch = normalized[i]
		if (ch === "*" && normalized[i + 1] === "*") {
			// ** — match anything (including path separators)
			if (normalized[i + 2] === "/") {
				regexStr += "(?:.+/)?"
				i += 3
			} else {
				regexStr += ".*"
				i += 2
			}
		} else if (ch === "*") {
			regexStr += "[^/]*"
			i++
		} else if (ch === "?") {
			regexStr += "[^/]"
			i++
		} else if (".+^${}()|[]\\".includes(ch)) {
			regexStr += "\\" + ch
			i++
		} else {
			regexStr += ch
			i++
		}
	}
	return new RegExp(`^${regexStr}$`)
}

/**
 * Check whether a relative file path matches any of the owned_scope glob patterns.
 */
export function isInScope(relativePath: string, scopePatterns: string[]): boolean {
	const normalized = relativePath.replace(/\\/g, "/")
	return scopePatterns.some((pattern) => globToRegExp(pattern).test(normalized))
}

/**
 * Resolve an absolute file path to a workspace-relative path.
 */
export function toRelativePath(absolutePath: string, workspacePath: string): string {
	return path.relative(workspacePath, absolutePath).replace(/\\/g, "/")
}

/**
 * Extract the target file path from tool parameters.
 * Different tools use different parameter names for the file path.
 */
export function extractFilePathFromParams(params: Record<string, unknown>): string | null {
	if (typeof params.path === "string") return params.path
	if (typeof params.file_path === "string") return params.file_path
	if (typeof params.target_file === "string") return params.target_file
	return null
}

/**
 * Classify a mutation based on tool name and pre-mutation hash.
 */
export function classifyMutation(toolName: string, _filePath: string | null, preHash: string | null): MutationClass {
	if (preHash === null) {
		return "FILE_CREATION"
	}

	switch (toolName) {
		case "apply_diff":
		case "search_and_replace":
		case "search_replace":
		case "edit":
		case "edit_file":
		case "apply_patch":
			return "AST_REFACTOR"
		case "write_to_file":
			return "INTENT_EVOLUTION"
		case "execute_command":
			return "CONFIGURATION"
		default:
			return "INTENT_EVOLUTION"
	}
}
