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

socket.on("redirect", (newGameURL, clear) => {
	window.location = newGameURL;
	if (clear === "clear") {
		sessionStorage.clear();
	}
});

// function home() {
// 	window.location.href = "/";
// }
