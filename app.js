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


// Create and configure the Express app
const app = express();
const server = http.createServer(app);
const io = socketIO(server);
var path = require("path");
const publicPath = path.join(__dirname, "public");
app.get("/", function (req, res) {
	res.sendFile(__dirname + "/public/html/index.html");
});
app.use(express.static(publicPath));
app.all("*", function (req, res) {
	res.redirect("/");
});

// Define classes
const { Game } = require("./classes/game");
const { Player } = require("./classes/player");

// Define global variables
var games = [];
var SECRET_CODE;

// Read the configuration properties from external file and create global variables from it
var propertiesReader = require("properties-reader");
var properties = propertiesReader(__dirname + "/config.properties");
properties.each((key, value) => {
	global[key] = value;
});

// Port: PORT environment variable (set by most hosting platforms) or applicationPort
const port = Number(process.env.PORT) || Number(global.applicationPort) || 3000;

// First IPv4 address of this machine on the local network (e.g. 192.168.1.10)
function lanAddress() {
	for (const addresses of Object.values(os.networkInterfaces())) {
		for (const address of addresses || []) {
			if (address.family === "IPv4" && !address.internal) {
				return address.address;
			}
		}
	}
	return null;
}

// Public address shown to players ("On your phone, open …"), in order of priority:
// 1. PUBLIC_URL environment variable (production)
// 2. punchlineURL in config.properties
// 3. the address the host used to open the game; "localhost" is replaced by the
//    machine's local network address so that phones on the same Wi-Fi can reach it
function resolvePunchlineURL(socket) {
	const configured = String(process.env.PUBLIC_URL || global.punchlineURL || "").trim();
	if (configured) {
		return configured.replace(/\/+$/, "");
	}

	const headers = socket.handshake.headers || {};
	const forwardedProto = String(headers["x-forwarded-proto"] || "").split(",")[0].trim();
	const protocol = forwardedProto || (socket.handshake.secure ? "https" : "http");
	let host = String(headers["x-forwarded-host"] || headers.host || "").split(",")[0].trim();
	if (!host) {
		host = "localhost:" + port;
	}

	const local = host.match(/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i);
	if (local) {
		const ip = lanAddress();
		if (ip) {
			host = ip + (local[2] || "");
		}
	}
	return protocol + "://" + host;
}

// Get the premium code
if (global.premiumCode != null && String(global.premiumCode).length > 0) {
	SECRET_CODE = String(global.premiumCode);
}

// Database connexion: a single shared connection, kept open for the server's lifetime
// (queries issued before it is open are buffered by mongoose).
const YourSchema = new mongoose.Schema({});
const YourModel = mongoose.model("Question", YourSchema, "questions");
let db = mongoose.connection;

db.on("error", console.error.bind(console, "MongoDB connection error:"));
db.once("open", function () {
	console.log("Connected to MongoDB");
});
mongoose.connect(databaseUrl).catch((err) => {
	console.error("MongoDB initial connection error:", err);
});

// Rooms dictionary
const rooms = {};

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

// Removes the game and the room linked to a room name
function destroyRoom(roomName) {
	const room = rooms[roomName];
	if (!room) return;
	clearTimeout(room.cleanupTimer);
	const game = findGame(room.pin);
	if (typeof game !== "undefined") {
		games.splice(games.indexOf(game), 1);
	}
	delete rooms[roomName];
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
} = require("./functions");

/**  *****************************************************************************************
 ******************************** Main program *******************************************
 ***************************************************************************************** **/

