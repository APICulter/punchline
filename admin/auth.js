/**
 * Admin authentication: password hashes (scrypt), sessions stored in MongoDB,
 * login rate limiting.
 *
 * Password hash format (one line, no spaces):
 *   scrypt$<N>$<r>$<p>$<salt, base64url>$<derived key, base64url>
 * created by `npm run admin:password` (admin/hash-password.js).
 */
"use strict";

const crypto = require("crypto");

// ---------------------------------------------------------------------------
// Password hashing
// ---------------------------------------------------------------------------

const SCRYPT_DEFAULTS = { N: 32768, r: 8, p: 1, keyLength: 32, saltLength: 16 };

// Bounds accepted when reading a hash from the configuration (a hash with absurd
// parameters would let a typo in the config freeze the server on every login)
const N_MIN = 1 << 14;
const N_MAX = 1 << 20;

function scryptAsync(password, salt, keyLength, params) {
	return new Promise((resolve, reject) => {
		crypto.scrypt(
			password,
			salt,
			keyLength,
			{
				N: params.N,
				r: params.r,
				p: params.p,
				// scrypt needs 128 * N * r bytes; leave some headroom
				maxmem: 256 * params.N * params.r + 1024 * 1024,
			},
			(err, key) => (err ? reject(err) : resolve(key))
		);
	});
}

// Same bytes for the same password, whatever the Unicode composition typed by the keyboard
function passwordBytes(password) {
	return Buffer.from(String(password).normalize("NFC"), "utf8");
}

