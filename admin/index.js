/**
 * Admin panel: mounted by app.js with
 *   require("./admin")(app, { mongoose, getGames, abortGame })
 * - mongoose:  the shared mongoose instance (connection already opened by app.js)
 * - getGames:  () => array of the games currently in memory
 * - abortGame: (pin, reasonKey) => ends one game and sends its players home
 *
 * Everything lives under /admin:
 *   GET  /admin                    login page, or the panel when signed in
 *   POST /admin/api/login|logout   session (cookie "punchline_admin", Path=/admin)
 *   /admin/api/questions…          questions CRUD, review, import / export, duplicates
 *   /admin/api/ai/…                AI question generation (admin/ai.js, needs ANTHROPIC_API_KEY)
 *   /admin/api/games…              live games, end a game
 *   GET  /admin/api/log            audit log
 *   /admin/*.js|css                assets of public/admin
 *
 * Credentials: ADMIN_USER + ADMIN_PASSWORD_HASH environment variables, otherwise
 * adminUser + adminPasswordHash in config.properties. Without them the panel is disabled.
 */
"use strict";

const path = require("path");
const crypto = require("crypto");
const express = require("express");

const auth = require("./auth");
const questionsRouter = require("./questions");
const gamesRouter = require("./games");
const ai = require("./ai");

const PAGES_DIR = path.join(__dirname, "..", "public", "admin");
const LOG_LIMIT_MAX = 200;
const MAX_CONCURRENT_LOGINS = 4; // scrypt is CPU / memory heavy: cap parallel verifications

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function readConfigFile() {
	try {
		const propertiesReader = require("properties-reader");
		const properties = propertiesReader(path.join(__dirname, "..", "config.properties"));
		// raw strings: get() would turn "1234" or "true" into a number / boolean
		const read = (key) => (typeof properties.getRaw === "function" ? properties.getRaw(key) : properties.get(key));
		return { user: read("adminUser"), hash: read("adminPasswordHash") };
	} catch (error) {
		return {};
	}
}

