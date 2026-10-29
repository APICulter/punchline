/**  *****************************************************************************************
 ******************************** Init for main program **************************************
 ***************************************************************************************** **/

// Import required modules
const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const mongoose = require("mongoose");
const DOMPurify = require("isomorphic-dompurify");
const os = require("os");

// Structured logs: one JSON object per line (time, level, msg + fields such as pin, event, error, stack)
function log(level, msg, fields) {
	const entry = Object.assign({ time: new Date().toISOString(), level: level, msg: msg }, fields || {});
	const err = entry.error;
	if (err instanceof Error) {
		entry.error = err.message;
		entry.stack = err.stack;
	} else if (err !== undefined) {
		entry.error = String(err);
	}
	let line;
	try {
		line = JSON.stringify(entry);
	} catch (e) {
		line = JSON.stringify({ time: entry.time, level: level, msg: msg, error: "unserializable log fields" });
	}
	(level === "error" || level === "fatal" || level === "warn" ? process.stderr : process.stdout).write(line + "\n");
}

// Create and configure the Express app
const app = express();
app.disable("x-powered-by");

// X-Forwarded-* headers are only trusted behind a reverse proxy: TRUST_PROXY=loopback (nginx on the
// same machine), a number of hops, an address / subnet list, or true. Not set => not trusted.
function parseTrustProxy(value) {
	const text = String(value == null ? "" : value).trim();
	if (text === "" || text === "false" || text === "0") return false;
	if (text === "true") return true;
	if (/^[0-9]+$/.test(text)) return Number(text);
	return text;
}
app.set("trust proxy", parseTrustProxy(process.env.TRUST_PROXY));

const server = http.createServer(app);
const io = socketIO(server);
var path = require("path");
const publicPath = path.join(__dirname, "public");
app.get("/", function (req, res) {
	res.sendFile(__dirname + "/public/html/index.html");
});
app.use(express.static(publicPath));

// Optional custom music for the host screens: audio files in public/music/<phase>/
// GET /api/music -> { lobby: ["/music/lobby/a.mp3", ...], countdown: [], ... }
const MUSIC_PHASES = ["lobby", "countdown", "answering", "reveal", "scores"];
const MUSIC_EXTENSIONS = [".mp3", ".ogg", ".m4a", ".wav"];
app.get("/api/music", function (req, res) {
	const musicPath = path.join(publicPath, "music");
	const tracks = {};
	MUSIC_PHASES.forEach(function (phase) {
		tracks[phase] = [];
		try {
			require("fs")
				.readdirSync(path.join(musicPath, phase), { withFileTypes: true })
				.forEach(function (entry) {
					// plain files only (no folders or links), allowed audio types, no hidden files
					if (!entry.isFile() || entry.name.startsWith(".") || /[\/\\]/.test(entry.name)) return;
					if (!MUSIC_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) return;
					tracks[phase].push("/music/" + phase + "/" + encodeURIComponent(entry.name));
				});
			tracks[phase].sort();
		} catch (e) {
			// missing or unreadable folder: no custom track for this phase
		}
	});
	res.set("Cache-Control", "no-store");
	res.json(tracks);
});

// Health check for the supervisor / reverse proxy / monitoring:
// 200 {status: "ok", ...} when MongoDB is connected, 503 otherwise (or while shutting down)
app.get("/healthz", function (req, res) {
	const mongo = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
	const ok = mongo === "connected" && !shuttingDown;
	res.set("Cache-Control", "no-store");
	res.status(ok ? 200 : 503).json({
		status: shuttingDown ? "shutting_down" : ok ? "ok" : "degraded",
		uptime: Math.round(process.uptime()),
		games: games.length,
		mongo: mongo,
	});
});

// Admin panel (admin/): login, questions management, live games.
// Must be registered before the catch-all redirect below.
require("./admin")(app, {
	mongoose,
	getGames: () => games,
	abortGame: (pin, reasonKey) => abortGame(pin, reasonKey),
	log: (level, msg, fields) => log(level, msg, fields),
	// premium code (Settings tab); premiumStore is created below, once config.properties is read
	premium: {
		get: () => premiumStore.get(),
		set: (code, user) => premiumStore.set(code, user),
		disable: (user) => premiumStore.disable(user),
	},
});

app.all("*", function (req, res) {
	res.redirect("/");
});

// Errors thrown by a route: logged, the request gets a 500, the process keeps running
app.use(function (err, req, res, next) {
	log("error", "http request failed", { method: req.method, path: req.path, error: err });
	if (res.headersSent) {
		return next(err);
	}
	res.status(500).type("text/plain").send("Internal server error");
});

// Define classes
const { Game } = require("./classes/game");
const { Player } = require("./classes/player");

// Define global variables
var games = [];
// true once SIGTERM / SIGINT was received (or after a fatal error)
var shuttingDown = false;

// Read the configuration properties from external file and create global variables from it
var propertiesReader = require("properties-reader");
var properties = propertiesReader(__dirname + "/config.properties");
properties.each((key, value) => {
	global[key] = value;
});

// Port: PORT environment variable (set by most hosting platforms) or applicationPort
const port = Number(process.env.PORT) || Number(global.applicationPort) || 3000;

// Best guess of this machine's address on the local network (e.g. 192.168.1.10), used only
// when the host opened the game on localhost. Virtual interfaces (Docker, VMs, VPNs, WSL)
// are skipped; home/office private ranges come first.
const VIRTUAL_INTERFACE = /^(docker|br-|veth|virbr|vmnet|vboxnet|vnic|zt|tailscale|utun|wg|tun|tap|lo|ham|nordlynx|vEthernet|WSL|Hyper-V|VirtualBox|VMware)/i;

function lanAddressScore(name, ip) {
	let score = 0;
	if (/^192\.168\./.test(ip)) score += 30;
	else if (/^10\./.test(ip)) score += 20;
	else if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) score += 10;
	if (/^(en|eth|wl|wlan|Wi-?Fi|Ethernet)/i.test(name)) score += 5;
	return score;
}

function lanAddress() {
	let best = null;
	for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
		if (VIRTUAL_INTERFACE.test(name)) continue;
		for (const address of addresses || []) {
			if (address.family !== "IPv4" && address.family !== 4) continue;
			if (address.internal || /^169\.254\./.test(address.address)) continue;
			const score = lanAddressScore(name, address.address);
			if (!best || score > best.score) best = { ip: address.address, score: score };
		}
	}
	return best ? best.ip : null;
}

const LOOPBACK_HOST = /^(localhost|127(\.\d{1,3}){3}|\[::1\]|0\.0\.0\.0)$/i;

// Public address shown to players ("On your phone, open …" and the QR code), in order:
// 1. PUBLIC_URL environment variable, then punchlineURL in config.properties (production)
// 2. the address shown in the host's browser (window.location.origin, sent with the
//    request): it is exactly what the host typed, https and domain included, even
//    behind a proxy that rewrites the Host header
// 3. the Host header (X-Forwarded-* only from a trusted proxy, TRUST_PROXY)
// 2 and 3 on localhost: replaced by this machine's local network address so that phones
// on the same Wi-Fi can reach it.
function resolvePunchlineURL(socket, clientOrigin) {
	const configured = String(process.env.PUBLIC_URL || global.punchlineURL || "").trim();
	if (configured) {
		return configured.replace(/\/+$/, "");
	}

	let protocol = null;
	let hostname = null;
	let portPart = "";
	try {
		const origin = new URL(String(clientOrigin || ""));
		if ((origin.protocol === "http:" || origin.protocol === "https:") && origin.hostname) {
			protocol = origin.protocol.slice(0, -1);
			hostname = origin.hostname;
			portPart = origin.port ? ":" + origin.port : "";
		}
	} catch (e) {
		// no or invalid origin: use the request headers
	}

	if (!hostname) {
		const headers = socket.handshake.headers || {};
		const trustFn = app.get("trust proxy fn");
		const trusted = typeof trustFn === "function" && trustFn(socket.handshake.address || "", 0);
		const forwardedProto = trusted ? String(headers["x-forwarded-proto"] || "").split(",")[0].trim() : "";
		protocol = forwardedProto || (socket.handshake.secure ? "https" : "http");
		const host = String((trusted && headers["x-forwarded-host"]) || headers.host || "localhost:" + port).split(",")[0].trim();
		const match = host.match(/^(\[[^\]]+\]|[^:]+)(:\d+)?$/);
		hostname = match ? match[1] : host;
		portPart = match && match[2] ? match[2] : "";
	}

	if (LOOPBACK_HOST.test(hostname)) {
		const ip = lanAddress();
		if (ip) hostname = ip;
	}
	return protocol + "://" + hostname + portPart;
}

