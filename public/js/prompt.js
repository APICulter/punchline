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

	document.getElementById("answer").focus();
};

socket.on("redirect", (newGameURL) => {
	window.location = newGameURL;
});


// Sends the player'answer to the back end
function sendAnswer() {

	let answer = document.getElementById("answer");
	let error = document.getElementById("answerError");

	if (answer.value.length == 0) {
		displayErrorMessage(error, "please answer");
		button.classList.add("invalid:border-red-500");
		return;
	} else if (answer.value.length >= 100) {
		displayErrorMessage(error, "answer too long");
		button.classList.add("invalid:border-red-500");
		return;
	} else {
		socket.emit("answer", {
			answer: DOMPurify.sanitize(answer.value),
			pin: DOMPurify.sanitize(punchlinePin),
			playerName: DOMPurify.sanitize(playerName),
		});
		button.setAttribute("disabled", "disabled");
	}

}

function home() {
	window.location.href = "/";
}