function loadCredentials() {
	const file = readConfigFile();
	const user = String(process.env.ADMIN_USER || file.user || "").trim();
	const hashText = String(process.env.ADMIN_PASSWORD_HASH || file.hash || "").trim();
	const hash = auth.parsePasswordHash(hashText);
	if (!user && !hashText) {
		return { enabled: false, reason: "missing" };
	}
	if (!user || user.length > 100) {
		return { enabled: false, reason: "user" };
	}
	if (!hash) {
		return { enabled: false, reason: "hash" };
	}
	return {
		enabled: true,
		user,
		hash,
		// sessions opened with other credentials are rejected (password or user changed)
		fingerprint: crypto.createHash("sha256").update(user + "\n" + hashText).digest("hex").slice(0, 32),
	};
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function securityHeaders(req, res, next) {
	res.set({
		"Cache-Control": "no-store",
		Pragma: "no-cache",
		"X-Frame-Options": "DENY",
		"X-Content-Type-Options": "nosniff",
		// same-origin: the Referer stays available for the CSRF check, never sent elsewhere
		"Referrer-Policy": "same-origin",
		"Cross-Origin-Opener-Policy": "same-origin",
		"Cross-Origin-Resource-Policy": "same-origin",
		"Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
		"X-Robots-Tag": "noindex, nofollow",
		"Content-Security-Policy": [
			"default-src 'none'",
			"script-src 'self'",
			"style-src 'self'",
			"img-src 'self' data:",
			"font-src 'self'",
			"connect-src 'self'",
			"form-action 'self'",
			"base-uri 'none'",
			"frame-ancestors 'none'",
		].join("; "),
	});
	if (req.secure) {
		res.set("Strict-Transport-Security", "max-age=31536000");
	}
	next();
}

function firstHeaderValue(value) {
	return String(value || "")
		.split(",")[0]
		.trim()
		.toLowerCase();
}

// Hosts this server answers as: Host header, X-Forwarded-Host behind a trusted proxy, PUBLIC_URL
function allowedHosts(req) {
	const hosts = new Set();
	const host = firstHeaderValue(req.get("host"));
	if (host) hosts.add(host);
	if (req.app.get("trust proxy")) {
		const forwarded = firstHeaderValue(req.get("x-forwarded-host"));
		if (forwarded) hosts.add(forwarded);
	}
	if (process.env.PUBLIC_URL) {
		try {
			hosts.add(new URL(process.env.PUBLIC_URL).host.toLowerCase());
		} catch (error) {
			// invalid PUBLIC_URL: ignored here
		}
	}
	return hosts;
}

function sameOrigin(req, value) {
	let url;
	try {
		url = new URL(value);
	} catch (error) {
		return false;
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") return false;
	if (req.secure && url.protocol !== "https:") return false;
	return allowedHosts(req).has(url.host.toLowerCase());
}

/**
 * CSRF protection for every mutating request, on top of the SameSite=Strict cookie:
 * - a custom header that a cross-site form can't send (X-Requested-With: fetch)
 * - Origin (or, if absent, Referer) must be this site
 */
function csrfGuard(req, res, next) {
	if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
	const requestedWith = String(req.get("x-requested-with") || "").toLowerCase();
	if (requestedWith !== "fetch" && requestedWith !== "xmlhttprequest") {
		return res.status(403).json({ error: "admin.error.csrf" });
	}
	const origin = req.get("origin");
	const referer = req.get("referer");
	const ok = origin ? origin !== "null" && sameOrigin(req, origin) : referer ? sameOrigin(req, referer) : false;
	if (!ok) {
		return res.status(403).json({ error: "admin.error.csrf" });
	}
	next();
}

function clientIp(req) {
	return String(req.ip || (req.socket && req.socket.remoteAddress) || "").slice(0, 64);
}

// Audit log entries (collection admin_log), kept one year
function logModel(mongoose) {
	if (mongoose.models.AdminLogEntry) return mongoose.models.AdminLogEntry;
	const logSchema = new mongoose.Schema(
		{
			at: { type: Date, required: true },
			action: { type: String, required: true },
			user: { type: String, default: "" },
			ip: { type: String, default: "" },
			details: { type: mongoose.Schema.Types.Mixed, default: {} },
		},
		{ collection: "admin_log", versionKey: false }
	);
	logSchema.index({ at: -1 });
	// entries are kept one year
	logSchema.index({ at: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });
	return mongoose.model("AdminLogEntry", logSchema);
}

function defaultLog(level, msg, fields) {
	const line = JSON.stringify(Object.assign({ time: new Date().toISOString(), level, msg }, fields || {}));
	(level === "error" || level === "warn" ? process.stderr : process.stdout).write(line + "\n");
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

module.exports = function mountAdmin(app, options) {
	const { mongoose, getGames, abortGame } = options || {};
	const log = (options && options.log) || defaultLog;
	const credentials = loadCredentials();
	const router = express.Router();
	const LogEntry = logModel(mongoose);

	// AI generation: the background top-up (AI_AUTO_TOPUP=true) runs even without admin credentials
	const aiService = ai.createService({ mongoose, log });
	ai.startTopup(aiService, {
		mongoose,
		log,
		auditSystem: (action, details) =>
			LogEntry.create({ at: new Date(), action, user: "system", ip: "", details }).catch((error) =>
				console.error("Admin: cannot write the audit log", error)
			),
	});

	router.use(securityHeaders);

	// Assets of public/admin (scripts); HTML pages are only served through the routes below
	const assets = express.static(PAGES_DIR, { index: false, redirect: false, dotfiles: "deny", fallthrough: true });
	router.use((req, res, next) => {
		if (/\.html?$/i.test(req.path)) return res.status(404).type("text/plain").send("Not found");
		if (req.path.startsWith("/api/")) return next();
		assets(req, res, next);
	});

	function sendPage(res, name) {
		res.type("html").sendFile(path.join(PAGES_DIR, name));
	}

	if (!credentials.enabled) {
		const details = {
			missing: "no admin configured",
			user: "invalid ADMIN_USER / adminUser",
			hash: "invalid ADMIN_PASSWORD_HASH / adminPasswordHash (create one with: npm run admin:password)",
		};
		console.warn(`Admin panel disabled: ${details[credentials.reason]}. See README, "Admin panel".`);

		router.get("/", (req, res) => sendPage(res, "setup.html"));
		router.use("/api", (req, res) => res.status(503).json({ error: "admin.error.disabled" }));
		router.use((req, res) => res.redirect(303, "/admin"));
		install(app, router);
		return;
	}

	// ----- Storage -----

	const sessions = auth.createSessionStore(mongoose, () => credentials.fingerprint);

	// Appends an action to the audit log; never fails the request because of the log
	async function audit(req, action, details = {}, user) {
		try {
			await LogEntry.create({
				at: new Date(),
				action,
				user: String(user || (req.admin && req.admin.user) || "").slice(0, 100),
				ip: clientIp(req),
				details,
			});
		} catch (error) {
			console.error("Admin: cannot write the audit log", error);
		}
	}

	const limiter = auth.createLoginLimiter({ maxAttempts: 5, windowMs: 15 * 60 * 1000 });
	let pendingLogins = 0;

	async function currentSession(req) {
		try {
			return await sessions.find(auth.readToken(req), credentials.user);
		} catch (error) {
			console.error("Admin: session lookup failed", error);
			return null;
		}
	}

	// ----- Pages -----

	router.get("/", async (req, res) => {
		const session = await currentSession(req);
		sendPage(res, session ? "panel.html" : "login.html");
	});

	// ----- API -----

	const api = express.Router();
	const json = express.json({ limit: "4kb", strict: true });
	api.use(csrfGuard);

	api.post("/login", json, async (req, res, next) => {
		const ip = clientIp(req);
		const wait = limiter.hit(ip);
		if (wait > 0) {
			res.set("Retry-After", String(wait));
			return res.status(429).json({ error: "admin.error.tooManyAttempts", retryAfter: wait });
		}
		const body = req.body && typeof req.body === "object" ? req.body : {};
		const username = typeof body.username === "string" ? body.username.slice(0, 200) : "";
		const password = typeof body.password === "string" ? body.password : "";
		if (pendingLogins >= MAX_CONCURRENT_LOGINS) {
			res.set("Retry-After", "2");
			return res.status(429).json({ error: "admin.error.busy", retryAfter: 2 });
		}
		pendingLogins++;
		try {
			// the password is always checked, so the answer time doesn't reveal a wrong user name
			const passwordOk = password.length > 0 && password.length <= 1024 && (await auth.verifyPassword(password, credentials.hash));
			const userOk = auth.safeEqual(username, credentials.user);
			if (!passwordOk || !userOk) {
				await audit(req, "login.failed", { username: username.slice(0, 64) }, "");
				return res.status(401).json({ error: "admin.error.badCredentials" });
			}
			limiter.reset(ip);
			const token = await sessions.create(credentials.user, req);
			auth.setSessionCookie(req, res, token);
			if (!req.secure && process.env.NODE_ENV === "production") {
				console.warn(
					"Admin: login over a request Express sees as plain HTTP in production; the Secure cookie needs HTTPS " +
						"(behind a reverse proxy, set Express \"trust proxy\" and X-Forwarded-Proto)."
				);
			}
			await audit(req, "login.ok", {}, credentials.user);
			res.json({ ok: true, user: credentials.user });
		} catch (error) {
			next(error);
		} finally {
			pendingLogins--;
		}
	});

	// Everything below needs a valid session
	api.use(async (req, res, next) => {
		const session = await currentSession(req);
		if (!session) {
			return res.status(401).json({ error: "admin.error.unauthorized" });
		}
		req.admin = { user: session.user, expiresAt: session.expiresAt };
		next();
	});

	api.post("/logout", async (req, res, next) => {
		try {
			await sessions.destroy(auth.readToken(req));
			auth.clearSessionCookie(req, res);
			await audit(req, "logout");
			res.json({ ok: true });
		} catch (error) {
			next(error);
		}
	});

	api.get("/session", (req, res) => {
		res.json({ user: req.admin.user, expiresAt: req.admin.expiresAt });
	});

	api.get("/log", async (req, res, next) => {
		try {
			let limit = parseInt(req.query.limit, 10);
			if (!Number.isInteger(limit) || limit < 1) limit = 50;
			limit = Math.min(limit, LOG_LIMIT_MAX);
			const entries = await LogEntry.find({}).sort({ at: -1, _id: -1 }).limit(limit).lean();
			res.json({
				entries: entries.map((entry) => ({
					at: entry.at,
					action: String(entry.action),
					user: String(entry.user || ""),
					ip: String(entry.ip || ""),
					details: entry.details && typeof entry.details === "object" ? entry.details : {},
				})),
			});
		} catch (error) {
			next(error);
		}
	});

	api.use(questionsRouter({ mongoose, audit }));
	api.use(ai.aiRouter({ service: aiService, audit, toClient: questionsRouter.toClient }));
	api.use(gamesRouter({ getGames, abortGame, audit }));

	api.use((req, res) => res.status(404).json({ error: "admin.error.notFound" }));

	// eslint-disable-next-line no-unused-vars
	api.use((error, req, res, next) => {
		if (error && error.type === "entity.too.large") {
			return res.status(413).json({ error: "admin.error.tooLarge" });
		}
		if (error && (error.type === "entity.parse.failed" || error.type === "encoding.unsupported" || error.type === "charset.unsupported")) {
			return res.status(400).json({ error: "admin.error.invalid" });
		}
		if (error && error.name === "ValidationError") {
			return res.status(400).json({ error: "admin.error.validation" });
		}
		console.error("Admin API error:", error);
		res.status(500).json({ error: "admin.error.server" });
	});

	router.use("/api", api);

	// Anything else under /admin: back to the panel
	router.use((req, res) => res.redirect(303, "/admin"));

	install(app, router);
};

/**
 * Registers the admin router on /admin, ahead of express.static and the other routes
 * that app.js registered before calling us, so that every /admin response goes through
 * the admin security headers (public/admin is not served raw by the main static handler).
 */
function install(app, router) {
	app.use("/admin", router);
	const stack = app._router && app._router.stack;
	if (!Array.isArray(stack) || stack.length < 2) return;
	const layer = stack.pop();
	let index = stack.findIndex((item) => item.name !== "query" && item.name !== "expressInit");
	if (index < 0) index = stack.length;
	stack.splice(index, 0, layer);
}