// Premium code: stored in MongoDB (collection "settings") and changed in the admin panel;
// premiumCode of config.properties is only the initial value (admin/premium.js)
const premiumStore = require("./admin/premium").createPremiumStore({
	mongoose,
	log,
	initialCode: () => (typeof properties.getRaw === "function" ? properties.getRaw("premiumCode") : global.premiumCode),
});

// Brute-force guard for the premium code: at most 10 wrong codes per client address
// in 15 minutes (the address is the proxy's X-Forwarded-For only behind a trusted proxy).
const PREMIUM_MAX_FAILURES = 10;
const PREMIUM_WINDOW_MS = 15 * 60 * 1000;
const premiumFailures = new Map(); // address -> { count, since }

function clientAddress(socket) {
	const address = socket.handshake.address || "";
	const trustFn = app.get("trust proxy fn");
	if (typeof trustFn === "function" && trustFn(address, 0)) {
		const forwarded = String((socket.handshake.headers || {})["x-forwarded-for"] || "").split(",")[0].trim();
		if (forwarded) return forwarded;
	}
	return address;
}

function premiumBlocked(address) {
	const entry = premiumFailures.get(address);
	if (!entry) return false;
	if (Date.now() - entry.since > PREMIUM_WINDOW_MS) {
		premiumFailures.delete(address);
		return false;
	}
	return entry.count >= PREMIUM_MAX_FAILURES;
}

function recordPremiumFailure(address) {
	const now = Date.now();
	const entry = premiumFailures.get(address);
	if (!entry || now - entry.since > PREMIUM_WINDOW_MS) {
		premiumFailures.set(address, { count: 1, since: now });
	} else {
		entry.count++;
	}
	// keep the map small
	if (premiumFailures.size > 10000) {
		for (const [key, value] of premiumFailures) {
			if (now - value.since > PREMIUM_WINDOW_MS) premiumFailures.delete(key);
		}
	}
}

// Database connexion: a single shared connection, kept open for the server's lifetime
// (queries issued before it is open are buffered by mongoose).
// Questions: one model shared with the admin panel and the seed script (db/question-bank.js)
const questionBank = require("./db/question-bank");
const YourModel = questionBank.getModel(mongoose);
let db = mongoose.connection;

db.on("error", (err) => log("error", "MongoDB connection error", { error: err }));
db.on("connected", () => log("info", "Connected to MongoDB"));
db.on("disconnected", () => {
	if (!shuttingDown) log("warn", "Disconnected from MongoDB");
});

// Initial connection, retried every 5 s while MongoDB is unreachable
// (once connected, the driver reconnects by itself)
function connectMongo() {
	// MONGODB_URI (environment) wins over databaseUrl (config.properties)
	const url = process.env.MONGODB_URI || global.databaseUrl;
	return mongoose.connect(url, { serverSelectionTimeoutMS: 5000 }).catch((err) => {
		log("error", "MongoDB initial connection error", { error: err });
		if (!shuttingDown) {
			safeTimeout("mongoConnectRetry", null, () => connectMongo().catch(() => {}), 5000);
		}
		throw err;
	});
}

// Messages sent to the clients: stable keys translated by the browser (public/js/i18n.js).
// Event names are unchanged; older clients simply display the key.
const MESSAGES = {
	pinEmpty: "error.pinEmpty",
	pinDigitsOnly: "error.pinDigitsOnly",
	pinLength: "error.pinLength",
	gameNotFound: "error.gameNotFound",
	roomFull: "error.roomFull",
	nameEmpty: "error.nameEmpty",
	nameTooLong: "error.nameTooLong",
	nameUnauthorized: "error.nameUnauthorized",
	nameTaken: "error.nameTaken",
	roundsInvalid: "error.roundsInvalid",
	answerTimeInvalid: "error.answerTimeInvalid",
	revealTimeInvalid: "error.revealTimeInvalid",
	voteTimeInvalid: "error.voteTime",
	premiumCodeLength: "error.premiumCodeLength",
	premiumCodeInvalid: "error.premiumCodeInvalid",
	premiumTooManyAttempts: "error.premiumTooManyAttempts",
	questionsUnavailable: "error.questionsUnavailable",
	notEnoughQuestions: "error.notEnoughQuestions",
	fewerQuestions: "notice.fewerQuestions",
	answerEmpty: "error.answerEmpty",
	answerTooLong: "error.answerTooLong",
	gameCrashed: "error.gameCrashed",
	gameResumed: "notice.gameResumed",
	voteTooLate: "notice.voteTooLate",
};

// Name reserved for the bot (case insensitive)
const BOT_NAME = String(global.botName || "bot");

// Per-game timers (seconds): bounds of the lobby sliders, defaults from config.properties
const ANSWER_TIME_MIN = 30;
const ANSWER_TIME_MAX = 150;
const REVEAL_TIME_MIN = 10;
const REVEAL_TIME_MAX = 30;
const VOTE_TIME_MIN = 15;
const VOTE_TIME_MAX = 60;

// Integer config value kept within [min, max], or fallback if missing / not a number
function boundedSetting(value, min, max, fallback) {
	const number = Math.round(Number(value));
	if (value === undefined || value === null || String(value).trim() === "" || !Number.isFinite(number)) {
		return fallback;
	}
	return Math.min(max, Math.max(min, number));
}

const DEFAULT_ANSWER_TIME = boundedSetting(global.questionCountDown, ANSWER_TIME_MIN, ANSWER_TIME_MAX, 60);
const DEFAULT_REVEAL_TIME = boundedSetting(global.revealTime, REVEAL_TIME_MIN, REVEAL_TIME_MAX, 10);
const DEFAULT_VOTE_TIME = boundedSetting(global.voteCountDown, VOTE_TIME_MIN, VOTE_TIME_MAX, 30);

// Validates a timer sent by the host: undefined / empty => default, otherwise an integer
// within [min, max]; returns null when invalid
function parseTimeSetting(value, min, max, fallback) {
	const text = clean(value).trim();
	if (text.length === 0) {
		return fallback;
	}
	if (!/^[0-9]+$/.test(text)) {
		return null;
	}
	const number = Number(text);
	return number >= min && number <= max ? number : null;
}

// Rooms dictionary (no prototype: room names come from the clients, e.g. "__proto__")
const rooms = Object.create(null);

// Delay before an empty room (no connected socket) and its game are destroyed
const EMPTY_ROOM_TTL_MS = 10 * 60 * 1000;

// Returns the room name linked to a PIN, or null
function findRoomName(pin) {
	for (const name in rooms) {
		if (rooms[name].pin == pin) {
			return name;
		}
	}
	return null;
}

// Returns the game linked to a PIN, or undefined
function findGame(pin) {
	return games.find((game) => game.pin === Number(pin));
}

// Makes sure a socket payload is an object, so that handlers never crash on data.xxx
function asObject(data) {
	return data !== null && typeof data === "object" ? data : {};
}

// Sanitizes any client value into a string
function clean(value) {
	return DOMPurify.sanitize(value == null ? "" : String(value));
}

// Removes a game from memory (its saved copy is marked as finished on the next save)
function removeGame(game) {
	clearVoteDeadline(game);
	const index = games.indexOf(game);
	if (index !== -1) {
		games.splice(index, 1);
		removedPins.add(game.pin);
		requestSave();
	}
}

