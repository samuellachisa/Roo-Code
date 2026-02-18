/**
 * Hook System Utilities
 *
 * Utility functions for content hashing, file operations, and pattern matching
 */

import crypto from "crypto"
import fs from "fs/promises"
import path from "path"
import { minimatch } from "minimatch"

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
 * Check if a file path matches any of the glob patterns
 */
export function matchesScope(filePath: string, patterns: string[]): boolean {
	return patterns.some((pattern) => minimatch(filePath, pattern, { dot: true }))
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
	// This is a placeholder - in production, use the 'yaml' package
	// For now, we'll use a simple implementation
	try {
		// Try to use yaml package if available
		const yaml = require("yaml")
		return yaml.parse(content)
	} catch {
		// Fallback to JSON if yaml not available
		throw new Error("YAML parsing requires 'yaml' package")
	}
}

/**
 * Stringify to YAML
 */
export function stringifyYAML(data: any): string {
	try {
		const yaml = require("yaml")
		return yaml.stringify(data)
	} catch {
		throw new Error("YAML stringification requires 'yaml' package")
	}
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
