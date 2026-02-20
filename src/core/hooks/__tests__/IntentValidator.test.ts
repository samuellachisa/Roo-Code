import { describe, it, expect } from "vitest"
import { IntentValidator } from "../IntentValidator"

describe("IntentValidator", () => {
	const validator = new IntentValidator()

	const validIntent = {
		id: "INT-001",
		name: "Hook System",
		status: "IN_PROGRESS",
		version: 1,
		owned_scope: ["src/core/hooks/**"],
		constraints: ["Must be backward compatible"],
		acceptance_criteria: ["Hooks intercept writes"],
		related_specs: [{ type: "speckit", ref: ".specify/specs/hook-system.spec.md" }],
		parent_intent: null,
		tags: ["governance"],
		created_at: "2026-02-18T10:00:00Z",
		updated_at: "2026-02-18T14:00:00Z",
	}

	describe("validateIntentSpec", () => {
		it("validates a correct intent without errors", () => {
			const result = validator.validateIntentSpec(validIntent)
			expect(result.valid).toBe(true)
			expect(result.errors).toHaveLength(0)
		})

		it("requires id field", () => {
			const { id, ...noId } = validIntent
			const result = validator.validateIntentSpec(noId)
			expect(result.valid).toBe(false)
			expect(result.errors.some((e) => e.includes("id"))).toBe(true)
		})

		it("rejects id not matching pattern", () => {
			const result = validator.validateIntentSpec({ ...validIntent, id: "bad-id" })
			expect(result.valid).toBe(false)
			expect(result.errors.some((e) => e.includes("pattern"))).toBe(true)
		})

		it("accepts valid id patterns", () => {
			for (const id of ["INT-001", "REQ-042", "FEAT-1234"]) {
				const result = validator.validateIntentSpec({ ...validIntent, id })
				expect(result.valid).toBe(true)
			}
		})

		it("requires name with min 3 chars", () => {
			const result = validator.validateIntentSpec({ ...validIntent, name: "ab" })
			expect(result.valid).toBe(false)
			expect(result.errors.some((e) => e.includes("name"))).toBe(true)
		})

		it("rejects name over 200 chars", () => {
			const result = validator.validateIntentSpec({ ...validIntent, name: "x".repeat(201) })
			expect(result.valid).toBe(false)
		})

		it("requires valid status", () => {
			const result = validator.validateIntentSpec({ ...validIntent, status: "INVALID" })
			expect(result.valid).toBe(false)
			expect(result.errors.some((e) => e.includes("status"))).toBe(true)
		})

		it("accepts all valid statuses", () => {
			for (const status of ["PENDING", "IN_PROGRESS", "COMPLETE", "BLOCKED", "ARCHIVED"]) {
				const result = validator.validateIntentSpec({ ...validIntent, status })
				expect(result.valid).toBe(true)
			}
		})

		it("requires non-empty owned_scope", () => {
			const result = validator.validateIntentSpec({ ...validIntent, owned_scope: [] })
			expect(result.valid).toBe(false)
			expect(result.errors.some((e) => e.includes("owned_scope"))).toBe(true)
		})

		it("requires constraints array", () => {
			const result = validator.validateIntentSpec({ ...validIntent, constraints: "not array" })
			expect(result.valid).toBe(false)
		})

		it("requires acceptance_criteria array", () => {
			const result = validator.validateIntentSpec({ ...validIntent, acceptance_criteria: null })
			expect(result.valid).toBe(false)
		})

		it("requires created_at", () => {
			const { created_at, ...noCreated } = validIntent
			const result = validator.validateIntentSpec(noCreated)
			expect(result.valid).toBe(false)
		})

		it("requires updated_at", () => {
			const { updated_at, ...noUpdated } = validIntent
			const result = validator.validateIntentSpec(noUpdated)
			expect(result.valid).toBe(false)
		})

		it("warns on invalid version", () => {
			const result = validator.validateIntentSpec({ ...validIntent, version: 0 })
			expect(result.valid).toBe(true) // warnings, not errors
			expect(result.warnings.some((w) => w.includes("version"))).toBe(true)
		})

		it("warns on invalid related_specs type", () => {
			const result = validator.validateIntentSpec({
				...validIntent,
				related_specs: [{ type: "invalid_type", ref: "some.md" }],
			})
			expect(result.valid).toBe(true)
			expect(result.warnings.some((w) => w.includes("invalid type"))).toBe(true)
		})

		it("warns on invalid parent_intent pattern", () => {
			const result = validator.validateIntentSpec({ ...validIntent, parent_intent: "bad-id" })
			expect(result.valid).toBe(true)
			expect(result.warnings.some((w) => w.includes("parent_intent"))).toBe(true)
		})

		it("rejects non-object input", () => {
			expect(validator.validateIntentSpec(null).valid).toBe(false)
			expect(validator.validateIntentSpec("string").valid).toBe(false)
			expect(validator.validateIntentSpec(42).valid).toBe(false)
		})

		it("validates minimal required fields only", () => {
			const minimal = {
				id: "INT-100",
				name: "Minimal Intent",
				status: "PENDING",
				owned_scope: ["src/**"],
				constraints: [],
				acceptance_criteria: [],
				created_at: "2026-01-01T00:00:00Z",
				updated_at: "2026-01-01T00:00:00Z",
			}
			const result = validator.validateIntentSpec(minimal)
			expect(result.valid).toBe(true)
		})
	})

	describe("validateActiveIntentsFile", () => {
		it("validates a correct file", () => {
			const result = validator.validateActiveIntentsFile({
				active_intents: [validIntent],
			})
			expect(result.valid).toBe(true)
		})

		it("rejects non-object input", () => {
			expect(validator.validateActiveIntentsFile(null).valid).toBe(false)
		})

		it("rejects missing active_intents", () => {
			expect(validator.validateActiveIntentsFile({}).valid).toBe(false)
		})

		it("detects duplicate IDs", () => {
			const result = validator.validateActiveIntentsFile({
				active_intents: [validIntent, validIntent],
			})
			expect(result.valid).toBe(false)
			expect(result.errors.some((e) => e.includes("duplicate"))).toBe(true)
		})

		it("reports per-intent validation errors", () => {
			const result = validator.validateActiveIntentsFile({
				active_intents: [{ id: "bad" }],
			})
			expect(result.valid).toBe(false)
			expect(result.errors.some((e) => e.includes("intent[0]"))).toBe(true)
		})
	})
})
