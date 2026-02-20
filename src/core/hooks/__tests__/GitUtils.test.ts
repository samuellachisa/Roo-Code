import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("child_process", () => ({
	exec: vi.fn(),
}))

vi.mock("util", () => ({
	promisify: (fn: any) => fn,
}))

import { exec } from "child_process"
import { GitUtils } from "../GitUtils"

const mockExec = vi.mocked(exec) as unknown as ReturnType<typeof vi.fn>

describe("GitUtils", () => {
	const workspacePath = "/workspace"
	let gitUtils: GitUtils

	beforeEach(() => {
		vi.clearAllMocks()
		gitUtils = new GitUtils(workspacePath)
	})

	describe("getCurrentSha", () => {
		it("returns the full SHA", async () => {
			mockExec.mockResolvedValue({ stdout: "abc123def456\n", stderr: "" })

			const sha = await gitUtils.getCurrentSha()
			expect(sha).toBe("abc123def456")
			expect(mockExec).toHaveBeenCalledWith(
				"git rev-parse HEAD",
				expect.objectContaining({
					cwd: workspacePath,
				}),
			)
		})

		it("returns null on error", async () => {
			mockExec.mockRejectedValue(new Error("not a git repo"))

			const sha = await gitUtils.getCurrentSha()
			expect(sha).toBeNull()
		})

		it("returns null on empty stdout", async () => {
			mockExec.mockResolvedValue({ stdout: "", stderr: "" })

			const sha = await gitUtils.getCurrentSha()
			expect(sha).toBeNull()
		})
	})

	describe("getShortSha", () => {
		it("returns the short SHA", async () => {
			mockExec.mockResolvedValue({ stdout: "abc123d\n", stderr: "" })

			const sha = await gitUtils.getShortSha()
			expect(sha).toBe("abc123d")
		})

		it("returns null on error", async () => {
			mockExec.mockRejectedValue(new Error("not a git repo"))
			expect(await gitUtils.getShortSha()).toBeNull()
		})
	})

	describe("hasUncommittedChanges", () => {
		it("returns true when there are changes", async () => {
			mockExec.mockResolvedValue({ stdout: " M src/index.ts\n", stderr: "" })

			expect(await gitUtils.hasUncommittedChanges()).toBe(true)
		})

		it("returns false when working tree is clean", async () => {
			mockExec.mockResolvedValue({ stdout: "", stderr: "" })

			expect(await gitUtils.hasUncommittedChanges()).toBe(false)
		})

		it("returns false on error", async () => {
			mockExec.mockRejectedValue(new Error("not a git repo"))

			expect(await gitUtils.hasUncommittedChanges()).toBe(false)
		})
	})

	describe("isGitRepo", () => {
		it("returns true for git repos", async () => {
			mockExec.mockResolvedValue({ stdout: "true\n", stderr: "" })

			expect(await gitUtils.isGitRepo()).toBe(true)
		})

		it("returns false for non-git dirs", async () => {
			mockExec.mockRejectedValue(new Error("not a git repository"))

			expect(await gitUtils.isGitRepo()).toBe(false)
		})
	})

	describe("getCurrentBranch", () => {
		it("returns the branch name", async () => {
			mockExec.mockResolvedValue({ stdout: "feature/hook-system\n", stderr: "" })

			expect(await gitUtils.getCurrentBranch()).toBe("feature/hook-system")
		})

		it("returns null on error", async () => {
			mockExec.mockRejectedValue(new Error("detached HEAD"))

			expect(await gitUtils.getCurrentBranch()).toBeNull()
		})
	})
})
