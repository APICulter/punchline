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
	
	if ((verb === "deletePlayer" && playerNameID === playerName)) {
	// if (verb === "clear" || (verb === "deletePlayer" && playerNameID === playerName) || (verb == null && playerNameID == null)) {
		window.location = newGameURL;
	}
});

// function home() {
// 	window.location.href = "/";
// }
