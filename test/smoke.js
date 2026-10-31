#!/usr/bin/env node
// Smoke test against a running Punchline server (CI, or by hand after a deploy).
//
//   node test/smoke.js                          default http://127.0.0.1:3000
//   SMOKE_URL=https://punchline.example.com node test/smoke.js
//
// 1. GET /healthz answers 200 {status: "ok"}
// 2. a host creates a game, two players join it, the host starts it (1 round, English)
// 3. the host asks for the first question and receives it
// 4. the game is ended (endGame), so nothing is left behind on the server
//
// Exit code 0 when everything passed, 1 otherwise (with the step that failed).
"use strict";

const { io } = require("socket.io-client");

const BASE_URL = (process.env.SMOKE_URL || process.argv[2] || "http://127.0.0.1:3000").replace(/\/+$/, "");
const STEP_TIMEOUT_MS = Number(process.env.SMOKE_STEP_TIMEOUT_MS) || 10000;
const TOTAL_TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS) || 45000;

const sockets = [];
let currentStep = "start";

function log(message) {
	console.log(`[smoke] ${message}`);
}

function fail(message) {
	console.error(`[smoke] FAILED at "${currentStep}": ${message}`);
	for (const socket of sockets) socket.close();
	process.exit(1);
}

// whole test watchdog
setTimeout(() => fail(`timeout after ${TOTAL_TIMEOUT_MS} ms`), TOTAL_TIMEOUT_MS).unref();

function step(name) {
	currentStep = name;
	log(name);
}

// resolves with the arguments of `event`, rejects on one of `errorEvents` or after the step timeout
function waitFor(socket, event, errorEvents = [], filter = () => true) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			cleanup();
			reject(new Error(`no "${event}" within ${STEP_TIMEOUT_MS} ms`));
		}, STEP_TIMEOUT_MS);
		const onEvent = (...args) => {
			if (!filter(...args)) return;
			cleanup();
			resolve(args);
		};
		const onError = {};
		for (const name of errorEvents) {
			onError[name] = (...args) => {
				cleanup();
				reject(new Error(`server answered "${name}": ${JSON.stringify(args)}`));
			};
			socket.on(name, onError[name]);
		}
		function cleanup() {
			clearTimeout(timer);
			socket.off(event, onEvent);
			for (const name of errorEvents) socket.off(name, onError[name]);
		}
		socket.on(event, onEvent);
	});
}

function connect(label) {
	const socket = io(BASE_URL, {
		transports: ["websocket"],
		reconnection: false,
		timeout: STEP_TIMEOUT_MS,
		// same-origin request, like a browser on the site
		extraHeaders: { Origin: BASE_URL },
	});
	sockets.push(socket);
	return new Promise((resolve, reject) => {
		socket.once("connect", () => resolve(socket));
		socket.once("connect_error", (error) => reject(new Error(`${label} could not connect: ${error.message}`)));
	});
}

async function main() {
	step("GET /healthz");
	const response = await fetch(`${BASE_URL}/healthz`, { signal: AbortSignal.timeout(STEP_TIMEOUT_MS) });
	const health = await response.json().catch(() => null);
	if (response.status !== 200 || !health || health.status !== "ok") {
		throw new Error(`HTTP ${response.status} ${JSON.stringify(health)}`);
	}
	log(`healthz ok (mongo ${health.mongo}, ${health.games} games)`);

	step("host creates a game");
	const host = await connect("host");
	const created = waitFor(host, "newGame", ["gameExists"]);
	host.emit("createGame");
	const [pin] = await created;
	if (!/^[0-9]{4}$/.test(String(pin))) throw new Error(`unexpected PIN ${JSON.stringify(pin)}`);
	log(`game ${pin}`);

	try {
		step("two players join");
		const names = ["Smoke A", "Smoke B"];
		const joiners = [];
		const joined = waitFor(host, "newJoiner", [], (data) => {
			if (data && names.includes(data.playerName) && !joiners.includes(data.playerName)) joiners.push(data.playerName);
			return joiners.length === names.length;
		});
		for (const playerName of names) {
			const player = await connect(playerName);
			const set = waitFor(player, "userSet", ["setUsernameErrorMessages"]);
			player.emit("setUsername", { pin: String(pin), playerName: playerName });
			const [data, page] = await set;
			if (!data || data.playerName !== playerName) throw new Error(`userSet for ${playerName}: ${JSON.stringify(data)}`);
			log(`${playerName} joined (${page})`);
		}
		await joined;
		log("host saw both players");

		step("host starts the game");
		const started = waitFor(host, "redirect", ["startGameErrorMessages"], (url) => url === "/html/game.html");
		host.emit("startGame", {
			pin: String(pin),
			nbOfQuestions: "1",
			secretCode: "",
			premiumMode: "false",
			lang: "en",
		});
		await started;

		step("host receives a question");
		const asked = waitFor(host, "question");
		host.emit("getQuestion", { pin: String(pin) });
		const [question] = await asked;
		if (!question || typeof question.question !== "string" || question.question.length === 0) {
			throw new Error(`empty question ${JSON.stringify(question)}`);
		}
		log(`question received (${question.total} in the game): "${question.question.slice(0, 60)}"`);
	} finally {
		// leave nothing behind, even when a step failed
		host.emit("endGame", { pin: String(pin) });
		await new Promise((resolve) => setTimeout(resolve, 300));
	}

	for (const socket of sockets) socket.close();
	log("PASSED");
	process.exit(0);
}

main().catch((error) => fail(error && error.message ? error.message : String(error)));
