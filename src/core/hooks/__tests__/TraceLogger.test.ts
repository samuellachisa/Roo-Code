import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as fs from "fs/promises"
import * as path from "path"
import { TraceLogger } from "../TraceLogger"
import type { AgentTraceEntry } from "../types"

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
vi.mock("child_process", () => ({
	exec: vi.fn((_cmd: string, _opts: unknown, cb: (err: Error | null, result: unknown) => void) =>
		cb(null, { stdout: "abc123def456\n", stderr: "" }),
	),
}))
vi.mock("util", async (importOriginal) => {
	const actual = await importOriginal<typeof import("util")>()
	return {
		...actual,
		promisify: (fn: (...args: unknown[]) => void) => {
			return (...args: unknown[]) =>
				new Promise((resolve, reject) => {
					fn(...args, (err: Error | null, result: unknown) => {
						if (err) reject(err)
						else resolve(result)
					})
				})
		},
	}
})

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
		it("appends Agent Trace format JSONL line to trace file", async () => {
			vi.mocked(fs.appendFile).mockResolvedValueOnce(undefined)

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

			await logger.log(entry, { modelIdentifier: "claude-3-5-sonnet" })

			expect(fs.appendFile).toHaveBeenCalledWith(TRACE_PATH, expect.any(String), "utf-8")
			const written = vi.mocked(fs.appendFile).mock.calls[0][1] as string
			const parsed = JSON.parse(written.trim()) as AgentTraceEntry
			expect(parsed.vcs.revision_id).toBe("abc123def456")
			expect(parsed.files).toHaveLength(1)
			expect(parsed.files[0].relative_path).toBe("src/new.ts")
			expect(parsed.files[0].conversations[0].contributor).toEqual({
				entity_type: "AI",
				model_identifier: "claude-3-5-sonnet",
			})
			expect(parsed.files[0].conversations[0].ranges[0].content_hash).toBe("sha256:ccc")
			expect(parsed.files[0].conversations[0].related).toContainEqual({
				type: "intent",
				value: "INT-001",
			})
		})

		it("includes specification references in related field", async () => {
			vi.mocked(fs.appendFile).mockResolvedValueOnce(undefined)

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

			await logger.log(entry, {
				relatedSpecs: ["REQ-001", ".specify/specs/hook-system.spec.md"],
			})

			const written = vi.mocked(fs.appendFile).mock.calls[0][1] as string
			const parsed = JSON.parse(written.trim()) as AgentTraceEntry
			const related = parsed.files[0].conversations[0].related
			expect(related).toContainEqual({ type: "specification", value: "REQ-001" })
			expect(related).toContainEqual({ type: "specification", value: ".specify/specs/hook-system.spec.md" })
		})

		it("retries once on first failure", async () => {
			vi.mocked(fs.appendFile).mockRejectedValueOnce(new Error("EBUSY")).mockResolvedValueOnce(undefined)

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

	describe("toAgentTraceEntry", () => {
		it("converts internal entry to Agent Trace format with vcs", async () => {
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

			const agentTrace = await logger.toAgentTraceEntry(entry, {
				modelIdentifier: "claude-3-5-sonnet",
				startLine: 15,
				endLine: 45,
			})

			expect(agentTrace.id).toBe("test-uuid-1234")
			expect(agentTrace.vcs.revision_id).toBe("abc123def456")
			expect(agentTrace.files).toHaveLength(1)
			expect(agentTrace.files[0].conversations[0].ranges[0]).toEqual({
				start_line: 15,
				end_line: 45,
				content_hash: "sha256:bbb",
			})
		})

		it("handles entries without files", async () => {
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

			const agentTrace = await logger.toAgentTraceEntry(entry)

			expect(agentTrace.files).toHaveLength(0)
		})
	})

	describe("getRecentEntries", () => {
		it("returns entries filtered by intent ID from legacy format", async () => {
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

		it("returns entries filtered by intent ID from Agent Trace format", async () => {
			const lines = [
				JSON.stringify({
					id: "at-1",
					timestamp: "2026-02-20T14:30:00Z",
					vcs: { revision_id: "abc123" },
					files: [
						{
							relative_path: "src/file.ts",
							conversations: [
								{
									url: "session-1",
									contributor: { entity_type: "AI", model_identifier: "claude" },
									ranges: [{ start_line: 1, end_line: 10, content_hash: "sha256:xxx" }],
									related: [{ type: "intent", value: "INT-001" }],
								},
							],
						},
					],
				}),
				JSON.stringify({
					id: "at-2",
					timestamp: "2026-02-20T14:31:00Z",
					vcs: { revision_id: "abc123" },
					files: [
						{
							relative_path: "src/other.ts",
							conversations: [
								{
									url: "session-1",
									contributor: { entity_type: "AI", model_identifier: "claude" },
									ranges: [],
									related: [{ type: "intent", value: "INT-002" }],
								},
							],
						},
					],
				}),
			].join("\n")

			vi.mocked(fs.readFile).mockResolvedValueOnce(lines)

			const entries = await logger.getRecentEntries("INT-001")
			expect(entries).toHaveLength(1)
			expect(entries[0].intent_id).toBe("INT-001")
			expect(entries[0].file?.relative_path).toBe("src/file.ts")
		})

		it("returns empty array if file does not exist", async () => {
			vi.mocked(fs.readFile).mockRejectedValueOnce(new Error("ENOENT"))

			const entries = await logger.getRecentEntries("INT-001")
			expect(entries).toEqual([])
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

	describe("getAllAgentTraceEntries", () => {
		it("returns raw Agent Trace entries", async () => {
			const atEntry: AgentTraceEntry = {
				id: "at-1",
				timestamp: "2026-02-20T14:30:00Z",
				vcs: { revision_id: "abc123" },
				files: [
					{
						relative_path: "src/file.ts",
						conversations: [
							{
								url: "session-1",
								contributor: { entity_type: "AI", model_identifier: "claude" },
								ranges: [{ start_line: 1, end_line: 10, content_hash: "sha256:xxx" }],
								related: [{ type: "intent", value: "INT-001" }],
							},
						],
					},
				],
			}

			vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify(atEntry))

			const entries = await logger.getAllAgentTraceEntries()
			expect(entries).toHaveLength(1)
			expect(entries[0].vcs.revision_id).toBe("abc123")
		})
	})
})
