import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("fs/promises", () => ({
	readFile: vi.fn(),
	writeFile: vi.fn(),
}))

import * as fs from "fs/promises"
import { LessonRecorder } from "../LessonRecorder"

describe("LessonRecorder", () => {
	const workspacePath = "/workspace"
	let recorder: LessonRecorder

	beforeEach(() => {
		vi.clearAllMocks()
		recorder = new LessonRecorder(workspacePath)
		vi.mocked(fs.writeFile).mockResolvedValue()
	})

	describe("recordLesson", () => {
		it("appends to existing Lessons Learned section", async () => {
			vi.mocked(fs.readFile).mockResolvedValue("# Shared Brain\n\n## Lessons Learned\n\nOld lesson here.\n")

			await recorder.recordLesson({
				intentId: "INT-001",
				toolName: "write_to_file",
				description: "Something went wrong",
			})

			expect(fs.writeFile).toHaveBeenCalledTimes(1)
			const written = vi.mocked(fs.writeFile).mock.calls[0][1] as string
			expect(written).toContain("## Lessons Learned")
			expect(written).toContain("Something went wrong")
			expect(written).toContain("INT-001")
			expect(written).toContain("`write_to_file`")
		})

		it("creates Lessons Learned section if missing", async () => {
			vi.mocked(fs.readFile).mockResolvedValue("# Shared Brain\n\n## Other Section\n")

			await recorder.recordLesson({
				intentId: "INT-002",
				toolName: "apply_diff",
				description: "Test failure",
				category: "Test Failure",
			})

			const written = vi.mocked(fs.writeFile).mock.calls[0][1] as string
			expect(written).toContain("## Lessons Learned")
			expect(written).toContain("Test Failure")
		})

		it("creates CLAUDE.md from scratch if file missing", async () => {
			vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"))

			await recorder.recordLesson({
				intentId: "INT-001",
				toolName: "execute_command",
				description: "Network failure",
			})

			const written = vi.mocked(fs.writeFile).mock.calls[0][1] as string
			expect(written).toContain("# Shared Brain")
			expect(written).toContain("## Lessons Learned")
			expect(written).toContain("Network failure")
		})

		it("inserts before next section when one exists", async () => {
			const content = [
				"# Brain",
				"",
				"## Lessons Learned",
				"",
				"Existing lesson.",
				"",
				"## Architecture Decisions",
				"",
				"Some decisions.",
			].join("\n")
			vi.mocked(fs.readFile).mockResolvedValue(content)

			await recorder.recordLesson({
				intentId: "INT-003",
				toolName: "edit",
				description: "Inserted mid-doc",
			})

			const written = vi.mocked(fs.writeFile).mock.calls[0][1] as string
			const archIdx = written.indexOf("## Architecture Decisions")
			const newLessonIdx = written.indexOf("Inserted mid-doc")
			expect(newLessonIdx).toBeLessThan(archIdx)
		})
	})

	describe("recordHashMismatch", () => {
		it("records a hash mismatch lesson", async () => {
			vi.mocked(fs.readFile).mockResolvedValue("# Brain\n\n## Lessons Learned\n")

			await recorder.recordHashMismatch("INT-001", "write_to_file", "src/index.ts")

			const written = vi.mocked(fs.writeFile).mock.calls[0][1] as string
			expect(written).toContain("Optimistic Lock Failure")
			expect(written).toContain("Hash mismatch")
			expect(written).toContain("`src/index.ts`")
		})
	})

	describe("recordScopeViolation", () => {
		it("records a scope violation lesson", async () => {
			vi.mocked(fs.readFile).mockResolvedValue("# Brain\n\n## Lessons Learned\n")

			await recorder.recordScopeViolation("INT-002", "apply_diff", "outside/file.ts")

			const written = vi.mocked(fs.writeFile).mock.calls[0][1] as string
			expect(written).toContain("Scope Violation")
			expect(written).toContain("`outside/file.ts`")
		})
	})
})
