var app = require("express")();
var http = require("http").Server(app);
var io = require("socket.io")(http);

const { Game } = require("./classes/game");
const { Player } = require("./classes/player");

app.get("/", function (req, res) {
	res.sendFile(__dirname + "/public/html/index.html");
});

rooms = [];
pins = [];
playerIds = 0;

var players = [];
var games = [];

io.on("connection", function (socket) {
	// console.log('A user connected');

	socket.on("setUsername", function (data) {
		//à corriger car on peut mettre deux fois le même nom...
		let exist = players.find((player) => player.name === data);
		if (typeof exist === "undefined") {
			let id = playerIds + 1;
			playerIds++;
			let player = new Player(id, data);
			players.push(player);
			socket.emit("userSet", { username: data });
		} else {
         socket.emit("userExists", 'ce nom est déjà pris');
      }
      
	});

	//Send message to everyone
	socket.on("msg", function (data) {
		io.sockets.emit("newmsg", data);
	});

	//Sends the pin game only to the creator of the game
	socket.on("createGame", function (data) {
		let game = new Game();
		let pin = Math.floor(Math.random() * 100);
		game.pin = pin;
		game.hostId = data.user;
		games.push(game);
		socket.emit("new pin", pin);
	});

	//A player joins a room if pin exists
	socket.on("joinRoom", function (data) {
		let pin = games.some((game) => game.pin === data.pin);
		if (pin) {
			let game = games.find((game) => game.pin === pin);
			game.players.push(players.find((player) => player.name === data.name));
			io.sockets.emit("joined", game);
		} else {
			io.sockets.emit("joined");
		}
	});

	//Send message to everyone
	socket.on("startGame", function (data) {
		//lance la game pour tous les joueurs dans la room
		//plus personne de nouveau ne peut entrer dans la room
		//le client qui a créé la game n'est pas joeur et sort du pool
		//appelle la fonction qui va s'occuper de l'algorithme principal du jeu
	});
});

http.listen(3000, function () {
	console.log("listening on localhost:3000");
});
