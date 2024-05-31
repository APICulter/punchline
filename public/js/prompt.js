const socket = io();
let punchlinePin;
let playerName;

window.onload = function () {
	playerName = sessionStorage.getItem("playerName");
	punchlinePin = sessionStorage.getItem("punchlinePin");

	if (playerName && punchlinePin) {
		socket.emit("joinRoom", punchlinePin, playerName);
	} else {
		window.location = "/";
	}
};

socket.on("redirect", (newGameURL) => {
	window.location = newGameURL;
});

// Sends the player'answer to the back end
function sendAnswer() {
	if (document.getElementById("answer").value.length > 0) {
		socket.emit("answer", {
			answer: document.getElementById("answer").value,
			punchlinePin: punchlinePin,
			playerName: playerName,
		});
		document.getElementById("button").setAttribute("disabled", "disabled");
	} else {
		document.getElementById("button").classList.add("invalid:border-red-500");
	}
}

function home() {
	window.location.href = "/";
}
