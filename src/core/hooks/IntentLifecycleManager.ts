/**
 * IntentLifecycleManager
 *
 * Validates and executes intent state transitions.
 * Writes back to active_intents.yaml with updated timestamps.
 *
 * SPEC-002 §2: Only legal transitions are permitted.
 * SPEC-002 §2.4: Prohibited transitions are enforced.
 */

import * as fs from "fs/promises"
import * as path from "path"
import YAML from "yaml"

import type { IntentStatus, ActiveIntentsFile } from "./types"

const INTENTS_FILENAME = "active_intents.yaml"

const VALID_TRANSITIONS: ReadonlyMap<IntentStatus, ReadonlySet<IntentStatus>> = new Map([
	["PENDING", new Set<IntentStatus>(["IN_PROGRESS", "ARCHIVED"])],
	["IN_PROGRESS", new Set<IntentStatus>(["COMPLETE", "BLOCKED", "ARCHIVED"])],
	["BLOCKED", new Set<IntentStatus>(["IN_PROGRESS", "ARCHIVED"])],
	["COMPLETE", new Set<IntentStatus>(["ARCHIVED"])],
	["ARCHIVED", new Set<IntentStatus>()],
])

export class IntentLifecycleManager {
	/**
	 * Check whether a status transition is legal.
	 */
	static validateTransition(from: IntentStatus, to: IntentStatus): boolean {
		const allowed = VALID_TRANSITIONS.get(from)
		return allowed !== undefined && allowed.has(to)
	}

	/**
	 * Transition an intent to a new status, persisting to active_intents.yaml.
	 * Throws if the transition is illegal or the intent is not found.
	 */
	static async transitionIntent(intentId: string, newStatus: IntentStatus, workspacePath: string): Promise<void> {
		const filePath = path.join(workspacePath, ".orchestration", INTENTS_FILENAME)
		const raw = await fs.readFile(filePath, "utf-8")
		const doc = YAML.parseDocument(raw)

		const intentsNode = doc.get("active_intents") as YAML.YAMLSeq | undefined
		if (!intentsNode || !YAML.isSeq(intentsNode)) {
			throw new Error("active_intents.yaml has no valid active_intents array")
		}

		let found = false
		for (const item of intentsNode.items) {
			if (!YAML.isMap(item)) continue
			const idNode = item.get("id")
			if (idNode !== intentId) continue

			const currentStatus = item.get("status") as IntentStatus
			if (!IntentLifecycleManager.validateTransition(currentStatus, newStatus)) {
				throw new Error(
					`Illegal transition: ${currentStatus} → ${newStatus} for intent "${intentId}". ` +
						`Valid transitions from ${currentStatus}: [${[...(VALID_TRANSITIONS.get(currentStatus) ?? [])].join(", ")}]`,
				)
			}

			item.set("status", newStatus)
			item.set("updated_at", new Date().toISOString())
			found = true
			break
		}

		if (!found) {
			throw new Error(`Intent "${intentId}" not found in active_intents.yaml`)
		}

		await fs.writeFile(filePath, doc.toString(), "utf-8")
	}

	/**
	 * Update a specific field on an intent, persisting to active_intents.yaml.
	 */
	static async updateIntentField(
		intentId: string,
		field: string,
		value: unknown,
		workspacePath: string,
	): Promise<void> {
		const filePath = path.join(workspacePath, ".orchestration", INTENTS_FILENAME)
		const raw = await fs.readFile(filePath, "utf-8")
		const doc = YAML.parseDocument(raw)

		const intentsNode = doc.get("active_intents") as YAML.YAMLSeq | undefined
		if (!intentsNode || !YAML.isSeq(intentsNode)) {
			throw new Error("active_intents.yaml has no valid active_intents array")
		}

		let found = false
		for (const item of intentsNode.items) {
			if (!YAML.isMap(item)) continue
			if (item.get("id") !== intentId) continue

			item.set(field, value)
			item.set("updated_at", new Date().toISOString())
			found = true
			break
		}

		if (!found) {
			throw new Error(`Intent "${intentId}" not found in active_intents.yaml`)
		}

		await fs.writeFile(filePath, doc.toString(), "utf-8")
	}
}