async function hashPassword(password, params = SCRYPT_DEFAULTS) {
	const salt = crypto.randomBytes(params.saltLength || SCRYPT_DEFAULTS.saltLength);
	const key = await scryptAsync(passwordBytes(password), salt, params.keyLength || SCRYPT_DEFAULTS.keyLength, params);
	return ["scrypt", params.N, params.r, params.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

// Returns { N, r, p, salt, key } or null if the string is not a valid hash
function parsePasswordHash(encoded) {
	if (typeof encoded !== "string") return null;
	const parts = encoded.trim().split("$");
	if (parts.length !== 6 || parts[0] !== "scrypt") return null;
	const [N, r, p] = parts.slice(1, 4).map((value) => (/^[0-9]{1,8}$/.test(value) ? Number(value) : NaN));
	if (!Number.isInteger(N) || N < N_MIN || N > N_MAX || (N & (N - 1)) !== 0) return null;
	if (!Number.isInteger(r) || r < 1 || r > 32) return null;
	if (!Number.isInteger(p) || p < 1 || p > 16) return null;
	if (!/^[A-Za-z0-9_-]+$/.test(parts[4]) || !/^[A-Za-z0-9_-]+$/.test(parts[5])) return null;
	const salt = Buffer.from(parts[4], "base64url");
	const key = Buffer.from(parts[5], "base64url");
	if (salt.length < 16 || key.length < 16 || key.length > 64) return null;
	return { N, r, p, salt, key };
}

// Constant-time comparison of a password with a parsed hash
async function verifyPassword(password, parsed) {
	if (!parsed) return false;
	const derived = await scryptAsync(passwordBytes(password), parsed.salt, parsed.key.length, parsed);
	return derived.length === parsed.key.length && crypto.timingSafeEqual(derived, parsed.key);
}

// Constant-time string comparison (both sides hashed first so lengths match)
function safeEqual(a, b) {
	const da = crypto.createHash("sha256").update(String(a), "utf8").digest();
	const db = crypto.createHash("sha256").update(String(b), "utf8").digest();
	return crypto.timingSafeEqual(da, db);
}

// ---------------------------------------------------------------------------
// Sessions: random token in a cookie, only its SHA-256 is stored server side
// ---------------------------------------------------------------------------

const COOKIE_NAME = "punchline_admin";
const IDLE_TIMEOUT_MS = 12 * 60 * 60 * 1000; // 12 h without activity
const MAX_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000; // 7 days after the login
const TOUCH_INTERVAL_MS = 60 * 1000; // lastSeen written at most once a minute

function sha256(value) {
	return crypto.createHash("sha256").update(value).digest("hex");
}

function parseCookies(header) {
	const cookies = {};
	String(header || "")
		.split(";")
		.forEach((part) => {
			const index = part.indexOf("=");
			if (index < 0) return;
			const name = part.slice(0, index).trim();
			const value = part.slice(index + 1).trim();
			if (name && !(name in cookies)) cookies[name] = value;
		});
	return cookies;
}

function readToken(req) {
	const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
	// 32 random bytes in base64url = 43 characters
	return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

function useSecureCookie(req) {
	return req.secure || process.env.NODE_ENV === "production";
}

function setSessionCookie(req, res, token) {
	const parts = [
		`${COOKIE_NAME}=${token}`,
		"Path=/admin",
		"HttpOnly",
		"SameSite=Strict",
		`Max-Age=${Math.floor(MAX_LIFETIME_MS / 1000)}`,
	];
	if (useSecureCookie(req)) parts.push("Secure");
	res.append("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(req, res) {
	const parts = [`${COOKIE_NAME}=`, "Path=/admin", "HttpOnly", "SameSite=Strict", "Max-Age=0"];
	if (useSecureCookie(req)) parts.push("Secure");
	res.append("Set-Cookie", parts.join("; "));
}

function createSessionStore(mongoose, credentialFingerprint) {
	const schema = new mongoose.Schema(
		{
			_id: { type: String }, // SHA-256 of the token
			user: { type: String, required: true },
			fp: { type: String, required: true }, // fingerprint of the credentials at login time
			createdAt: { type: Date, required: true },
			lastSeenAt: { type: Date, required: true },
			expiresAt: { type: Date, required: true },
			ip: { type: String, default: "" },
			userAgent: { type: String, default: "" },
		},
		{ collection: "admin_sessions", versionKey: false }
	);
	// MongoDB removes a session once expiresAt is reached (idle or max lifetime)
	schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
	const Session = mongoose.models.AdminSession || mongoose.model("AdminSession", schema);

	function expiry(createdAt, now) {
		return new Date(Math.min(now + IDLE_TIMEOUT_MS, createdAt.getTime() + MAX_LIFETIME_MS));
	}

	return {
		async create(user, req) {
			const token = crypto.randomBytes(32).toString("base64url");
			const now = Date.now();
			const createdAt = new Date(now);
			await Session.create({
				_id: sha256(token),
				user,
				fp: credentialFingerprint(),
				createdAt,
				lastSeenAt: createdAt,
				expiresAt: expiry(createdAt, now),
				ip: String(req.ip || "").slice(0, 64),
				userAgent: String(req.get("user-agent") || "").slice(0, 200),
			});
			return token;
		},

		// Returns the session (plain object) or null; refreshes the idle timeout
		async find(token, expectedUser) {
			if (!token) return null;
			const id = sha256(token);
			const session = await Session.findById(id).lean();
			if (!session) return null;
			const now = Date.now();
			// The TTL monitor runs every minute: check the expiry ourselves too.
			// A session opened with other credentials (password changed) is no longer valid.
			if (
				session.expiresAt.getTime() <= now ||
				session.fp !== credentialFingerprint() ||
				!safeEqual(session.user, expectedUser)
			) {
				await Session.deleteOne({ _id: id });
				return null;
			}
			if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
				const expiresAt = expiry(session.createdAt, now);
				await Session.updateOne({ _id: id }, { $set: { lastSeenAt: new Date(now), expiresAt } });
				session.expiresAt = expiresAt;
			}
			return session;
		},

		async destroy(token) {
			if (!token) return;
			await Session.deleteOne({ _id: sha256(token) });
		},
	};
}

// ---------------------------------------------------------------------------
// Login rate limit (in memory, per IP): every attempt counts, a success resets.
// Counting attempts (not only failures) also blocks parallel requests.
// ---------------------------------------------------------------------------

function createLoginLimiter({ maxAttempts = 5, windowMs = 15 * 60 * 1000, maxEntries = 10000 } = {}) {
	const entries = new Map(); // ip -> { count, resetAt }

	const sweep = setInterval(() => {
		const now = Date.now();
		for (const [ip, entry] of entries) {
			if (entry.resetAt <= now) entries.delete(ip);
		}
	}, 60 * 1000);
	sweep.unref();

	return {
		// Registers an attempt; returns 0 if allowed, otherwise the seconds to wait
		hit(ip) {
			const now = Date.now();
			let entry = entries.get(ip);
			if (!entry || entry.resetAt <= now) {
				if (!entry && entries.size >= maxEntries) {
					// memory bound: forget the oldest entry
					entries.delete(entries.keys().next().value);
				}
				entry = { count: 0, resetAt: now + windowMs };
				entries.set(ip, entry);
			}
			if (entry.count >= maxAttempts) {
				return Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
			}
			entry.count++;
			return 0;
		},
		reset(ip) {
			entries.delete(ip);
		},
	};
}

module.exports = {
	SCRYPT_DEFAULTS,
	COOKIE_NAME,
	IDLE_TIMEOUT_MS,
	MAX_LIFETIME_MS,
	hashPassword,
	parsePasswordHash,
	verifyPassword,
	safeEqual,
	sha256,
	readToken,
	setSessionCookie,
	clearSessionCookie,
	createSessionStore,
	createLoginLimiter,
};
