/**
 * Premium code: the code that unlocks the premium (explicit) questions in the lobby.
 *
 * Stored in MongoDB, collection "settings", one document:
 *   { _id: "premium", code: String | null, updatedAt: Date, updatedBy: String }
 * code null = premium turned off. The first time (no document), it is initialised from
 * premiumCode in config.properties when set; without both, premium is off.
 *
 * app.js creates the store, calls load() at startup and matches() in startGame;
 * the admin panel (admin/settings.js) reads and changes it through get / set / disable.
 * The value is cached in memory: a change applies at once, without a restart.
 */
"use strict";

const crypto = require("crypto");

const DOC_ID = "premium";
const MIN_LENGTH = 4;
const MAX_LENGTH = 15; // the lobby accepts 15 characters
const CODE_PATTERN = /^[A-Za-z0-9-]+$/;
// placeholder of config.properties.example: never a real code
const PLACEHOLDERS = ["change-me"];

// Short common words (3 to 5 letters, a-z only: no accent to type on a phone or a TV remote).
// Two words + 3 digits = 15 characters at most ("apple-river-427").
const WORDS = {
	en: [
		"acorn", "actor", "album", "alarm", "amber", "apple", "apron", "arrow", "attic", "bacon",
		"badge", "bagel", "baker", "banjo", "basil", "beach", "bean", "bear", "bell", "bench",
		"berry", "bike", "bird", "blue", "boat", "bread", "brick", "broom", "brush", "cabin",
		"cake", "camel", "candy", "canoe", "cape", "card", "cargo", "cedar", "chair", "chalk",
		"chess", "cider", "clock", "cloud", "clown", "coast", "cocoa", "comet", "coral", "corn",
		"crab", "crane", "crown", "cube", "daisy", "delta", "desk", "dice", "donut", "dove",
		"dream", "drum", "duck", "eagle", "earth", "easel", "elbow", "fable", "fairy", "farm",
		"fern", "field", "film", "fish", "flag", "flame", "flute", "foam", "fork", "frog",
		"fruit", "gecko", "ghost", "giant", "gift", "glove", "goat", "gold", "grape", "grass",
		"hazel", "heart", "hill", "honey", "horse", "igloo", "iris", "jazz", "jelly", "juice",
		"kayak", "kite", "kiwi", "koala", "ladle", "lake", "lamp", "leaf", "lemon", "lily",
		"lime", "lion", "llama", "lotus", "lunch", "magic", "mango", "maple", "melon", "mint",
		"moon", "moose", "mouse", "music", "nest", "north", "oasis", "ocean", "olive", "onion",
		"orbit", "otter", "paint", "panda", "paper", "park", "peach", "pearl", "piano", "pilot",
		"pizza", "plum", "polar", "pond", "pony", "puppy", "quilt", "radio", "rain", "raven",
		"reef", "rice", "river", "robin", "robot", "rock", "rose", "ruby", "sail", "salad",
		"sand", "scarf", "seal", "shell", "ship", "silk", "skate", "sled", "snow", "sofa",
		"soup", "spoon", "star", "stone", "sugar", "swan", "table", "taco", "tent", "tiger",
		"toast", "torch", "tower", "train", "tree", "tulip", "tuna", "wagon", "whale", "wheat",
		"wind", "wolf", "wool", "yarn", "zebra", "zest", "bunny", "maze", "pasta", "lava",
	],
	fr: [
		"ange", "arbre", "avion", "bague", "balle", "banc", "biche", "bijou", "bille", "bleu",
		"bois", "botte", "boule", "bulle", "cadre", "carte", "cerf", "chat", "chien", "chou",
		"clou", "colle", "conte", "corde", "cygne", "dinde", "dune", "ferme", "figue", "frite",
		"fruit", "gant", "gare", "glace", "gomme", "grain", "grue", "guide", "harpe", "herbe",
		"hibou", "igloo", "jade", "jupe", "kiwi", "lait", "lama", "lampe", "lapin", "lune",
		"loup", "lutin", "lynx", "miel", "moto", "nappe", "neige", "noix", "nuage", "olive",
		"ombre", "onde", "orage", "orge", "ours", "pain", "panda", "pelle", "perle", "phare",
		"piano", "pied", "pomme", "pont", "porte", "poule", "prune", "radis", "rame", "robe",
		"roche", "rose", "roue", "ruche", "sable", "sapin", "sauce", "savon", "singe", "sofa",
		"soupe", "sucre", "tapis", "tarte", "tigre", "tipi", "toit", "train", "vache", "vague",
		"velo", "vent", "verre", "ville", "vigne", "poire", "crabe", "datte", "melon", "coing",
		"cacao", "sirop", "pizza", "taxi", "robot", "radio", "photo", "livre", "page", "plume",
		"stylo", "craie", "bocal", "tasse", "four", "frigo", "drap", "clef", "loupe", "ruban",
		"laine", "coton", "soie", "cuir", "mont", "plage", "port", "quai", "voile", "ancre",
		"algue", "thon", "sole", "carpe", "koala", "bison", "daim", "poney", "aigle", "merle",
		"geai", "grive", "fleur", "lilas", "foin", "tige", "orme", "saule", "palme", "champ",
		"tour", "salon", "gong", "banjo", "danse", "chant", "film", "fable", "mime", "clown",
		"magie", "jouet", "judo", "golf", "rugby", "surf", "match", "sport", "filet", "score",
		"coupe", "dodo", "pion", "cube", "menu", "bus", "lac", "nid", "jeu", "sel",
		"riz", "jus", "mer", "ciel", "midi", "rire", "brume", "givre", "flan", "kayak",
	],
};

