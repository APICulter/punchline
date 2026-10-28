// const socket = io();


window.onload = function () {
	playerName = sessionStorage.getItem("playerName");
	punchlinePin = sessionStorage.getItem("punchlinePin");

	if (playerName && punchlinePin) {
		socket.emit("joinRoom", punchlinePin, playerName);
	} else {
		window.location = "/";
	}
};

socket.on("redirectDeletePlayer", (newGameURL, verb, playerNameID) => {
	
	if (verb === "deletePlayer" && playerNameID === playerName) {
		window.location = newGameURL;
	}
});
