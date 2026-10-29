/**
 * Questions management: search, filters, CRUD, review (pending AI questions), CSV import /
 * export, duplicates. Rules and model: db/question-bank.js (shared with the game and the seed).
 *
 * Documents of the "questions" collection (read by the game, see functions.js):
 *   { question, reponse_1, reponse_2, reponse_3, explicit: "true" | "false", lang, category,
 *     status, source, playCount, lastPlayedAt, createdAt, norm }
 * reponse_1..3 are the bot's answers. explicit stays a STRING (the game matches "false").
 *
 * CSV format: no header, one question per line, no quoting (a field can't contain ";" or a
 * line break):
 *   question;reponse_1;reponse_2;reponse_3;explicit[;category[;lang]]
 * The old 5-field format is accepted; a missing lang is the one chosen in the import dialog.
 */
"use strict";

const express = require("express");
const bank = require("../db/question-bank");

const { LANGS, CATEGORIES, STATUSES, ANSWER_FIELDS, QUESTION_MAX, ANSWER_MAX, tidy, normKey, validateQuestion } = bank;
const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 100;
const SEARCH_MAX = 100;
const IMPORT_MAX_BYTES = 1024 * 1024;
const IMPORT_MAX_LINES = 10000;
const REPORT_MAX_ITEMS = 200; // per-line details returned to the browser
const REVIEW_MAX = 1000; // "approve all" / "reject all": at most this many at once

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

// Document from the database -> safe JSON for the panel (only the known fields)
function toClient(doc) {
	const date = (value) => (value instanceof Date && !isNaN(value.getTime()) ? value.toISOString() : null);
	return {
		id: String(doc._id),
		question: doc.question == null ? "" : String(doc.question),
		reponse_1: doc.reponse_1 == null ? "" : String(doc.reponse_1),
		reponse_2: doc.reponse_2 == null ? "" : String(doc.reponse_2),
		reponse_3: doc.reponse_3 == null ? "" : String(doc.reponse_3),
		explicit: String(doc.explicit) === "true",
		lang: LANGS.includes(doc.lang) ? doc.lang : "",
		category: CATEGORIES.includes(doc.category) ? doc.category : "",
		status: STATUSES.includes(doc.status) ? doc.status : "approved",
		source: bank.SOURCES.includes(doc.source) ? doc.source : "import",
		playCount: Number.isFinite(doc.playCount) ? doc.playCount : 0,
		lastPlayedAt: date(doc.lastPlayedAt),
		createdAt: date(doc.createdAt),
	};
}

function shorten(text, max = 80) {
	const chars = Array.from(String(text || ""));
	return chars.length > max ? chars.slice(0, max - 1).join("") + "…" : chars.join("");
}

