import { exec as nodeExec, execFile as nodeExecFile } from "node:child_process";
import fs from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Liquid } from "liquidjs";
import _ from "lodash";
import errs from "./error.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const exec = async (cmd, options = {}) => {
	const { stdout, stderr } = await new Promise((resolve, reject) => {
		const child = nodeExec(cmd, options, (isError, stdout, stderr) => {
			if (isError) {
				reject(new errs.CommandError(stderr, isError));
			} else {
				resolve({ stdout, stderr });
			}
		});

		child.on("error", (e) => {
			reject(new errs.CommandError(stderr, 1, e));
		});
	});
	return stdout;
};

/**
 * @param   {String} cmd
 * @param   {Array}  args
 * @param   {Object|undefined}  options
 * @returns {Promise}
 */
const execFile = (cmd, args, options) => {
	const opts = options || {};

	return new Promise((resolve, reject) => {
		nodeExecFile(cmd, args, opts, (err, stdout, stderr) => {
			if (err && typeof err === "object") {
				reject(new errs.CommandError(stderr, 1, err));
			} else {
				resolve(stdout.trim());
			}
		});
	});
};

/**
 * Used in objection query builder
 *
 * @param   {Array}  omissions
 * @returns {Function}
 */
const omitRow = (omissions) => {
	/**
	 * @param   {Object} row
	 * @returns {Object}
	 */
	return (row) => {
		return _.omit(row, omissions);
	};
};

/**
 * Used in objection query builder
 *
 * @param   {Array}  omissions
 * @returns {Function}
 */
const omitRows = (omissions) => {
	/**
	 * @param   {Array} rows
	 * @returns {Object}
	 */
	return (rows) => {
		rows.forEach((row, idx) => {
			rows[idx] = _.omit(row, omissions);
		});
		return rows;
	};
};

/**
 * Converts a domain name to a filesystem-safe string used in log filenames.
 * Must stay in sync with the Liquid sanitizeForFilename filter used by nginx templates.
 *
 * @param {string} domain
 * @returns {string}
 */
const sanitizeForFilename = (domain) => {
	if (!domain || typeof domain !== "string") {
		return "unknown";
	}
	const result = domain
		.replace(/^\*\./, "wildcard_")
		.replace(/[^a-zA-Z0-9-]/g, "_")
		.replace(/_+/g, "_")
		.toLowerCase()
		.substring(0, 63)
		.replace(/^_|_$/g, "");
	return result || "unknown";
};

/**
 * @returns {Object} Liquid render engine
 */
const getRenderEngine = () => {
	const renderEngine = new Liquid({
		root: `${__dirname}/../templates/`,
	});

	/**
	 * nginxAccessRule expects the object given to have 2 properties:
	 *
	 * directive  string
	 * address    string
	 */
	renderEngine.registerFilter("nginxAccessRule", (v) => {
		if (typeof v.directive !== "undefined" && typeof v.address !== "undefined" && v.directive && v.address) {
			return `${v.directive} ${v.address};`;
		}
		return "";
	});

	/**
	 * sanitizeForFilename converts a domain name to a filesystem-safe string.
	 * - Handles wildcards: "*.example.com" -> "wildcard_example_com"
	 * - Replaces special chars with underscores
	 * - Limits length to 63 chars for filesystem safety
	 */
	renderEngine.registerFilter("sanitizeForFilename", sanitizeForFilename);

	return renderEngine;
};

/**
 * Resolve a proxy-host log path under /data/logs.
 *
 * Preference order:
 * 1. Legacy id-only path: proxy-host-${id}_${type}.log (phase1 / #5648 / CI mocks)
 * 2. Exact domain-based path from host.domain_names (phase2 templates)
 * 3. Glob fallback: proxy-host-${id}-*_${type}.log (stale domain renames)
 *
 * Only returns paths that stay under the logs directory.
 *
 * @param {Number|string} hostId
 * @param {"access"|"error"} type
 * @param {{ domain_names?: string[] }|null|undefined} host
 * @param {{ logsDir?: string }} [options]
 * @returns {Promise<string|null>} absolute path or null if nothing found
 */
const resolveProxyHostLogPath = async (hostId, type, host = null, options = {}) => {
	const logsDir = options.logsDir || "/data/logs";
	const id = Number.parseInt(String(hostId), 10);
	if (!Number.isFinite(id) || id < 1 || (type !== "access" && type !== "error")) {
		return null;
	}

	const pathExists = async (candidate) => {
		try {
			await fs.stat(candidate);
			return true;
		} catch (err) {
			if (err && err.code === "ENOENT") {
				return false;
			}
			throw err;
		}
	};

	// 1) Legacy path — keep CI mock-log and pre-phase2 deployments working
	const legacyPath = `${logsDir}/proxy-host-${id}_${type}.log`;
	if (await pathExists(legacyPath)) {
		return legacyPath;
	}

	// 2) Deterministic domain-based path (matches nginx template: sort | first | sanitize)
	const domains = Array.isArray(host?.domain_names) ? [...host.domain_names] : [];
	if (domains.length > 0) {
		domains.sort();
		const primary = sanitizeForFilename(domains[0]);
		const domainPath = `${logsDir}/proxy-host-${id}-${primary}_${type}.log`;
		if (await pathExists(domainPath)) {
			return domainPath;
		}
	}

	// 3) Glob fallback for renamed domains / missing host meta
	// Only accept filenames that cannot escape logsDir (no path separators).
	const prefix = `proxy-host-${id}-`;
	const suffix = `_${type}.log`;
	let entries = [];
	try {
		entries = await fs.readdir(logsDir);
	} catch (err) {
		if (err && err.code === "ENOENT") {
			return null;
		}
		throw err;
	}

	const matches = entries
		.filter((name) => {
			if (typeof name !== "string") {
				return false;
			}
			if (name.includes("/") || name.includes("\\") || name.includes("\0")) {
				return false;
			}
			return name.startsWith(prefix) && name.endsWith(suffix);
		})
		.sort();

	if (matches.length === 0) {
		return null;
	}

	// Deterministic: prefer the lexicographically first match
	return `${logsDir}/${matches[0]}`;
};

export default {
	exec,
	execFile,
	omitRow,
	omitRows,
	getRenderEngine,
	sanitizeForFilename,
	resolveProxyHostLogPath,
};
