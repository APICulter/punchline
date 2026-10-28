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
		let answer = document.createElement("input");
		answer.setAttribute("type", "radio");
		// the id must not depend on the player's name (a name like "main" or "vote" would clash with the page ids)
		answer.id = "answer-" + index;
		answer.value = element.playerName;
		answer.name = "answer";
		answer.className += "invisible";

		let answerBlock = document.createElement("div");
		answerBlock.id = "answerBlock-" + index;
		answerBlock.className +=
			" cursor-pointer text-left p-2 bg-indigo-400 rounded-md shadow text-gray-200 max-w-lg checked:bg-blue-500 w-full break-words";
		if (element.playerName == playerName) {
			answer.setAttribute("disabled", "true");
			answerBlock.classList.remove("bg-indigo-400");
			answerBlock.classList.add("bg-stone-600");
		}
		answerBlock.textContent = element.textAnswer;

		let label = document.createElement("label");
		label.setAttribute("for", answer.id);
		label.id = "label-" + index;
		label.className = "w-11/12";

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
		return;
	}
	// prevents voting twice
	button.setAttribute("disabled", "disabled");
	socket.emit("vote", answer.value, punchlinePin);
});
