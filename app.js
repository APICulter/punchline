var express = require("express");
var path = require("path");
var app = express();
var http = require("http").Server(app);
var io = require("socket.io")(http);

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
		//à corriger car on peut mettre deux fois le même nom...
		let exist = players.find((player) => player.name === data);
		if (typeof exist === "undefined") {
			let id = playerIds + 1;
			playerIds++;
			let player = new Player(id, data, ID);
			players.push(player);
			socket.emit("userSet", { username: data });
		} else {
			socket.emit("userExists", "ce nom est déjà pris");
		}
	});

	//Send message to everyone
	socket.on("msg", function (data) {
		io.sockets.emit("newmsg", data);
	});

	//Sends the pin game only to the creator of the game
	//for now, the hostSocketId is used to now how is hosting the game, but the case of disconnect has not been made
	//Does the socket id change if the client reconnects ?
	socket.on("createGame", function (data) {
		let game = games.find((game) => game.hostSocketId === ID);
		if (typeof game === "undefined") {
			let game = new Game();
			//must check if pin already exist. important otherwise can be 2 games with same id !!!
			let pin = Math.floor(Math.random() * 100);
			game.pin = pin;
			game.hostSocketId = ID;
			games.push(game);
			socket.emit("new pin", pin);
		} else {
			socket.emit("game already exists", game.pin);
		}
	});

	//A player joins a room if pin exists
	socket.on("joinRoom", function (data) {
		let game = games.find((game) => game.pin === Number(data.pin));
		if (typeof game !== "undefined") {
			let player = game.players.find((player) => player.name === data.user);
			if (typeof player === "undefined") {
				game.players.push(players.find((player) => player.name === data.user));
				// io.to(game.hostSocketId).emit('redirect', '/html/settings.html');
				io.to(game.hostSocketId).emit("newJoiner", data.user);
				socket.emit("redirect", "/html/waiting.html");
			} else {
				//utile?
				io.sockets.emit("player already joined");
			}
		} else {
			//utile ?
			io.sockets.emit("no game found");
		}
	});

	//Send message to everyone
	socket.on("startGame", function (data) {
		//lance la game pour tous les joueurs dans la room
		socket.broadcast.emit("redirect", "/html/prompt.html");
		socket.broadcast.emit("game-pin", data);
		socket.emit('redirect', "/html/game.html" );
		//plus aucun nouveau joueur ne peut entrer dans la room
		
		
		//le client qui a créé la game n'est pas joeur et sort du pool
		//appelle la fonction qui va s'occuper de l'algorithme principal du jeu
	});

	socket.on('answer', function(data){
		let game = games.find((game) => game.pin === Number(data.pin));

		game.answers.push({
			playerSocketId: ID, 
			//a voir si la connexion est coupée...
			playerName: game.players.find((player) => player.socketId === ID),
			textAnswer: data.answer
			});
	});
});

http.listen(3000, function () {
	console.log("listening on localhost:3000");
});


