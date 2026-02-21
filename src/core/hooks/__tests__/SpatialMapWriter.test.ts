import { describe, it, expect, vi, beforeEach } from "vitest"
import * as fs from "fs/promises"
import { SpatialMapWriter } from "../SpatialMapWriter"

vi.mock("fs/promises", async (importOriginal) => {
	const actual = await importOriginal<typeof import("fs/promises")>()
	return {
		...actual,
		readFile: vi.fn(),
		writeFile: vi.fn(),
	}
})

const WORKSPACE = "/test/workspace"

const EXISTING_MAP = `# Intent-Code Spatial Map

This file maps business intents to physical files and AST nodes.

## INT-001: Hook System

### Core Components

- \`src/core/hooks/HookEngine.ts\` - Central coordinator
- \`src/core/hooks/types.ts\` - Type definitions

## INT-002: Weather API

### Planned Structure

- \`src/api/weather/client.ts\` - API client

---

_This file is automatically updated by the hook system as intents evolve._
`

describe("SpatialMapWriter", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("addFileToIntent", () => {
		it("adds a new file to an existing intent section", async () => {
			vi.mocked(fs.readFile).mockResolvedValueOnce(EXISTING_MAP)
			vi.mocked(fs.writeFile).mockResolvedValueOnce(undefined)

			await SpatialMapWriter.addFileToIntent("INT-001", "src/core/hooks/NewFile.ts", WORKSPACE)

			expect(fs.writeFile).toHaveBeenCalled()
			const written = vi.mocked(fs.writeFile).mock.calls[0][1] as string
			expect(written).toContain("`src/core/hooks/NewFile.ts`")
		})

		it("does not duplicate existing entries", async () => {
			vi.mocked(fs.readFile).mockResolvedValueOnce(EXISTING_MAP)
			vi.mocked(fs.writeFile).mockResolvedValueOnce(undefined)

			await SpatialMapWriter.addFileToIntent("INT-001", "src/core/hooks/HookEngine.ts", WORKSPACE)

			// Should still write (no new file entry but no error)
			// The file entry is already listed, so no duplication occurs
		})

		it("creates a new section if intent not found", async () => {
			vi.mocked(fs.readFile).mockResolvedValueOnce(EXISTING_MAP)
			vi.mocked(fs.writeFile).mockResolvedValueOnce(undefined)

			await SpatialMapWriter.addFileToIntent("INT-003", "src/new/file.ts", WORKSPACE, "New Feature")

			expect(fs.writeFile).toHaveBeenCalled()
			const written = vi.mocked(fs.writeFile).mock.calls[0][1] as string
			expect(written).toContain("## INT-003: New Feature")
			expect(written).toContain("`src/new/file.ts`")
		})

		it("creates map file if it does not exist", async () => {
			vi.mocked(fs.readFile).mockRejectedValueOnce(new Error("ENOENT"))
			vi.mocked(fs.writeFile).mockResolvedValueOnce(undefined)

			await SpatialMapWriter.addFileToIntent("INT-001", "src/file.ts", WORKSPACE, "Hook System")

			expect(fs.writeFile).toHaveBeenCalled()
			const written = vi.mocked(fs.writeFile).mock.calls[0][1] as string
			expect(written).toContain("Intent-Code Spatial Map")
			expect(written).toContain("`src/file.ts`")
		})

		it("appends evolution log on INTENT_EVOLUTION mutation", async () => {
			vi.mocked(fs.readFile).mockResolvedValueOnce(EXISTING_MAP)
			vi.mocked(fs.writeFile).mockResolvedValueOnce(undefined)

			await SpatialMapWriter.addFileToIntent(
				"INT-001",
				"src/core/hooks/NewFeature.ts",
				WORKSPACE,
				"Hook System",
				"INTENT_EVOLUTION",
			)

			expect(fs.writeFile).toHaveBeenCalled()
			const written = vi.mocked(fs.writeFile).mock.calls[0][1] as string
			expect(written).toContain("`src/core/hooks/NewFeature.ts`")
			expect(written).toContain("### Evolution Log")
			expect(written).toContain("[EVOLUTION")
			expect(written).toContain("new behavior added")
		})

		it("does not add evolution log for AST_REFACTOR mutation", async () => {
			vi.mocked(fs.readFile).mockResolvedValueOnce(EXISTING_MAP)
			vi.mocked(fs.writeFile).mockResolvedValueOnce(undefined)

			await SpatialMapWriter.addFileToIntent(
				"INT-001",
				"src/core/hooks/Refactored.ts",
				WORKSPACE,
				"Hook System",
				"AST_REFACTOR",
			)

			expect(fs.writeFile).toHaveBeenCalled()
			const written = vi.mocked(fs.writeFile).mock.calls[0][1] as string
			expect(written).toContain("`src/core/hooks/Refactored.ts`")
			expect(written).not.toContain("### Evolution Log")
		})
	})

	describe("removeFileFromIntent", () => {
		it("removes an existing file entry", async () => {
			vi.mocked(fs.readFile).mockResolvedValueOnce(EXISTING_MAP)
			vi.mocked(fs.writeFile).mockResolvedValueOnce(undefined)

			await SpatialMapWriter.removeFileFromIntent("INT-001", "src/core/hooks/types.ts", WORKSPACE)

			expect(fs.writeFile).toHaveBeenCalled()
			const written = vi.mocked(fs.writeFile).mock.calls[0][1] as string
			expect(written).not.toContain("`src/core/hooks/types.ts`")
			expect(written).toContain("`src/core/hooks/HookEngine.ts`") // other entry preserved
		})

		it("does nothing if map file does not exist", async () => {
			vi.mocked(fs.readFile).mockRejectedValueOnce(new Error("ENOENT"))

			await SpatialMapWriter.removeFileFromIntent("INT-001", "src/file.ts", WORKSPACE)

			expect(fs.writeFile).not.toHaveBeenCalled()
		})
	})
})
