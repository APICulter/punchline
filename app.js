var express = require("express");
var path = require("path");
var app = express();
var http = require("http").Server(app);
var io = require("socket.io")(http);
// import 'animate.css';

const { Game } = require("./classes/game");
const { Player } = require("./classes/player");

const publicPath = path.join(__dirname, "public");
app.get("/", function (req, res) {
	res.sendFile(__dirname + "/public/html/index.html");
});

app.use(express.static(publicPath));

rooms = [];
pins = [];
playerIds = 0;

var players = [];
var games = [];

io.on("connection", function (socket) {
	// console.log('A user connected');
	const ID = socket.id;

	socket.on("setUsername", function (data) {
		//à changer car on doit aussi regarder dans quelle game on se trouve
		let game =  games.find((game) => game.pin === Number(data.pin));
		let exist = game.players.find((player) => player.name === data.playerName);
		if (typeof exist === "undefined") {
			let id = playerIds + 1;
			playerIds++;
			let player = new Player(id, data.playerName, ID);
			game.players.push(player);
			socket.emit("userSet",  data, "/html/waiting.html");
			io.to(game.hostSocketId).emit("newJoiner", {user: data.playerName, pin: game.pin});
			// socket.emit("redirect", "/html/waiting.html", data.pin);
		} else {
			socket.emit("userExists", "Ce nom est déjà pris");
		}
	});

	//Send message to everyone
	socket.on("msg", function (data) {
		io.sockets.emit("newmsg", data);
	});

	//Sends the pin game only to the creator of the game
	//for now, the hostSocketId is used to now how is hosting the game, but the case of disconnect has not been made
	//Does the socket id change if the client reconnects ?
	socket.on("createGame", function () {
		let game = games.find((game) => game.hostSocketId === ID);
		if (typeof game === "undefined") {
			let game = new Game();
			//must check if pin already exist. important otherwise can be 2 games with same id !!!
			let pin = Math.floor(Math.random() * 100);
			game.pin = pin;
			game.hostSocketId = ID;
			games.push(game);
			socket.emit("newGame", pin);
		} else {
			socket.emit("game already exists", game.pin);
		}
	});

	
    // does the pin (game) exist ?
	socket.on("findRoomById", function (data) {
	let game = games.find((game) => game.pin === Number(data.pin));
	if (typeof game !== "undefined") {
		socket.emit("gamePinFound");
	}
	});

	//A player joins a room if pin exists
	socket.on("joinRoom", function (data) {
		let game = games.find((game) => game.pin === Number(data.pin));
		if (typeof game !== "undefined") {
			let player = game.players.find((player) => player.name === data.user);
			if (typeof player === "undefined") {
				game.players.push(players.find((player) => player.name === data.user));
				let onlinePlayer = players.find((player) => player.name === data.user);
				onlinePlayer.game = game.pin;
				// io.to(game.hostSocketId).emit('redirect', '/html/settings.html');
				io.to(game.hostSocketId).emit("newJoiner", {user: data.user, pin: game.pin});
				socket.emit("redirect", "/html/waiting.html", data.pin);
			} else {
				//utile?
				io.sockets.emit("player already joined");
			}
		} else {
			//utile ?
			io.sockets.emit("noGameFound");
		}
	});

	socket.on("startGame", function (data) {
		//lance la game pour tous les joueurs dans la room
		let game = games.find((game) => game.pin === Number(data.pin));
		game.nbOfPlayers = game.players.length;

		// socket.broadcast.emit("redirect", "/html/prompt.html");
		//emit ci dessous a deplacer dans la fonction de jeu
		socket.emit("redirect", "/html/game.html", data.pin);
		//plus aucun nouveau joueur ne peut entrer dans la room
		initQuestions(game);
		//ajouter la configuration => plus tard
		// socket.emit('question', game.questions );

		//init des votes
		// game.players.forEach((player) => {
		// 	game.votes[player.name] = 0;
		// });
		//le client qui a créé la game n'est pas joeur et sort du pool
		//appelle la fonction qui va s'occuper de l'algorithme principal du jeu
	});

	//à changer car on devrait pouvoir faire la séquence de questions de manière générique, et avec un meilleur nom
	socket.on("getQuestion", function (data) {
		let game = games.find((game) => game.pin === Number(data.punchlinePin));
		//condition pour checker s'il reste une question, sinon afficher le tableau de bord
		game.question++;
		if (game.question <= game.questions.length) {
			let question = game.questions[Number(game.question - 1)];
			game.answers = [];
			game.maxAnswers = 0;
			game.maxVotes = 0;
			// socket.broadcast.emit("redirect", "/html/prompt.html");
			socket.emit("question", question);
		} else {
			socket.broadcast.emit("redirect", "/html/waiting.html");
			socket.emit("redirect", "/html/scores.html");
		}
	});

	socket.on("startPrompt", function (data) {
		let game = games.find((game) => game.pin === Number(data.punchlinePin));
		socket.broadcast.emit("redirect", "/html/prompt.html");
	});

	socket.on("answer", function (data) {
		let game = games.find((game) => game.pin === Number(data.punchlinePin));
		let player = game.players.find((player) => player.name === data.playerName);
		if (game.maxAnswers < game.nbOfPlayers) {
			game.answers.push({
				// playerSocketId: ID,
				//a voir si la connexion est coupée...
				playerName: player.name,
				textAnswer: data.answer,
				votes: 0,
			});
			game.maxAnswers++;
			socket.emit("redirect", "/html/waiting.html");

			if (game.maxAnswers == game.nbOfPlayers) {
				//faire en sorte que tout le monde soit redirigé. ici broadcast
				// socket.broadcast.emit("redirect", "/html/waiting.html");
				// io.to(game.hostSocketId).emit("displayAnswers", game.answers);

				//à changer pour que émette uniquement vers la room
				io.emit("displayAnswers", shuffle(game.answers));
			}
		}
		// else {
		// 	socket.broadcast.emit("redirect", "/html/waiting.html");
		// 	// io.to(game.hostSocketId).emit("newJoiner", data.user);
		// }
	});

	socket.on("timeIsUpToAnswer", function (data) {
		let game = games.find((game) => game.pin === Number(data.punchlinePin));
		socket.broadcast.emit("redirect", "/html/waiting.html");
		if(game.answers.length <= 1) {
			io.emit("skipVoteQuestion", game.question);
		} else {
			io.emit("displayAnswers", shuffle(game.answers));
		}
	});

	// socket.on("timeIsUpToVote", function (data) {
	// 	let game = games.find((game) => game.pin === Number(data.punchlinePin));
	// 	socket.broadcast.emit("redirect", "/html/waiting.html");
	// 	io.emit("displayVotes", game.answers);
	// });

	

	function shuffle(array) {
		let counter = array.length;
	
		// While there are elements in the array
		while (counter > 0) {
			// Pick a random index
			let index = Math.floor(Math.random() * counter);
	
			// Decrease counter by 1
			counter--;
	
			// And swap the last element with it
			let temp = array[counter];
			array[counter] = array[index];
			array[index] = temp;
		}
	
		return array;
	}

	socket.on("getVotes", function (data) {
		// let game = games.find((game) => game.pin === Number(data.punchlinePin));
		socket.broadcast.emit("redirect", "/html/votePrompt.html");
		// socket.emit('redirect', '/html/votes.html');
	});

	socket.on("getAnswers", function (data) {
		let game = games.find((game) => game.pin === Number(data.punchlinePin));
		//mettre une condition pour éviter de faire planter si on revient sur la tab
			socket.emit("postAnswers", game.answers);
	});

	socket.on("vote", function (playerName, pin) {
		let game = games.find((game) => game.pin === Number(pin));
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
			io.emit("displayVotes", game.answers);
			//mettre les votes dans game.answers
		}
	});

	socket.on("getScores", function (pin) {
		let game = games.find((game) => game.pin === Number(pin.punchlinePin));
		// let scores = [];
		// game.players.forEach(player => {
		// 	scores[player.name] = player.points;
		// });

		//faire une méthode de classe statique ?
		let playersRankedByPoints = game.players;
		playersRankedByPoints.sort(function(a,b) { return parseFloat(b.points) - parseFloat(a.points) } );
		socket.emit("scores", game.players);
	});

	socket.on("endGame", function (pin) {
		let game = games.find((game) => game.pin === Number(pin.punchlinePin));
			game.players.forEach((player) => {
				let onLinePlayer = players.find(
					(onLinePlayer) => onLinePlayer.id === player.id
				);
				// onLinePlayer.game = undefined;
				players.splice(players.indexOf(onLinePlayer), 1);
			});
			games.splice(games.indexOf(game), 1);
		socket.broadcast.emit("redirect", "/html/index.html", "clear");
	});

	//Cherche les questions en BDD et les ajoute à la game
	function initQuestions(game) {
		//boucle
		// let goOn = true;
		// let indexLoop = 1;
		// while (goOn) {
		// 	game.questions.push({id: indexLoop, question: 'Pourquoi les poissons ?'});
		// 	indexLoop++;
		// 	if(indexLoop > 200) {
		// 		goOn = false;
		// 	}
		// }
		game.questions.push({ id: 1, question: "de quelle couleur est le ciel ?" });
		game.questions.push({ id: 2, question: "pourquoi les poulets ?" });
	}
});

http.listen(3000, function () {
	console.log("listening on localhost:3000");
});

//peut être mettre cette fonction à l'intérieur du  io.on("connection", function (socket) {
