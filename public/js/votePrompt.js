// const socket = io();

window.onload = function () {
	punchlinePin = sessionStorage.getItem("punchlinePin");
	playerName = sessionStorage.getItem("playerName");

	if (playerName && punchlinePin) {
		socket.emit("joinRoom", punchlinePin, playerName);
		socket.emit("getAnswers", { pin: punchlinePin });
	} else {
		window.location = "/";
	}
};

// displays everyone's answer on the phone, so that the player can vote for its favorite answer
socket.on("postAnswers", function (data) {
	if (!Array.isArray(data)) {
		return;
	}
	// avoids duplicated answers if the event is received twice
	document.getElementById("answers").replaceChildren();

	data.forEach((element, index) => {
		let isOwn = element.playerName == playerName;

		let answer = document.createElement("input");
		answer.setAttribute("type", "radio");
		// the id must not depend on the player's name (a name like "main" or "vote" would clash with the page ids)
		answer.id = "answer-" + index;
		answer.value = element.playerName;
		answer.name = "answer";
		answer.className = "sr-only";

		let label = document.createElement("label");
		label.setAttribute("for", answer.id);
		label.id = "label-" + index;
		label.className = "vote-option animate__animated animate__fadeInUp";
		label.style.animationDelay = Math.min(index, 8) * 60 + "ms";

		let answerBlock = document.createElement("div");
		answerBlock.id = "answerBlock-" + index;
		// tails alternate left / right, like a conversation
		answerBlock.className = index % 2 === 1 ? "bubble bubble--right" : "bubble";
		answerBlock.textContent = element.textAnswer;

		if (isOwn) {
			answer.setAttribute("disabled", "true");
			label.classList.add("is-own");
			let ownTag = document.createElement("span");
			ownTag.className = "own-tag";
			i18nText(ownTag, "vote.yours");
			label.append(ownTag);
		}

		document.getElementById("answers").append(answer);
		document.getElementById("answers").append(label);
		label.append(answerBlock);
	});
});

const button = document.querySelector("#vote");
button.addEventListener("click", function () {
	let answer = document.querySelector("input[name=answer]:checked");
	// nothing selected yet
	if (!answer) {
		let error = document.getElementById("voteError");
		if (error) {
			displayErrorMessage(error, "error.pickAnswer");
		}
		return;
	}
	try {
		sessionStorage.setItem("punchlineLastAction", "vote");
	} catch (e) {
		// only used for the copy of the waiting screen
	}
	// prevents voting twice
	button.setAttribute("disabled", "disabled");
	socket.emit("vote", answer.value, punchlinePin);
});
