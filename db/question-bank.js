/**
 * Questions: shared rules for the game (functions.js), the admin panel (admin/) and the
 * seed script (db/seed.js).
 *
 * Documents of the "questions" collection:
 *   question, reponse_1, reponse_2, reponse_3   texts (reponse_* = the bot's answers)
 *   explicit       "true" | "false"  (a STRING: the game matches "false")
 *   lang           "fr" | "en"
 *   category       one of CATEGORIES, or "" (none)
 *   status         "approved" | "pending" | "rejected"  (only approved ones are played)
 *   source         "bank" | "ai" | "admin" | "import"
 *   playCount      number of games that used it
 *   lastPlayedAt   Date | null
 *   createdAt      Date
 *   norm           normalized question text (dedupe key, unique per lang)
 *   seedKey        bank questions only: norm of the original bank text (kept when an admin
 *                  edits the text, so that the seed does not add the original back)
 *
 * Bank / import CSV: no header, ";" separator, no quoting:
 *   question;reponse_1;reponse_2;reponse_3;explicit[;category[;lang]]
 */
"use strict";

const fs = require("fs");
const path = require("path");

const LANGS = ["fr", "en"];
const DEFAULT_LANG = "fr";
const STATUSES = ["approved", "pending", "rejected"];
const SOURCES = ["bank", "ai", "admin", "import"];
const CATEGORIES = [
	"quotidien",
	"travail",
	"couple",
	"famille",
	"nourriture",
	"voyage",
	"ecole",
	"tech",
	"pop",
	"absurde",
	"animaux",
	"sport",
	"fete",
];
const QUESTION_MAX = 300;
const ANSWER_MAX = 100;
const ANSWER_FIELDS = ["reponse_1", "reponse_2", "reponse_3"];
const FRESH_DAYS = 30; // a question played less than 30 days ago is "recent"
const AUTO_SEED_MIN = 50; // startup: seed a language that has fewer approved questions
const BANK_DIR = path.join(__dirname, "questions");

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

// Collapses any whitespace (line breaks, tabs, non-breaking spaces…) into single spaces
function tidy(value) {
	return String(value).normalize("NFC").replace(/\s+/g, " ").trim();
}

/**
 * Dedupe key: lowercase, no accents, no punctuation, single spaces.
 * "L’œuf  ou la poule ?" -> "l oeuf ou la poule"
 */
function normKey(text) {
	return String(text == null ? "" : text)
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/œ/g, "oe")
		.replace(/æ/g, "ae")
		.replace(/ß/g, "ss")
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim();
}

const FR_WORDS = new Set(
	("le la les des une un du de est et que qui pour pas ton ta tes mon ma mes ce cette ces avec dans sur quand pourquoi " +
		"quoi tu je il elle nous vous au aux ou mais son sa ses leur plus faire fait jamais rien tout toujours chez quel quelle " +
		"pire meilleur meilleure truc chose vraiment dire jour nuit soir matin ne en y comme si").split(" ")
);
const EN_WORDS = new Set(
	("the a an of to your you what is and for with that this my worst best would in on at it be are was thing things never " +
		"why how when who do does if or but not they their them most way say says said into from about can will should").split(" ")
);

/**
 * Language of a question, guessed from its texts: French accents, typographic spaces before
 * "?" / "!" and common French words => "fr"; common English words => "en". Ties => "en"
 * unless an accent or French punctuation tips it.
 */