// Removes the game and the room linked to a room name
function destroyRoom(roomName) {
	const room = rooms[roomName];
	if (!room) return;
	clearTimeout(room.cleanupTimer);
	const game = findGame(room.pin);
	if (typeof game !== "undefined") {
		removeGame(game);
	}
	delete rooms[roomName];
}

// Destroys a room (and its game) if nobody comes back to it within EMPTY_ROOM_TTL_MS
function scheduleRoomCleanup(roomName) {
	const room = rooms[roomName];
	if (!room) return;
	clearTimeout(room.cleanupTimer);
	room.cleanupTimer = safeTimeout("roomCleanup", room.pin, () => {
		if (rooms[roomName] === room && room.sockets.length === 0) {
			destroyRoom(roomName);
		}
	}, EMPTY_ROOM_TTL_MS);
	room.cleanupTimer.unref();
}

// Ends one game from the server side (admin action, or an error inside that game):
// its host and players are sent back home with a message key; other games are untouched.
// Returns true if a game or room was found.
// PINs of the games aborted in the last minutes, with the reason: a page that was loading at
// that moment (its new socket was not in the room yet) is told when it sends "joinRoom"
const ABORTED_MEMORY_MS = 10 * 60 * 1000;
const recentlyAborted = new Map(); // pin -> { reasonKey, at }

function recentAbortReason(pin) {
	const now = Date.now();
	for (const [key, value] of recentlyAborted) {
		if (now - value.at > ABORTED_MEMORY_MS) recentlyAborted.delete(key);
	}
	const entry = recentlyAborted.get(Number(pin));
	return entry ? entry.reasonKey : null;
}

function abortGame(pin, reasonKey) {
	const roomName = findRoomName(pin);
	if (roomName || findGame(pin)) {
		recentlyAborted.set(Number(pin), { reasonKey: reasonKey || "error.gameEnded", at: Date.now() });
	}
	if (roomName) {
		io.to(roomName).emit("gameAborted", reasonKey || "error.gameEnded");
		io.to(roomName).emit("redirect", "/html/index.html");
		io.in(roomName).socketsLeave(roomName);
		destroyRoom(roomName);
		return true;
	}
	const game = findGame(pin);
	if (typeof game !== "undefined") {
		removeGame(game);
		return true;
	}
	return false;
}

/**  *****************************************************************************************
 ******************************** Failure isolation ******************************************
 ***************************************************************************************** **/

// A bug in one game must never take the other games down: every socket handler and every
// server-side timer goes through these helpers. An exception is logged with the game PIN and
// the event name, then only the game concerned is aborted (players sent home with a message).

// Events whose arguments are not ({ pin, ... }): where to read the PIN
const PIN_ARGUMENT = {
	joinRoom: (args) => args[0],
	joinGame: (args) => args[0],
	vote: (args) => args[1],
	leaveRoom: (args) => (typeof args[0] === "string" && rooms[args[0]] ? rooms[args[0]].pin : undefined),
};
// Events a socket sends before being part of the game: the PIN of the payload is enough
const JOINING_EVENTS = ["joinRoom", "joinGame", "setUsername", "findRoomById"];

// Does this socket take part in the game (room member, host or player)?
function socketBelongsTo(socket, pin) {
	const roomName = findRoomName(pin);
	if (roomName && rooms[roomName].sockets.includes(socket)) return true;
	const game = findGame(pin);
	return (
		typeof game !== "undefined" &&
		(game.hostSocketId === socket.id || game.players.some((player) => player.socketId === socket.id))
	);
}

// The game an error belongs to: the PIN of the payload if the sender is part of that game
// (so that a client cannot abort somebody else's game), otherwise the game the sender is in.
function errorPin(socket, event, args) {
	try {
		const read = PIN_ARGUMENT[event] || ((a) => (a[0] !== null && typeof a[0] === "object" ? a[0].pin : undefined));
		const candidate = clean(read(args)).trim();
		if (/^[0-9]{4}$/.test(candidate) && (findGame(candidate) || findRoomName(candidate))) {
			if (JOINING_EVENTS.includes(event) || socketBelongsTo(socket, candidate)) {
				return Number(candidate);
			}
		}
		for (const name in rooms) {
			if (rooms[name].sockets.includes(socket)) return rooms[name].pin;
		}
		const game = games.find(
			(g) => g.hostSocketId === socket.id || g.players.some((player) => player.socketId === socket.id)
		);
		return game ? game.pin : null;
	} catch (e) {
		return null;
	}
}

// Logs an error and aborts the game it belongs to (pin may be null: log only)
function handleGameError(error, fields, pin) {
	log("error", "game error", Object.assign({ pin: pin == null ? null : pin }, fields, { error: error }));
	if (pin != null) {
		try {
			abortGame(pin, MESSAGES.gameCrashed);
			log("warn", "game aborted after an error", { pin: pin, event: fields.event });
		} catch (e) {
			log("error", "abortGame failed", { pin: pin, event: fields.event, error: e });
		}
	}
}

// Wraps a socket handler (sync or async). options.global: the event is not tied to one game
// (errors are only logged).
function guardHandler(socket, event, handler, options) {
	const isGlobal = options && options.global;
	return function (...args) {
		const fail = (error) => {
			const pin = isGlobal ? null : errorPin(socket, event, args);
			handleGameError(error, { event: event, socket: socket.id }, pin);
			requestSave();
		};
		try {
			const result = handler.apply(this, args);
			if (result && typeof result.then === "function") {
				result.then(requestSave, fail);
			} else {
				requestSave();
			}
		} catch (error) {
			fail(error);
		}
	};
}

// setTimeout whose callback cannot crash the process; pin (optional) is the game it belongs to
function safeTimeout(name, pin, fn, ms) {
	return setTimeout(() => {
		try {
			fn();
		} catch (error) {
			handleGameError(error, { event: "timer:" + name }, pin);
		}
		requestSave();
	}, ms);
}

/**  *****************************************************************************************
 ******************************** Persistence ************************************************
 ***************************************************************************************** **/

// Games are kept in memory and copied to the MongoDB collection "games" (one document per PIN):
// at most once per second after a change, and on shutdown. On startup, games that are not
// finished and were updated less than 6 hours ago are put back in memory.
const SAVE_DELAY_MS = 1000;
const RESTORE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

const snapshotSchema = new mongoose.Schema(
	{
		_id: Number, // PIN
		finished: Boolean,
		updatedAt: Date,
		game: mongoose.Schema.Types.Mixed,
	},
	{ collection: "games", versionKey: false, minimize: false }
);
// old documents are removed by MongoDB after 7 days
snapshotSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });
const GameSnapshot = mongoose.model("GameSnapshot", snapshotSchema);

let saveTimer = null;
let saving = null; // promise of the save in progress
const lastSaved = new Map(); // pin -> JSON of the last saved state
const removedPins = new Set(); // games removed from memory since the last save

// What is needed to rebuild a game (no socket ids: they change after a restart)
function serializeGame(game) {
	return {
		pin: game.pin,
		players: game.players.map((player) => ({
			id: player.id,
			name: player.name,
			points: player.points,
			gameCreator: player.gameCreator,
		})),
		settings: game.settings,
		question: game.question,
		questions: game.questions,
		answers: game.answers,
		maxAnswers: game.maxAnswers,
		nbOfPlayers: game.nbOfPlayers,
		votes: game.votes,
		maxVotes: game.maxVotes,
		inGame: game.inGame,
		status: game.status,
		nbOfQuestions: game.nbOfQuestions,
		premium: game.premium,
		lang: game.lang,
		answerTime: game.answerTime,
		revealTime: game.revealTime,
		voteTime: game.voteTime,
	};
}

// The game reached the final scores
function isFinished(game) {
	return game.inGame && game.questions.length > 0 && game.question >= game.questions.length;
}

