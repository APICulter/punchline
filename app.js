/**  *****************************************************************************************
 ******************************** Init for main program **************************************
 ***************************************************************************************** **/

// Import required modules
const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const mongoose = require('mongoose');


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
var propertiesReader = require('properties-reader');
var properties = propertiesReader(__dirname +'/config.properties');
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
			useUnifiedTopology: true
		});

let YourSchema;
let YourModel;
let db = mongoose.connection;

db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', async function() { 
	console.log('Connected to MongoDB');
	YourSchema = new mongoose.Schema({});
	YourModel = mongoose.model('Question', YourSchema, 'questions');
	mongoose.connection.close();
});


// Rooms dictionary
const rooms = {};


// Generates a random UUID for a player
const { v4: uuidv4 } = require('uuid');


// Import custom functions from functions.js
const { generatePIN, 
	unlockedPlayers, 
	initBot,
    addBotAnswer,
    shuffle,
    initQuestions
} = require('./functions');







/**  *****************************************************************************************
 ******************************** Main program *******************************************
 ***************************************************************************************** **/


io.on("connection", function (socket) {
	// console.log('A user connected');
	const ID = socket.id;

	// Handler for creating a new room
	socket.on("createGame", () => {
		const roomName = `room-${socket.id}`;
		const pin = generatePIN();

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
		let game = games.find((game) => game.pin === Number(data.pin));
		if (game !== null) {
			if (game.players.length == Number(maxNumberOfPlayers) ) {
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
			socket.emit("noGameFound", noGameFoundMessage);
		}
	});

	

	// Handler for joining a room (after entering PIN and before giving a name)
	socket.on("joinRoom", (pin, playerName) => {
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
			if (game !== null) {
				let player = game.players.find((player) => player.name === playerName);
				if (player !== null) {
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
		let game = games.find((game) => game.pin == pin);
		if (game !== null) {
			let player = game.players.find((player) => player.name === playerName);
			if (player !== null) {
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
		if (data.playerName.toLowerCase() == botName) {
			socket.emit("userExists", unauthorizedNameMessage);
			return;
		}

		let game = games.find((game) => game.pin === Number(data.pin));
		let roomName = null;
		for (const name in rooms) {
			if (rooms[name].pin == data.pin) {
				roomName = name;
				break;
			}
		}

		if (roomName && game !== null) {

			let exist = game.players.find(
				(player) => player.name === data.playerName
			);

			if (exist == null) {
				let id = uuidv4();
				let player = new Player(id, data.playerName, ID);
				game.players.push(player);

				socket.join(roomName);
				rooms[roomName].sockets.push(socket);
				io.to(game.hostSocketId).emit("newJoiner", {
					playerName: player.name,
					playerId: player.id
				});
				socket.emit("userSet", data, "/html/waiting.html");

			} else {
				socket.emit("userExists", userExistsMessage);
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

	// Starts the game for all players in the room
	socket.on("startGame", function (data) {

		let game = games.find((game) => game.pin === Number(data.pin));
		if (game !== null) {
			let roomName = null;
				for (const name in rooms) {
					if (rooms[name].pin == data.punchlinePin) {
						roomName = name;
						break;
					}
				}
			socket.to(roomName).emit("redirect", "/");
			socket.emit("redirect", "/");

		} else {

			// Is game premium ? 
			if (data.premiumMode == true) {
				if (SECRET_CODE !== null && data.secretCode == SECRET_CODE ) {
				game.premium = true;
				} else {
					socket.emit("premiumCodeError", premiumCodeErrorMessage);
					return;
				}
			}

			game.nbOfPlayers = game.players.length;
			game.inGame = true;
			game.nbOfQuestions = data.nbOfQuestions;
			
			initQuestions( mongoose, YourModel, game);
			initBot(game);

			socket.emit("redirect", "/html/game.html", data.pin);
			
		}
		
	});

	

	// Handler for sending the next question in the pool
	socket.on("getQuestion", function (data) {

		let game = games.find((game) => game.pin === Number(data.punchlinePin));
		if (game !== null) {
			let roomName = null;
				for (const name in rooms) {
					if (rooms[name].pin == data.punchlinePin) {
						roomName = name;
						break;
					}
				}
			socket.to(roomName).emit("redirect", "/");
			socket.emit("redirect", "/");
		} else {
			
			// Is there any question left ?
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
					if (rooms[name].pin == data.punchlinePin) {
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
		let game = games.find((game) => game.pin === Number(data.pin));

		if (game !== null) {
			let roomName = null;
				for (const name in rooms) {
					if (rooms[name].pin == data.punchlinePin) {
						roomName = name;
						break;
					}
				}

		} else {

			// delete player
			for (player of game.players) {
				if (player.id == data.playerId) {
					game.players.splice(game.players.indexOf(player), 1);
					break;
				}
			};
				
			socket.emit("playerDeleted", data.playerId);
		}
	});

	// Handler to allow players to answer the question
	socket.on("startPrompt", function (data) {
		let game = games.find((game) => game.pin === Number(data.punchlinePin));

		if (game !== null) {
			let roomName = null;
				for (const name in rooms) {
					if (rooms[name].pin == data.punchlinePin) {
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
				if (rooms[name].pin == data.punchlinePin) {
					roomName = name;
					break;
				}
			}
			socket.to(roomName).emit("redirect", "/html/prompt.html");
		}
		
	});

	// Handler to send the player's answer
	socket.on("answer", function (data) {
		let game = games.find((game) => game.pin === Number(data.punchlinePin));
		if (game !== null) {
			let roomName = null;
				for (const name in rooms) {
					if (rooms[name].pin == data.punchlinePin) {
						roomName = name;
						break;
					}
				}
			socket.to(roomName).emit("redirect", "/");
			socket.emit("redirect", "/");
		} else {
			let player = game.players.find((player) => player.name === data.playerName);
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
						if (rooms[name].pin == data.punchlinePin) {
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

	// Handler to end round when timer goes to 0 if there is still 1 player that did not vote
	socket.on("timeIsUpToAnswer", function (data) {
		let game = games.find((game) => game.pin === Number(data.punchlinePin));

		if (game !== null) {
			let roomName = null;
				for (const name in rooms) {
					if (rooms[name].pin == data.punchlinePin) {
						roomName = name;
						break;
					}
				}
			socket.to(roomName).emit("redirect", "/");
			socket.emit("redirect", "/");
		} else {
			let roomName = null;
		for (const name in rooms) {
			if (rooms[name].pin == data.punchlinePin) {
				roomName = name;
				break;
			}
		}
		socket.to(roomName).emit("redirect", "/html/waiting.html");

		// socket.broadcast.emit("redirect", "/html/waiting.html");
		if (game.answers.length <= 1) {
			io.in(roomName).emit("skipVoteQuestion", game.question);
			// io.emit("skipVoteQuestion", game.question);
		} else {
			game.status = "";
			addBotAnswer(game);
			io.in(roomName).emit("displayAnswers", shuffle(game.answers));
			// io.emit("displayAnswers", shuffle(game.answers));
		}
		}
		
	});

	// socket.on("timeIsUpToVote", function (data) {
	// 	let game = games.find((game) => game.pin === Number(data.punchlinePin));
	// 	socket.broadcast.emit("redirect", "/html/waiting.html");
	// 	io.emit("displayVotes", game.answers);
	// });

	

	
	// Handler to retrieve the votes and displau on UI
	socket.on("getVotes", function (data) {
		let game = games.find((game) => game.pin === Number(data.punchlinePin));
		game.status = "voting";
		let roomName = null;
		for (const name in rooms) {
			if (rooms[name].pin == data.punchlinePin) {
				roomName = name;
				break;
			}
		}
		socket.to(roomName).emit("redirect", "/html/votePrompt.html");
	});

	socket.on("getAnswers", function (data) {
		let game = games.find((game) => game.pin === Number(data.punchlinePin));
		//mettre une condition pour éviter de faire planter si on revient sur la tab
		socket.emit("postAnswers", game.answers);
	});

	// Handler to vote for a player
	socket.on("vote", function (playerName, pin) {
		let game = games.find((game) => game.pin === Number(pin));
		if (game !== null) {
			let roomName = null;
				for (const name in rooms) {
					if (rooms[name].pin == data.punchlinePin) {
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
	socket.on("getScores", function (pin) {
		let game = games.find((game) => game.pin === Number(pin.punchlinePin));
		// let scores = [];
		// game.players.forEach(player => {
		// 	scores[player.name] = player.points;
		// });


		if (game !== null) {
			let roomName = null;
				for (const name in rooms) {
					if (rooms[name].pin == pin.punchlinePin) {
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
	socket.on("endGame", function (pin) {
		let game = games.find((game) => game.pin === Number(pin.punchlinePin));
		// game.players.forEach((player) => {
		// 	let onLinePlayer = players.find(
		// 		(onLinePlayer) => onLinePlayer.id === player.id
		// 	);
		// 	// onLinePlayer.game = undefined;
		// 	players.splice(players.indexOf(onLinePlayer), 1);
		// });
		games.splice(games.indexOf(game), 1);
		// if (game.maxVotes == game.nbOfPlayers) {
		let roomName = null;
		for (const name in rooms) {
			if (rooms[name].pin == pin.punchlinePin) {
				roomName = name;
				break;
			}
		}
		// }

		socket.to(roomName).emit("redirect", "/html/index.html", "clear");
		delete rooms[roomName];

		// socket.broadcast.emit("redirect", "/html/index.html", "clear");
	});

	
});



const port = applicationPort;
server.listen(port, () => {
	console.log(`Server is running on http://localhost:${port}`);
});
