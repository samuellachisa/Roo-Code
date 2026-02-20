import { describe, it, expect } from "vitest"
import { computeContentHash, isInScope, extractFilePathFromParams, classifyMutation, toRelativePath } from "../utils"

describe("computeContentHash", () => {
	it("returns sha256-prefixed hex string", () => {
		const hash = computeContentHash("hello world")
		expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/)
	})

	it("produces deterministic output", () => {
		const a = computeContentHash("test content")
		const b = computeContentHash("test content")
		expect(a).toBe(b)
	})

	it("produces different hashes for different content", () => {
		const a = computeContentHash("content A")
		const b = computeContentHash("content B")
		expect(a).not.toBe(b)
	})

	it("hashes empty string without error", () => {
		const hash = computeContentHash("")
		expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/)
	})

	it("hashes Buffer input", () => {
		const hash = computeContentHash(Buffer.from("binary data"))
		expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/)
	})
})

describe("isInScope", () => {
	it("matches exact file paths", () => {
		expect(isInScope("src/core/hooks/HookEngine.ts", ["src/core/hooks/HookEngine.ts"])).toBe(true)
	})

	it("matches ** glob patterns", () => {
		expect(isInScope("src/core/hooks/HookEngine.ts", ["src/core/hooks/**"])).toBe(true)
	})

	it("matches deeply nested paths with **", () => {
		expect(isInScope("src/core/hooks/deep/nested/file.ts", ["src/core/hooks/**"])).toBe(true)
	})

	it("rejects paths not matching any pattern", () => {
		expect(isInScope("src/api/weather/client.ts", ["src/core/hooks/**"])).toBe(false)
	})

	it("matches when any pattern in array matches", () => {
		expect(isInScope("src/api/weather/client.ts", ["src/core/hooks/**", "src/api/weather/**"])).toBe(true)
	})

	it("normalizes Windows backslashes", () => {
		expect(isInScope("src\\core\\hooks\\HookEngine.ts", ["src/core/hooks/**"])).toBe(true)
	})

	it("matches * for single directory level", () => {
		expect(isInScope("src/core/hooks/types.ts", ["src/core/hooks/*.ts"])).toBe(true)
		expect(isInScope("src/core/hooks/deep/types.ts", ["src/core/hooks/*.ts"])).toBe(false)
	})

	it("handles .orchestration patterns with dotfiles", () => {
		expect(isInScope(".orchestration/active_intents.yaml", [".orchestration/**"])).toBe(true)
	})
})

describe("extractFilePathFromParams", () => {
	it("extracts 'path' parameter", () => {
		expect(extractFilePathFromParams({ path: "src/file.ts" })).toBe("src/file.ts")
	})

	it("extracts 'file_path' parameter", () => {
		expect(extractFilePathFromParams({ file_path: "src/file.ts" })).toBe("src/file.ts")
	})

	it("extracts 'target_file' parameter", () => {
		expect(extractFilePathFromParams({ target_file: "src/file.ts" })).toBe("src/file.ts")
	})

	it("returns null when no file path parameter exists", () => {
		expect(extractFilePathFromParams({ content: "data" })).toBeNull()
	})

	it("prefers 'path' over other parameter names", () => {
		expect(extractFilePathFromParams({ path: "a.ts", file_path: "b.ts" })).toBe("a.ts")
	})
})

describe("classifyMutation", () => {
	it("classifies new file creation when preHash is null", () => {
		expect(classifyMutation("write_to_file", "src/new.ts", null)).toBe("FILE_CREATION")
	})

	it("classifies write_to_file with existing file as INTENT_EVOLUTION", () => {
		expect(classifyMutation("write_to_file", "src/existing.ts", "sha256:abc")).toBe("INTENT_EVOLUTION")
	})

	it("classifies apply_diff as AST_REFACTOR", () => {
		expect(classifyMutation("apply_diff", "src/file.ts", "sha256:abc")).toBe("AST_REFACTOR")
	})

	it("classifies edit as AST_REFACTOR", () => {
		expect(classifyMutation("edit", "src/file.ts", "sha256:abc")).toBe("AST_REFACTOR")
	})

	it("classifies execute_command as CONFIGURATION", () => {
		expect(classifyMutation("execute_command", null, "sha256:abc")).toBe("CONFIGURATION")
	})
})

describe("toRelativePath", () => {
	it("converts absolute to relative", () => {
		const result = toRelativePath("/workspace/src/file.ts", "/workspace")
		expect(result).toBe("src/file.ts")
	})

	it("normalizes backslashes", () => {
		const result = toRelativePath("/workspace/src\\hooks\\file.ts", "/workspace")
		expect(result).toMatch(/src\/hooks\/file\.ts/)
	})
})
