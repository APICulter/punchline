const socket = io();
const button = document.getElementById("button");

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
		button.setAttribute("disabled", "disabled");
	} else {
		button.classList.add("invalid:border-red-500");
	}
}

function home() {
	window.location.href = "/";
}
