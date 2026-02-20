/**
 * HITLGate (Human-in-the-Loop Gate)
 *
 * Shows a VS Code warning dialog asking for human approval before
 * executing destructive commands (execute_command, delete_file).
 * The dialog blocks execution until the user responds.
 *
 * Destructive tools are those that can cause irreversible damage:
 * - execute_command: arbitrary shell execution
 * - delete_file: permanent file removal
 *
 * Write tools (write_to_file, apply_diff, etc.) are governed by
 * scope validation and optimistic locking, so they don't need HITL.
 */

import * as vscode from "vscode"

const DESTRUCTIVE_TOOLS: ReadonlySet<string> = new Set(["execute_command", "delete_file"])

export interface HITLDecision {
	approved: boolean
	reason?: string
}

export class HITLGate {
	private static _enabled = true

	/**
	 * Enable or disable HITL globally (useful for testing).
	 */
	static setEnabled(enabled: boolean): void {
		HITLGate._enabled = enabled
	}

	static isEnabled(): boolean {
		return HITLGate._enabled
	}

	/**
	 * Returns true if this tool requires HITL approval.
	 */
	static isDestructive(toolName: string): boolean {
		return DESTRUCTIVE_TOOLS.has(toolName)
	}

	/**
	 * Request human approval via VS Code warning dialog.
	 * Returns approved=true if the user clicks "Allow", false otherwise.
	 *
	 * If HITL is disabled (e.g. in tests), auto-approves.
	 */
	static async requestApproval(params: {
		toolName: string
		intentId: string
		filePath?: string | null
		description?: string
	}): Promise<HITLDecision> {
		if (!HITLGate._enabled) {
			return { approved: true }
		}

		const { toolName, intentId, filePath, description } = params

		let message = `[Governance] Intent ${intentId}: ${toolName}`
		if (filePath) {
			message += ` on ${filePath}`
		}
		if (description) {
			message += `\n${description}`
		}

		const choice = await vscode.window.showWarningMessage(message, { modal: true }, "Allow", "Reject")

		if (choice === "Allow") {
			return { approved: true }
		}

		return {
			approved: false,
			reason: `Human rejected ${toolName} execution via HITL gate.`,
		}
	}
}
