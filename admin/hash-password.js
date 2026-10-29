#!/usr/bin/env node
/**
 * Prints the hash of an admin password, to put in ADMIN_PASSWORD_HASH
 * (or adminPasswordHash in config.properties).
 *
 *   npm run admin:password                       # asks for the password twice, without echo
 *   printf '%s' "$PASSWORD" | npm run --silent admin:password   # reads it from stdin
 *
 * Only the hash line is written to stdout; prompts and hints go to stderr.
 */
"use strict";

const { hashPassword } = require("./auth");

const MIN_LENGTH = 12;
const MAX_LENGTH = 1024;

// Reads one line from the terminal without echoing it
function promptHidden(question) {
	return new Promise((resolve, reject) => {
		const stdin = process.stdin;
		let value = "";
		process.stderr.write(question);
		stdin.setRawMode(true);
		stdin.resume();
		stdin.setEncoding("utf8");

		function done(error) {
			stdin.setRawMode(false);
			stdin.pause();
			stdin.removeListener("data", onData);
			process.stderr.write("\n");
			if (error) reject(error);
			else resolve(value);
		}

		function onData(chunk) {
			for (const char of chunk) {
				if (char === "\r" || char === "\n" || char === "\u0004") {
					done();
					return;
				}
				if (char === "\u0003") {
					done(new Error("Cancelled"));
					return;
				}
				if (char === "\u007f" || char === "\b") {
					value = Array.from(value).slice(0, -1).join("");
				} else if (char >= " ") {
					value += char;
				}
			}
		}

		stdin.on("data", onData);
	});
}

function readStdin() {
	return new Promise((resolve, reject) => {
		let data = "";
		process.stdin.setEncoding("utf8");
		process.stdin.on("data", (chunk) => {
			data += chunk;
			if (data.length > MAX_LENGTH * 4) {
				reject(new Error("Input too long"));
			}
		});
		process.stdin.on("end", () => resolve(data.replace(/\r?\n$/, "")));
		process.stdin.on("error", reject);
	});
}

async function main() {
	let password;
	if (process.stdin.isTTY) {
		password = await promptHidden("Admin password: ");
		const confirmation = await promptHidden("Confirm password: ");
		if (password !== confirmation) {
			throw new Error("The two passwords are different");
		}
	} else {
		password = await readStdin();
	}

	if (Array.from(password).length < MIN_LENGTH) {
		throw new Error(`The password must have at least ${MIN_LENGTH} characters`);
	}
	if (password.length > MAX_LENGTH) {
		throw new Error(`The password must have at most ${MAX_LENGTH} characters`);
	}

	const hash = await hashPassword(password);
	process.stdout.write(hash + "\n");
	process.stderr.write(
		"\nSet it with the admin user name, e.g. (single quotes: the hash contains '$'):\n" +
			`  export ADMIN_USER='admin'\n  export ADMIN_PASSWORD_HASH='${hash}'\n` +
			"or in config.properties:\n" +
			`  adminUser = admin\n  adminPasswordHash = ${hash}\n` +
			"then restart the server.\n"
	);
}

main().catch((error) => {
	process.stderr.write(`Error: ${error.message}\n`);
	process.exit(1);
});
