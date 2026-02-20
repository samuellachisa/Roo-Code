import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("fs/promises", () => ({
	readFile: vi.fn(),
	writeFile: vi.fn(),
}))

import * as fs from "fs/promises"
import { SessionCoordinator } from "../SessionCoordinator"

describe("SessionCoordinator", () => {
	const workspacePath = "/workspace"
	let coordinator: SessionCoordinator

	beforeEach(() => {
		vi.clearAllMocks()
		coordinator = new SessionCoordinator(workspacePath)
		vi.mocked(fs.writeFile).mockResolvedValue()
	})

	describe("heartbeat", () => {
		it("creates session table if none exists", async () => {
			vi.mocked(fs.readFile).mockResolvedValue("# Shared Brain\n\n## Lessons Learned\n")

			await coordinator.heartbeat("session-abc", "INT-001")

			const written = vi.mocked(fs.writeFile).mock.calls[0][1] as string
			expect(written).toContain("## Active Sessions")
			expect(written).toContain("session-abc")
			expect(written).toContain("INT-001")
		})

		it("updates existing session entry", async () => {
			const content = [
				"# Brain",
				"",
				"## Active Sessions",
				"",
				"<!-- machine-managed, do not edit -->",
				"",
				"| Session | Intent | Last Heartbeat |",
				"| ------- | ------ | -------------- |",
				"| session-abc | INT-001 | 2026-02-20T10:00:00.000Z |",
			].join("\n")
			vi.mocked(fs.readFile).mockResolvedValue(content)

			await coordinator.heartbeat("session-abc", "INT-002")

			const written = vi.mocked(fs.writeFile).mock.calls[0][1] as string
			expect(written).toContain("session-abc")
			expect(written).toContain("INT-002")
			expect(written).not.toContain("INT-001")
		})

		it("handles CLAUDE.md not existing", async () => {
			vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"))

			await coordinator.heartbeat("session-abc", "INT-001")

			expect(fs.writeFile).not.toHaveBeenCalled()
		})
	})

	describe("listSessions", () => {
		it("parses session table", async () => {
			const content = [
				"## Active Sessions",
				"",
				"| Session | Intent | Last Heartbeat |",
				"| ------- | ------ | -------------- |",
				"| sess-1 | INT-001 | 2026-02-20T10:00:00.000Z |",
				"| sess-2 | none | 2026-02-20T11:00:00.000Z |",
			].join("\n")
			vi.mocked(fs.readFile).mockResolvedValue(content)

			const sessions = await coordinator.listSessions()
			expect(sessions).toHaveLength(2)
			expect(sessions[0].sessionId).toBe("sess-1")
			expect(sessions[0].intentId).toBe("INT-001")
			expect(sessions[1].sessionId).toBe("sess-2")
			expect(sessions[1].intentId).toBeNull()
		})

		it("returns empty for missing file", async () => {
			vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"))
			expect(await coordinator.listSessions()).toEqual([])
		})
	})

	describe("isIntentClaimedByOther", () => {
		it("returns true when another session claims the intent", async () => {
			const content = [
				"## Active Sessions",
				"| Session | Intent | Last Heartbeat |",
				"| ------- | ------ | -------------- |",
				"| sess-1 | INT-001 | 2026-02-20T10:00:00.000Z |",
				"| sess-2 | INT-002 | 2026-02-20T10:00:00.000Z |",
			].join("\n")
			vi.mocked(fs.readFile).mockResolvedValue(content)

			expect(await coordinator.isIntentClaimedByOther("sess-2", "INT-001")).toBe(true)
		})

		it("returns false when only self has the intent", async () => {
			const content = [
				"## Active Sessions",
				"| Session | Intent | Last Heartbeat |",
				"| ------- | ------ | -------------- |",
				"| sess-1 | INT-001 | 2026-02-20T10:00:00.000Z |",
			].join("\n")
			vi.mocked(fs.readFile).mockResolvedValue(content)

			expect(await coordinator.isIntentClaimedByOther("sess-1", "INT-001")).toBe(false)
		})
	})

	describe("cleanupStaleSessions", () => {
		it("removes sessions older than threshold", async () => {
			const staleTime = new Date(Date.now() - 10 * 60 * 1000).toISOString()
			const freshTime = new Date().toISOString()
			const content = [
				"## Active Sessions",
				"| Session | Intent | Last Heartbeat |",
				"| ------- | ------ | -------------- |",
				`| stale-sess | INT-001 | ${staleTime} |`,
				`| fresh-sess | INT-002 | ${freshTime} |`,
			].join("\n")
			vi.mocked(fs.readFile).mockResolvedValue(content)

			const removed = await coordinator.cleanupStaleSessions()
			expect(removed).toBe(1)

			const written = vi.mocked(fs.writeFile).mock.calls[0][1] as string
			expect(written).not.toContain("stale-sess")
			expect(written).toContain("fresh-sess")
		})

		it("returns 0 when no stale sessions", async () => {
			const freshTime = new Date().toISOString()
			const content = [
				"## Active Sessions",
				"| Session | Intent | Last Heartbeat |",
				"| ------- | ------ | -------------- |",
				`| sess-1 | INT-001 | ${freshTime} |`,
			].join("\n")
			vi.mocked(fs.readFile).mockResolvedValue(content)

			const removed = await coordinator.cleanupStaleSessions()
			expect(removed).toBe(0)
			expect(fs.writeFile).not.toHaveBeenCalled()
		})
	})
})
