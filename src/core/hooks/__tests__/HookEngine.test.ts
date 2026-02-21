import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as fs from "fs/promises"
import { HookEngine } from "../HookEngine"
import { HITLGate } from "../HITLGate"

vi.mock("fs/promises", async (importOriginal) => {
	const actual = await importOriginal<typeof import("fs/promises")>()
	return {
		...actual,
		readFile: vi.fn(),
		stat: vi.fn(),
		access: vi.fn(),
		appendFile: vi.fn(),
		writeFile: vi.fn(),
	}
})
vi.mock("uuid", () => ({
	v4: () => "trace-uuid-1234",
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
const SESSION = "test-session-1"

const VALID_YAML = `
active_intents:
  - id: "INT-001"
    name: "Hook System"
    status: "IN_PROGRESS"
    owned_scope:
      - "src/core/hooks/**"
      - ".orchestration/**"
    constraints:
      - "Must not break existing tools"
    acceptance_criteria:
      - "Hooks intercept all writes"
    created_at: "2026-02-18T10:00:00Z"
    updated_at: "2026-02-18T14:00:00Z"
  - id: "INT-002"
    name: "Weather API"
    status: "COMPLETE"
    owned_scope:
      - "src/api/weather/**"
    constraints: []
    acceptance_criteria: []
    created_at: "2026-02-18T09:00:00Z"
    updated_at: "2026-02-18T09:00:00Z"
`

function mockOrchestrationExists() {
	vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any)
	vi.mocked(fs.access).mockResolvedValue(undefined)
}

function mockOrchestrationMissing() {
	vi.mocked(fs.stat).mockRejectedValue(new Error("ENOENT"))
}

describe("HookEngine", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		HookEngine.clearInstances()
		HITLGate.setEnabled(false) // Disable HITL for tests to avoid modal prompts
	})

	afterEach(() => {
		HITLGate.setEnabled(true)
		vi.restoreAllMocks()
		HookEngine.clearInstances()
	})

	describe("getInstance", () => {
		it("returns same instance for same workspace+session", () => {
			const a = HookEngine.getInstance(WORKSPACE, SESSION)
			const b = HookEngine.getInstance(WORKSPACE, SESSION)
			expect(a).toBe(b)
		})

		it("returns different instances for different sessions", () => {
			const a = HookEngine.getInstance(WORKSPACE, "session-a")
			const b = HookEngine.getInstance(WORKSPACE, "session-b")
			expect(a).not.toBe(b)
		})
	})

	describe("isEnabled", () => {
		it("returns true when .orchestration/ exists with active_intents.yaml", async () => {
			mockOrchestrationExists()
			const engine = HookEngine.getInstance(WORKSPACE, SESSION)
			expect(await engine.isEnabled()).toBe(true)
		})

		it("returns false when .orchestration/ does not exist", async () => {
			mockOrchestrationMissing()
			const engine = HookEngine.getInstance(WORKSPACE, SESSION)
			expect(await engine.isEnabled()).toBe(false)
		})
	})

	describe("intent management", () => {
		it("starts with no active intent", () => {
			const engine = HookEngine.getInstance(WORKSPACE, SESSION)
			expect(engine.getActiveIntent()).toBeNull()
		})

		it("sets and gets active intent", () => {
			const engine = HookEngine.getInstance(WORKSPACE, SESSION)
			engine.setActiveIntent("INT-001")
			expect(engine.getActiveIntent()).toBe("INT-001")
		})

		it("clears active intent", () => {
			const engine = HookEngine.getInstance(WORKSPACE, SESSION)
			engine.setActiveIntent("INT-001")
			engine.clearActiveIntent()
			expect(engine.getActiveIntent()).toBeNull()
		})
	})

	describe("preToolUse", () => {
		it("allows exempt tools without intent", async () => {
			const engine = HookEngine.getInstance(WORKSPACE, SESSION)

			const result = await engine.preToolUse({
				toolName: "read_file",
				filePath: "src/file.ts",
				intentId: null,
				params: {},
				sessionId: SESSION,
			})

			expect(result.allowed).toBe(true)
		})

		it("rejects execute_command (destructive) without active intent", async () => {
			mockOrchestrationExists()
			vi.mocked(fs.readFile).mockResolvedValue(VALID_YAML)
			const engine = HookEngine.getInstance(WORKSPACE, SESSION)

			const result = await engine.preToolUse({
				toolName: "execute_command",
				filePath: null,
				intentId: null,
				params: { command: "rm -rf /" },
				sessionId: SESSION,
			})

			expect(result.allowed).toBe(false)
			expect(result.reason).toContain("No active intent")
		})

		it("allows execute_command with valid intent and HITL (disabled in tests)", async () => {
			mockOrchestrationExists()
			vi.mocked(fs.readFile).mockResolvedValue(VALID_YAML)
			const engine = HookEngine.getInstance(WORKSPACE, SESSION)
			engine.setActiveIntent("INT-001")

			const result = await engine.preToolUse({
				toolName: "execute_command",
				filePath: null,
				intentId: "INT-001",
				params: { command: "npm test" },
				sessionId: SESSION,
			})

			expect(result.allowed).toBe(true)
			expect(result.metadata?.destructive).toBe(true)
		})

		it("rejects write tools without active intent", async () => {
			vi.mocked(fs.readFile).mockResolvedValue(VALID_YAML)
			const engine = HookEngine.getInstance(WORKSPACE, SESSION)

			const result = await engine.preToolUse({
				toolName: "write_to_file",
				filePath: "src/file.ts",
				intentId: null,
				params: {},
				sessionId: SESSION,
			})

			expect(result.allowed).toBe(false)
			expect(result.reason).toContain("No active intent")
		})

		it("rejects when intent is not found", async () => {
			vi.mocked(fs.readFile).mockResolvedValue(VALID_YAML)
			const engine = HookEngine.getInstance(WORKSPACE, SESSION)

			const result = await engine.preToolUse({
				toolName: "write_to_file",
				filePath: "src/file.ts",
				intentId: "INT-999",
				params: {},
				sessionId: SESSION,
			})

			expect(result.allowed).toBe(false)
			expect(result.reason).toContain("not found")
		})

		it("rejects COMPLETE intents", async () => {
			vi.mocked(fs.readFile).mockResolvedValue(VALID_YAML)
			const engine = HookEngine.getInstance(WORKSPACE, SESSION)

			const result = await engine.preToolUse({
				toolName: "write_to_file",
				filePath: "src/api/weather/client.ts",
				intentId: "INT-002",
				params: {},
				sessionId: SESSION,
			})

			expect(result.allowed).toBe(false)
			expect(result.reason).toContain("COMPLETE")
		})

		it("rejects PENDING intents", async () => {
			const yamlWithPending = VALID_YAML.replace('status: "IN_PROGRESS"', 'status: "PENDING"')
			vi.mocked(fs.readFile).mockResolvedValue(yamlWithPending)
			const engine = HookEngine.getInstance(WORKSPACE, SESSION)

			const result = await engine.preToolUse({
				toolName: "write_to_file",
				filePath: "src/core/hooks/HookEngine.ts",
				intentId: "INT-001",
				params: {},
				sessionId: SESSION,
			})

			expect(result.allowed).toBe(false)
			expect(result.reason).toContain("PENDING")
		})

		it("rejects BLOCKED intents", async () => {
			const yamlWithBlocked = VALID_YAML.replace('status: "IN_PROGRESS"', 'status: "BLOCKED"')
			vi.mocked(fs.readFile).mockResolvedValue(yamlWithBlocked)
			const engine = HookEngine.getInstance(WORKSPACE, SESSION)

			const result = await engine.preToolUse({
				toolName: "write_to_file",
				filePath: "src/core/hooks/HookEngine.ts",
				intentId: "INT-001",
				params: {},
				sessionId: SESSION,
			})

			expect(result.allowed).toBe(false)
			expect(result.reason).toContain("BLOCKED")
		})

		it("rejects ARCHIVED intents", async () => {
			const yamlWithArchived = VALID_YAML.replace('status: "COMPLETE"', 'status: "ARCHIVED"')
			vi.mocked(fs.readFile).mockResolvedValue(yamlWithArchived)
			const engine = HookEngine.getInstance(WORKSPACE, SESSION)

			const result = await engine.preToolUse({
				toolName: "write_to_file",
				filePath: "src/api/weather/client.ts",
				intentId: "INT-002",
				params: {},
				sessionId: SESSION,
			})

			expect(result.allowed).toBe(false)
			expect(result.reason).toContain("ARCHIVED")
		})

		it("rejects out-of-scope file paths", async () => {
			vi.mocked(fs.readFile).mockResolvedValue(VALID_YAML)
			const engine = HookEngine.getInstance(WORKSPACE, SESSION)

			const result = await engine.preToolUse({
				toolName: "write_to_file",
				filePath: "src/api/weather/client.ts",
				intentId: "INT-001",
				params: {},
				sessionId: SESSION,
			})

			expect(result.allowed).toBe(false)
			expect(result.reason).toContain("Scope violation")
		})

		it("allows in-scope file paths with valid intent", async () => {
			vi.mocked(fs.readFile).mockResolvedValue(VALID_YAML)
			// computeFileHash will try to read the file
			const enoent = new Error("ENOENT") as NodeJS.ErrnoException
			enoent.code = "ENOENT"
			// After YAML read, file hash read will fail with ENOENT (new file)
			vi.mocked(fs.readFile).mockResolvedValueOnce(VALID_YAML).mockRejectedValueOnce(enoent)

			const engine = HookEngine.getInstance(WORKSPACE, SESSION)

			const result = await engine.preToolUse({
				toolName: "write_to_file",
				filePath: "src/core/hooks/NewFile.ts",
				intentId: "INT-001",
				params: {},
				sessionId: SESSION,
			})

			expect(result.allowed).toBe(true)
		})

		it("computes preHash for existing files", async () => {
			vi.mocked(fs.readFile)
				.mockResolvedValueOnce(VALID_YAML) // intents load
				.mockResolvedValueOnce(Buffer.from("file content")) // file hash

			const engine = HookEngine.getInstance(WORKSPACE, SESSION)

			const result = await engine.preToolUse({
				toolName: "write_to_file",
				filePath: "src/core/hooks/existing.ts",
				intentId: "INT-001",
				params: {},
				sessionId: SESSION,
			})

			expect(result.allowed).toBe(true)
			expect(result.preHash).toMatch(/^sha256:/)
		})
	})

	describe("postToolUse", () => {
		it("appends trace entry for write tools", async () => {
			vi.mocked(fs.readFile).mockResolvedValue(VALID_YAML)
			vi.mocked(fs.appendFile).mockResolvedValue(undefined)

			const engine = HookEngine.getInstance(WORKSPACE, SESSION)
			engine.setActiveIntent("INT-001")

			// File read for post-hash will fail (simulating new file that was just created)
			const enoent = new Error("ENOENT") as NodeJS.ErrnoException
			enoent.code = "ENOENT"
			vi.mocked(fs.readFile).mockRejectedValueOnce(enoent)

			await engine.postToolUse({
				toolName: "write_to_file",
				filePath: "src/core/hooks/NewFile.ts",
				intentId: "INT-001",
				params: {},
				sessionId: SESSION,
				preHash: null,
				success: true,
			})

			expect(fs.appendFile).toHaveBeenCalled()
		})

		it("does not trace exempt tools", async () => {
			const engine = HookEngine.getInstance(WORKSPACE, SESSION)

			await engine.postToolUse({
				toolName: "read_file",
				filePath: "src/file.ts",
				intentId: "INT-001",
				params: {},
				sessionId: SESSION,
				preHash: null,
				success: true,
			})

			expect(fs.appendFile).not.toHaveBeenCalled()
		})

		it("uses agent-provided mutation_class when valid", async () => {
			vi.mocked(fs.readFile).mockResolvedValue(VALID_YAML)
			vi.mocked(fs.appendFile).mockImplementation(async (path, data) => {
				const entry = JSON.parse(data as string)
				expect(entry.files[0]?.conversations[0]?.related).toBeDefined()
				// Agent passed mutation_class=AST_REFACTOR; we verify via the trace structure
				// (mutation_class is internal; Agent Trace format uses ranges/related)
				expect(entry.id).toBeDefined()
				expect(entry.vcs).toBeDefined()
			})

			const engine = HookEngine.getInstance(WORKSPACE, SESSION)
			engine.setActiveIntent("INT-001")

			const enoent = new Error("ENOENT") as NodeJS.ErrnoException
			enoent.code = "ENOENT"
			vi.mocked(fs.readFile).mockRejectedValueOnce(enoent)

			await engine.postToolUse({
				toolName: "write_to_file",
				filePath: "src/core/hooks/RefactoredFile.ts",
				intentId: "INT-001",
				params: { mutation_class: "AST_REFACTOR" },
				sessionId: SESSION,
				preHash: "sha256:abc123",
				success: true,
			})

			expect(fs.appendFile).toHaveBeenCalled()
			const appendCall = vi.mocked(fs.appendFile).mock.calls[0]
			const logged = JSON.parse(appendCall[1] as string)
			// Verify intent is in related (agent trace format)
			const related = logged.files?.[0]?.conversations?.[0]?.related ?? []
			expect(
				related.some((r: { type: string; value: string }) => r.type === "intent" && r.value === "INT-001"),
			).toBe(true)
		})

		it("updates spatial map on successful write", async () => {
			vi.mocked(fs.readFile).mockResolvedValue(VALID_YAML)
			vi.mocked(fs.appendFile).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)

			const engine = HookEngine.getInstance(WORKSPACE, SESSION)
			engine.setActiveIntent("INT-001")

			await engine.postToolUse({
				toolName: "write_to_file",
				filePath: "src/core/hooks/NewComponent.ts",
				intentId: "INT-001",
				params: {},
				sessionId: SESSION,
				preHash: null,
				success: true,
			})

			expect(fs.writeFile).toHaveBeenCalled()
		})
	})
})
