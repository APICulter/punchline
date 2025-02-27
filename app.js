/**  *****************************************************************************************
 ******************************** Init for main program **************************************
 ***************************************************************************************** **/

// Import required modules
const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const mongoose = require("mongoose");
const DOMPurify = require("isomorphic-dompurify");


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
// import 'animate.css';

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

// Get the premium code
if (premiumCode != null && premiumCode.length > 0) {
	SECRET_CODE = premiumCode;
}

// Database connexion
mongoose.connect(databaseUrl, {
	useNewUrlParser: true,
	useUnifiedTopology: true,
});

let YourSchema;
let YourModel;
let db = mongoose.connection;

db.on("error", console.error.bind(console, "MongoDB connection error:"));
db.once("open", async function () {
	console.log("Connected to MongoDB");
	YourSchema = new mongoose.Schema({});
	YourModel = mongoose.model("Question", YourSchema, "questions");
	mongoose.connection.close();
});

// Rooms dictionary
const rooms = {};

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
	// console.log('A user connected');
	const ID = socket.id;

	// Handler to get the game URL => Rules panel
	socket.on("getPunchlineURL", () => {
		socket.emit("sendPunchlineURL", punchlineURL);
	});
	


	// Handler for creating a new room
	socket.on("createGame", () => {
		// console.log("Tableau des games " + JSON.stringify(games));

		const pin = generatePIN();
		const roomName = `${pin}-${socket.id}`;


		if (!rooms[roomName]) {
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

		data.pin = DOMPurify.sanitize(data.pin);

		if (data.pin.length == 0) {
			socket.emit("findRoomByIdErrorMessages", emptyPinMessage);
			return;
		} else if (isNaN(data.pin)) {
			socket.emit("findRoomByIdErrorMessages", onlyNumbersMessage);
			return;
		} else if (data.pin.length > 4) {
			socket.emit("findRoomByIdErrorMessages", fourDigitPinMessage);
			return;
		} else {

			let game = games.find((game) => game.pin === Number(data.pin));
			if (typeof game !== "undefined") {
				// We prevent max number of joigners before the game starts
				if (game.players.length == Number(maxNumberOfPlayers) && game.inGame == false) {
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

		pin = DOMPurify.sanitize(pin);
		playerName = DOMPurify.sanitize(playerName);

		let roomName = null;
		for (const name in rooms) {
			if (rooms[name].pin == pin) {
				roomName = name;
				break;
			}
		}

		if (roomName) {
			socket.join(roomName);
			rooms[roomName].sockets.push(socket);
			let game = games.find((game) => game.pin == pin);
			if (typeof game !== "undefined") {
				let player = game.players.find((player) => player.name === playerName);
				if (typeof player !== "undefined") {
					player.socketId = socket.id;
					player.lock = true;
				}
			}
		} else {
			// socket.emit("invalidPIN");
			// socket.emit("redirect", "/html/index.html", "clear");
		}
	});

	// Handler for joining or rejoigning a game after disconnexion
	socket.on("joinGame", (pin, playerName) => {

		pin = DOMPurify.sanitize(pin);
		playerName = DOMPurify.sanitize(playerName);

		let game = games.find((game) => game.pin == pin);
		if (typeof game !== "undefined") {
			let player = game.players.find((player) => player.name === playerName);
			if (typeof player !== "undefined") {
				player.socketId = socket.id;
				player.lock = true;
			}

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


		data.playerName = DOMPurify.sanitize(data.playerName);

		if (data.playerName.length == 0) {
			socket.emit("setUsernameErrorMessages", emptyPlayerNameMessage);
			return;
		} else if (data.playerName.length > 25) {
			socket.emit("setUsernameErrorMessages", tooLongPlayerNameMessage);
			return;
		} else if (data.playerName.toLowerCase() == botName) {
			socket.emit("setUsernameErrorMessages", unauthorizedNameMessage);
			return;
		}

		data.pin = DOMPurify.sanitize(data.pin);
		let game = games.find((game) => game.pin === Number(data.pin));
		let roomName = null;
		for (const name in rooms) {
			if (rooms[name].pin == data.pin) {
				roomName = name;
				break;
			}
		}

		if (roomName && typeof game !== "undefined") {
			let exist = game.players.find(
				(player) => player.name === data.playerName
			);

			if (typeof exist === "undefined") {
				let id = uuidv4();
				let player = new Player(id, data.playerName, ID);
				game.players.push(player);

				socket.join(roomName);
				rooms[roomName].sockets.push(socket);
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

		// Handler for leaving a room
		socket.on("leaveGame", (data) => {
			
		data.pin = DOMPurify.sanitize(data.pin);
		data.playerName = DOMPurify.sanitize(data.playerName);
		let game = games.find((game) => game.pin === Number(data.pin));
		if (typeof game === "undefined") {
			// let roomName = null;
			// for (const name in rooms) {
			// 	if (rooms[name].pin == data.pin) {
			// 		roomName = name;
			// 		break;
			// 	}
			// }
			// socket.to(roomName).emit("redirect", "/");
			// socket.emit("redirect", "/");

		} else {
			let player = game.players.find((player) => player.name === data.playerName);
				if (typeof player !== "undefined") {
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

		// Remove the socket from all rooms
		for (const roomName in rooms) {
			const room = rooms[roomName];
			room.sockets = room.sockets.filter((s) => s !== socket);
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
	socket.on("startGame", function (data) {

		
		
		data.pin = DOMPurify.sanitize(data.pin);
		let game = games.find((game) => game.pin === Number(data.pin));
		if (typeof game === "undefined") {
			let roomName = null;
			for (const name in rooms) {
				if (rooms[name].pin == data.pin) {
					roomName = name;
					break;
				}
			}
			socket.to(roomName).emit("redirect", "/");
			socket.emit("redirect", "/");
		} else {

			// Sanitize input
			data.nbOfQuestions = DOMPurify.sanitize(data.nbOfQuestions);
			data.secretCode = DOMPurify.sanitize(data.secretCode);
			data.premiumMode = DOMPurify.sanitize(data.premiumMode);
	
			if (isNaN(Number(data.nbOfQuestions)) || Number(data.nbOfQuestions) < 1 || Number(data.nbOfQuestions) > 10) {
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
			game.nbOfQuestions = data.nbOfQuestions;

			initQuestions(mongoose, YourModel, game);
			initBot(game);

			socket.emit("redirect", "/html/game.html", data.pin);
		}
	});

	// Handler for sending the next question in the pool
	socket.on("getQuestion", function (data) {

		data.pin = DOMPurify.sanitize(data.pin);

		let game = games.find((game) => game.pin === Number(data.pin));
		if (typeof game === "undefined") {
			let roomName = null;
			for (const name in rooms) {
				if (rooms[name].pin == data.pin) {
					roomName = name;
					break;
				}
			}
			socket.to(roomName).emit("redirect", "/");
			socket.emit("redirect", "/");
		} else {
			// Is there any question left ?
			data.numberQuestion = DOMPurify.sanitize(data.numberQuestion);
			game.question++;
			if (game.question < game.questions.length) {
				let question = game.questions[Number(game.question)];
				game.answers = [];
				game.maxAnswers = 0;
				game.maxVotes = 0;
				socket.emit("question", question);
			} else {
				let roomName = null;
				for (const name in rooms) {
					if (rooms[name].pin == data.pin) {
						roomName = name;
						break;
					}
				}
				socket.to(roomName).emit("redirect", "/html/waiting.html");
				socket.emit("redirect", "/html/scores.html");
			}
		}
	});

	// Handler to remove a player from the room in the lobby
	socket.on("deletePlayer", function (data) {

		data.pin = DOMPurify.sanitize(data.pin);

		let game = games.find((game) => game.pin === Number(data.pin));
		let roomName = null;
		for (const name in rooms) {
			if (rooms[name].pin == data.pin) {
				roomName = name;
				break;
			}
		}
		if (typeof game === "undefined") {
			
		} else {
			// delete player in the game object
			data.playerId = DOMPurify.sanitize(data.playerId);
			let playerName ;
			for (player of game.players) {
				if (player.id == data.playerId) {
					playerName = player.name;
					game.players.splice(game.players.indexOf(player), 1);
					break;
				}
			}

			// send to all the room the name of the player which has to be redirected to the lobby
			socket.to(roomName).emit("redirectDeletePlayer", "/html/index.html", "deletePlayer", playerName);

			socket.emit("playerDeleted", data.playerId);
		}
	});

	// Handler to allow players to answer the question
	socket.on("startPrompt", function (data) {
		data.pin = DOMPurify.sanitize(data.pin);
		let game = games.find((game) => game.pin === Number(data.pin));

		if (typeof game === "undefined") {
			let roomName = null;
			for (const name in rooms) {
				if (rooms[name].pin == data.pin) {
					roomName = name;
					break;
				}
			}
			socket.to(roomName).emit("redirect", "/");
			socket.emit("redirect", "/");
		} else {
			game.status = "answering";
			let roomName = null;
			for (const name in rooms) {
				if (rooms[name].pin == data.pin) {
					roomName = name;
					break;
				}
			}
			socket.to(roomName).emit("redirect", "/html/prompt.html");
		}
	});

	// Handler to send the player's answer
	socket.on("answer", function (data) {


		data.answer = DOMPurify.sanitize(data.answer);

		if (data.answer.length == 0) {
			socket.emit("answerErrorMessages", answerEmptyErrorMessage);
			return;
		} else if (data.answer.length >= 100) {
			socket.emit("answerErrorMessages", answerTooLongErrorMessage);
			return;
		}

		data.pin = DOMPurify.sanitize(data.pin);
		let game = games.find((game) => game.pin === Number(data.pin));
		if (typeof game === "undefined") {
			let roomName = null;
			for (const name in rooms) {
				if (rooms[name].pin == data.pin) {
					roomName = name;
					break;
				}
			}
			socket.to(roomName).emit("redirect", "/");
			socket.emit("redirect", "/");
		} else {

			data.playerName = DOMPurify.sanitize(data.playerName);

			let player = game.players.find(
				(player) => player.name === data.playerName
			);
			if (game.maxAnswers < game.nbOfPlayers) {
				game.answers.push({
					// playerSocketId: ID,
					//what if connexion fails ?
					playerName: player.name,
					textAnswer: data.answer,
					votes: 0,
				});
				game.maxAnswers++;
				socket.emit("redirect", "/html/waiting.html");

				if (game.maxAnswers == game.nbOfPlayers) {
					game.status = "";

					let roomName = null;
					for (const name in rooms) {
						if (rooms[name].pin == data.pin) {
							roomName = name;
							break;
						}
					}
					addBotAnswer(game);
					io.in(roomName).emit("displayAnswers", shuffle(game.answers));
				}
			}
		}
	});

	// Handler to end round when timer goes to 0 if there is still 1 player that did not answer
	socket.on("timeIsUpToAnswer", function (data) {
		data.pin = DOMPurify.sanitize(data.pin);
		let game = games.find((game) => game.pin === Number(data.pin));
		let roomName = null;
			for (const name in rooms) {
				if (rooms[name].pin == data.pin) {
					roomName = name;
					break;
				}
			}

		if (typeof game === "undefined") {
			
			socket.to(roomName).emit("redirect", "/");
			socket.emit("redirect", "/");

		} else {
			
			socket.to(roomName).emit("redirect", "/html/waiting.html");

			// if (game.answers.length <= 1) {
			// 	io.in(roomName).emit("skipVoteQuestion", game.question);
			// } else {
				game.status = "";
				addBotAnswer(game);
				io.in(roomName).emit("displayAnswers", shuffle(game.answers));
			// }
		}
	});

	// socket.on("timeIsUpToVote", function (data) {
	// 	let game = games.find((game) => game.pin === Number(data.punchlinePin));
	// 	socket.broadcast.emit("redirect", "/html/waiting.html");
	// 	io.emit("displayVotes", game.answers);
	// });

	// Handler to retrieve the votes and displau on UI
	socket.on("getVotes", function (data) {
		data.pin = DOMPurify.sanitize(data.pin);
		let game = games.find((game) => game.pin === Number(data.pin));
		game.status = "voting";
		let roomName = null;
		for (const name in rooms) {
			if (rooms[name].pin == data.pin) {
				roomName = name;
				break;
			}
		}
		socket.to(roomName).emit("redirect", "/html/votePrompt.html");
	});

	socket.on("getAnswers", function (data) {
		let game = games.find((game) => game.pin === Number(data.pin));
		//mettre une condition pour éviter de faire planter si on revient sur la tab
		socket.emit("postAnswers", game.answers);
	});

	// Handler to vote for a player
	socket.on("vote", function (playerName, pin) {
		let game = games.find((game) => game.pin === Number(pin));
		if (typeof game === "undefined") {
			let roomName = null;
			for (const name in rooms) {
				if (rooms[name].pin == pin) {
					roomName = name;
					break;
				}
			}
			socket.to(roomName).emit("redirect", "/");
			socket.emit("redirect", "/");
		} else {
			let answer = game.answers.find(
				(answer) => answer.playerName === playerName
			);
			answer.votes++;
			game.answers[playerName]++;
			let player = game.players.find((player) => player.name === playerName);
			player.points++;
			game.maxVotes++;
			socket.emit("redirect", "/html/waiting.html");
			if (game.maxVotes == game.nbOfPlayers) {
				let roomName = null;
				for (const name in rooms) {
					if (rooms[name].pin == pin) {
						roomName = name;
						break;
					}
				}
				game.status = "";
				io.in(roomName).emit("displayVotes", game.answers);
				// io.emit("displayVotes", game.answers);
				//mettre les votes dans game.answers
			}
		}
	});

	// Handler to get the ranking of players based on the number of points (final board)
	socket.on("getScores", function (data) {
		let game = games.find((game) => game.pin === Number(data.pin));
		// let scores = [];
		// game.players.forEach(player => {
		// 	scores[player.name] = player.points;
		// });

		if (typeof game === "undefined") {
			let roomName = null;
			for (const name in rooms) {
				if (rooms[name].pin == data.pin) {
					roomName = name;
					break;
				}
			}
			socket.to(roomName).emit("redirect", "/");
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
		let game = games.find((game) => game.pin === Number(data.pin));
		// game.players.forEach((player) => {
		// 	let onLinePlayer = players.find(
		// 		(onLinePlayer) => onLinePlayer.id === player.id
		// 	);
		// 	// onLinePlayer.game = undefined;
		// 	players.splice(players.indexOf(onLinePlayer), 1);
		// });
		// console.log("Tableau des games avant destruction " + JSON.stringify(games));
		if (typeof game !== "undefined") {
		games.splice(games.indexOf(game), 1);

		}
		// console.log("Tableau des games apres destruction " + JSON.stringify(games));
		// if (game.maxVotes == game.nbOfPlayers) {
		let roomName = null;
		for (const name in rooms) {
			if (rooms[name].pin == data.pin) {
				roomName = name;
				break;
			}
		}
		// }

		socket.to(roomName).emit("redirect", "/html/index.html");
		delete rooms[roomName];

		// socket.broadcast.emit("redirect", "/html/index.html", "clear");
	});
});

const port = applicationPort;
server.listen(port, () => {
	console.log(`Server is running on http://localhost:${port}`);
});
