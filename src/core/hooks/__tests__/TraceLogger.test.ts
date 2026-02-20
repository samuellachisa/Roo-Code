import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as fs from "fs/promises"
import * as path from "path"
import { TraceLogger } from "../TraceLogger"

vi.mock("fs/promises", async (importOriginal) => {
	const actual = await importOriginal<typeof import("fs/promises")>()
	return {
		...actual,
		readFile: vi.fn(),
		appendFile: vi.fn(),
	}
})
vi.mock("uuid", () => ({
	v4: () => "test-uuid-1234",
}))

const WORKSPACE = "/test/workspace"
const TRACE_PATH = path.join(WORKSPACE, ".orchestration", "agent_trace.jsonl")

describe("TraceLogger", () => {
	let logger: TraceLogger

	beforeEach(() => {
		vi.clearAllMocks()
		logger = new TraceLogger(WORKSPACE)
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe("createEntry", () => {
		it("creates a trace entry with all fields", () => {
			const entry = logger.createEntry({
				intentId: "INT-001",
				sessionId: "session-1",
				toolName: "write_to_file",
				mutationClass: "INTENT_EVOLUTION",
				filePath: "src/file.ts",
				preHash: "sha256:aaa",
				postHash: "sha256:bbb",
				scopeValidation: "PASS",
				success: true,
			})

			expect(entry.id).toBe("test-uuid-1234")
			expect(entry.intent_id).toBe("INT-001")
			expect(entry.session_id).toBe("session-1")
			expect(entry.tool_name).toBe("write_to_file")
			expect(entry.mutation_class).toBe("INTENT_EVOLUTION")
			expect(entry.file).toEqual({
				relative_path: "src/file.ts",
				pre_hash: "sha256:aaa",
				post_hash: "sha256:bbb",
			})
			expect(entry.scope_validation).toBe("PASS")
			expect(entry.success).toBe(true)
			expect(entry.timestamp).toBeTruthy()
		})

		it("sets file to null for non-file tools", () => {
			const entry = logger.createEntry({
				intentId: "INT-001",
				sessionId: "session-1",
				toolName: "execute_command",
				mutationClass: "CONFIGURATION",
				filePath: null,
				preHash: null,
				postHash: null,
				scopeValidation: "EXEMPT",
				success: true,
			})

			expect(entry.file).toBeNull()
		})

		it("includes error message on failure", () => {
			const entry = logger.createEntry({
				intentId: "INT-001",
				sessionId: "session-1",
				toolName: "write_to_file",
				mutationClass: "INTENT_EVOLUTION",
				filePath: "src/file.ts",
				preHash: "sha256:aaa",
				postHash: null,
				scopeValidation: "PASS",
				success: false,
				error: "Permission denied",
			})

			expect(entry.success).toBe(false)
			expect(entry.error).toBe("Permission denied")
		})
	})

	describe("log", () => {
		it("appends JSONL line to trace file", async () => {
			vi.mocked(fs.appendFile).mockResolvedValueOnce()

			const entry = logger.createEntry({
				intentId: "INT-001",
				sessionId: "session-1",
				toolName: "write_to_file",
				mutationClass: "FILE_CREATION",
				filePath: "src/new.ts",
				preHash: null,
				postHash: "sha256:ccc",
				scopeValidation: "PASS",
				success: true,
			})

			await logger.log(entry)

			expect(fs.appendFile).toHaveBeenCalledWith(
				TRACE_PATH,
				expect.stringContaining('"intent_id":"INT-001"'),
				"utf-8",
			)
		})

		it("retries once on first failure", async () => {
			vi.mocked(fs.appendFile).mockRejectedValueOnce(new Error("EBUSY")).mockResolvedValueOnce()

			const entry = logger.createEntry({
				intentId: "INT-001",
				sessionId: "s",
				toolName: "edit",
				mutationClass: "AST_REFACTOR",
				filePath: "src/f.ts",
				preHash: "sha256:a",
				postHash: "sha256:b",
				scopeValidation: "PASS",
				success: true,
			})

			await logger.log(entry)

			expect(fs.appendFile).toHaveBeenCalledTimes(2)
		})

		it("does not throw on double failure", async () => {
			vi.mocked(fs.appendFile).mockRejectedValueOnce(new Error("EBUSY")).mockRejectedValueOnce(new Error("EBUSY"))

			const entry = logger.createEntry({
				intentId: "INT-001",
				sessionId: "s",
				toolName: "edit",
				mutationClass: "AST_REFACTOR",
				filePath: "src/f.ts",
				preHash: "sha256:a",
				postHash: "sha256:b",
				scopeValidation: "PASS",
				success: true,
			})

			await expect(logger.log(entry)).resolves.toBeUndefined()
		})
	})

	describe("getRecentEntries", () => {
		it("returns entries filtered by intent ID", async () => {
			const lines = [
				JSON.stringify({ intent_id: "INT-001", tool_name: "write_to_file" }),
				JSON.stringify({ intent_id: "INT-002", tool_name: "edit" }),
				JSON.stringify({ intent_id: "INT-001", tool_name: "apply_diff" }),
			].join("\n")

			vi.mocked(fs.readFile).mockResolvedValueOnce(lines)

			const entries = await logger.getRecentEntries("INT-001")
			expect(entries).toHaveLength(2)
			expect(entries[0].tool_name).toBe("write_to_file")
			expect(entries[1].tool_name).toBe("apply_diff")
		})

		it("returns empty array if file does not exist", async () => {
			vi.mocked(fs.readFile).mockRejectedValueOnce(new Error("ENOENT"))

			const entries = await logger.getRecentEntries("INT-001")
			expect(entries).toEqual([])
		})

		it("skips malformed lines", async () => {
			const lines = [
				JSON.stringify({ intent_id: "INT-001", tool_name: "edit" }),
				"NOT_VALID_JSON",
				JSON.stringify({ intent_id: "INT-001", tool_name: "write_to_file" }),
			].join("\n")

			vi.mocked(fs.readFile).mockResolvedValueOnce(lines)

			const entries = await logger.getRecentEntries("INT-001")
			expect(entries).toHaveLength(2)
		})

		it("respects limit parameter", async () => {
			const lines = Array.from({ length: 30 }, (_, i) =>
				JSON.stringify({ intent_id: "INT-001", tool_name: `tool_${i}` }),
			).join("\n")

			vi.mocked(fs.readFile).mockResolvedValueOnce(lines)

			const entries = await logger.getRecentEntries("INT-001", 5)
			expect(entries).toHaveLength(5)
		})
	})
})
