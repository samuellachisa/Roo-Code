/**
 * Hook System Utilities
 *
 * Utility functions for content hashing, file operations, and pattern matching
 */

import crypto from "crypto"
import fs from "fs/promises"
import path from "path"

/**
 * Compute SHA-256 hash of content for spatial independence
 */
export function computeContentHash(content: string): string {
	const hash = crypto.createHash("sha256")
	hash.update(content)
	return `sha256:${hash.digest("hex")}`
}

/**
 * Compute hash of file content
 */
export async function computeFileHash(filePath: string): Promise<string> {
	try {
		const content = await fs.readFile(filePath, "utf-8")
		return computeContentHash(content)
	} catch (error) {
		throw new Error(`Failed to compute hash for ${filePath}: ${error}`)
	}
}

/**
 * Convert glob pattern to regex
 * Supports: *, **, ?, [abc], {a,b,c}
 */
function globToRegex(pattern: string): RegExp {
	let regexStr = "^"
	let i = 0

	while (i < pattern.length) {
		const char = pattern[i]

		if (char === "*") {
			// Check for **
			if (pattern[i + 1] === "*") {
				// ** matches any number of directories
				regexStr += ".*"
				i += 2
				// Skip trailing /
				if (pattern[i] === "/") {
					i++
				}
			} else {
				// * matches anything except /
				regexStr += "[^/]*"
				i++
			}
		} else if (char === "?") {
			// ? matches any single character except /
			regexStr += "[^/]"
			i++
		} else if (char === "[") {
			// Character class [abc]
			const closeIdx = pattern.indexOf("]", i)
			if (closeIdx !== -1) {
				regexStr += pattern.substring(i, closeIdx + 1)
				i = closeIdx + 1
			} else {
				regexStr += "\\["
				i++
			}
		} else if (char === "{") {
			// Brace expansion {a,b,c}
			const closeIdx = pattern.indexOf("}", i)
			if (closeIdx !== -1) {
				const options = pattern.substring(i + 1, closeIdx).split(",")
				regexStr += "(" + options.map((opt) => opt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")"
				i = closeIdx + 1
			} else {
				regexStr += "\\{"
				i++
			}
		} else if (/[.*+?^${}()|[\]\\]/.test(char)) {
			// Escape regex special characters
			regexStr += "\\" + char
			i++
		} else {
			regexStr += char
			i++
		}
	}

	regexStr += "$"
	return new RegExp(regexStr)
}

/**
 * Check if a file path matches any of the glob patterns
 */
export function matchesScope(filePath: string, patterns: string[]): boolean {
	// Normalize path to use forward slashes
	const normalizedPath = normalizePath(filePath)

	return patterns.some((pattern) => {
		const regex = globToRegex(pattern)
		return regex.test(normalizedPath)
	})
}

/**
 * Ensure .orchestration directory exists
 */
export async function ensureOrchestrationDir(cwd: string): Promise<string> {
	const orchestrationDir = path.join(cwd, ".orchestration")
	try {
		await fs.mkdir(orchestrationDir, { recursive: true })
		return orchestrationDir
	} catch (error) {
		throw new Error(`Failed to create .orchestration directory: ${error}`)
	}
}

/**
 * Check if orchestration is enabled for this workspace
 */
export async function isOrchestrationEnabled(cwd: string): Promise<boolean> {
	const orchestrationDir = path.join(cwd, ".orchestration")
	try {
		const stat = await fs.stat(orchestrationDir)
		return stat.isDirectory()
	} catch {
		return false
	}
}

/**
 * Generate UUID v4
 */
export function generateUUID(): string {
	return crypto.randomUUID()
}

/**
 * Get current ISO 8601 timestamp
 */
export function getCurrentTimestamp(): string {
	return new Date().toISOString()
}

/**
 * Extract line range from content
 */
export function extractLineRange(content: string, startLine: number, endLine: number): string {
	const lines = content.split("\n")
	return lines.slice(startLine - 1, endLine).join("\n")
}

/**
 * Normalize path to use forward slashes (for cross-platform consistency)
 */
export function normalizePath(filePath: string): string {
	return filePath.replace(/\\/g, "/")
}

/**
 * Get relative path from cwd
 */
export function getRelativePath(cwd: string, absolutePath: string): string {
	const rel = path.relative(cwd, absolutePath)
	return normalizePath(rel)
}

/**
 * Parse YAML safely (basic implementation)
 * For production, use a proper YAML library like 'yaml'
 */
export function parseYAML(content: string): any {
	// Use yaml package
	const yaml = require("yaml")
	return yaml.parse(content)
}

/**
 * Stringify to YAML
 */
export function stringifyYAML(data: any): string {
	const yaml = require("yaml")
	return yaml.stringify(data)
}

/**
 * Append line to JSONL file
 */
export async function appendToJSONL(filePath: string, data: any): Promise<void> {
	const line = JSON.stringify(data) + "\n"
	await fs.appendFile(filePath, line, "utf-8")
}

/**
 * Read JSONL file and parse entries
 */
export async function readJSONL(filePath: string): Promise<any[]> {
	try {
		const content = await fs.readFile(filePath, "utf-8")
		return content
			.split("\n")
			.filter((line) => line.trim())
			.map((line) => JSON.parse(line))
	} catch (error: any) {
		if (error.code === "ENOENT") {
			return []
		}
		throw error
	}
}

/**
 * Get Git revision ID (SHA)
 */
export async function getGitRevision(cwd: string): Promise<string> {
	try {
		const { simpleGit } = await import("simple-git")
		const git = simpleGit(cwd)
		const log = await git.log({ maxCount: 1 })
		return log.latest?.hash || "unknown"
	} catch {
		return "unknown"
	}
}

/**
 * Validate intent ID format
 */
export function isValidIntentId(intentId: string): boolean {
	// Format: INT-XXX or REQ-XXX or similar
	return /^[A-Z]+-\d+$/.test(intentId)
}

/**
 * Sanitize file path for security
 */
export function sanitizePath(filePath: string): string {
	// Remove any path traversal attempts
	return filePath.replace(/\.\./g, "").replace(/^\//, "")
}