// Asks for a save within SAVE_DELAY_MS (several changes in a row => one save)
function requestSave() {
	if (saveTimer || shuttingDown) return;
	saveTimer = setTimeout(() => {
		saveTimer = null;
		saveGames().catch((error) => log("error", "games save failed", { error: error }));
	}, SAVE_DELAY_MS);
}

// Writes the games that changed since the last save; resolves when done (never rejects
// while MongoDB is unreachable: the changes are kept and written on a later save)
async function saveGames() {
	if (saving) {
		// a save is already running: save again right after it
		await saving.catch(() => {});
		return saveGames();
	}
	if (mongoose.connection.readyState !== 1) {
		if (!shuttingDown) {
			clearTimeout(saveTimer);
			saveTimer = null;
			setTimeout(requestSave, 5000).unref();
		}
		return;
	}
	const now = new Date();
	const operations = [];
	const pending = new Map();
	for (const game of games) {
		let json;
		try {
			json = JSON.stringify(serializeGame(game));
		} catch (error) {
			log("error", "game could not be serialized", { pin: game.pin, error: error });
			continue;
		}
		if (lastSaved.get(game.pin) === json) continue;
		pending.set(game.pin, json);
		operations.push({
			replaceOne: {
				filter: { _id: game.pin },
				replacement: { _id: game.pin, finished: isFinished(game), updatedAt: now, game: JSON.parse(json) },
				upsert: true,
			},
		});
	}
	const removed = [...removedPins].filter((pin) => !findGame(pin));
	removed.forEach((pin) => {
		operations.push({
			updateOne: { filter: { _id: pin }, update: { $set: { finished: true, updatedAt: now } } },
		});
	});
	removedPins.clear();
	if (operations.length === 0) return;

	saving = GameSnapshot.bulkWrite(operations, { ordered: false });
	try {
		await saving;
		pending.forEach((json, pin) => lastSaved.set(pin, json));
		removed.forEach((pin) => lastSaved.delete(pin));
	} catch (error) {
		removed.forEach((pin) => removedPins.add(pin));
		log("error", "games save failed", { error: error, games: operations.length });
		if (!shuttingDown) setTimeout(requestSave, 5000).unref();
	} finally {
		saving = null;
	}
}

// Same as saveGames, but gives up after ms milliseconds (shutdown / fatal error)
function saveGamesWithin(ms) {
	clearTimeout(saveTimer);
	saveTimer = null;
	return Promise.race([
		saveGames().then(() => true, (error) => {
			log("error", "final games save failed", { error: error });
			return false;
		}),
		new Promise((resolve) => setTimeout(() => resolve(false), ms).unref()),
	]);
}

// Games restored after a restart, waiting for their host to come back (see recoverGame)
const restoredGames = new WeakSet();
// Sockets of the host page that was running before the restart: its late (buffered) events
// are ignored, a fresh game page takes over
const staleHostSockets = new WeakMap(); // game -> Set of socket ids

// Players told that their game was resumed after a restart (see catchUpPlayer)
const resumedPlayers = new WeakMap(); // game -> Set of player names

// A phone that reconnects after its game was resumed (it missed the message and the redirect):
// tell it and send it to the page of the current phase
function catchUpPlayer(socket, pin, playerName) {
	const game = findGame(pin);
	const told = game && resumedPlayers.get(game);
	if (!told || !playerName || told.has(playerName)) return;
	if (!game.players.some((player) => player.name === playerName && player.socketId === socket.id)) return;
	told.add(playerName);
	socket.emit("gameResumed", MESSAGES.gameResumed);
	if (game.status === "answering" && !game.answers.some((answer) => answer.playerName === playerName)) {
		socket.emit("redirect", "/html/prompt.html");
	} else if (game.status === "voting" && !game.votes.includes(playerName)) {
		socket.emit("redirect", "/html/votePrompt.html");
	} else {
		socket.emit("redirect", "/html/waiting.html");
	}
}

function isStaleHostSocket(game, socket) {
	const stale = staleHostSockets.get(game);
	return Boolean(stale && stale.has(socket.id));
}

// Puts back in memory the games saved before the last stop / crash
async function restoreGames() {
	const since = new Date(Date.now() - RESTORE_MAX_AGE_MS);
	const docs = await GameSnapshot.find({ finished: false, updatedAt: { $gte: since } }).lean();
	let restored = 0;
	for (const doc of docs) {
		try {
			const data = doc.game || {};
			const pin = Number(doc._id);
			if (!Number.isInteger(pin) || findGame(pin) || findRoomName(pin)) continue;
			const game = Object.assign(new Game(), data, { pin: pin, hostSocketId: null });
			game.players = (Array.isArray(data.players) ? data.players : []).map((p) => {
				// nobody is connected yet: everyone can take their place back
				const player = Object.assign(new Player(), p, { socketId: null, lock: false });
				if (player.id === -1) player.lock = true; // the bot
				return player;
			});
			if (isFinished(game)) continue;
			games.push(game);
			const roomName = pin + "-restored";
			rooms[roomName] = { pin: pin, sockets: [] };
			scheduleRoomCleanup(roomName);
			if (game.inGame) restoredGames.add(game);
			lastSaved.set(pin, JSON.stringify(serializeGame(game)));
			restored++;
		} catch (error) {
			log("error", "game could not be restored", { pin: doc._id, error: error });
		}
	}
	log("info", "games restored", { count: restored });
}

// First host connection to a game restored in the middle of a round: the round in progress
// cannot be continued as is (timers ran on the host page, events may have been lost), so
//  - before the answers were closed (countdown / answering): the current question starts over,
//  - after (answers reveal, votes, votes reveal): the round is over (points already given are
//    kept) and the game goes on with the next question (or the final scores).
// The host page is reloaded (it asks for the question again); the players wait for the prompt.
function recoverGame(game, roomName, socket) {
	restoredGames.delete(game);
	if (!game.inGame || isFinished(game)) return;

	const answersClosed = game.status === "voting" || (game.status === "" && game.answers.length > 0);
	const restartQuestion = !answersClosed && game.question >= 0;
	if (restartQuestion) {
		// getQuestion moves to game.question + 1: serve the same question again
		game.question -= 1;
	}
	game.status = "";
	game.answers = [];
	game.maxAnswers = 0;
	game.votes = [];
	game.maxVotes = 0;

	let stale = staleHostSockets.get(game);
	if (!stale) {
		stale = new Set();
		staleHostSockets.set(game, stale);
	}
	stale.add(socket.id);

	log("info", "game recovered after a restart", {
		pin: game.pin,
		event: "recover",
		action: restartQuestion ? "restartQuestion" : "nextQuestion",
		nextRound: game.question + 2,
	});
	io.to(roomName).emit("gameResumed", MESSAGES.gameResumed);
	socket.to(roomName).emit("redirect", "/html/waiting.html");
	// players already back are told now, the others when their phone reconnects
	resumedPlayers.set(game, new Set(game.players.filter((player) => player.socketId).map((player) => player.name)));
	socket.emit("redirect", "/html/game.html", game.pin);
	requestSave();
}

// (Re)attaches a socket to its room and player: "joinRoom" from each page, and every
// reconnection (the socket id changes, e.g. after a server restart).
// No player name = the host's screen.
function rejoinRoom(socket, pin, playerName) {
	let roomName = findRoomName(pin);

	if (roomName) {
		socket.join(roomName);
		if (!rooms[roomName].sockets.includes(socket)) {
			rooms[roomName].sockets.push(socket);
		}
		// Someone is back in the room: cancel its pending destruction
		clearTimeout(rooms[roomName].cleanupTimer);
		let game = findGame(pin);
		if (typeof game !== "undefined" && playerName.length > 0) {
			let player = game.players.find((player) => player.name === playerName);
			if (typeof player !== "undefined") {
				player.socketId = socket.id;
				player.lock = true;
			}
		} else if (typeof game !== "undefined") {
			// the host's screen (lobby, game or scores page): host events go to this socket
			game.hostSocketId = socket.id;
			if (restoredGames.has(game)) {
				recoverGame(game, roomName, socket);
			}
		}
	} else if (!findGame(pin)) {
		const reasonKey = recentAbortReason(pin);
		if (reasonKey) {
			socket.emit("gameAborted", reasonKey);
			socket.emit("redirect", "/html/index.html");
		}
	}
}