function detectLang(doc) {
	const parts = [doc && doc.question].concat(ANSWER_FIELDS.map((field) => doc && doc[field]));
	const raw = parts.filter((part) => typeof part === "string").join(" ");
	const lower = raw.toLowerCase();
	let fr = 0;
	let en = 0;
	const accents = lower.match(/[àâçéèêëîïôûùüÿœæ]/g);
	if (accents) fr += 2 * accents.length;
	if (/\s[?!:;]/.test(raw)) fr += 1; // French typography
	if (/\b(?:l|d|j|qu|c|n|s|m|t)['’][a-zàâçéèêëîïôûùüÿœ]/i.test(raw)) fr += 2; // l'eau, qu'il, c'est
	if (/\b\w+'s\b|n't\b|'re\b|'ll\b|'ve\b/i.test(raw)) en += 2; // English contractions
	for (const word of lower.split(/[^a-zàâçéèêëîïôûùüÿœæ]+/)) {
		if (!word) continue;
		if (FR_WORDS.has(word)) fr += 1;
		if (EN_WORDS.has(word)) en += 1;
	}
	return fr > en ? "fr" : "en";
}

// ---------------------------------------------------------------------------
// Validation (admin form, CSV import, seed, AI output)
// ---------------------------------------------------------------------------

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
 * Validates a question (admin JSON, CSV row, AI item).
 * input: { question, reponse_1..3, explicit: boolean, lang?, category? }
 * options.requireLang: lang must be "fr" / "en" (otherwise options.defaultLang is used when missing)
 * Returns { value, errors }: errors maps a field to a translation key (empty when valid).
 * value.explicit is the STRING "true" / "false"; value.norm is the dedupe key.
 */
function validateQuestion(input, options) {
	options = options || {};
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

	let lang = input.lang;
	if ((lang === undefined || lang === null || lang === "") && !options.requireLang) lang = options.defaultLang || DEFAULT_LANG;
	if (typeof lang !== "string" || !LANGS.includes(lang)) {
		errors.lang = "admin.error.invalid";
	}
	value.lang = LANGS.includes(lang) ? lang : DEFAULT_LANG;

	const category = input.category === undefined || input.category === null ? "" : input.category;
	if (typeof category !== "string" || (category !== "" && !CATEGORIES.includes(category))) {
		errors.category = "admin.error.badCategory";
	}
	value.category = typeof category === "string" && CATEGORIES.includes(category) ? category : "";

	value.norm = normKey(value.question);
	if (!errors.question && value.norm.length === 0) errors.question = "admin.error.required";

	return { value, errors };
}

/**
 * Parses CSV text: question;reponse_1;reponse_2;reponse_3;explicit[;category[;lang]]
 * (the old 5-field format is still accepted). Blank lines are skipped, a missing explicit
 * means "false", a missing lang means options.defaultLang. Strict: extra columns, an unknown
 * explicit, category or lang are reported as errors.
 * Returns { rows: [{ line, value }], errors: [{ line, errors: [key] }], lines, tooMany }.
 */
function parseCsv(text, options) {
	options = options || {};
	const maxLines = options.maxLines || Infinity;
	const rows = [];
	const errors = [];
	const lines = String(text).replace(/^﻿/, "").split(/\r\n|\n|\r/);
	// a trailing newline is not a line
	if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
	if (lines.length > maxLines) {
		return { rows, errors: [{ line: 0, errors: ["admin.import.tooManyLines"] }], lines: lines.length, tooMany: true };
	}
	lines.forEach((raw, index) => {
		const line = index + 1;
		if (raw.trim() === "") return;
		const cells = raw.split(";");
		if (cells.length > 7) {
			errors.push({ line, errors: ["admin.import.tooManyColumns"] });
			return;
		}
		const explicitText = (cells[4] || "").trim().toLowerCase() || "false";
		if (explicitText !== "true" && explicitText !== "false") {
			errors.push({ line, errors: ["admin.import.badExplicit"] });
			return;
		}
		const category = (cells[5] || "").trim().toLowerCase();
		const langText = (cells[6] || "").trim().toLowerCase();
		if (langText && !LANGS.includes(langText)) {
			errors.push({ line, errors: ["admin.import.badLang"] });
			return;
		}
		const { value, errors: fieldErrors } = validateQuestion(
			{
				question: cells[0],
				reponse_1: cells[1],
				reponse_2: cells[2],
				reponse_3: cells[3],
				explicit: explicitText === "true",
				category,
				lang: langText || options.defaultLang || DEFAULT_LANG,
			},
			{ requireLang: true }
		);
		const keys = Object.keys(fieldErrors);
		if (keys.length > 0) {
			errors.push({ line, errors: keys.map((field) => field + ":" + fieldErrors[field]) });
			return;
		}
		rows.push({ line, value });
	});
	return { rows, errors, lines: lines.length };
}

// One CSV cell; old documents may contain characters the format can't hold: replaced by spaces
function csvCell(value) {
	return String(value == null ? "" : value)
		.replace(/[;\r\n]+/g, " ")
		.trim();
}

// question;reponse_1;reponse_2;reponse_3;explicit;category;lang
function toCsvLine(doc) {
	return [
		csvCell(doc.question),
		csvCell(doc.reponse_1),
		csvCell(doc.reponse_2),
		csvCell(doc.reponse_3),
		String(doc.explicit) === "true" ? "true" : "false",
		CATEGORIES.includes(doc.category) ? doc.category : "",
		LANGS.includes(doc.lang) ? doc.lang : "",
	].join(";");
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

function defineSchema(mongoose) {
	const schema = new mongoose.Schema(
		{
			question: { type: String, required: true, trim: true, maxlength: QUESTION_MAX },
			reponse_1: { type: String, trim: true, maxlength: ANSWER_MAX, default: "" },
			reponse_2: { type: String, trim: true, maxlength: ANSWER_MAX, default: "" },
			reponse_3: { type: String, trim: true, maxlength: ANSWER_MAX, default: "" },
			explicit: { type: String, enum: ["true", "false"], required: true, default: "false" },
			lang: { type: String, enum: LANGS, required: true, default: DEFAULT_LANG },
			category: { type: String, enum: CATEGORIES.concat([""]), default: "" },
			status: { type: String, enum: STATUSES, required: true, default: "approved" },
			source: { type: String, enum: SOURCES, required: true, default: "admin" },
			playCount: { type: Number, default: 0, min: 0 },
			lastPlayedAt: { type: Date, default: null },
			createdAt: { type: Date, default: () => new Date() },
			norm: { type: String, required: true },
			seedKey: { type: String },
		},
		// indexes are built by migrate(), after the old documents got their lang / norm
		{ collection: "questions", versionKey: false, strict: true, autoIndex: false }
	);
	// dedupe: one question text per language
	schema.index({ lang: 1, norm: 1 }, { unique: true, name: "lang_norm_unique" });
	// game selection (classic: explicit = "false"; premium: any explicit)
	schema.index({ status: 1, lang: 1, explicit: 1, lastPlayedAt: 1 }, { name: "select_classic" });
	schema.index({ status: 1, lang: 1, lastPlayedAt: 1 }, { name: "select_all" });
	// admin lists (newest first, by status / language)
	schema.index({ status: 1, lang: 1, _id: -1 }, { name: "admin_list" });
	// seed: original bank text of an edited question
	schema.index({ lang: 1, seedKey: 1 }, { name: "lang_seedKey", sparse: true });
	return schema;
}

// The single mongoose model of the collection (shared by the game, the admin and the seed)
function getModel(mongoose) {
	if (mongoose.models.Question) return mongoose.models.Question;
	return mongoose.model("Question", defineSchema(mongoose));
}

// Bank questions removed by an admin: the seed does not add them back
function getRemovedModel(mongoose) {
	if (mongoose.models.QuestionRemoved) return mongoose.models.QuestionRemoved;
	const schema = new mongoose.Schema(
		{ lang: String, norm: String, at: Date },
		{ collection: "questions_removed", versionKey: false }
	);
	schema.index({ lang: 1, norm: 1 }, { unique: true });
	return mongoose.model("QuestionRemoved", schema);
}

// ---------------------------------------------------------------------------
// Migration (idempotent, run at every startup and by the seed)
// ---------------------------------------------------------------------------

/**
 * Brings old documents to the current shape: status approved, source import, playCount 0,
 * lastPlayedAt null, createdAt from the ObjectId, explicit as a string, lang guessed from the
 * texts, norm computed. Duplicates per {lang, norm} keep their text but get a suffixed norm
 * (so that the unique index can be built; the admin duplicate finder still shows them).
 * Then creates the indexes. Returns a summary.
 */
async function migrate(mongoose, log) {
	log = log || (() => {});
	const Question = getModel(mongoose);
	const collection = Question.collection;
	const summary = { defaults: 0, langNorm: 0, duplicates: 0 };

	const simple = [
		[{ status: { $exists: false } }, { $set: { status: "approved" } }],
		[{ source: { $exists: false } }, { $set: { source: "import" } }],
		[{ playCount: { $exists: false } }, { $set: { playCount: 0 } }],
		[{ lastPlayedAt: { $exists: false } }, { $set: { lastPlayedAt: null } }],
		[{ category: { $exists: false } }, { $set: { category: "" } }],
		[{ explicit: true }, { $set: { explicit: "true" } }],
		[{ explicit: { $nin: ["true", "false"] } }, { $set: { explicit: "false" } }],
	];
	for (const [filter, update] of simple) {
		const result = await collection.updateMany(filter, update);
		summary.defaults += result.modifiedCount || 0;
	}
	const created = await collection.updateMany({ createdAt: { $exists: false } }, [{ $set: { createdAt: { $toDate: "$_id" } } }]);
	summary.defaults += created.modifiedCount || 0;

	// lang and norm need JavaScript: only the documents that miss one of them
	const cursor = collection.find(
		{ $or: [{ lang: { $nin: LANGS } }, { norm: { $exists: false } }, { norm: "" }] },
		{ projection: { question: 1, reponse_1: 1, reponse_2: 1, reponse_3: 1, lang: 1 } }
	);
	let batch = [];
	for await (const doc of cursor) {
		const lang = LANGS.includes(doc.lang) ? doc.lang : detectLang(doc);
		const norm = normKey(doc.question) || "empty " + String(doc._id);
		batch.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { lang, norm } } } });
		if (batch.length >= 500) {
			await collection.bulkWrite(batch, { ordered: false });
			summary.langNorm += batch.length;
			batch = [];
		}
	}
	if (batch.length) {
		await collection.bulkWrite(batch, { ordered: false });
		summary.langNorm += batch.length;
	}

	// duplicates would block the unique index: only checked while the index is missing
	const indexes = await collection.indexes().catch(() => []);
	if (!indexes.some((index) => index.name === "lang_norm_unique")) {
		const groups = await collection
			.aggregate([
				{ $group: { _id: { lang: "$lang", norm: "$norm" }, ids: { $push: "$_id" }, count: { $sum: 1 } } },
				{ $match: { count: { $gt: 1 } } },
			], { allowDiskUse: true })
			.toArray();
		const fixes = [];
		groups.forEach((group) => {
			group.ids
				.sort((a, b) => String(a).localeCompare(String(b)))
				.slice(1)
				.forEach((id) => {
					fixes.push({ updateOne: { filter: { _id: id }, update: { $set: { norm: group._id.norm + " ~" + String(id) } } } });
				});
		});
		if (fixes.length) {
			await collection.bulkWrite(fixes, { ordered: false });
			summary.duplicates = fixes.length;
			log("warn", "duplicate questions found (kept, see the admin duplicate finder)", { count: fixes.length });
		}
	}

	await Question.createIndexes();
	await getRemovedModel(mongoose).createIndexes();
	if (summary.defaults || summary.langNorm || summary.duplicates) {
		log("info", "questions migrated", summary);
	}
	return summary;
}

