/**
 * Questions management: validation, search, CRUD, CSV import / export, duplicates.
 *
 * Documents of the "questions" collection (read by the game, see functions.js):
 *   { question, reponse_1, reponse_2, reponse_3, explicit: "true" | "false" }
 * reponse_1..3 are the bot's answers. explicit stays a STRING (the game matches "false").
 *
 * CSV format (same as db/db.py): no header, one question per line,
 *   question;reponse_1;reponse_2;reponse_3;explicit
 * no quoting, so a field can't contain ";" or a line break.
 */
"use strict";

const express = require("express");

const QUESTION_MAX = 300;
const ANSWER_MAX = 100;
const ANSWER_FIELDS = ["reponse_1", "reponse_2", "reponse_3"];
const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 100;
const SEARCH_MAX = 100;
const IMPORT_MAX_BYTES = 1024 * 1024;
const IMPORT_MAX_LINES = 10000;
const REPORT_MAX_ITEMS = 200; // per-line details returned to the browser

// ---------------------------------------------------------------------------
// Normalisation and validation
// ---------------------------------------------------------------------------

// Collapses any whitespace (line breaks, tabs, non-breaking spaces…) into single spaces
function tidy(value) {
	return String(value).normalize("NFC").replace(/\s+/g, " ").trim();
}

// Validates one text field; returns [value, errorKey|null]
function checkText(raw, max, required) {
	if (raw === undefined || raw === null) raw = "";
	if (typeof raw !== "string") return ["", "admin.error.invalid"];
	const value = tidy(raw);
	if (required && value.length === 0) return [value, "admin.error.required"];
	if (Array.from(value).length > max) return [value, "admin.error.tooLong"];
	// eslint-disable-next-line no-control-regex
	if (/[\u0000-\u001f\u007f�]/.test(value)) return [value, "admin.error.badChars"];
	if (value.includes(";")) return [value, "admin.error.semicolon"];
	return [value, null];
}

/**
 * Validates a question sent by the panel (JSON) or read from the CSV.
 * explicit must be a boolean. Returns { value, errors } where errors maps a field
 * name to a translation key (empty object when valid) and value is the document.
 */
function validateQuestion(input) {
	const errors = {};
	const value = {};
	if (input === null || typeof input !== "object" || Array.isArray(input)) {
		return { value, errors: { form: "admin.error.invalid" } };
	}

	let [text, error] = checkText(input.question, QUESTION_MAX, true);
	value.question = text;
	if (error) errors.question = error;

	ANSWER_FIELDS.forEach((field) => {
		[text, error] = checkText(input[field], ANSWER_MAX, false);
		value[field] = text;
		if (error) errors[field] = error;
	});
	// the bot needs at least one answer
	if (!ANSWER_FIELDS.some((field) => value[field].length > 0) && !ANSWER_FIELDS.some((field) => errors[field])) {
		errors.reponse_1 = "admin.error.answerRequired";
	}

	if (typeof input.explicit !== "boolean") {
		errors.explicit = "admin.error.invalid";
	}
	value.explicit = input.explicit === true ? "true" : "false";

	return { value, errors };
}

