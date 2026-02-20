/**
 * IntentIgnore
 *
 * Parses .intentignore files (gitignore-style syntax) to exclude
 * certain paths from intent scope enforcement. Paths matching
 * .intentignore are allowed to be written without intent validation.
 */

import * as fs from "fs/promises"
import * as path from "path"

export class IntentIgnore {
	private patterns: RegExp[] = []
	private loaded = false

	constructor(private workspacePath: string) {}

	async load(): Promise<void> {
		const ignorePath = path.join(this.workspacePath, ".orchestration", ".intentignore")
		try {
			const content = await fs.readFile(ignorePath, "utf-8")
			this.patterns = content
				.split("\n")
				.map((line) => line.trim())
				.filter((line) => line.length > 0 && !line.startsWith("#"))
				.map((pattern) => this.patternToRegExp(pattern))
			this.loaded = true
		} catch {
			this.patterns = []
			this.loaded = true
		}
	}

	isIgnored(relativePath: string): boolean {
		if (!this.loaded || this.patterns.length === 0) {
			return false
		}
		const normalized = relativePath.replace(/\\/g, "/")
		return this.patterns.some((re) => re.test(normalized))
	}

	private patternToRegExp(pattern: string): RegExp {
		const negated = pattern.startsWith("!")
		let p = negated ? pattern.slice(1) : pattern

		p = p.replace(/\\/g, "/")
		if (p.endsWith("/")) {
			p += "**"
		}

		let regexStr = ""
		let i = 0
		while (i < p.length) {
			const ch = p[i]
			if (ch === "*" && p[i + 1] === "*") {
				if (p[i + 2] === "/") {
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
}
