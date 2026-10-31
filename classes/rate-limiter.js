/**
 * Small in-memory limiters for the socket.io server (app.js). Everything is bounded in memory:
 * when a limiter holds maxKeys entries, the oldest one is forgotten.
 *
 * - WindowCounter: at most `max` hits per key within `windowMs` (fixed window per key).
 * - TokenBucket: per-socket event flood guard (capacity `burst`, refilled `perSecond`).
 * - clientKey(address): the key of a client address: IPv4 as is, IPv6 by /64 prefix (one
 *   home or phone usually owns a whole /64: counting single IPv6 addresses would be useless).
 */
"use strict";

class WindowCounter {
	constructor({ max, windowMs, maxKeys = 20000 }) {
		this.max = max;
		this.windowMs = windowMs;
		this.maxKeys = maxKeys;
		this.entries = new Map(); // key -> { count, resetAt }
	}

	entry(key, now) {
		let entry = this.entries.get(key);
		if (entry && entry.resetAt <= now) {
			this.entries.delete(key);
			entry = null;
		}
		return entry || null;
	}

	// Is the key over its limit right now? (does not count)
	blocked(key, now = Date.now()) {
		const entry = this.entry(key, now);
		return Boolean(entry && entry.count >= this.max);
	}

	// Counts one hit; returns true if the key is (now) over its limit
	hit(key, now = Date.now()) {
		let entry = this.entry(key, now);
		if (!entry) {
			if (this.entries.size >= this.maxKeys) this.sweep(now);
			if (this.entries.size >= this.maxKeys) this.entries.delete(this.entries.keys().next().value);
			entry = { count: 0, resetAt: now + this.windowMs };
			this.entries.set(key, entry);
		}
		entry.count++;
		return entry.count > this.max;
	}

	reset(key) {
		this.entries.delete(key);
	}

	sweep(now = Date.now()) {
		for (const [key, entry] of this.entries) {
			if (entry.resetAt <= now) this.entries.delete(key);
		}
	}
}

class TokenBucket {
	constructor({ burst, perSecond }) {
		this.burst = burst;
		this.perSecond = perSecond;
		this.tokens = burst;
		this.at = Date.now();
	}

	// Takes one token; false when the bucket is empty
	take(now = Date.now()) {
		this.tokens = Math.min(this.burst, this.tokens + ((now - this.at) / 1000) * this.perSecond);
		this.at = now;
		if (this.tokens < 1) return false;
		this.tokens -= 1;
		return true;
	}
}

// "::ffff:1.2.3.4" -> "1.2.3.4"; IPv6 -> its /64 prefix ("2001:db8:1:2::/64")
function clientKey(address) {
	let text = String(address || "").trim().toLowerCase();
	if (text.startsWith("::ffff:") && text.indexOf(".") !== -1) text = text.slice(7);
	if (text.indexOf(":") === -1) return text || "unknown";
	// expand "::" to get the first 4 groups
	const zone = text.indexOf("%");
	if (zone !== -1) text = text.slice(0, zone);
	const [head, tail] = text.split("::");
	const headGroups = head ? head.split(":") : [];
	const tailGroups = tail !== undefined && tail ? tail.split(":") : [];
	const missing = 8 - headGroups.length - tailGroups.length;
	const groups = tail !== undefined ? headGroups.concat(new Array(Math.max(0, missing)).fill("0"), tailGroups) : headGroups;
	return groups.slice(0, 4).map((group) => group.replace(/^0+(?=.)/, "")).join(":") + "::/64";
}

module.exports = { WindowCounter, TokenBucket, clientKey };
