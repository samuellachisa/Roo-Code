import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as fs from "fs/promises"
import { IntentContextLoader } from "../IntentContextLoader"

vi.mock("fs/promises")

const WORKSPACE = "/test/workspace"

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
      - "Must be backward compatible"
    acceptance_criteria:
      - "Hooks intercept all write tools"
      - "Trace entries are logged"
    created_at: "2026-02-18T10:00:00Z"
    updated_at: "2026-02-18T14:00:00Z"
  - id: "INT-002"
    name: "Weather API"
    status: "PENDING"
    owned_scope:
      - "src/api/weather/**"
    constraints:
      - "Use OpenWeatherMap"
    acceptance_criteria:
      - "Fetch weather by city"
    created_at: "2026-02-18T09:00:00Z"
    updated_at: "2026-02-18T09:00:00Z"
`

const INTENT_MAP_MD = `# Intent-Code Spatial Map

## INT-001: Hook System

### Core Components

- \`src/core/hooks/HookEngine.ts\` - Central coordinator
- \`src/core/hooks/IntentContextLoader.ts\` - Context management

## INT-002: Weather API

### Planned Structure

- \`src/api/weather/client.ts\` - API client
`

describe("IntentContextLoader", () => {
	let loader: IntentContextLoader

	beforeEach(() => {
		vi.clearAllMocks()
		loader = new IntentContextLoader(WORKSPACE)
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe("getIntent", () => {
		it("returns the intent matching the ID", async () => {
			vi.mocked(fs.readFile).mockResolvedValueOnce(VALID_YAML)

			const intent = await loader.getIntent("INT-001")
			expect(intent).not.toBeNull()
			expect(intent!.id).toBe("INT-001")
			expect(intent!.name).toBe("Hook System")
			expect(intent!.status).toBe("IN_PROGRESS")
			expect(intent!.owned_scope).toEqual(["src/core/hooks/**", ".orchestration/**"])
		})

		it("returns null for non-existent intent", async () => {
			vi.mocked(fs.readFile).mockResolvedValueOnce(VALID_YAML)

			const intent = await loader.getIntent("INT-999")
			expect(intent).toBeNull()
		})

		it("returns null when YAML is malformed", async () => {
			vi.mocked(fs.readFile).mockResolvedValueOnce("not: valid: yaml: [[[")

			const intent = await loader.getIntent("INT-001")
			expect(intent).toBeNull()
		})

		it("returns null when file does not exist", async () => {
			const err = new Error("ENOENT") as NodeJS.ErrnoException
			err.code = "ENOENT"
			vi.mocked(fs.readFile).mockRejectedValueOnce(err)

			const intent = await loader.getIntent("INT-001")
			expect(intent).toBeNull()
		})
	})

	describe("getAllIntents", () => {
		it("returns all intents from the YAML file", async () => {
			vi.mocked(fs.readFile).mockResolvedValueOnce(VALID_YAML)

			const intents = await loader.getAllIntents()
			expect(intents).toHaveLength(2)
			expect(intents[0].id).toBe("INT-001")
			expect(intents[1].id).toBe("INT-002")
		})
	})

	describe("buildIntentContext", () => {
		it("builds context with intent spec and related files", async () => {
			vi.mocked(fs.readFile).mockResolvedValueOnce(VALID_YAML).mockResolvedValueOnce(INTENT_MAP_MD)

			const context = await loader.buildIntentContext("INT-001")
			expect(context).not.toBeNull()
			expect(context!.intent.id).toBe("INT-001")
			expect(context!.constraints).toEqual(["Must not break existing tools", "Must be backward compatible"])
			expect(context!.acceptanceCriteria).toEqual(["Hooks intercept all write tools", "Trace entries are logged"])
			expect(context!.relatedFiles.length).toBeGreaterThan(0)
		})

		it("returns null for non-existent intent", async () => {
			vi.mocked(fs.readFile).mockResolvedValueOnce(VALID_YAML)

			const context = await loader.buildIntentContext("INT-999")
			expect(context).toBeNull()
		})
	})

	describe("formatContextForPrompt", () => {
		it("produces XML with intent details", async () => {
			vi.mocked(fs.readFile).mockResolvedValueOnce(VALID_YAML).mockResolvedValueOnce(INTENT_MAP_MD)

			const context = await loader.buildIntentContext("INT-001")
			const xml = loader.formatContextForPrompt(context!)

			expect(xml).toContain('<intent_context id="INT-001"')
			expect(xml).toContain("<scope>")
			expect(xml).toContain("<pattern>src/core/hooks/**</pattern>")
			expect(xml).toContain("<constraints>")
			expect(xml).toContain("<constraint>Must not break existing tools</constraint>")
			expect(xml).toContain("<acceptance_criteria>")
			expect(xml).toContain("<related_files>")
		})
	})

	describe("reload", () => {
		it("clears cache and re-reads from disk", async () => {
			vi.mocked(fs.readFile).mockResolvedValue(VALID_YAML)

			await loader.getIntent("INT-001")
			await loader.reload()
			await loader.getIntent("INT-001")

			// readFile called: first load, reload, second load = at least 2 calls
			expect(fs.readFile).toHaveBeenCalledTimes(2)
		})
	})
})
