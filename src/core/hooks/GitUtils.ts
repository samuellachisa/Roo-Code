/**
 * GitUtils
 *
 * Lightweight wrapper for git operations needed by the trace system.
 * Uses child_process.exec to avoid adding git library dependencies.
 * All methods return null/false on failure (non-git repos, etc.).
 */

import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)
const TIMEOUT_MS = 5000

export class GitUtils {
	constructor(private workspacePath: string) {}

	/**
	 * Get the current HEAD commit SHA. Returns null if not a git repo.
	 */
	async getCurrentSha(): Promise<string | null> {
		try {
			const { stdout } = await execAsync("git rev-parse HEAD", {
				cwd: this.workspacePath,
				timeout: TIMEOUT_MS,
			})
			return stdout.trim() || null
		} catch {
			return null
		}
	}

	/**
	 * Get the short (7-char) HEAD SHA.
	 */
	async getShortSha(): Promise<string | null> {
		try {
			const { stdout } = await execAsync("git rev-parse --short HEAD", {
				cwd: this.workspacePath,
				timeout: TIMEOUT_MS,
			})
			return stdout.trim() || null
		} catch {
			return null
		}
	}

	/**
	 * Check if the working tree has uncommitted changes.
	 */
	async hasUncommittedChanges(): Promise<boolean> {
		try {
			const { stdout } = await execAsync("git status --porcelain", {
				cwd: this.workspacePath,
				timeout: TIMEOUT_MS,
			})
			return stdout.trim().length > 0
		} catch {
			return false
		}
	}

	/**
	 * Check if the workspace is inside a git repository.
	 */
	async isGitRepo(): Promise<boolean> {
		try {
			await execAsync("git rev-parse --is-inside-work-tree", {
				cwd: this.workspacePath,
				timeout: TIMEOUT_MS,
			})
			return true
		} catch {
			return false
		}
	}

	/**
	 * Get the current branch name.
	 */
	async getCurrentBranch(): Promise<string | null> {
		try {
			const { stdout } = await execAsync("git rev-parse --abbrev-ref HEAD", {
				cwd: this.workspacePath,
				timeout: TIMEOUT_MS,
			})
			return stdout.trim() || null
		} catch {
			return null
		}
	}
}