io.on("connection", function (socket) {
	const ID = socket.id;

	// Handler to get the game URL => Rules panel
	socket.on("getPunchlineURL", () => {
		socket.emit("sendPunchlineURL", resolvePunchlineURL(socket));
	});

	// Handler for creating a new room
	socket.on("createGame", () => {
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
	});

	// Handler for checking if the game / room exists
	socket.on("findRoomById", function (data) {
		data = asObject(data);
		data.pin = clean(data.pin).trim();

		if (data.pin.length == 0) {
			socket.emit("findRoomByIdErrorMessages", emptyPinMessage);
			return;
		} else if (!/^[0-9]+$/.test(data.pin)) {
			socket.emit("findRoomByIdErrorMessages", onlyNumbersMessage);
			return;
		} else if (data.pin.length != 4) {
			socket.emit("findRoomByIdErrorMessages", fourDigitPinMessage);
			return;
		} else {

			let game = findGame(data.pin);
			if (typeof game !== "undefined") {
				// We prevent max number of joigners before the game starts
				if (game.players.length >= Number(maxNumberOfPlayers) && game.inGame == false) {
					socket.emit("errorRoomFull", errorRoomFullMessage);
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
				socket.emit("findRoomByIdErrorMessages", noGameFoundMessage);
			}
		}
	});

	// Handler for joining a room (after entering PIN and before giving a name)
	socket.on("joinRoom", (pin, playerName) => {
		pin = clean(pin);
		playerName = clean(playerName);

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
			}
		}
	});

	// Handler for joining or rejoigning a game after disconnexion
	socket.on("joinGame", (pin, playerName) => {
		pin = clean(pin);
		playerName = clean(playerName);

		let game = findGame(pin);
		if (typeof game !== "undefined") {
			// Only an existing, currently unlocked (disconnected) player can be taken over
			let player = game.players.find((player) => player.name === playerName);
			if (typeof player === "undefined" || player.lock) {
				socket.emit("findRoomByIdErrorMessages", noGameFoundMessage);
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
	socket.on("setUsername", function (data) {
		data = asObject(data);
		data.playerName = clean(data.playerName).trim();

		if (data.playerName.length == 0) {
			socket.emit("setUsernameErrorMessages", emptyPlayerNameMessage);
			return;
		} else if (data.playerName.length > 25) {
			socket.emit("setUsernameErrorMessages", tooLongPlayerNameMessage);
			return;
		} else if (data.playerName.toLowerCase() == String(botName).toLowerCase()) {
			socket.emit("setUsernameErrorMessages", unauthorizedNameMessage);
			return;
		}

		data.pin = clean(data.pin);
		let game = findGame(data.pin);
		let roomName = findRoomName(data.pin);

		if (roomName && typeof game !== "undefined") {
			// New players can only join the lobby, within the max number of players
			if (game.inGame || game.players.length >= Number(maxNumberOfPlayers)) {
				socket.emit("setUsernameErrorMessages", errorRoomFullMessage);
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
				socket.emit("setUsernameErrorMessages", userExistsMessage);
			}
		}
	});

	// Handler for leaving a room
	socket.on("leaveRoom", (roomName) => {
		const room = rooms[roomName];
		if (room) {
			socket.leave(roomName);
			room.sockets = room.sockets.filter((s) => s !== socket);
		}
	});

	// Handler for leaving a game (unlocks the player so they can rejoin later)
	socket.on("leaveGame", (data) => {
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
	socket.on("disconnect", () => {
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
			if (wasInRoom && room.sockets.length === 0) {
				clearTimeout(room.cleanupTimer);
				room.cleanupTimer = setTimeout(() => {
					if (rooms[roomName] === room && room.sockets.length === 0) {
						destroyRoom(roomName);
					}
				}, EMPTY_ROOM_TTL_MS);
				room.cleanupTimer.unref();
			}
		}
	});


	socket.on("getConfig", function () {
		// get the different variables
		let configurationVariables = [];
		configurationVariables.push(questionCountDown);
		configurationVariables.push(beforeQuestionCountDown);
		configurationVariables.push(voteCountDown);

		// emit to the sender
		socket.emit("getConfigResponse", configurationVariables);
	});


	// Starts the game for all players in the room
	socket.on("startGame", async function (data) {
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
				socket.emit("startGameErrorMessages", nbOfQuestionsErrorMessage);
				return;
			} else if ((data.secretCode.length == 0 || data.secretCode.length > 15) && data.premiumMode === "true") {
				socket.emit("startGameErrorMessages", premiumCodeLengthErrorMessage);
				return;
			}


			// Is game premium ?
			if (data.premiumMode === "true") {
				if (
					typeof SECRET_CODE !== "undefined" &&
					data.secretCode == SECRET_CODE
				) {
					game.premium = true;
				} else {
					socket.emit("startGameErrorMessages", premiumCodeErrorMessage);
					return;
				}
			}

			game.nbOfPlayers = game.players.length;
			game.inGame = true;
			game.nbOfQuestions = Number(data.nbOfQuestions);

			// Questions must be loaded before the host goes to the game page,
			// otherwise the first "getQuestion" finds an empty pool and ends the game
			await initQuestions(YourModel, game);
			if (game.questions.length === 0) {
				game.inGame = false;
				game.premium = false;
				socket.emit("startGameErrorMessages", "Unable to load questions");
				return;
			}
			initBot(game);

			socket.emit("redirect", "/html/game.html", data.pin);
		}
	});

	// Handler for sending the next question in the pool
	socket.on("getQuestion", function (data) {
		data = asObject(data);
		data.pin = clean(data.pin);

		let game = findGame(data.pin);
		if (typeof game === "undefined") {
			let roomName = findRoomName(data.pin);
			if (roomName) socket.to(roomName).emit("redirect", "/");
			socket.emit("redirect", "/");
		} else {
			// Is there any question left ?
			game.question++;
			game.status = "";
			game.answers = [];
			game.maxAnswers = 0;
			game.maxVotes = 0;
			game.votes = [];
			if (game.question < game.questions.length) {
				let question = game.questions[game.question];
				socket.emit("question", question);
			} else {
				let roomName = findRoomName(data.pin);
				if (roomName) socket.to(roomName).emit("redirect", "/html/waiting.html");
				socket.emit("redirect", "/html/scores.html");
			}
		}
	});

	// Handler to remove a player from the room in the lobby
	socket.on("deletePlayer", function (data) {
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
	socket.on("startPrompt", function (data) {
		data = asObject(data);
		data.pin = clean(data.pin);
		let game = findGame(data.pin);

		if (typeof game === "undefined") {
			let roomName = findRoomName(data.pin);
			if (roomName) socket.to(roomName).emit("redirect", "/");
			socket.emit("redirect", "/");
		} else {
			game.status = "answering";
			let roomName = findRoomName(data.pin);
			if (roomName) socket.to(roomName).emit("redirect", "/html/prompt.html");
		}
	});

	// Handler to send the player's answer
	socket.on("answer", function (data) {
		data = asObject(data);
		data.answer = clean(data.answer).trim();

		if (data.answer.length == 0) {
			socket.emit("answerErrorMessages", answerEmptyErrorMessage);
			return;
		} else if (data.answer.length >= 100) {
			socket.emit("answerErrorMessages", answerTooLongErrorMessage);
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
					playerName: player.name,
					textAnswer: data.answer,
					votes: 0,
				});
				game.maxAnswers++;
				socket.emit("redirect", "/html/waiting.html");

				if (game.maxAnswers == game.nbOfPlayers) {
					game.status = "";

					let roomName = findRoomName(data.pin);
					addBotAnswer(game);
					if (roomName) io.in(roomName).emit("displayAnswers", shuffle(game.answers));
				}
			}
		}
	});

	// Handler to end round when timer goes to 0 if there is still 1 player that did not answer
	socket.on("timeIsUpToAnswer", function (data) {
		data = asObject(data);
		data.pin = clean(data.pin);
		let game = findGame(data.pin);
		let roomName = findRoomName(data.pin);

		if (typeof game === "undefined") {
			if (roomName) socket.to(roomName).emit("redirect", "/");
			socket.emit("redirect", "/");
		} else if (game.status === "answering") {
			// Only once per round: if every player already answered, answers were already displayed
			if (roomName) socket.to(roomName).emit("redirect", "/html/waiting.html");
			game.status = "";
			addBotAnswer(game);
			if (roomName) io.in(roomName).emit("displayAnswers", shuffle(game.answers));
		}
	});

	// Handler to open the vote for players
	socket.on("getVotes", function (data) {
		data = asObject(data);
		data.pin = clean(data.pin);
		let game = findGame(data.pin);
		if (typeof game === "undefined") {
			socket.emit("redirect", "/");
			return;
		}
		game.status = "voting";
		let roomName = findRoomName(data.pin);
		if (roomName) socket.to(roomName).emit("redirect", "/html/votePrompt.html");
	});

	socket.on("getAnswers", function (data) {
		data = asObject(data);
		let game = findGame(clean(data.pin));
		if (typeof game === "undefined") {
			socket.emit("redirect", "/");
			return;
		}
		socket.emit("postAnswers", game.answers);
	});

	// Handler to vote for a player
	socket.on("vote", function (playerName, pin) {
		pin = clean(pin);
		playerName = clean(playerName);
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
			let answer = game.answers.find(
				(answer) => answer.playerName === playerName
			);
			// Ignore votes outside of the voting phase, from unknown sockets,
			// for a non-existing answer, or for the voter's own answer
			if (
				game.status !== "voting" ||
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
			let player = game.players.find((player) => player.name === playerName);
			if (typeof player !== "undefined") {
				player.points++;
			}
			game.maxVotes++;
			socket.emit("redirect", "/html/waiting.html");
			if (game.maxVotes >= game.nbOfPlayers) {
				let roomName = findRoomName(pin);
				game.status = "";
				if (roomName) io.in(roomName).emit("displayVotes", game.answers);
			}
		}
	});

	// Handler to get the ranking of players based on the number of points (final board)
	socket.on("getScores", function (data) {
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
	socket.on("endGame", function (data) {
		data = asObject(data);
		data.pin = clean(data.pin);
		let game = findGame(data.pin);
		if (typeof game !== "undefined") {
			games.splice(games.indexOf(game), 1);
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

server.listen(port, () => {
	console.log(`Server is running on http://localhost:${port}`);
});
