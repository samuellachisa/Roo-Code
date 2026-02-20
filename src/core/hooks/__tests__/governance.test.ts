import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("fs/promises", () => ({
	access: vi.fn(),
}))

import * as fs from "fs/promises"
import { getGovernanceSection } from "../../prompts/sections/governance"

describe("getGovernanceSection", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("returns governance preamble when .orchestration exists", async () => {
		vi.mocked(fs.access).mockResolvedValue()

		const result = await getGovernanceSection("/workspace")
		expect(result).toContain("INTENT-DRIVEN GOVERNANCE")
		expect(result).toContain("select_active_intent")
		expect(result).toContain("MANDATORY")
		expect(result).toContain("active_intents.yaml")
	})

	it("returns empty string when .orchestration does not exist", async () => {
		vi.mocked(fs.access).mockRejectedValue(new Error("ENOENT"))

		const result = await getGovernanceSection("/workspace")
		expect(result).toBe("")
	})

	it("mentions scope violation handling", async () => {
		vi.mocked(fs.access).mockResolvedValue()

		const result = await getGovernanceSection("/workspace")
		expect(result).toContain("scope")
		expect(result).toContain("owned_scope")
	})

	it("mentions cryptographic tracing", async () => {
		vi.mocked(fs.access).mockResolvedValue()

		const result = await getGovernanceSection("/workspace")
		expect(result).toContain("agent_trace.jsonl")
	})
})
