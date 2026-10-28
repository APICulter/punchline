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

// Character counter under the answer (the limit comes from the maxlength of the field)
const answerField = document.getElementById("answer");
const answerCount = document.getElementById("answerCount");

function updateAnswerCount() {
	if (!answerField || !answerCount) {
		return;
	}
	let max = answerField.maxLength > 0 ? answerField.maxLength : 99;
	let length = answerField.value.length;
	answerCount.textContent = length + "/" + max;
	answerCount.classList.toggle("is-near-limit", length >= max - 10);
}

if (answerField) {
	answerField.addEventListener("input", updateAnswerCount);
	updateAnswerCount();
}

// Sends the player'answer to the back end
function sendAnswer() {

	let answer = document.getElementById("answer");
	let error = document.getElementById("answerError");

	answer.value = answer.value.trim();

	if (answer.value.length == 0) {
		displayErrorMessage(error, "Write something first");
		updateAnswerCount();
		return;
	} else if (answer.value.length >= 100) {
		displayErrorMessage(error, "That answer is too long");
		return;
	} else {
		socket.emit("answer", {
			answer: DOMPurify.sanitize(answer.value),
			pin: DOMPurify.sanitize(punchlinePin),
			playerName: DOMPurify.sanitize(playerName),
		});
		try {
			sessionStorage.setItem("punchlineLastAction", "answer");
		} catch (e) {
			// only used for the copy of the waiting screen
		}
		// prevents sending the answer twice (re-enabled if the server refuses it)
		button.setAttribute("disabled", "disabled");
	}
}

// Displays error message coming from the backend if the answer is refused
socket.on("answerErrorMessages", function (data) {
	button.removeAttribute("disabled");
	try {
		sessionStorage.removeItem("punchlineLastAction");
	} catch (e) {}
	displayErrorMessage(document.getElementById("answerError"), data);
});
