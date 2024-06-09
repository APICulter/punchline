const socket = io();


window.onload = function () {
	playerName = sessionStorage.getItem("playerName");
	punchlinePin = sessionStorage.getItem("punchlinePin");

	if (playerName && punchlinePin) {
		socket.emit("joinRoom", punchlinePin, playerName);
	} else {
		window.location = "/";
	}
};

socket.on("redirect", (newGameURL, verb, playerNameID) => {
	
	if (verb === "clear" || (verb === "deletePlayer" && playerNameID === playerName)) {
		window.location = newGameURL;
		sessionStorage.clear();
	}
});

// function home() {
// 	window.location.href = "/";
// }
