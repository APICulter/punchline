// const socket = io();
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

// Sends the player'answer to the back end
function sendAnswer() {

	let answer = document.getElementById("answer");
	let error = document.getElementById("answerError");

	answer.value = answer.value.trim();

	if (answer.value.length == 0) {
		displayErrorMessage(error, "please answer");
		return;
	} else if (answer.value.length >= 100) {
		displayErrorMessage(error, "answer too long");
		return;
	} else {
		socket.emit("answer", {
			answer: DOMPurify.sanitize(answer.value),
			pin: DOMPurify.sanitize(punchlinePin),
			playerName: DOMPurify.sanitize(playerName),
		});
		// prevents sending the answer twice (re-enabled if the server refuses it)
		button.setAttribute("disabled", "disabled");
	}
}

// Displays error message coming from the backend if the answer is refused
socket.on("answerErrorMessages", function (data) {
	button.removeAttribute("disabled");
	displayErrorMessage(document.getElementById("answerError"), data);
});