// Generates a random UUID for a player
const { v4: uuidv4 } = require("uuid");

// Import custom functions from functions.js
const {
	generatePIN,
	unlockedPlayers,
	initBot,
	addBotAnswer,
	shuffle,
	initQuestions,
	normalizeAnswer,
	htmlToText,
	answerId,
	answersForHost,
	answersForPlayer,
} = require("./functions");

// Closes the answers of the round: the bot adds its answer, the order is shuffled (the same order
// is used by the big screen, the phones and the votes reveal) and the big screen gets the texts
// only (no author: the whole room receives this event)
function closeAnswers(game, roomName) {
	game.status = "";
	addBotAnswer(game);
	shuffle(game.answers);
	if (roomName) io.in(roomName).emit("displayAnswers", answersForHost(game.answers));
}

/* Votes: the server owns the deadline. When the votes open (openVotes), the players whose phone
   is connected at that moment are awaited and a timer of game.voteTime seconds starts. The votes
   close (closeVotes, exactly once per round) as soon as every awaited player voted, or at the
   deadline; then "displayVotes" is sent and late votes are ignored. A player who was offline
   when the votes opened is not awaited, but can still vote before the deadline.
   This state is in memory only (never saved): after a restart the resume rule of recoverGame
   applies (the round counts as played). */
const voteRounds = new WeakMap(); // game -> { round, expected: Set of names, endsAt, timer }

function voteTimeOf(game) {
	return Number.isInteger(game.voteTime) && game.voteTime >= VOTE_TIME_MIN && game.voteTime <= VOTE_TIME_MAX
		? game.voteTime
		: DEFAULT_VOTE_TIME;
}

function clearVoteDeadline(game) {
	const state = voteRounds.get(game);
	if (state && state.timer) {
		clearTimeout(state.timer);
		state.timer = null;
	}
}

// The votes of this round are open (and not closed yet)
function openVoteState(game) {
	const state = voteRounds.get(game);
	return game.status === "voting" && state && state.round === game.question && state.timer ? state : null;
}

// Is this player's phone connected right now?
function playerConnected(player) {
	if (!player.socketId) return false;
	const playerSocket = io.sockets.sockets.get(player.socketId);
	return Boolean(playerSocket && playerSocket.connected);
}

// Time left to vote: ms (exact) and seconds (rounded up); clients count down from the moment they
// receive it, so that the clocks of the devices do not matter
function voteTiming(state) {
	const remainingMs = state ? Math.max(0, state.endsAt - Date.now()) : 0;
	return { remainingMs: remainingMs, remaining: Math.ceil(remainingMs / 1000), endsAt: state ? state.endsAt : null };
}

// Number of votes received / awaited and time left, for the big screen
function emitVoteProgress(game) {
	if (!game.hostSocketId) return;
	const state = openVoteState(game);
	const payload = { votes: game.maxVotes, expected: state ? state.expected.size : game.nbOfPlayers };
	if (state) Object.assign(payload, voteTiming(state), { voteTime: voteTimeOf(game) });
	io.to(game.hostSocketId).emit("voteProgress", payload);
}

// Opens the votes of the current round (once per round: a second "getVotes" changes nothing)
function openVotes(game, roomName) {
	const current = voteRounds.get(game);
	if (current && current.round === game.question) {
		return false;
	}
	clearVoteDeadline(game);
	const expected = new Set(
		game.players.filter((player) => player.id !== -1 && playerConnected(player)).map((player) => player.name)
	);
	const ms = voteTimeOf(game) * 1000;
	const state = { round: game.question, expected: expected, endsAt: Date.now() + ms, timer: null };
	voteRounds.set(game, state);
	game.status = "voting";
	state.timer = safeTimeout("voteDeadline", game.pin, () => {
		if (voteRounds.get(game) !== state || !state.timer) return;
		state.timer = null;
		if (games.includes(game) && game.status === "voting" && game.question === state.round) {
			closeVotes(game, "deadline");
		}
	}, ms);
	if (roomName) io.to(roomName).except(game.hostSocketId || []).emit("redirect", "/html/votePrompt.html");
	return true;
}

// Closes the votes (every awaited vote is in, or the deadline): only the first call does something
function closeVotes(game, reason) {
	if (game.status !== "voting") return false;
	clearVoteDeadline(game);
	game.status = "";
	// players still on the vote page: too late, to the waiting page
	game.players.forEach((player) => {
		if (player.id === -1 || game.votes.includes(player.name) || !player.socketId) return;
		io.to(player.socketId).emit("voteTimeUp", MESSAGES.voteTooLate);
		io.to(player.socketId).emit("redirect", "/html/waiting.html");
	});
	log("info", "votes closed", { pin: game.pin, event: "votes", reason: reason, votes: game.maxVotes });
	const roomName = findRoomName(game.pin);
	if (roomName) io.in(roomName).emit("displayVotes", game.answers);
	return true;
}

/**  *****************************************************************************************
 ******************************** Main program *******************************************
 ***************************************************************************************** **/

io.engine.on("connection_error", (err) => {
	log("warn", "socket.io connection error", { error: err && err.message, code: err && err.code });
});

