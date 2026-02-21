/**
 * Governance preamble injected into the system prompt when
 * .orchestration/ exists in the workspace. Enforces Constitution
 * Principle 1: "No Intent, No Write."
 */

import * as fs from "fs/promises"
import * as path from "path"

/**
 * Returns the governance preamble if .orchestration/active_intents.yaml exists,
 * otherwise returns an empty string (backward compatible).
 */
export async function getGovernanceSection(cwd: string): Promise<string> {
	try {
		const intentsPath = path.join(cwd, ".orchestration", "active_intents.yaml")
		await fs.access(intentsPath)
	} catch {
		return ""
	}

	return `====

INTENT-DRIVEN GOVERNANCE

This workspace uses intent-driven development. The .orchestration/ directory is present.

MANDATORY: Before modifying ANY file, you MUST call the select_active_intent tool with the appropriate intent_id from .orchestration/active_intents.yaml. This is not optional. Write operations (write_to_file, apply_diff, edit, search_and_replace, etc.) will be REJECTED if no intent is active.

Workflow:
1. Read .orchestration/active_intents.yaml to see available intents
2. Call select_active_intent(intent_id="<id>") with the intent that matches the user's request
3. The system will load constraints, scope, and acceptance criteria for that intent
4. Proceed with modifications — only files within the intent's owned_scope are allowed
5. All mutations are cryptographically traced to agent_trace.jsonl

When work on an intent is complete and all acceptance criteria are satisfied, call verify_acceptance_criteria(intent_id="<id>") to transition the intent to COMPLETE. This prevents further modifications to that intent.

If your write is rejected with a scope violation, you must either:
- Choose a different intent whose scope covers the target file
- Ask the user to amend the intent's owned_scope in active_intents.yaml

Do NOT attempt to write files without first selecting an intent. Do NOT ignore scope violations.`
}