// Key used to detect duplicates: same question, ignoring case, spacing and apostrophe style
function duplicateKey(question) {
	return tidy(question)
		.toLowerCase()
		.replace(/[‘’ʼ`´]/g, "'")
		.replace(/\s*([?!:;.,…])/g, "$1")
		.trim();
}

// Accent-insensitive, case-insensitive regular expression for a search text
const ACCENT_CLASSES = {
	a: "aàáâãäåæAÀÁÂÃÄÅÆ",
	c: "cçCÇ",
	e: "eéèêëEÉÈÊË",
	i: "iìíîïIÌÍÎÏ",
	n: "nñNÑ",
	o: "oòóôõöøœOÒÓÔÕÖØŒ",
	u: "uùúûüUÙÚÛÜ",
	y: "yýÿYÝŸ",
	"'": "'‘’ʼ`´",
};

function searchRegex(search) {
	const plain = tidy(search)
		.slice(0, SEARCH_MAX)
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[‘’ʼ`´]/g, "'")
		.toLowerCase();
	if (!plain) return null;
	let source = "";
	for (const char of plain) {
		if (ACCENT_CLASSES[char]) source += "[" + ACCENT_CLASSES[char] + "]";
		else if (char === " ") source += "\\s+";
		else source += char.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
	}
	return new RegExp(source, "i");
}

// Document from the database -> safe JSON for the panel (only the known fields, as strings)
function toClient(doc) {
	return {
		id: String(doc._id),
		question: doc.question == null ? "" : String(doc.question),
		reponse_1: doc.reponse_1 == null ? "" : String(doc.reponse_1),
		reponse_2: doc.reponse_2 == null ? "" : String(doc.reponse_2),
		reponse_3: doc.reponse_3 == null ? "" : String(doc.reponse_3),
		explicit: String(doc.explicit) === "true",
	};
}

function shorten(text, max = 80) {
	const chars = Array.from(String(text || ""));
	return chars.length > max ? chars.slice(0, max - 1).join("") + "…" : chars.join("");
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/**
 * Parses an import file like db/db.py does (";" separator, no quoting, blank lines skipped,
 * missing explicit = "false"), but strictly: extra columns or an unknown explicit value
 * are reported as errors instead of being silently dropped.
 * Returns { rows: [{ line, value }], errors: [{ line, errors: [key] }], lines }.
 */
function parseCsv(text) {
	const rows = [];
	const errors = [];
	const lines = String(text).replace(/^﻿/, "").split(/\r\n|\n|\r/);
	if (lines.length > IMPORT_MAX_LINES) {
		return { rows, errors: [{ line: 0, errors: ["admin.import.tooManyLines"] }], lines: lines.length, tooMany: true };
	}
	lines.forEach((raw, index) => {
		const line = index + 1;
		if (raw.trim() === "") return;
		const cells = raw.split(";");
		if (cells.length > 5) {
			errors.push({ line, errors: ["admin.import.tooManyColumns"] });
			return;
		}
		const explicitText = (cells[4] || "").trim().toLowerCase() || "false";
		if (explicitText !== "true" && explicitText !== "false") {
			errors.push({ line, errors: ["admin.import.badExplicit"] });
			return;
		}
		const { value, errors: fieldErrors } = validateQuestion({
			question: cells[0],
			reponse_1: cells[1],
			reponse_2: cells[2],
			reponse_3: cells[3],
			explicit: explicitText === "true",
		});
		const keys = Object.keys(fieldErrors);
		if (keys.length > 0) {
			errors.push({ line, errors: keys.map((field) => field + ":" + fieldErrors[field]) });
			return;
		}
		rows.push({ line, value });
	});
	return { rows, errors, lines: lines.length };
}

// One CSV line; old documents may contain characters the format can't hold: replaced by spaces
function csvCell(value) {
	return String(value == null ? "" : value)
		.replace(/[;\r\n]+/g, " ")
		.trim();
}

function toCsvLine(doc) {
	return [
		csvCell(doc.question),
		csvCell(doc.reponse_1),
		csvCell(doc.reponse_2),
		csvCell(doc.reponse_3),
		String(doc.explicit) === "true" ? "true" : "false",
	].join(";");
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

module.exports = function questionsRouter({ mongoose, audit }) {
	const schema = new mongoose.Schema(
		{
			question: { type: String, required: true, trim: true, maxlength: QUESTION_MAX },
			reponse_1: { type: String, trim: true, maxlength: ANSWER_MAX, default: "" },
			reponse_2: { type: String, trim: true, maxlength: ANSWER_MAX, default: "" },
			reponse_3: { type: String, trim: true, maxlength: ANSWER_MAX, default: "" },
			explicit: { type: String, enum: ["true", "false"], required: true, default: "false" },
		},
		// "Question" is registered by app.js with an empty schema; this model uses the same collection
		{ collection: "questions", versionKey: false, strict: true }
	);
	const Question = mongoose.models.AdminQuestion || mongoose.model("AdminQuestion", schema);

	const router = express.Router();
	const json = express.json({ limit: "16kb", strict: true });
	const csvBody = express.text({ type: ["text/csv", "text/plain", "application/vnd.ms-excel"], limit: IMPORT_MAX_BYTES });

	function isObjectId(id) {
		return typeof id === "string" && /^[a-f0-9]{24}$/i.test(id);
	}

	// Map duplicateKey -> [ids] of every question in the database
	async function existingKeys(excludeId) {
		const keys = new Map();
		const docs = await Question.find({}, { question: 1 }).lean();
		docs.forEach((doc) => {
			if (excludeId && String(doc._id) === excludeId) return;
			const key = duplicateKey(doc.question || "");
			if (!keys.has(key)) keys.set(key, []);
			keys.get(key).push(String(doc._id));
		});
		return keys;
	}

	function badRequest(res, errors) {
		res.status(400).json({ error: "admin.error.validation", fields: errors });
	}

	// GET /questions?q=&filter=all|classic|premium&page=1&pageSize=20
	router.get("/questions", async (req, res, next) => {
		try {
			const search = typeof req.query.q === "string" ? req.query.q : "";
			const filter = ["classic", "premium"].includes(req.query.filter) ? req.query.filter : "all";
			let pageSize = parseInt(req.query.pageSize, 10);
			if (!Number.isInteger(pageSize) || pageSize < 1) pageSize = PAGE_SIZE_DEFAULT;
			pageSize = Math.min(pageSize, PAGE_SIZE_MAX);
			let page = parseInt(req.query.page, 10);
			if (!Number.isInteger(page) || page < 1) page = 1;

			const base = {};
			const regex = searchRegex(search);
			if (regex) {
				base.$or = ["question", ...ANSWER_FIELDS].map((field) => ({ [field]: regex }));
			}
			const classic = { ...base, explicit: "false" };
			const premium = { ...base, explicit: "true" };
			const query = filter === "classic" ? classic : filter === "premium" ? premium : base;

			const [all, classicCount, premiumCount, total] = await Promise.all([
				Question.countDocuments(base),
				Question.countDocuments(classic),
				Question.countDocuments(premium),
				Question.countDocuments(query),
			]);
			const pages = Math.max(1, Math.ceil(total / pageSize));
			page = Math.min(page, pages);
			const docs = await Question.find(query)
				.sort({ _id: -1 })
				.skip((page - 1) * pageSize)
				.limit(pageSize)
				.lean();

			res.json({
				items: docs.map(toClient),
				total,
				page,
				pages,
				pageSize,
				counts: { all, classic: classicCount, premium: premiumCount },
			});
		} catch (error) {
			next(error);
		}
	});

	// POST /questions  { question, reponse_1, reponse_2, reponse_3, explicit: boolean }
	router.post("/questions", json, async (req, res, next) => {
		try {
			const { value, errors } = validateQuestion(req.body);
			if (Object.keys(errors).length > 0) return badRequest(res, errors);
			const keys = await existingKeys();
			if (keys.has(duplicateKey(value.question))) {
				return res.status(409).json({ error: "admin.error.duplicate", fields: { question: "admin.error.duplicate" } });
			}
			const doc = await Question.create(value);
			await audit(req, "question.create", { id: String(doc._id), question: shorten(value.question) });
			res.status(201).json({ item: toClient(doc.toObject()) });
		} catch (error) {
			next(error);
		}
	});

	// PUT /questions/:id
	router.put("/questions/:id", json, async (req, res, next) => {
		try {
			const id = req.params.id;
			if (!isObjectId(id)) return res.status(404).json({ error: "admin.error.notFound" });
			const { value, errors } = validateQuestion(req.body);
			if (Object.keys(errors).length > 0) return badRequest(res, errors);
			const keys = await existingKeys(id);
			if (keys.has(duplicateKey(value.question))) {
				return res.status(409).json({ error: "admin.error.duplicate", fields: { question: "admin.error.duplicate" } });
			}
			const doc = await Question.findByIdAndUpdate(id, { $set: value }, { new: true, runValidators: true }).lean();
			if (!doc) return res.status(404).json({ error: "admin.error.notFound" });
			await audit(req, "question.update", { id, question: shorten(value.question) });
			res.json({ item: toClient(doc) });
		} catch (error) {
			next(error);
		}
	});

	// DELETE /questions/:id
	router.delete("/questions/:id", async (req, res, next) => {
		try {
			const id = req.params.id;
			if (!isObjectId(id)) return res.status(404).json({ error: "admin.error.notFound" });
			const doc = await Question.findByIdAndDelete(id).lean();
			if (!doc) return res.status(404).json({ error: "admin.error.notFound" });
			await audit(req, "question.delete", { id, question: shorten(doc.question) });
			res.json({ ok: true });
		} catch (error) {
			next(error);
		}
	});

	// GET /questions/duplicates -> groups of questions sharing the same duplicate key
	router.get("/questions/duplicates", async (req, res, next) => {
		try {
			const docs = await Question.find({}).sort({ _id: 1 }).lean();
			const groups = new Map();
			docs.forEach((doc) => {
				const key = duplicateKey(doc.question || "");
				if (!groups.has(key)) groups.set(key, []);
				groups.get(key).push(toClient(doc));
			});
			const duplicates = Array.from(groups.values()).filter((group) => group.length > 1);
			res.json({ groups: duplicates.slice(0, REPORT_MAX_ITEMS), total: duplicates.length });
		} catch (error) {
			next(error);
		}
	});

	// POST /questions/import?dryRun=1   body: the CSV file (text/csv, max 1 MB)
	router.post("/questions/import", csvBody, async (req, res, next) => {
		try {
			if (typeof req.body !== "string") {
				return res.status(415).json({ error: "admin.import.badType" });
			}
			const dryRun = req.query.dryRun === "1" || req.query.dryRun === "true";
			const parsed = parseCsv(req.body);
			const keys = await existingKeys();
			const seen = new Map(); // key -> first line in the file
			const duplicatesDb = [];
			const duplicatesFile = [];
			const toInsert = [];
			parsed.rows.forEach(({ line, value }) => {
				const key = duplicateKey(value.question);
				if (keys.has(key)) {
					duplicatesDb.push({ line, question: shorten(value.question) });
				} else if (seen.has(key)) {
					duplicatesFile.push({ line, sameAs: seen.get(key), question: shorten(value.question) });
				} else {
					seen.set(key, line);
					toInsert.push(value);
				}
			});

			let inserted = 0;
			if (!dryRun && toInsert.length > 0) {
				const result = await Question.insertMany(toInsert, { ordered: true });
				inserted = result.length;
				await audit(req, "question.import", {
					inserted,
					duplicates: duplicatesDb.length + duplicatesFile.length,
					errors: parsed.errors.length,
				});
			}

			res.json({
				dryRun,
				lines: parsed.lines,
				valid: parsed.rows.length,
				toInsert: toInsert.length,
				inserted,
				duplicatesDb: duplicatesDb.slice(0, REPORT_MAX_ITEMS),
				duplicatesDbCount: duplicatesDb.length,
				duplicatesFile: duplicatesFile.slice(0, REPORT_MAX_ITEMS),
				duplicatesFileCount: duplicatesFile.length,
				errors: parsed.errors.slice(0, REPORT_MAX_ITEMS),
				errorCount: parsed.errors.length,
				tooManyLines: Boolean(parsed.tooMany),
			});
		} catch (error) {
			next(error);
		}
	});

	// GET /questions/export -> every question as a CSV file (db/db.py format)
	router.get("/questions/export", async (req, res, next) => {
		try {
			const docs = await Question.find({}).sort({ _id: 1 }).lean();
			const date = new Date().toISOString().slice(0, 10);
			res.set("Content-Type", "text/csv; charset=utf-8");
			res.set("Content-Disposition", `attachment; filename="punchline-questions-${date}.csv"`);
			res.send(docs.map(toCsvLine).join("\n") + (docs.length ? "\n" : ""));
		} catch (error) {
			next(error);
		}
	});

	return router;
};

module.exports.validateQuestion = validateQuestion;
module.exports.duplicateKey = duplicateKey;
module.exports.parseCsv = parseCsv;
module.exports.searchRegex = searchRegex;
module.exports.IMPORT_MAX_BYTES = IMPORT_MAX_BYTES;