function isDuplicateKeyError(error) {
	return Boolean(error && (error.code === 11000 || error.code === 11001));
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

module.exports = function questionsRouter({ mongoose, audit }) {
	const Question = bank.getModel(mongoose);
	const Removed = bank.getRemovedModel(mongoose);

	const router = express.Router();
	const json = express.json({ limit: "16kb", strict: true });
	const csvBody = express.text({ type: ["text/csv", "text/plain", "application/vnd.ms-excel"], limit: IMPORT_MAX_BYTES });

	function isObjectId(id) {
		return typeof id === "string" && /^[a-f0-9]{24}$/i.test(id);
	}

	function badRequest(res, errors) {
		res.status(400).json({ error: "admin.error.validation", fields: errors });
	}

	function duplicate(res) {
		res.status(409).json({ error: "admin.error.duplicate", fields: { question: "admin.error.duplicate" } });
	}

	// Another question with the same {lang, norm}?
	async function isDuplicate(value, excludeId) {
		const filter = { lang: value.lang, norm: value.norm };
		if (excludeId) filter._id = { $ne: excludeId };
		return Boolean(await Question.exists(filter));
	}

	// Query string -> filters shared by the list and the export
	function readFilters(query) {
		const lang = LANGS.includes(query.lang) ? query.lang : "all";
		const category = query.category === "none" || CATEGORIES.includes(query.category) ? query.category : "all";
		const status = STATUSES.includes(query.status) || query.status === "all" ? query.status : "approved";
		const filter = ["classic", "premium"].includes(query.filter) ? query.filter : "all";
		const search = typeof query.q === "string" ? query.q : "";
		return { lang, category, status, filter, search };
	}

	function baseQuery(filters) {
		const base = {};
		if (filters.lang !== "all") base.lang = filters.lang;
		if (filters.status !== "all") base.status = filters.status;
		if (filters.category === "none") base.category = { $in: ["", null] };
		else if (filters.category !== "all") base.category = filters.category;
		const regex = searchRegex(filters.search);
		if (regex) {
			base.$or = ["question", ...ANSWER_FIELDS].map((field) => ({ [field]: regex }));
		}
		return base;
	}

	// GET /questions?q=&filter=all|classic|premium&lang=all|fr|en&category=all|none|<cat>
	//               &status=approved|pending|rejected|all&page=1&pageSize=20
	router.get("/questions", async (req, res, next) => {
		try {
			const filters = readFilters(req.query);
			let pageSize = parseInt(req.query.pageSize, 10);
			if (!Number.isInteger(pageSize) || pageSize < 1) pageSize = PAGE_SIZE_DEFAULT;
			pageSize = Math.min(pageSize, PAGE_SIZE_MAX);
			let page = parseInt(req.query.page, 10);
			if (!Number.isInteger(page) || page < 1) page = 1;

			const base = baseQuery(filters);
			const classic = { ...base, explicit: "false" };
			const premium = { ...base, explicit: "true" };
			const query = filters.filter === "classic" ? classic : filters.filter === "premium" ? premium : base;

			const [all, classicCount, premiumCount, total, pending, approvedByLang] = await Promise.all([
				Question.countDocuments(base),
				Question.countDocuments(classic),
				Question.countDocuments(premium),
				Question.countDocuments(query),
				Question.countDocuments({ status: "pending" }),
				Question.aggregate([{ $match: { status: "approved" } }, { $group: { _id: "$lang", count: { $sum: 1 } } }]),
			]);
			const pages = Math.max(1, Math.ceil(total / pageSize));
			page = Math.min(page, pages);
			const docs = await Question.find(query)
				.sort({ _id: -1 })
				.skip((page - 1) * pageSize)
				.limit(pageSize)
				.lean();
			const approved = {};
			LANGS.forEach((lang) => {
				const row = approvedByLang.find((item) => item._id === lang);
				approved[lang] = row ? row.count : 0;
			});

			res.json({
				items: docs.map(toClient),
				total,
				page,
				pages,
				pageSize,
				counts: { all, classic: classicCount, premium: premiumCount, pending, approved },
			});
		} catch (error) {
			next(error);
		}
	});

	// POST /questions  { question, reponse_1, reponse_2, reponse_3, explicit: boolean, lang, category }
	router.post("/questions", json, async (req, res, next) => {
		try {
			const { value, errors } = validateQuestion(req.body, { requireLang: true });
			if (Object.keys(errors).length > 0) return badRequest(res, errors);
			if (await isDuplicate(value)) return duplicate(res);
			const doc = await Question.create(
				Object.assign(value, { status: "approved", source: "admin", playCount: 0, lastPlayedAt: null, createdAt: new Date() })
			);
			await audit(req, "question.create", { id: String(doc._id), lang: value.lang, question: shorten(value.question) });
			res.status(201).json({ item: toClient(doc.toObject()) });
		} catch (error) {
			if (isDuplicateKeyError(error)) return duplicate(res);
			next(error);
		}
	});

	// PUT /questions/:id  (same body as POST; status, source and play counts are kept)
	router.put("/questions/:id", json, async (req, res, next) => {
		try {
			const id = req.params.id;
			if (!isObjectId(id)) return res.status(404).json({ error: "admin.error.notFound" });
			const { value, errors } = validateQuestion(req.body, { requireLang: true });
			if (Object.keys(errors).length > 0) return badRequest(res, errors);
			if (await isDuplicate(value, id)) return duplicate(res);
			const doc = await Question.findByIdAndUpdate(id, { $set: value }, { new: true, runValidators: true }).lean();
			if (!doc) return res.status(404).json({ error: "admin.error.notFound" });
			await audit(req, "question.update", { id, lang: value.lang, question: shorten(value.question) });
			res.json({ item: toClient(doc) });
		} catch (error) {
			if (isDuplicateKeyError(error)) return duplicate(res);
			next(error);
		}
	});

	// DELETE /questions/:id  (a bank question is remembered so that the seed does not add it back)
	router.delete("/questions/:id", async (req, res, next) => {
		try {
			const id = req.params.id;
			if (!isObjectId(id)) return res.status(404).json({ error: "admin.error.notFound" });
			const doc = await Question.findByIdAndDelete(id).lean();
			if (!doc) return res.status(404).json({ error: "admin.error.notFound" });
			if (doc.source === "bank" && LANGS.includes(doc.lang)) {
				const norm = doc.seedKey || doc.norm;
				if (norm) {
					await Removed.updateOne({ lang: doc.lang, norm }, { $set: { at: new Date() } }, { upsert: true }).catch(() => {});
				}
			}
			await audit(req, "question.delete", { id, question: shorten(doc.question) });
			res.json({ ok: true });
		} catch (error) {
			next(error);
		}
	});

	// POST /questions/:id/status  { status: "approved" | "rejected" | "pending" }
	router.post("/questions/:id/status", json, async (req, res, next) => {
		try {
			const id = req.params.id;
			if (!isObjectId(id)) return res.status(404).json({ error: "admin.error.notFound" });
			const status = req.body && req.body.status;
			if (!STATUSES.includes(status)) return badRequest(res, { status: "admin.error.invalid" });
			const doc = await Question.findByIdAndUpdate(id, { $set: { status } }, { new: true }).lean();
			if (!doc) return res.status(404).json({ error: "admin.error.notFound" });
			const action = status === "approved" ? "question.approve" : status === "rejected" ? "question.reject" : "question.pending";
			await audit(req, action, { id, question: shorten(doc.question) });
			res.json({ item: toClient(doc) });
		} catch (error) {
			next(error);
		}
	});

	// POST /questions/review  { action: "approve" | "reject", lang: "all" | "fr" | "en" }
	// approves / rejects every pending question (of that language)
	router.post("/questions/review", json, async (req, res, next) => {
		try {
			const body = req.body && typeof req.body === "object" ? req.body : {};
			if (body.action !== "approve" && body.action !== "reject") return badRequest(res, { action: "admin.error.invalid" });
			const filter = { status: "pending" };
			if (LANGS.includes(body.lang)) filter.lang = body.lang;
			else if (body.lang !== undefined && body.lang !== "all") return badRequest(res, { lang: "admin.error.invalid" });
			const ids = (await Question.find(filter, { _id: 1 }).sort({ _id: 1 }).limit(REVIEW_MAX).lean()).map((doc) => doc._id);
			const status = body.action === "approve" ? "approved" : "rejected";
			const result = ids.length ? await Question.updateMany({ _id: { $in: ids }, status: "pending" }, { $set: { status } }) : { modifiedCount: 0 };
			const count = result.modifiedCount || 0;
			await audit(req, body.action === "approve" ? "question.approveAll" : "question.rejectAll", { count, lang: filter.lang || "all" });
			res.json({ ok: true, count });
		} catch (error) {
			next(error);
		}
	});

	// GET /questions/duplicates -> groups of questions sharing the same language and normalized text
	router.get("/questions/duplicates", async (req, res, next) => {
		try {
			const docs = await Question.find({}).sort({ _id: 1 }).lean();
			const groups = new Map();
			docs.forEach((doc) => {
				const key = (doc.lang || "") + "|" + normKey(doc.question || "");
				if (!groups.has(key)) groups.set(key, []);
				groups.get(key).push(toClient(doc));
			});
			const duplicates = Array.from(groups.values()).filter((group) => group.length > 1);
			res.json({ groups: duplicates.slice(0, REPORT_MAX_ITEMS), total: duplicates.length });
		} catch (error) {
			next(error);
		}
	});

	// POST /questions/import?dryRun=1&lang=fr   body: the CSV file (text/csv, max 1 MB)
	router.post("/questions/import", csvBody, async (req, res, next) => {
		try {
			if (typeof req.body !== "string") {
				return res.status(415).json({ error: "admin.import.badType" });
			}
			const dryRun = req.query.dryRun === "1" || req.query.dryRun === "true";
			if (!LANGS.includes(req.query.lang)) {
				return badRequest(res, { lang: "admin.error.invalid" });
			}
			const parsed = bank.parseCsv(req.body, { defaultLang: req.query.lang, maxLines: IMPORT_MAX_LINES });

			// questions already in the database: indexed lookups on {lang, norm}, by chunks
			const known = new Set();
			for (const lang of LANGS) {
				const norms = parsed.rows.filter((row) => row.value.lang === lang).map((row) => row.value.norm);
				for (let i = 0; i < norms.length; i += 1000) {
					const found = await Question.find({ lang, norm: { $in: norms.slice(i, i + 1000) } }, { norm: 1 }).lean();
					found.forEach((doc) => known.add(lang + "|" + doc.norm));
				}
			}

			const seen = new Map(); // key -> first line in the file
			const duplicatesDb = [];
			const duplicatesFile = [];
			const toInsert = [];
			const byLang = { fr: 0, en: 0 };
			parsed.rows.forEach(({ line, value }) => {
				const key = value.lang + "|" + value.norm;
				if (known.has(key)) {
					duplicatesDb.push({ line, question: shorten(value.question) });
				} else if (seen.has(key)) {
					duplicatesFile.push({ line, sameAs: seen.get(key), question: shorten(value.question) });
				} else {
					seen.set(key, line);
					byLang[value.lang]++;
					toInsert.push(value);
				}
			});

			let inserted = 0;
			if (!dryRun && toInsert.length > 0) {
				const now = new Date();
				const docs = toInsert.map((value) =>
					Object.assign({}, value, { status: "approved", source: "import", playCount: 0, lastPlayedAt: null, createdAt: now })
				);
				try {
					const result = await Question.insertMany(docs, { ordered: false });
					inserted = result.length;
				} catch (error) {
					// a question added meanwhile (unique index): the others are inserted
					if (!isDuplicateKeyError(error) && !(error && error.writeErrors)) throw error;
					inserted = error.insertedDocs ? error.insertedDocs.length : (error.result && error.result.insertedCount) || 0;
				}
				await audit(req, "question.import", {
					inserted,
					duplicates: duplicatesDb.length + duplicatesFile.length,
					errors: parsed.errors.length,
					lang: req.query.lang,
				});
			}

			res.json({
				dryRun,
				lines: parsed.lines,
				valid: parsed.rows.length,
				toInsert: toInsert.length,
				toInsertByLang: byLang,
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

	// GET /questions/export?lang=&status=&category=&filter=&q= -> CSV
	//   question;reponse_1;reponse_2;reponse_3;explicit;category;lang
	// (default: every approved question; status=all for everything)
	router.get("/questions/export", async (req, res, next) => {
		try {
			const filters = readFilters(req.query);
			const query = baseQuery(filters);
			if (filters.filter === "classic") query.explicit = "false";
			if (filters.filter === "premium") query.explicit = "true";
			const date = new Date().toISOString().slice(0, 10);
			const suffix = filters.lang === "all" ? "" : "-" + filters.lang;
			res.set("Content-Type", "text/csv; charset=utf-8");
			res.set("Content-Disposition", `attachment; filename="punchline-questions${suffix}-${date}.csv"`);
			const cursor = Question.find(query).sort({ _id: 1 }).lean().cursor();
			let body = "";
			for await (const doc of cursor) {
				body += bank.toCsvLine(doc) + "\n";
			}
			res.send(body);
		} catch (error) {
			next(error);
		}
	});

	return router;
};

module.exports.validateQuestion = validateQuestion;
module.exports.duplicateKey = normKey;
module.exports.parseCsv = bank.parseCsv;
module.exports.searchRegex = searchRegex;
module.exports.toClient = toClient;
module.exports.IMPORT_MAX_BYTES = IMPORT_MAX_BYTES;
module.exports.QUESTION_MAX = QUESTION_MAX;
module.exports.ANSWER_MAX = ANSWER_MAX;