io.on("connection", function (socket) {
	const ID = socket.id;

	// Every handler goes through guardHandler: an exception only aborts the game concerned
	const on = (event, handler, options) => socket.on(event, guardHandler(socket, event, handler, options));

	// Reconnection (e.g. after a server restart): the client sends its PIN and player name in
	// the handshake, so the socket is back in its room before any of its buffered events is handled
	guardHandler(socket, "handshakeRejoin", function () {
		const auth = asObject(socket.handshake.auth);
		if (auth.rejoin === true && auth.pin != null) {
			const pin = clean(auth.pin);
			const playerName = clean(auth.playerName);
			rejoinRoom(socket, pin, playerName);
			catchUpPlayer(socket, pin, playerName);
		}
	})();

	// Handler to get the game URL => Rules panel
	on("getPunchlineURL", (data) => {
		const origin = data && typeof data === "object" ? String(data.origin || "").slice(0, 200) : "";
		socket.emit("sendPunchlineURL", resolvePunchlineURL(socket, origin));
	}, { global: true });

	// Handler for creating a new room
	on("createGame", () => {
		// Look for a PIN that is not already used by another game
		let pin = generatePIN();
		for (let i = 0; i < 20 && (findGame(pin) || findRoomName(pin)); i++) {
			pin = generatePIN();
		}
		const roomName = `${pin}-${socket.id}`;

		if (!rooms[roomName] && !findGame(pin) && !findRoomName(pin)) {
			rooms[roomName] = {
				pin: pin,
				sockets: [],
			};
			socket.join(roomName);
			rooms[roomName].sockets.push(socket);

			// Creation of the game linked to the room
			let game = new Game();
			game.pin = pin;
			game.hostSocketId = ID;
			games.push(game);

			socket.emit("newGame", pin);
		} else {
			// Retry if the generated room name already exists (highly unlikely)
			socket.emit("gameExists");
		}
	}, { global: true });

	// Handler for checking if the game / room exists
	on("findRoomById", function (data) {
		data = asObject(data);
		data.pin = clean(data.pin).trim();

		if (data.pin.length == 0) {
			socket.emit("findRoomByIdErrorMessages", MESSAGES.pinEmpty);
			return;
		} else if (!/^[0-9]+$/.test(data.pin)) {
			socket.emit("findRoomByIdErrorMessages", MESSAGES.pinDigitsOnly);
			return;
		} else if (data.pin.length != 4) {
			socket.emit("findRoomByIdErrorMessages", MESSAGES.pinLength);
			return;
		} else {

			let game = findGame(data.pin);
			if (typeof game !== "undefined") {
				// We prevent max number of joigners before the game starts
				if (game.players.length >= Number(maxNumberOfPlayers) && game.inGame == false) {
					socket.emit("errorRoomFull", MESSAGES.roomFull);
					return;
				} else {
					socket.emit(
						"gamePinFound",
						game.pin,
						game.inGame,
						unlockedPlayers(game.players)
					);
				}
			} else {
				socket.emit("findRoomByIdErrorMessages", MESSAGES.gameNotFound);
			}
		}
	}, { global: true });

	// Handler for joining a room (after entering PIN and before giving a name)
	on("joinRoom", (pin, playerName) => {
		rejoinRoom(socket, clean(pin), clean(playerName));
	});

	// Handler for joining or rejoigning a game after disconnexion
	on("joinGame", (pin, playerName) => {
		pin = clean(pin);
		playerName = clean(playerName);

		let game = findGame(pin);
		if (typeof game !== "undefined") {
			// Only an existing, currently unlocked (disconnected) player can be taken over
			let player = game.players.find((player) => player.name === playerName);
			if (typeof player === "undefined" || player.lock) {
				socket.emit("findRoomByIdErrorMessages", MESSAGES.gameNotFound);
				return;
			}
			player.socketId = socket.id;
			player.lock = true;

			// Find what the game status if. As a function, redirect to the right page (waiting, prompt, Vote)
			switch (game.status) {
				case "answering":
					socket.emit("redirect", "/html/prompt.html", pin, playerName);
					break;

				case "voting":
					socket.emit("redirect", "/html/votePrompt.html", pin, playerName);
					break;

				default:
					socket.emit("redirect", "/html/waiting.html", pin, playerName);
					break;
			}
		}
	});

	// Sets the player's name and goes to the waiting room
	on("setUsername", function (data) {
		data = asObject(data);
		data.playerName = clean(data.playerName).trim();

		if (data.playerName.length == 0) {
			socket.emit("setUsernameErrorMessages", MESSAGES.nameEmpty);
			return;
		} else if (data.playerName.length > 25) {
			socket.emit("setUsernameErrorMessages", MESSAGES.nameTooLong);
			return;
		} else if (data.playerName.toLowerCase() == BOT_NAME.toLowerCase()) {
			socket.emit("setUsernameErrorMessages", MESSAGES.nameUnauthorized);
			return;
		}

		data.pin = clean(data.pin);
		let game = findGame(data.pin);
		let roomName = findRoomName(data.pin);

		if (roomName && typeof game !== "undefined") {
			// New players can only join the lobby, within the max number of players
			if (game.inGame || game.players.length >= Number(maxNumberOfPlayers)) {
				socket.emit("setUsernameErrorMessages", MESSAGES.roomFull);
				return;
			}

			let exist = game.players.find(
				(player) => player.name === data.playerName
			);

			if (typeof exist === "undefined") {
				let id = uuidv4();
				let player = new Player(id, data.playerName, ID);
				game.players.push(player);

				socket.join(roomName);
				if (!rooms[roomName].sockets.includes(socket)) {
					rooms[roomName].sockets.push(socket);
				}
				io.to(game.hostSocketId).emit("newJoiner", {
					playerName: player.name,
					playerId: player.id,
				});
				socket.emit("userSet", data, "/html/waiting.html");
			} else {
				socket.emit("setUsernameErrorMessages", MESSAGES.nameTaken);
			}
		}
	});

	// Handler for leaving a room
	on("leaveRoom", (roomName) => {
		const room = typeof roomName === "string" ? rooms[roomName] : undefined;
		if (room) {
			socket.leave(roomName);
			room.sockets = room.sockets.filter((s) => s !== socket);
		}
	});

	// Handler for leaving a game (unlocks the player so they can rejoin later)
	on("leaveGame", (data) => {
		data = asObject(data);
		data.pin = clean(data.pin);
		data.playerName = clean(data.playerName);
		let game = findGame(data.pin);
		if (typeof game !== "undefined") {
			let player = game.players.find((player) => player.name === data.playerName);
			if (typeof player !== "undefined" && player.socketId === socket.id) {
				player.lock = false;
			}
		}
	});

	// Handler for disconnecting from the server
	on("disconnect", () => {
		//unlock the player of the game
		//maybe user some "break to stop searching ?"
		games.forEach((game) => {
			game.players.forEach((player) => {
				if (player.socketId == socket.id) {
					player.lock = false;
				}
			});
		});

		// Remove the socket from all rooms. A room left without any socket (host and players gone)
		// is destroyed after a grace period, so that games are not kept in memory forever.
		// (Sockets change on every page navigation, hence the delay.)
		for (const roomName in rooms) {
			const room = rooms[roomName];
			const wasInRoom = room.sockets.includes(socket);
			room.sockets = room.sockets.filter((s) => s !== socket);
			if (wasInRoom && room.sockets.length === 0 && !shuttingDown) {
				scheduleRoomCleanup(roomName);
			}
		}
	}, { global: true });


	on("getConfig", function (data) {
		data = asObject(data);
		// timers of the game linked to the PIN (set in the lobby), or the config defaults
		let game = findGame(clean(data.pin));
		let answerTime = game && game.answerTime ? game.answerTime : DEFAULT_ANSWER_TIME;
		let revealTime = game && game.revealTime ? game.revealTime : DEFAULT_REVEAL_TIME;
		let voteTime = game ? voteTimeOf(game) : DEFAULT_VOTE_TIME;

		// get the different variables
		// [answer time, before question countdown, vote countdown, reveal time] in seconds
		let configurationVariables = [];
		configurationVariables.push(answerTime);
		configurationVariables.push(beforeQuestionCountDown);
		configurationVariables.push(voteTime);
		configurationVariables.push(revealTime);

		// emit to the sender
		socket.emit("getConfigResponse", configurationVariables);
	});


	// Starts the game for all players in the room
	on("startGame", async function (data) {
		data = asObject(data);
		data.pin = clean(data.pin);
		let game = findGame(data.pin);
		if (typeof game === "undefined") {
			let roomName = findRoomName(data.pin);
			if (roomName) socket.to(roomName).emit("redirect", "/");
			socket.emit("redirect", "/");
		} else {

			// The game is already started (e.g. double click on "start"): ignore
			if (game.inGame) {
				return;
			}

			// Sanitize input
			data.nbOfQuestions = clean(data.nbOfQuestions);
			data.secretCode = clean(data.secretCode);
			data.premiumMode = clean(data.premiumMode);

			if (!Number.isInteger(Number(data.nbOfQuestions)) || Number(data.nbOfQuestions) < 1 || Number(data.nbOfQuestions) > 10) {
				socket.emit("startGameErrorMessages", MESSAGES.roundsInvalid);
				return;
			}

			// Timers chosen in the lobby (seconds); missing => config defaults
			const answerTime = parseTimeSetting(data.answerTime, ANSWER_TIME_MIN, ANSWER_TIME_MAX, DEFAULT_ANSWER_TIME);
			const revealTime = parseTimeSetting(data.revealTime, REVEAL_TIME_MIN, REVEAL_TIME_MAX, DEFAULT_REVEAL_TIME);
			const voteTime = parseTimeSetting(data.voteTime, VOTE_TIME_MIN, VOTE_TIME_MAX, DEFAULT_VOTE_TIME);
			if (answerTime === null) {
				socket.emit("startGameErrorMessages", MESSAGES.answerTimeInvalid);
				return;
			} else if (revealTime === null) {
				socket.emit("startGameErrorMessages", MESSAGES.revealTimeInvalid);
				return;
			} else if (voteTime === null) {
				socket.emit("startGameErrorMessages", MESSAGES.voteTimeInvalid);
				return;
			} else if ((data.secretCode.length == 0 || data.secretCode.length > 15) && data.premiumMode === "true") {
				socket.emit("startGameErrorMessages", MESSAGES.premiumCodeLength);
				return;
			}


			// Is game premium ?
			if (data.premiumMode === "true") {
				const address = clientAddress(socket);
				if (premiumBlocked(address)) {
					socket.emit("startGameErrorMessages", MESSAGES.premiumTooManyAttempts);
					return;
				}
				// constant time, ignoring case, spaces and dashes; false when premium is off
				if (premiumStore.matches(data.secretCode)) {
					game.premium = true;
				} else {
					recordPremiumFailure(address);
					socket.emit("startGameErrorMessages", MESSAGES.premiumCodeInvalid);
					return;
				}
			}

			game.nbOfPlayers = game.players.length;
			game.inGame = true;
			game.nbOfQuestions = Number(data.nbOfQuestions);
			game.answerTime = answerTime;
			game.revealTime = revealTime;
			game.voteTime = voteTime;
			// Language of the questions: the host's interface language (fr | en, default fr)
			const lang = clean(data.lang).trim().toLowerCase();
			game.lang = questionBank.LANGS.includes(lang) ? lang : "fr";

			// Questions must be loaded before the host goes to the game page,
			// otherwise the first "getQuestion" finds an empty pool and ends the game
			const selection = await initQuestions(YourModel, game);
			if (game.questions.length === 0) {
				game.inGame = false;
				game.premium = false;
				socket.emit("startGameErrorMessages", selection && !selection.error ? MESSAGES.notEnoughQuestions : MESSAGES.questionsUnavailable);
				return;
			}
			if (game.questions.length < game.nbOfQuestions) {
				// not enough questions in this language: a shorter game, the host is told on the next page
				log("warn", "not enough questions, shorter game", { pin: game.pin, lang: game.lang, requested: game.nbOfQuestions, selected: game.questions.length });
				game.nbOfQuestions = game.questions.length;
				socket.emit("startGameNotice", MESSAGES.fewerQuestions, { count: game.questions.length });
			}
			initBot(game);

			socket.emit("redirect", "/html/game.html", data.pin);
		}
	});

	// Handler for sending the next question in the pool
	on("getQuestion", function (data) {
		data = asObject(data);
		data.pin = clean(data.pin);

		let game = findGame(data.pin);
		if (typeof game === "undefined") {
			let roomName = findRoomName(data.pin);
			if (roomName) socket.to(roomName).emit("redirect", "/");
			socket.emit("redirect", "/");
		} else {
			// late event of the host page that was running before a restart
			if (isStaleHostSocket(game, socket)) return;
			// Is there any question left ?
			game.question++;
			game.status = "";
			game.answers = [];
			game.maxAnswers = 0;
			game.maxVotes = 0;
			game.votes = [];
			clearVoteDeadline(game);
			if (game.question < game.questions.length) {
				let question = game.questions[game.question];
				// the bot's answers (reponse_1..3) stay on the server
				socket.emit("question", { id: question.id, question: question.question, total: game.questions.length });
			} else {
				let roomName = findRoomName(data.pin);
				if (roomName) socket.to(roomName).emit("redirect", "/html/waiting.html");
				socket.emit("redirect", "/html/scores.html");
			}
		}
	});

	// The host switches the language during the game: the questions not shown yet are
	// replaced by questions in the new language (the current one stays, players may be
	// answering it). Only the host of the game can do it.
	on("setGameLang", async function (data) {
		data = asObject(data);
		const game = findGame(clean(data.pin));
		if (typeof game === "undefined" || game.hostSocketId !== socket.id) return;
		const lang = clean(data.lang).trim().toLowerCase();
		if (!questionBank.LANGS.includes(lang) || lang === game.lang) return;

		const first = Math.max(game.question + 1, 0);
		const remaining = game.questions.length - first;
		game.lang = lang;
		requestSave();
		if (!game.inGame || remaining <= 0) return;

		const pool = { lang: lang, premium: game.premium, nbOfQuestions: remaining, questions: [] };
		const outcome = await initQuestions(YourModel, pool);
		if (outcome.error || pool.questions.length === 0) return;
		// rounds that could not be replaced keep their question
		pool.questions.forEach((question, k) => {
			game.questions[first + k] = Object.assign({}, question, { id: first + k });
		});
		requestSave();
		socket.emit("gameLangChanged", "notice.questionsLang");
	});

	// Handler to remove a player from the room in the lobby
	on("deletePlayer", function (data) {
		data = asObject(data);
		data.pin = clean(data.pin);

		let game = findGame(data.pin);
		let roomName = findRoomName(data.pin);
		// Players can only be removed from the lobby (nbOfPlayers is frozen once the game started)
		if (typeof game !== "undefined" && !game.inGame) {
			// delete player in the game object
			data.playerId = clean(data.playerId);
			let index = game.players.findIndex((player) => player.id == data.playerId);
			if (index === -1) {
				return;
			}
			let [player] = game.players.splice(index, 1);

			// send to all the room the name of the player which has to be redirected to the lobby
			if (roomName) {
				socket.to(roomName).emit("redirectDeletePlayer", "/html/index.html", "deletePlayer", player.name);
				// the removed player must not receive the room's events anymore
				const playerSocket = io.sockets.sockets.get(player.socketId);
				if (playerSocket) {
					playerSocket.leave(roomName);
					rooms[roomName].sockets = rooms[roomName].sockets.filter((s) => s !== playerSocket);
				}
			}

			socket.emit("playerDeleted", data.playerId);
		}
	});

	// Handler to allow players to answer the question
	on("startPrompt", function (data) {
		data = asObject(data);
		data.pin = clean(data.pin);
		let game = findGame(data.pin);

		if (typeof game === "undefined") {
			let roomName = findRoomName(data.pin);
			if (roomName) socket.to(roomName).emit("redirect", "/");
			socket.emit("redirect", "/");
		} else {
			if (isStaleHostSocket(game, socket)) return;
			game.status = "answering";
			let roomName = findRoomName(data.pin);
			if (roomName) socket.to(roomName).emit("redirect", "/html/prompt.html");
		}
	});

	// Handler to send the player's answer
	on("answer", function (data) {
		data = asObject(data);
		// plain text, normalised like the bot's answers (see normalizeAnswer)
		data.answer = normalizeAnswer(htmlToText(clean(data.answer)));

		if (data.answer.length == 0) {
			socket.emit("answerErrorMessages", MESSAGES.answerEmpty);
			return;
		} else if (data.answer.length >= 100) {
			socket.emit("answerErrorMessages", MESSAGES.answerTooLong);
			return;
		}

		data.pin = clean(data.pin);
		let game = findGame(data.pin);
		if (typeof game === "undefined") {
			let roomName = findRoomName(data.pin);
			if (roomName) socket.to(roomName).emit("redirect", "/");
			socket.emit("redirect", "/");
		} else {
			data.playerName = clean(data.playerName);

			let player = game.players.find(
				(player) => player.name === data.playerName && player.id !== -1
			);
			// Answers are only accepted while the prompt is open (not after the time is up),
			// from a known player, and only once per player and per round
			if (
				game.status !== "answering" ||
				typeof player === "undefined" ||
				game.answers.some((answer) => answer.playerName === player.name)
			) {
				socket.emit("redirect", "/html/waiting.html");
				return;
			}
			if (game.maxAnswers < game.nbOfPlayers) {
				game.answers.push({
					id: answerId(),
					playerName: player.name,
					textAnswer: data.answer,
					votes: 0,
				});
				game.maxAnswers++;
				socket.emit("redirect", "/html/waiting.html");

				if (game.maxAnswers == game.nbOfPlayers) {
					closeAnswers(game, findRoomName(data.pin));
				}
			}
		}
	});

	// Handler to end round when timer goes to 0 if there is still 1 player that did not answer
	on("timeIsUpToAnswer", function (data) {
		data = asObject(data);
		data.pin = clean(data.pin);
		let game = findGame(data.pin);
		let roomName = findRoomName(data.pin);

		if (typeof game === "undefined") {
			if (roomName) socket.to(roomName).emit("redirect", "/");
			socket.emit("redirect", "/");
		} else if (isStaleHostSocket(game, socket)) {
			return;
		} else if (game.status === "answering") {
			// Only once per round: if every player already answered, answers were already displayed
			if (roomName) socket.to(roomName).emit("redirect", "/html/waiting.html");
			closeAnswers(game, roomName);
		}
	});

	// Handler to open the vote for players
	on("getVotes", function (data) {
		data = asObject(data);
		data.pin = clean(data.pin);
		let game = findGame(data.pin);
		if (typeof game === "undefined") {
			socket.emit("redirect", "/");
			return;
		}
		if (isStaleHostSocket(game, socket)) return;
		// only once the answers are closed (not while the players are still writing)
		if (game.status === "answering") return;
		openVotes(game, findRoomName(data.pin));
		emitVoteProgress(game);
	});

	on("getAnswers", function (data) {
		data = asObject(data);
		let game = findGame(clean(data.pin));
		if (typeof game === "undefined") {
			socket.emit("redirect", "/");
			return;
		}
		// texts and opaque ids only: who wrote what (the bot included) is only known after the
		// votes; "yours" lets the phone disable the player's own answer
		let player = game.players.find((player) => player.socketId === socket.id && player.id !== -1);
		socket.emit("postAnswers", answersForPlayer(game.answers, player ? player.name : null));
		// vote page: the time left to vote, or "too late" if the votes are already closed
		if (player && !game.votes.includes(player.name)) {
			const state = openVoteState(game);
			if (state) {
				socket.emit("voteTimer", voteTiming(state));
			} else if (game.status === "" && voteRounds.has(game) && voteRounds.get(game).round === game.question) {
				socket.emit("voteTimeUp", MESSAGES.voteTooLate);
				socket.emit("redirect", "/html/waiting.html");
			}
		}
	});

	// Handler to vote for an answer (its opaque id, see "postAnswers")
	on("vote", function (votedAnswerId, pin) {
		pin = clean(pin);
		votedAnswerId = clean(votedAnswerId);
		let game = findGame(pin);
		if (typeof game === "undefined") {
			let roomName = findRoomName(pin);
			if (roomName) socket.to(roomName).emit("redirect", "/");
			socket.emit("redirect", "/");
		} else {
			// The voter is identified by its socket (updated by "joinRoom" on the vote page)
			let voter = game.players.find(
				(player) => player.socketId === socket.id && player.id !== -1
			);
			let answer = votedAnswerId
				? game.answers.find((answer) => answer.id === votedAnswerId)
				: undefined;
			// Ignore votes outside of the voting phase (after the deadline included), from unknown
			// sockets, for a non-existing answer, or for the voter's own answer
			const voteState = openVoteState(game);
			const closedState = voteRounds.get(game);
			if (
				!voteState &&
				typeof voter !== "undefined" &&
				!game.votes.includes(voter.name) &&
				game.status === "" &&
				closedState &&
				closedState.round === game.question
			) {
				// too late: the vote is not counted, the phone goes to the waiting page
				socket.emit("voteTimeUp", MESSAGES.voteTooLate);
				socket.emit("redirect", "/html/waiting.html");
				return;
			}
			if (
				!voteState ||
				typeof voter === "undefined" ||
				typeof answer === "undefined" ||
				answer.playerName === voter.name
			) {
				return;
			}
			// One vote per player and per round
			if (game.votes.includes(voter.name)) {
				socket.emit("redirect", "/html/waiting.html");
				return;
			}
			game.votes.push(voter.name);

			answer.votes++;
			let player = game.players.find((player) => player.name === answer.playerName);
			if (typeof player !== "undefined") {
				player.points++;
			}
			game.maxVotes++;
			// a player who was offline when the votes opened is back and voted: counted as awaited
			voteState.expected.add(voter.name);
			socket.emit("redirect", "/html/waiting.html");
			emitVoteProgress(game);
			const allIn = [...voteState.expected].every((name) => game.votes.includes(name));
			if (allIn || game.maxVotes >= game.nbOfPlayers) {
				closeVotes(game, "allVoted");
			}
		}
	});

	// Handler to get the ranking of players based on the number of points (final board)
	on("getScores", function (data) {
		data = asObject(data);
		data.pin = clean(data.pin);
		let game = findGame(data.pin);

		if (typeof game === "undefined") {
			let roomName = findRoomName(data.pin);
			if (roomName) socket.to(roomName).emit("redirect", "/");
			socket.emit("redirect", "/");
		} else {
			let playersRankedByPoints = game.players;
			playersRankedByPoints.sort(function (a, b) {
				return parseFloat(b.points) - parseFloat(a.points);
			});
			socket.emit("scores", game.players);
		}
	});

	// Handler to send everyone back to the lobby
	on("endGame", function (data) {
		data = asObject(data);
		data.pin = clean(data.pin);
		let game = findGame(data.pin);
		if (typeof game !== "undefined") {
			removeGame(game);
		}

		let roomName = findRoomName(data.pin);
		if (roomName) {
			socket.to(roomName).emit("redirect", "/html/index.html");
			// make every socket leave the Socket.io room so that a future game cannot reach them
			io.in(roomName).socketsLeave(roomName);
			destroyRoom(roomName);
		}
	});
});

