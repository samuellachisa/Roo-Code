import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("vscode", () => ({
	window: {
		showWarningMessage: vi.fn(),
	},
}))

import * as vscode from "vscode"
import { HITLGate } from "../HITLGate"

describe("HITLGate", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		HITLGate.setEnabled(true)
	})

	afterEach(() => {
		HITLGate.setEnabled(true)
	})

	describe("isDestructive", () => {
		it("returns true for execute_command", () => {
			expect(HITLGate.isDestructive("execute_command")).toBe(true)
		})

		it("returns true for delete_file", () => {
			expect(HITLGate.isDestructive("delete_file")).toBe(true)
		})

		it("returns false for write_to_file", () => {
			expect(HITLGate.isDestructive("write_to_file")).toBe(false)
		})

		it("returns false for read_file", () => {
			expect(HITLGate.isDestructive("read_file")).toBe(false)
		})
	})

	describe("requestApproval", () => {
		it("auto-approves when disabled", async () => {
			HITLGate.setEnabled(false)

			const result = await HITLGate.requestApproval({
				toolName: "execute_command",
				intentId: "INT-001",
			})

			expect(result.approved).toBe(true)
			expect(vscode.window.showWarningMessage).not.toHaveBeenCalled()
		})

		it("approves when user clicks Allow", async () => {
			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue("Allow" as any)

			const result = await HITLGate.requestApproval({
				toolName: "execute_command",
				intentId: "INT-001",
				filePath: "src/danger.sh",
			})

			expect(result.approved).toBe(true)
			expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
				expect.stringContaining("execute_command"),
				{ modal: true },
				"Allow",
				"Reject",
			)
		})

		it("rejects when user clicks Reject", async () => {
			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue("Reject" as any)

			const result = await HITLGate.requestApproval({
				toolName: "delete_file",
				intentId: "INT-002",
			})

			expect(result.approved).toBe(false)
			expect(result.reason).toContain("Human rejected")
		})

		it("rejects when user dismisses dialog", async () => {
			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(undefined as any)

			const result = await HITLGate.requestApproval({
				toolName: "execute_command",
				intentId: "INT-001",
			})

			expect(result.approved).toBe(false)
		})

		it("includes file path in message when provided", async () => {
			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue("Allow" as any)

			await HITLGate.requestApproval({
				toolName: "execute_command",
				intentId: "INT-001",
				filePath: "rm -rf /",
			})

			const message = vi.mocked(vscode.window.showWarningMessage).mock.calls[0][0]
			expect(message).toContain("rm -rf /")
		})
	})
})
