/**
 * Settings tab: the premium code (admin/premium.js keeps it in MongoDB + in memory).
 *   GET  /settings/premium            current code (shown to the admin only), last change
 *   POST /settings/premium/generate   { lang: "fr" | "en" } new readable code
 *   POST /settings/premium/set        { code } a code chosen by the admin
 *   POST /settings/premium/disable    premium turned off
 * The audit log records the action, never the code itself.
 */
"use strict";

const express = require("express");
const premiumCode = require("./premium");

module.exports = function settingsRouter({ premium, audit }) {
	const router = express.Router();
	const json = express.json({ limit: "1kb", strict: true });

	function available(res) {
		if (premium && typeof premium.get === "function") return true;
		res.status(503).json({ error: "admin.settings.error.unavailable" });
		return false;
	}

	function body(req) {
		return req.body && typeof req.body === "object" ? req.body : {};
	}

	router.get("/settings/premium", (req, res) => {
		if (!available(res)) return;
		res.json({ premium: premium.get() });
	});

	router.post("/settings/premium/generate", json, async (req, res, next) => {
		try {
			if (!available(res)) return;
			const lang = body(req).lang === "fr" ? "fr" : "en";
			const before = premium.get().code;
			let code = premiumCode.generate(lang);
			// never the same code again (tiny chance)
			while (before && premiumCode.normalize(code) === premiumCode.normalize(before)) code = premiumCode.generate(lang);
			const result = await premium.set(code, req.admin.user);
			await audit(req, "premium.generate", { lang });
			res.json({ premium: result });
		} catch (error) {
			next(error);
		}
	});

	router.post("/settings/premium/set", json, async (req, res, next) => {
		try {
			if (!available(res)) return;
			const code = body(req).code;
			const invalid = premiumCode.validate(code);
			if (invalid) return res.status(400).json({ error: invalid, fields: { code: invalid } });
			const result = await premium.set(code.trim(), req.admin.user);
			await audit(req, "premium.change");
			res.json({ premium: result });
		} catch (error) {
			next(error);
		}
	});

	router.post("/settings/premium/disable", json, async (req, res, next) => {
		try {
			if (!available(res)) return;
			const result = await premium.disable(req.admin.user);
			await audit(req, "premium.disable");
			res.json({ premium: result });
		} catch (error) {
			next(error);
		}
	});

	return router;
};