/**  *****************************************************************************************
 ******************************** Process lifecycle ******************************************
 ***************************************************************************************** **/

// A rejected promise nobody handled: logged, the process keeps running
process.on("unhandledRejection", (reason) => {
	log("error", "unhandled promise rejection", { error: reason instanceof Error ? reason : String(reason) });
});

// An exception outside of the guarded handlers: the process is in an unknown state. Save what
// can be saved (best effort, 2 s max) and exit with an error so that the supervisor restarts it.
let fatalError = false;
process.on("uncaughtException", (error) => {
	log("fatal", "uncaught exception, exiting", { error: error });
	if (fatalError) {
		process.exit(1);
	}
	fatalError = true;
	shuttingDown = true;
	setTimeout(() => process.exit(1), 3000).unref();
	saveGamesWithin(2000).finally(() => process.exit(1));
});

// SIGTERM (systemd, docker) / SIGINT (PM2, Ctrl+C): stop accepting connections, save the games,
// close socket.io, the HTTP server and MongoDB, exit within a few seconds.
async function shutdown(signal) {
	if (shuttingDown) return;
	shuttingDown = true;
	log("info", "shutting down", { signal: signal, games: games.length });
	setTimeout(() => {
		log("warn", "shutdown took too long, exiting");
		process.exit(0);
	}, 5000).unref();
	try {
		server.close();
		if (typeof server.closeIdleConnections === "function") server.closeIdleConnections();
		const saved = await saveGamesWithin(3000);
		log("info", saved ? "games saved" : "games not saved", { games: games.length });
		await new Promise((resolve) => io.close(() => resolve()));
		await mongoose.disconnect();
	} catch (error) {
		log("error", "error during shutdown", { error: error });
	}
	process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Startup: MongoDB, then the saved games, then the HTTP server (so that reconnecting clients
// find their game). Without MongoDB the server starts anyway, with no game restored.
async function start() {
	try {
		await connectMongo();
		await premiumStore.load();
		// questions: migration of old documents, indexes, bank seeded when a language is nearly empty
		try {
			await questionBank.prepare(mongoose, log);
		} catch (error) {
			log("error", "questions preparation failed", { error: error });
		}
		await restoreGames();
	} catch (error) {
		log("error", "games not restored", { error: error });
	}
	// HOST=127.0.0.1 behind nginx: the Node port is not reachable from outside (default: all interfaces)
	const host = String(process.env.HOST || "").trim() || undefined;
	server.listen(port, host, () => {
		log("info", `Server is running on http://${host || "localhost"}:${port}`, { port: port, host: host || null, pid: process.pid });
		// PM2 "wait_ready": the server is ready to accept connections
		if (typeof process.send === "function") process.send("ready");
	});
}
start();
