/**
 * Live games: read-only view of the in-memory games (app.js) and "end this game".
 * Only public information is returned: never socket ids, player ids or the premium code.
 */
"use strict";

const express = require("express");

const WATCH_INTERVAL_MS = 5000;
const MAX_GAMES = 200;

module.exports = function gamesRouter({ getGames, abortGame, audit, isConnected }) {
	const router = express.Router();

	// The game objects have no timestamps: they are watched every few seconds to know
	// when a game was first seen and when its state last changed (approximate times).
	const tracking = new WeakMap(); // game -> { firstSeen, lastActivity, signature }

	function signature(game) {
		const players = Array.isArray(game.players) ? game.players : [];
		return JSON.stringify([
			game.inGame,
			game.status,
			game.question,
			Array.isArray(game.answers) ? game.answers.length : 0,
			Array.isArray(game.votes) ? game.votes.length : 0,
			players.map((player) => [player && player.name, player && player.points, player && player.lock]),
		]);
	}

	function track(game) {
		const now = Date.now();
		const sig = signature(game);
		let entry = tracking.get(game);
		if (!entry) {
			entry = { firstSeen: now, lastActivity: now, signature: sig };
			tracking.set(game, entry);
		} else if (entry.signature !== sig) {
			entry.signature = sig;
			entry.lastActivity = now;
		}
		return entry;
	}

	function currentGames() {
		try {
			const games = getGames();
			return Array.isArray(games) ? games : [];
		} catch (error) {
			console.error("Admin: cannot read the games", error);
			return [];
		}
	}

	const watcher = setInterval(() => currentGames().forEach(track), WATCH_INTERVAL_MS);
	watcher.unref();

	function phase(game) {
		const questions = Array.isArray(game.questions) ? game.questions.length : 0;
		if (!game.inGame) return "lobby";
		if (questions > 0 && Number(game.question) >= questions) return "scores";
		if (game.status === "answering") return "answering";
		if (game.status === "voting") return "voting";
		return "playing";
	}

	function describe(game) {
		const entry = track(game);
		const players = (Array.isArray(game.players) ? game.players : [])
			.filter((player) => player && typeof player === "object")
			.map((player) => ({
				name: String(player.name == null ? "" : player.name).slice(0, 40),
				points: Number(player.points) || 0,
				bot: player.id === -1,
				// live socket check from app.js when available (a lock flag can stay set after a page is closed)
				connected: typeof isConnected === "function" ? isConnected(player) : player.lock !== false,
			}));
		const rounds = Number(game.nbOfQuestions) || 0;
		const questionIndex = Number(game.question);
		return {
			pin: String(game.pin),
			phase: phase(game),
			round: game.inGame && rounds > 0 ? Math.min(Math.max(questionIndex + 1, 1), rounds) : 0,
			rounds,
			premium: game.premium === true,
			answerTime: Number(game.answerTime) || null,
			revealTime: Number(game.revealTime) || null,
			voteTime: Number(game.voteTime) || null,
			players,
			firstSeen: new Date(entry.firstSeen).toISOString(),
			lastActivity: new Date(entry.lastActivity).toISOString(),
		};
	}

	// GET /games
	router.get("/games", (req, res) => {
		const games = currentGames().filter((game) => game && typeof game === "object");
		res.json({
			games: games.slice(0, MAX_GAMES).map(describe),
			total: games.length,
			now: new Date().toISOString(),
		});
	});

	// POST /games/:pin/end
	router.post("/games/:pin/end", async (req, res, next) => {
		try {
			const pin = req.params.pin;
			if (!/^[0-9]{4}$/.test(pin)) return res.status(404).json({ error: "admin.error.gameNotFound" });
			const ended = abortGame(Number(pin), "error.gameEnded");
			if (!ended) return res.status(404).json({ error: "admin.error.gameNotFound" });
			await audit(req, "game.end", { pin });
			res.json({ ok: true });
		} catch (error) {
			next(error);
		}
	});

	return router;
};
