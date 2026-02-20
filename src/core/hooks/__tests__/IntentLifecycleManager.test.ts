import { describe, it, expect, vi, beforeEach } from "vitest"
import * as fs from "fs/promises"
import { IntentLifecycleManager } from "../IntentLifecycleManager"

vi.mock("fs/promises", async (importOriginal) => {
	const actual = await importOriginal<typeof import("fs/promises")>()
	return {
		...actual,
		readFile: vi.fn(),
		writeFile: vi.fn(),
	}
})

const WORKSPACE = "/test/workspace"

const YAML_CONTENT = `active_intents:
  - id: "INT-001"
    name: "Hook System"
    status: "IN_PROGRESS"
    owned_scope:
      - "src/core/hooks/**"
    constraints: []
    acceptance_criteria: []
    created_at: "2026-02-18T10:00:00Z"
    updated_at: "2026-02-18T14:00:00Z"
  - id: "INT-002"
    name: "Weather API"
    status: "PENDING"
    owned_scope:
      - "src/api/weather/**"
    constraints: []
    acceptance_criteria: []
    created_at: "2026-02-18T09:00:00Z"
    updated_at: "2026-02-18T09:00:00Z"
`

describe("IntentLifecycleManager", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("validateTransition", () => {
		it("allows PENDING → IN_PROGRESS", () => {
			expect(IntentLifecycleManager.validateTransition("PENDING", "IN_PROGRESS")).toBe(true)
		})

		it("allows PENDING → ARCHIVED", () => {
			expect(IntentLifecycleManager.validateTransition("PENDING", "ARCHIVED")).toBe(true)
		})

		it("allows IN_PROGRESS → COMPLETE", () => {
			expect(IntentLifecycleManager.validateTransition("IN_PROGRESS", "COMPLETE")).toBe(true)
		})

		it("allows IN_PROGRESS → BLOCKED", () => {
			expect(IntentLifecycleManager.validateTransition("IN_PROGRESS", "BLOCKED")).toBe(true)
		})

		it("allows IN_PROGRESS → ARCHIVED", () => {
			expect(IntentLifecycleManager.validateTransition("IN_PROGRESS", "ARCHIVED")).toBe(true)
		})

		it("allows BLOCKED → IN_PROGRESS", () => {
			expect(IntentLifecycleManager.validateTransition("BLOCKED", "IN_PROGRESS")).toBe(true)
		})

		it("allows BLOCKED → ARCHIVED", () => {
			expect(IntentLifecycleManager.validateTransition("BLOCKED", "ARCHIVED")).toBe(true)
		})

		it("allows COMPLETE → ARCHIVED", () => {
			expect(IntentLifecycleManager.validateTransition("COMPLETE", "ARCHIVED")).toBe(true)
		})

		// Prohibited transitions
		it("prohibits COMPLETE → IN_PROGRESS", () => {
			expect(IntentLifecycleManager.validateTransition("COMPLETE", "IN_PROGRESS")).toBe(false)
		})

		it("prohibits ARCHIVED → any", () => {
			expect(IntentLifecycleManager.validateTransition("ARCHIVED", "PENDING")).toBe(false)
			expect(IntentLifecycleManager.validateTransition("ARCHIVED", "IN_PROGRESS")).toBe(false)
			expect(IntentLifecycleManager.validateTransition("ARCHIVED", "COMPLETE")).toBe(false)
			expect(IntentLifecycleManager.validateTransition("ARCHIVED", "BLOCKED")).toBe(false)
		})

		it("prohibits any → PENDING", () => {
			expect(IntentLifecycleManager.validateTransition("IN_PROGRESS", "PENDING")).toBe(false)
			expect(IntentLifecycleManager.validateTransition("COMPLETE", "PENDING")).toBe(false)
			expect(IntentLifecycleManager.validateTransition("BLOCKED", "PENDING")).toBe(false)
		})

		it("prohibits PENDING → COMPLETE", () => {
			expect(IntentLifecycleManager.validateTransition("PENDING", "COMPLETE")).toBe(false)
		})

		it("prohibits PENDING → BLOCKED", () => {
			expect(IntentLifecycleManager.validateTransition("PENDING", "BLOCKED")).toBe(false)
		})
	})

	describe("transitionIntent", () => {
		it("transitions PENDING → IN_PROGRESS and updates YAML", async () => {
			vi.mocked(fs.readFile).mockResolvedValueOnce(YAML_CONTENT)
			vi.mocked(fs.writeFile).mockResolvedValueOnce(undefined)

			await IntentLifecycleManager.transitionIntent("INT-002", "IN_PROGRESS", WORKSPACE)

			expect(fs.writeFile).toHaveBeenCalled()
			const written = vi.mocked(fs.writeFile).mock.calls[0][1] as string
			expect(written).toContain("IN_PROGRESS")
		})

		it("throws on illegal transition", async () => {
			vi.mocked(fs.readFile).mockResolvedValueOnce(YAML_CONTENT)

			await expect(IntentLifecycleManager.transitionIntent("INT-002", "COMPLETE", WORKSPACE)).rejects.toThrow(
				"Illegal transition",
			)
		})

		it("throws when intent not found", async () => {
			vi.mocked(fs.readFile).mockResolvedValueOnce(YAML_CONTENT)

			await expect(IntentLifecycleManager.transitionIntent("INT-999", "IN_PROGRESS", WORKSPACE)).rejects.toThrow(
				"not found",
			)
		})

		it("updates updated_at timestamp", async () => {
			vi.mocked(fs.readFile).mockResolvedValueOnce(YAML_CONTENT)
			vi.mocked(fs.writeFile).mockResolvedValueOnce(undefined)

			await IntentLifecycleManager.transitionIntent("INT-002", "IN_PROGRESS", WORKSPACE)

			const written = vi.mocked(fs.writeFile).mock.calls[0][1] as string
			// INT-002's updated_at should be a 2026-02-20 timestamp (today), not the original
			const int002Section = written.split("INT-002")[1]
			expect(int002Section).toBeDefined()
			expect(int002Section).not.toContain('updated_at: "2026-02-18T09:00:00Z"')
		})
	})

	describe("updateIntentField", () => {
		it("updates a field and writes back to YAML", async () => {
			vi.mocked(fs.readFile).mockResolvedValueOnce(YAML_CONTENT)
			vi.mocked(fs.writeFile).mockResolvedValueOnce(undefined)

			await IntentLifecycleManager.updateIntentField("INT-001", "version", 2, WORKSPACE)

			expect(fs.writeFile).toHaveBeenCalled()
			const written = vi.mocked(fs.writeFile).mock.calls[0][1] as string
			expect(written).toContain("version: 2")
		})

		it("throws when intent not found", async () => {
			vi.mocked(fs.readFile).mockResolvedValueOnce(YAML_CONTENT)

			await expect(IntentLifecycleManager.updateIntentField("INT-999", "version", 2, WORKSPACE)).rejects.toThrow(
				"not found",
			)
		})
	})
})
