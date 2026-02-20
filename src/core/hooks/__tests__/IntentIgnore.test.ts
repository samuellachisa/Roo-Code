import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("fs/promises", () => ({
	readFile: vi.fn(),
}))

import * as fs from "fs/promises"
import { IntentIgnore } from "../IntentIgnore"

describe("IntentIgnore", () => {
	const workspacePath = "/workspace"
	let intentIgnore: IntentIgnore

	beforeEach(() => {
		vi.clearAllMocks()
		intentIgnore = new IntentIgnore(workspacePath)
	})

	describe("load", () => {
		it("loads patterns from .intentignore file", async () => {
			vi.mocked(fs.readFile).mockResolvedValue("# comment\npackage-lock.json\ndist/**\n\n.vscode/**\n")

			await intentIgnore.load()

			expect(intentIgnore.isIgnored("package-lock.json")).toBe(true)
			expect(intentIgnore.isIgnored("dist/bundle.js")).toBe(true)
			expect(intentIgnore.isIgnored(".vscode/settings.json")).toBe(true)
			expect(intentIgnore.isIgnored("src/index.ts")).toBe(false)
		})

		it("handles missing .intentignore gracefully", async () => {
			vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"))

			await intentIgnore.load()

			expect(intentIgnore.isIgnored("anything")).toBe(false)
		})

		it("ignores comments and blank lines", async () => {
			vi.mocked(fs.readFile).mockResolvedValue("# This is a comment\n\n  # Another comment\n  \nfoo.txt\n")

			await intentIgnore.load()

			expect(intentIgnore.isIgnored("foo.txt")).toBe(true)
			expect(intentIgnore.isIgnored("# This is a comment")).toBe(false)
		})
	})

	describe("isIgnored", () => {
		it("returns false when not loaded", () => {
			expect(intentIgnore.isIgnored("any-file.ts")).toBe(false)
		})

		it("matches simple filenames", async () => {
			vi.mocked(fs.readFile).mockResolvedValue("package-lock.json\nyarn.lock\n")

			await intentIgnore.load()

			expect(intentIgnore.isIgnored("package-lock.json")).toBe(true)
			expect(intentIgnore.isIgnored("yarn.lock")).toBe(true)
			expect(intentIgnore.isIgnored("pnpm-lock.yaml")).toBe(false)
		})

		it("matches glob patterns with **", async () => {
			vi.mocked(fs.readFile).mockResolvedValue("dist/**\nbuild/**\n")

			await intentIgnore.load()

			expect(intentIgnore.isIgnored("dist/index.js")).toBe(true)
			expect(intentIgnore.isIgnored("dist/chunks/a.js")).toBe(true)
			expect(intentIgnore.isIgnored("build/output.css")).toBe(true)
			expect(intentIgnore.isIgnored("src/dist/fake.js")).toBe(false)
		})

		it("matches single wildcard *", async () => {
			vi.mocked(fs.readFile).mockResolvedValue("*.log\n")

			await intentIgnore.load()

			expect(intentIgnore.isIgnored("error.log")).toBe(true)
			expect(intentIgnore.isIgnored("debug.log")).toBe(true)
			expect(intentIgnore.isIgnored("logs/error.log")).toBe(false)
		})

		it("matches directory trailing slash patterns", async () => {
			vi.mocked(fs.readFile).mockResolvedValue("node_modules/\n")

			await intentIgnore.load()

			expect(intentIgnore.isIgnored("node_modules/foo/bar.js")).toBe(true)
		})

		it("normalizes backslashes", async () => {
			vi.mocked(fs.readFile).mockResolvedValue("dist/**\n")

			await intentIgnore.load()

			expect(intentIgnore.isIgnored("dist\\bundle.js")).toBe(true)
		})
	})
})
