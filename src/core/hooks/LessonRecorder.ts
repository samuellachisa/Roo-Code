/**
 * LessonRecorder
 *
 * Appends "Lessons Learned" entries to .orchestration/CLAUDE.md
 * when verification failures or hash mismatches are detected.
 * Append-only semantics — never modifies existing content.
 */

import * as fs from "fs/promises"
import * as path from "path"

const CLAUDE_FILENAME = "CLAUDE.md"
const LESSONS_HEADER = "## Lessons Learned"

export class LessonRecorder {
	constructor(private workspacePath: string) {}

	private get claudePath(): string {
		return path.join(this.workspacePath, ".orchestration", CLAUDE_FILENAME)
	}

	/**
	 * Append a lesson learned entry to CLAUDE.md.
	 * Creates the Lessons Learned section if it doesn't exist.
	 */
	async recordLesson(params: {
		intentId: string
		toolName: string
		description: string
		category?: string
	}): Promise<void> {
		const { intentId, toolName, description, category } = params
		const timestamp = new Date().toISOString().split("T")[0]
		const cat = category ?? "Verification Failure"

		const entry = [
			"",
			`### ${timestamp}: ${cat} (${intentId})`,
			"",
			`- **Tool**: \`${toolName}\``,
			`- **Issue**: ${description}`,
			`- **Intent**: ${intentId}`,
			"",
		].join("\n")

		let content: string
		try {
			content = await fs.readFile(this.claudePath, "utf-8")
		} catch {
			content = `# Shared Brain - Roo-Code Project\n\n${LESSONS_HEADER}\n`
		}

		if (!content.includes(LESSONS_HEADER)) {
			content += `\n\n${LESSONS_HEADER}\n`
		}

		const headerIdx = content.indexOf(LESSONS_HEADER)
		const afterHeader = headerIdx + LESSONS_HEADER.length
		const nextSectionIdx = content.indexOf("\n## ", afterHeader + 1)

		if (nextSectionIdx === -1) {
			content += entry
		} else {
			content = content.slice(0, nextSectionIdx) + entry + content.slice(nextSectionIdx)
		}

		await fs.writeFile(this.claudePath, content, "utf-8")
	}

	/**
	 * Record a hash mismatch (optimistic lock failure).
	 */
	async recordHashMismatch(intentId: string, toolName: string, filePath: string): Promise<void> {
		await this.recordLesson({
			intentId,
			toolName,
			description: `Hash mismatch detected for \`${filePath}\`. File was modified by another session between read and write.`,
			category: "Optimistic Lock Failure",
		})
	}

	/**
	 * Record a scope violation that was blocked.
	 */
	async recordScopeViolation(intentId: string, toolName: string, filePath: string): Promise<void> {
		await this.recordLesson({
			intentId,
			toolName,
			description: `Attempted to write \`${filePath}\` which is outside the intent's owned_scope. Agent should verify scope before writing.`,
			category: "Scope Violation",
		})
	}
}