// ---------------------------------------------------------------------------
// Seed (db/questions/<lang>.csv)
// ---------------------------------------------------------------------------

// db/questions/fr.csv -> "fr"; null when the file name is not a supported language
function langFromFile(file) {
	const name = path.basename(file).toLowerCase().replace(/\.csv$/, "");
	return LANGS.includes(name) ? name : null;
}

function bankFiles(dir) {
	dir = dir || BANK_DIR;
	try {
		return fs
			.readdirSync(dir)
			.filter((name) => /\.csv$/i.test(name) && langFromFile(name))
			.sort()
			.map((name) => path.join(dir, name));
	} catch (error) {
		return [];
	}
}

/**
 * Upserts one bank file. A question is "already present" when its {lang, norm} exists (any
 * status), when it is the original text of an edited bank question (seedKey), or when an admin
 * removed it. Existing documents are never modified (play counts, admin edits are kept).
 * Returns { file, lang, lines, inserted, present, invalid: [{ line, errors }] }.
 */
async function seedFile(mongoose, file, options) {
	options = options || {};
	const Question = getModel(mongoose);
	const Removed = getRemovedModel(mongoose);
	const lang = options.lang || langFromFile(file);
	const report = { file, lang, lines: 0, inserted: 0, present: 0, invalid: [] };
	if (!lang) {
		report.invalid.push({ line: 0, errors: ["file name must be fr.csv or en.csv"] });
		return report;
	}
	const text = fs.readFileSync(file, "utf8");
	const parsed = parseCsv(text, { defaultLang: lang });
	report.lines = parsed.lines;
	report.invalid = parsed.errors;

	// rows of another language (7th column) are ignored: the language comes from the file name
	const rows = [];
	const seen = new Set();
	parsed.rows.forEach(({ line, value }) => {
		if (value.lang !== lang) {
			report.invalid.push({ line, errors: ["lang:admin.import.badLang"] });
			return;
		}
		if (seen.has(value.norm)) {
			report.present++; // repeated in the file
			return;
		}
		seen.add(value.norm);
		rows.push(value);
	});
	report.invalid.sort((a, b) => a.line - b.line);

	const now = new Date();
	for (let i = 0; i < rows.length; i += 500) {
		const chunk = rows.slice(i, i + 500);
		const norms = chunk.map((row) => row.norm);
		const [byNorm, bySeedKey, removed] = await Promise.all([
			Question.find({ lang, norm: { $in: norms } }, { norm: 1 }).lean(),
			Question.find({ lang, seedKey: { $in: norms } }, { seedKey: 1 }).lean(),
			Removed.find({ lang, norm: { $in: norms } }, { norm: 1 }).lean(),
		]);
		const known = new Set(
			byNorm.map((doc) => doc.norm).concat(bySeedKey.map((doc) => doc.seedKey), removed.map((doc) => doc.norm))
		);
		const operations = [];
		chunk.forEach((row) => {
			if (known.has(row.norm)) {
				report.present++;
				return;
			}
			operations.push({
				updateOne: {
					filter: { lang, norm: row.norm },
					update: {
						$setOnInsert: Object.assign({}, row, {
							lang,
							status: "approved",
							source: "bank",
							playCount: 0,
							lastPlayedAt: null,
							createdAt: now,
							seedKey: row.norm,
						}),
					},
					upsert: true,
				},
			});
		});
		if (operations.length) {
			const result = await Question.collection.bulkWrite(operations, { ordered: false });
			report.inserted += result.upsertedCount || 0;
			report.present += operations.length - (result.upsertedCount || 0);
		}
	}
	return report;
}

