/**
 * SpatialMapWriter
 *
 * Maintains .orchestration/intent_map.md by auto-adding file references
 * after successful mutations. Called from PostToolUse.
 */

import * as fs from "fs/promises"
import * as path from "path"

const MAP_FILENAME = "intent_map.md"

export class SpatialMapWriter {
	/**
	 * Add a file reference to an intent's section in intent_map.md.
	 * Creates the section if it doesn't exist. Skips duplicate entries.
	 */
	static async addFileToIntent(
		intentId: string,
		filePath: string,
		workspacePath: string,
		intentName?: string,
	): Promise<void> {
		const mapPath = path.join(workspacePath, ".orchestration", MAP_FILENAME)
		let content: string

		try {
			content = await fs.readFile(mapPath, "utf-8")
		} catch {
			content = "# Intent-Code Spatial Map\n\nThis file maps business intents to physical files and AST nodes.\n"
		}

		const entry = `- \`${filePath}\``

		// Check if file is already listed under this intent
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
			if (inSection && line.includes(`\`${filePath}\``)) {
				return // Already listed
			}
		}

		// Find or create the section
		const sectionHeader = `## ${intentId}`
		const sectionIdx = lines.findIndex((l) => l.startsWith(sectionHeader))

		if (sectionIdx === -1) {
			// Create new section at the end (before the trailing marker if present)
			const trailingIdx = lines.findIndex((l) => l.startsWith("---") || l.startsWith("_This file"))
			const label = intentName ? `${intentId}: ${intentName}` : intentId
			const newSection = [`\n## ${label}\n`, "### Files\n", entry, ""]

			if (trailingIdx !== -1) {
				lines.splice(trailingIdx, 0, ...newSection)
			} else {
				lines.push(...newSection)
			}
		} else {
			// Find the end of the section to insert the entry
			let insertIdx = sectionIdx + 1
			while (insertIdx < lines.length && !lines[insertIdx].startsWith("## ")) {
				insertIdx++
			}
			// Insert before the next section (or end of file), after last non-empty line
			let lastContentIdx = insertIdx - 1
			while (lastContentIdx > sectionIdx && lines[lastContentIdx].trim() === "") {
				lastContentIdx--
			}
			lines.splice(lastContentIdx + 1, 0, entry)
		}

		await fs.writeFile(mapPath, lines.join("\n"), "utf-8")
	}

	/**
	 * Remove a file reference from an intent's section.
	 */
	static async removeFileFromIntent(intentId: string, filePath: string, workspacePath: string): Promise<void> {
		const mapPath = path.join(workspacePath, ".orchestration", MAP_FILENAME)

		let content: string
		try {
			content = await fs.readFile(mapPath, "utf-8")
		} catch {
			return // Nothing to remove
		}

		const lines = content.split("\n")
		let inSection = false
		const filtered = lines.filter((line) => {
			if (line.startsWith("## ") && line.includes(intentId)) {
				inSection = true
				return true
			}
			if (inSection && line.startsWith("## ")) {
				inSection = false
				return true
			}
			if (inSection && line.includes(`\`${filePath}\``)) {
				return false // Remove this line
			}
			return true
		})

		await fs.writeFile(mapPath, filtered.join("\n"), "utf-8")
	}
}
