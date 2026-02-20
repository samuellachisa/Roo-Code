/**
 * IntentValidator
 *
 * Validates IntentSpec objects against the SPEC-002 schema.
 * Lenient at runtime: unknown fields produce warnings, not rejections.
 */

import type { IntentSpec, IntentStatus } from "./types"

const VALID_STATUSES: ReadonlySet<string> = new Set(["PENDING", "IN_PROGRESS", "COMPLETE", "BLOCKED", "ARCHIVED"])

const ID_PATTERN = /^[A-Z]+-\d{3,}$/

const VALID_SPEC_REF_TYPES: ReadonlySet<string> = new Set([
	"speckit",
	"github_issue",
	"github_pr",
	"constitution",
	"external",
])

export interface ValidationResult {
	valid: boolean
	errors: string[]
	warnings: string[]
}

export class IntentValidator {
	validateIntentSpec(spec: unknown): ValidationResult {
		const errors: string[] = []
		const warnings: string[] = []

		if (!spec || typeof spec !== "object") {
			return { valid: false, errors: ["Intent must be a non-null object"], warnings }
		}

		const s = spec as Record<string, unknown>

		// Required: id
		if (typeof s.id !== "string" || s.id.length === 0) {
			errors.push("id is required and must be a non-empty string")
		} else if (!ID_PATTERN.test(s.id)) {
			errors.push(`id "${s.id}" must match pattern ${ID_PATTERN} (e.g., "INT-001")`)
		}

		// Required: name
		if (typeof s.name !== "string" || s.name.length < 3) {
			errors.push("name is required and must be at least 3 characters")
		} else if (s.name.length > 200) {
			errors.push("name must be at most 200 characters")
		}

		// Required: status
		if (typeof s.status !== "string" || !VALID_STATUSES.has(s.status)) {
			errors.push(`status must be one of: ${[...VALID_STATUSES].join(", ")}`)
		}

		// Required: owned_scope (non-empty)
		if (!Array.isArray(s.owned_scope) || s.owned_scope.length === 0) {
			errors.push("owned_scope must be a non-empty array of glob patterns")
		} else {
			for (const pattern of s.owned_scope) {
				if (typeof pattern !== "string" || pattern.length === 0) {
					errors.push("owned_scope entries must be non-empty strings")
					break
				}
			}
		}

		// Required: constraints
		if (!Array.isArray(s.constraints)) {
			errors.push("constraints must be an array")
		}

		// Required: acceptance_criteria
		if (!Array.isArray(s.acceptance_criteria)) {
			errors.push("acceptance_criteria must be an array")
		}

		// Required: timestamps
		if (typeof s.created_at !== "string") {
			errors.push("created_at is required and must be an ISO 8601 string")
		}
		if (typeof s.updated_at !== "string") {
			errors.push("updated_at is required and must be an ISO 8601 string")
		}

		// Optional: version
		if (s.version !== undefined && (typeof s.version !== "number" || s.version < 1)) {
			warnings.push("version should be a positive integer (defaulting to 1)")
		}

		// Optional: related_specs
		if (s.related_specs !== undefined) {
			if (!Array.isArray(s.related_specs)) {
				warnings.push("related_specs should be an array")
			} else {
				for (const ref of s.related_specs) {
					if (!ref || typeof ref !== "object") {
						warnings.push("related_specs entries should be objects with type and ref")
						break
					}
					const r = ref as Record<string, unknown>
					if (typeof r.type !== "string" || !VALID_SPEC_REF_TYPES.has(r.type)) {
						warnings.push(`related_specs entry has invalid type: ${r.type}`)
					}
					if (typeof r.ref !== "string") {
						warnings.push("related_specs entry must have a string ref")
					}
				}
			}
		}

		// Optional: parent_intent
		if (s.parent_intent !== undefined && s.parent_intent !== null) {
			if (typeof s.parent_intent !== "string" || !ID_PATTERN.test(s.parent_intent)) {
				warnings.push(`parent_intent "${s.parent_intent}" should match ID pattern`)
			}
		}

		// Optional: tags
		if (s.tags !== undefined && !Array.isArray(s.tags)) {
			warnings.push("tags should be an array of strings")
		}

		return { valid: errors.length === 0, errors, warnings }
	}

	validateActiveIntentsFile(parsed: unknown): ValidationResult {
		const errors: string[] = []
		const warnings: string[] = []

		if (!parsed || typeof parsed !== "object") {
			return { valid: false, errors: ["File must contain a YAML object"], warnings }
		}

		const f = parsed as Record<string, unknown>
		if (!Array.isArray(f.active_intents)) {
			return { valid: false, errors: ["active_intents must be an array"], warnings }
		}

		const seenIds = new Set<string>()
		for (let i = 0; i < f.active_intents.length; i++) {
			const result = this.validateIntentSpec(f.active_intents[i])
			for (const e of result.errors) {
				errors.push(`intent[${i}]: ${e}`)
			}
			for (const w of result.warnings) {
				warnings.push(`intent[${i}]: ${w}`)
			}

			const spec = f.active_intents[i] as IntentSpec
			if (spec?.id) {
				if (seenIds.has(spec.id)) {
					errors.push(`intent[${i}]: duplicate id "${spec.id}"`)
				}
				seenIds.add(spec.id)
			}
		}

		return { valid: errors.length === 0, errors, warnings }
	}
}
