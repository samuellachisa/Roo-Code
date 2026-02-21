/**
 * SpatialMapWriter
 *
 * Maintains .orchestration/intent_map.md — the human-readable spatial map
 * that links business intents to physical files and AST nodes.
 *
 * When a manager asks "Where is the billing logic?", this file answers.
 *
 * Update Pattern: Incrementally updated on successful mutations.
 * On INTENT_EVOLUTION, records the evolution event with a timestamp.
 */

import * as fs from "fs/promises"
import * as path from "path"

import type { MutationClass } from "./types"

const MAP_FILENAME = "intent_map.md"

export class SpatialMapWriter {
	/**
	 * Add a file reference to an intent's section in intent_map.md.
	 * Creates the section if it doesn't exist. Skips duplicate entries.
	 * When mutationClass is INTENT_EVOLUTION, appends an evolution marker.
	 */
	static async addFileToIntent(
		intentId: string,
		filePath: string,
		workspacePath: string,
		intentName?: string,
		mutationClass?: MutationClass,
	): Promise<void> {
		const mapPath = path.join(workspacePath, ".orchestration", MAP_FILENAME)
		let content: string

		try {
			content = await fs.readFile(mapPath, "utf-8")
		} catch {
			content = "# Intent-Code Spatial Map\n\nThis file maps business intents to physical files and AST nodes.\n"
		}

		const entry = `- \`${filePath}\``

		const lines = content.split("\n")
		let inSection = false
		let fileAlreadyListed = false
		for (const line of lines) {
			if (line.startsWith("## ") && line.includes(intentId)) {
				inSection = true
				continue
			}
			if (inSection && line.startsWith("## ")) {
				break
			}
			if (inSection && line.includes(`\`${filePath}\``)) {
				fileAlreadyListed = true
				break
			}
		}

		if (!fileAlreadyListed) {
			const sectionHeader = `## ${intentId}`
			const sectionIdx = lines.findIndex((l) => l.startsWith(sectionHeader))

			if (sectionIdx === -1) {
				const trailingIdx = lines.findIndex((l) => l.startsWith("---") || l.startsWith("_This file"))
				const label = intentName ? `${intentId}: ${intentName}` : intentId
				const newSection = [`\n## ${label}\n`, "### Files\n", entry, ""]

				if (trailingIdx !== -1) {
					lines.splice(trailingIdx, 0, ...newSection)
				} else {
					lines.push(...newSection)
				}
			} else {
				let insertIdx = sectionIdx + 1
				while (insertIdx < lines.length && !lines[insertIdx].startsWith("## ")) {
					insertIdx++
				}
				let lastContentIdx = insertIdx - 1
				while (lastContentIdx > sectionIdx && lines[lastContentIdx].trim() === "") {
					lastContentIdx--
				}
				lines.splice(lastContentIdx + 1, 0, entry)
			}
		}

		// On INTENT_EVOLUTION, append an evolution marker to the section
		if (mutationClass === "INTENT_EVOLUTION") {
			const timestamp = new Date().toISOString().split("T")[0]
			const evolutionEntry = `- _[EVOLUTION ${timestamp}]_ \`${filePath}\` — new behavior added`
			const sectionIdx = lines.findIndex((l) => l.startsWith(`## ${intentId}`))

			if (sectionIdx !== -1) {
				const evolutionSubheader = "### Evolution Log"
				let evolutionIdx = -1
				for (let i = sectionIdx + 1; i < lines.length; i++) {
					if (lines[i].startsWith("## ")) break
					if (lines[i].includes(evolutionSubheader)) {
						evolutionIdx = i
						break
					}
				}

				if (evolutionIdx === -1) {
					let insertIdx = sectionIdx + 1
					while (insertIdx < lines.length && !lines[insertIdx].startsWith("## ")) {
						insertIdx++
					}
					let lastContentIdx = insertIdx - 1
					while (lastContentIdx > sectionIdx && lines[lastContentIdx].trim() === "") {
						lastContentIdx--
					}
					lines.splice(lastContentIdx + 1, 0, "", evolutionSubheader, "", evolutionEntry)
				} else {
					let insertAfter = evolutionIdx + 1
					while (
						insertAfter < lines.length &&
						!lines[insertAfter].startsWith("## ") &&
						!lines[insertAfter].startsWith("### ")
					) {
						insertAfter++
					}
					let lastEvolutionLine = insertAfter - 1
					while (lastEvolutionLine > evolutionIdx && lines[lastEvolutionLine].trim() === "") {
						lastEvolutionLine--
					}
					lines.splice(lastEvolutionLine + 1, 0, evolutionEntry)
				}
			}
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
			return
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
				return false
			}
			return true
		})

		await fs.writeFile(mapPath, filtered.join("\n"), "utf-8")
	}
}
