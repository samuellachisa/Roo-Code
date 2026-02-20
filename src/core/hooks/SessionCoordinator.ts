/**
 * SessionCoordinator
 *
 * Coordinates parallel agent sessions using .orchestration/CLAUDE.md
 * as a shared memory plane. Each session registers itself and can
 * discover other active sessions to avoid conflicting mutations.
 *
 * Session presence is tracked via a "## Active Sessions" section in
 * CLAUDE.md. Sessions heartbeat on each tool invocation and are
 * considered stale after STALE_THRESHOLD_MS.
 */

import * as fs from "fs/promises"
import * as path from "path"

const SESSIONS_HEADER = "## Active Sessions"
const STALE_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes

export interface SessionInfo {
	sessionId: string
	intentId: string | null
	startedAt: string
	lastHeartbeat: string
}

export class SessionCoordinator {
	constructor(private workspacePath: string) {}

	private get claudePath(): string {
		return path.join(this.workspacePath, ".orchestration", "CLAUDE.md")
	}

	/**
	 * Register or update this session's heartbeat in CLAUDE.md.
	 */
	async heartbeat(sessionId: string, intentId: string | null): Promise<void> {
		const now = new Date().toISOString()

		let content: string
		try {
			content = await fs.readFile(this.claudePath, "utf-8")
		} catch {
			return
		}

		if (!content.includes(SESSIONS_HEADER)) {
			content += `\n\n${SESSIONS_HEADER}\n\n<!-- machine-managed, do not edit -->\n`
		}

		const sessionLine = `| ${sessionId} | ${intentId ?? "none"} | ${now} |`
		const existingPattern = new RegExp(`^\\| ${this.escapeRegex(sessionId)} \\|.*$`, "m")

		if (existingPattern.test(content)) {
			content = content.replace(existingPattern, sessionLine)
		} else {
			const headerIdx = content.indexOf(SESSIONS_HEADER)
			const tableStart = content.indexOf("|", headerIdx + SESSIONS_HEADER.length)

			if (tableStart === -1) {
				const insertAt = content.indexOf("\n", headerIdx + SESSIONS_HEADER.length)
				const tableHeader = [
					"",
					"| Session | Intent | Last Heartbeat |",
					"| ------- | ------ | -------------- |",
					sessionLine,
					"",
				].join("\n")
				content = content.slice(0, insertAt + 1) + tableHeader + content.slice(insertAt + 1)
			} else {
				const nextSection = content.indexOf("\n## ", headerIdx + SESSIONS_HEADER.length + 1)
				const insertPoint = nextSection === -1 ? content.length : nextSection
				content = content.slice(0, insertPoint) + sessionLine + "\n" + content.slice(insertPoint)
			}
		}

		await fs.writeFile(this.claudePath, content, "utf-8")
	}

	/**
	 * List all sessions currently registered in CLAUDE.md.
	 */
	async listSessions(): Promise<SessionInfo[]> {
		let content: string
		try {
			content = await fs.readFile(this.claudePath, "utf-8")
		} catch {
			return []
		}

		const sessions: SessionInfo[] = []
		const linePattern = /^\| ([^ |]+) \| ([^ |]+) \| ([^ |]+) \|$/gm
		let match
		while ((match = linePattern.exec(content)) !== null) {
			if (match[1] === "Session" || match[1] === "-------") {
				continue
			}
			sessions.push({
				sessionId: match[1],
				intentId: match[2] === "none" ? null : match[2],
				startedAt: match[3],
				lastHeartbeat: match[3],
			})
		}
		return sessions
	}

	/**
	 * Check if another session is working on the same intent.
	 */
	async isIntentClaimedByOther(sessionId: string, intentId: string): Promise<boolean> {
		const sessions = await this.listSessions()
		return sessions.some((s) => s.intentId === intentId && s.sessionId !== sessionId)
	}

	/**
	 * Remove stale sessions that haven't heartbeated recently.
	 */
	async cleanupStaleSessions(): Promise<number> {
		let content: string
		try {
			content = await fs.readFile(this.claudePath, "utf-8")
		} catch {
			return 0
		}

		const now = Date.now()
		let removed = 0
		const linePattern = /^\| ([^ |]+) \| ([^ |]+) \| ([^ |]+) \|$/gm
		const linesToRemove: string[] = []
		let match

		while ((match = linePattern.exec(content)) !== null) {
			if (match[1] === "Session" || match[1] === "-------") {
				continue
			}
			const heartbeat = new Date(match[3]).getTime()
			if (now - heartbeat > STALE_THRESHOLD_MS) {
				linesToRemove.push(match[0])
				removed++
			}
		}

		for (const line of linesToRemove) {
			content = content.replace(line + "\n", "")
		}

		if (removed > 0) {
			await fs.writeFile(this.claudePath, content, "utf-8")
		}

		return removed
	}

	private escapeRegex(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
	}
}
