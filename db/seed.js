#!/usr/bin/env node
/**
 * Loads the question bank into MongoDB:  npm run db:seed  [-- path/to/fr.csv ...]
 *
 * Default files: db/questions/*.csv whose name is a language (fr.csv, en.csv). Each line:
 *   question;reponse_1;reponse_2;reponse_3;explicit;category
 * The language comes from the file name; questions are added as source "bank", status approved.
 *
 * Idempotent: a question already in the database for that language (same normalized text),
 * the original text of a bank question edited in the admin panel, or a bank question removed
 * by an admin is not added again. Existing documents are never modified.
 *
 * MongoDB: MONGODB_URI, otherwise databaseUrl from config.properties, otherwise
 * mongodb://127.0.0.1:27017/punchline (same order as the server).
 */
"use strict";

const path = require("path");
const mongoose = require("mongoose");
const bank = require("./question-bank");

const ROOT = path.join(__dirname, "..");
const DEFAULT_URL = "mongodb://127.0.0.1:27017/punchline";

function databaseUrl() {
	if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
	try {
		const propertiesReader = require("properties-reader");
		const properties = propertiesReader(path.join(ROOT, "config.properties"));
		const value = typeof properties.getRaw === "function" ? properties.getRaw("databaseUrl") : properties.get("databaseUrl");
		if (value) return String(value).trim();
	} catch (error) {
		// no config.properties: default URL
	}
	return DEFAULT_URL;
}

// Error keys of the validation (shared with the admin panel) -> plain English for the console
const MESSAGES = {
	"admin.error.required": "required",
	"admin.error.tooLong": "too long",
	"admin.error.badChars": "invalid characters",
	"admin.error.semicolon": "contains \";\"",
	"admin.error.answerRequired": "at least one bot answer is needed",
	"admin.error.invalid": "invalid value",
	"admin.error.badCategory": "unknown category (expected one of: " + bank.CATEGORIES.join(", ") + ")",
	"admin.import.badExplicit": "explicit must be true or false",
	"admin.import.badLang": "lang must be the language of the file",
	"admin.import.tooManyColumns": "more than 7 columns (a \";\" inside a text?)",
};

function describe(code) {
	const [field, key] = String(code).includes(":") ? String(code).split(":") : ["", String(code)];
	const text = MESSAGES[key] || key;
	return field ? `${field}: ${text}` : text;
}

function displayPath(file) {
	const relative = path.relative(process.cwd(), file);
	return relative && !relative.startsWith("..") ? relative : file;
}

function log(level, msg, fields) {
	const extra = fields && Object.keys(fields).length ? " " + JSON.stringify(fields) : "";
	(level === "warn" || level === "error" ? console.error : console.log)(`[${level}] ${msg}${extra}`);
}

async function main() {
	const args = process.argv.slice(2);
	const files = args.length ? args.map((file) => path.resolve(file)) : bank.bankFiles();
	if (files.length === 0) {
		console.error(`No bank file found in ${path.relative(process.cwd(), bank.BANK_DIR) || bank.BANK_DIR} (expected fr.csv, en.csv)`);
		process.exitCode = 1;
		return;
	}

	await mongoose.connect(databaseUrl(), { serverSelectionTimeoutMS: 5000 });
	try {
		await bank.migrate(mongoose, log);
		let totalInserted = 0;
		let totalPresent = 0;
		let totalInvalid = 0;
		for (const file of files) {
			const report = await bank.seedFile(mongoose, file);
			const name = displayPath(file);
			totalInserted += report.inserted;
			totalPresent += report.present;
			totalInvalid += report.invalid.length;
			console.log(
				`${name} (${report.lang || "?"}): ${report.inserted} inserted, ${report.present} already present, ${report.invalid.length} invalid line(s)`
			);
			report.invalid.forEach((item) => {
				console.log(`  line ${item.line}: ${item.errors.map(describe).join(", ")}`);
			});
		}
		const Question = bank.getModel(mongoose);
		const counts = await Question.aggregate([
			{ $match: { status: "approved" } },
			{ $group: { _id: "$lang", count: { $sum: 1 } } },
			{ $sort: { _id: 1 } },
		]);
		console.log(
			`Total: ${totalInserted} inserted, ${totalPresent} already present, ${totalInvalid} invalid. Approved questions: ` +
				(counts.map((row) => `${row._id} ${row.count}`).join(", ") || "none")
		);
	} finally {
		await mongoose.disconnect();
	}
}

main().catch((error) => {
	console.error("Seed failed:", error && error.message ? error.message : error);
	process.exitCode = 1;
	mongoose.disconnect().catch(() => {});
});