async function seedFiles(mongoose, files) {
	const reports = [];
	for (const file of files) {
		reports.push(await seedFile(mongoose, file));
	}
	return reports;
}

/**
 * Startup: migration, then the bank of every language with fewer than AUTO_SEED_MIN approved
 * questions (a fresh install gets content without running the seed by hand).
 */
async function prepare(mongoose, log) {
	log = log || (() => {});
	await migrate(mongoose, log);
	const Question = getModel(mongoose);
	for (const file of bankFiles()) {
		const lang = langFromFile(file);
		const count = await Question.countDocuments({ status: "approved", lang });
		if (count >= AUTO_SEED_MIN) continue;
		log("info", "few questions in this language: seeding from the bank", { lang, approved: count, file: path.relative(process.cwd(), file) });
		const report = await seedFile(mongoose, file);
		log("info", "questions seeded", { lang, inserted: report.inserted, present: report.present, invalid: report.invalid.length });
	}
}

module.exports = {
	LANGS,
	DEFAULT_LANG,
	STATUSES,
	SOURCES,
	CATEGORIES,
	QUESTION_MAX,
	ANSWER_MAX,
	ANSWER_FIELDS,
	FRESH_DAYS,
	AUTO_SEED_MIN,
	BANK_DIR,
	tidy,
	normKey,
	detectLang,
	checkText,
	validateQuestion,
	parseCsv,
	toCsvLine,
	getModel,
	getRemovedModel,
	migrate,
	langFromFile,
	bankFiles,
	seedFile,
	seedFiles,
	prepare,
};