// What the lobby compares: case, spaces and dashes don't matter ("Pomme Velo 427" = "pomme-velo-427")
function normalize(code) {
	return String(code == null ? "" : code)
		.normalize("NFKC")
		.toLowerCase()
		.replace(/[\s\-\u2010-\u2015\u2212_]+/g, "");
}

function digest(value) {
	return crypto.createHash("sha256").update(value, "utf8").digest();
}

// Validation of a code typed in the admin panel: returns an error key or null
function validate(code) {
	if (typeof code !== "string") return "admin.settings.error.invalid";
	const value = code.trim();
	if (value.length < MIN_LENGTH || value.length > MAX_LENGTH) return "admin.settings.error.length";
	if (!CODE_PATTERN.test(value)) return "admin.settings.error.chars";
	if (normalize(value).length < MIN_LENGTH) return "admin.settings.error.length";
	return null;
}

// New readable code: two different words of the admin's language + 3 digits ("pomme-velo-042")
function generate(lang) {
	const words = WORDS[lang] || WORDS.en;
	const first = crypto.randomInt(words.length);
	let second = crypto.randomInt(words.length - 1);
	if (second >= first) second++;
	const digits = String(crypto.randomInt(1000)).padStart(3, "0");
	return words[first] + "-" + words[second] + "-" + digits;
}

function settingsModel(mongoose) {
	if (mongoose.models.Setting) return mongoose.models.Setting;
	const schema = new mongoose.Schema(
		{
			_id: { type: String },
			code: { type: String, default: null },
			updatedAt: { type: Date },
			updatedBy: { type: String, default: "" },
		},
		{ collection: "settings", versionKey: false, strict: false }
	);
	return mongoose.model("Setting", schema);
}

/**
 * options.initialCode: () => premiumCode of config.properties (read when load() runs)
 */
function createPremiumStore({ mongoose, log, initialCode }) {
	const Setting = settingsModel(mongoose);
	const write = log || (() => {});
	// cache: { code, updatedAt, updatedBy, persisted }
	let state = { code: null, updatedAt: null, updatedBy: "", persisted: false };
	let loaded = false; // the database value was read (or written by the admin)
	let pending = null; // load in progress

	let warned = false;
	function warnOnce(msg) {
		if (!warned) write("warn", msg);
		warned = true;
	}

	function configCode() {
		const raw = typeof initialCode === "function" ? initialCode() : initialCode;
		const value = String(raw == null ? "" : raw).trim();
		if (!value) return null;
		if (PLACEHOLDERS.includes(value.toLowerCase())) {
			warnOnce("premiumCode in config.properties is the example placeholder: ignored");
			return null;
		}
		if (value.length > MAX_LENGTH || normalize(value).length === 0) {
			warnOnce("premiumCode in config.properties is not usable (1 to 15 characters): ignored");
			return null;
		}
		return value;
	}

	function apply(doc, persisted) {
		state = {
			code: doc && typeof doc.code === "string" && doc.code ? doc.code : null,
			updatedAt: doc && doc.updatedAt ? new Date(doc.updatedAt) : null,
			updatedBy: doc && doc.updatedBy ? String(doc.updatedBy) : "",
			persisted,
		};
	}

	function read() {
		return (async () => {
			try {
				let doc = await Setting.findById(DOC_ID).lean();
				if (!doc) {
					const code = configCode();
					if (code) {
						// first start with this feature: the config value becomes the stored one
						await Setting.updateOne(
							{ _id: DOC_ID },
							{ $setOnInsert: { code, updatedAt: new Date(), updatedBy: "config" } },
							{ upsert: true }
						);
						doc = await Setting.findById(DOC_ID).lean();
						write("info", "premium code initialised from config.properties");
					}
				}
				if (loaded) return; // the admin changed it in the meantime
				apply(doc, Boolean(doc));
				loaded = true;
				write("info", state.code ? "premium code loaded" : "premium is turned off (no premium code)");
			} catch (error) {
				write("error", "premium code not loaded, config.properties used until MongoDB answers", { error });
			}
		})().finally(() => {
			pending = null;
		});
	}

	// Reads the stored code (once MongoDB is connected); safe to call several times
	function load() {
		if (loaded) return Promise.resolve();
		if (!pending) pending = read();
		return pending;
	}

	// until the database answers, the config value is used (as before this feature);
	// the first (re)connection loads the stored value
	apply({ code: configCode(), updatedBy: "config" }, false);
	if (mongoose.connection && typeof mongoose.connection.on === "function") {
		mongoose.connection.on("connected", () => {
			if (!loaded) load();
		});
	}

	async function save(code, user) {
		const doc = { code: code || null, updatedAt: new Date(), updatedBy: String(user || "").slice(0, 100) };
		await Setting.updateOne({ _id: DOC_ID }, { $set: doc }, { upsert: true });
		apply(doc, true);
		loaded = true;
		return get();
	}

	function get() {
		return {
			enabled: Boolean(state.code),
			code: state.code,
			updatedAt: state.updatedAt ? state.updatedAt.toISOString() : null,
			updatedBy: state.updatedBy,
			persisted: state.persisted,
		};
	}

	// Constant-time check of a code typed in the lobby (false when premium is off)
	function matches(input) {
		const expected = state.code ? normalize(state.code) : "";
		const typed = normalize(input);
		// always hash and compare, so that "off" and "wrong" take the same time
		const same = crypto.timingSafeEqual(digest(typed), digest(expected || "\u0000premium-off"));
		return Boolean(expected) && typed.length > 0 && same;
	}

	return {
		load,
		get,
		matches,
		set: (code, user) => save(code.trim(), user),
		disable: (user) => save(null, user),
	};
}

module.exports = { createPremiumStore, normalize, validate, generate, WORDS, MIN_LENGTH, MAX_LENGTH };
