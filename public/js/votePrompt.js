// const socket = io();

window.onload = function () {
	punchlinePin = sessionStorage.getItem("punchlinePin");
	playerName = sessionStorage.getItem("playerName");

	if (playerName && punchlinePin) {
		socket.emit("joinRoom", punchlinePin, playerName, playerToken());
		socket.emit("getAnswers", { pin: punchlinePin, playerName: playerName, token: playerToken() });
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
		// the server only sends a text, an opaque id and "yours" (no author before the votes reveal)
		let isOwn = element.yours === true;

		let answer = document.createElement("input");
		answer.setAttribute("type", "radio");
		// the id must not depend on the player's name (a name like "main" or "vote" would clash with the page ids)
		answer.id = "answer-" + index;
		answer.value = element.id;
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
			displayErrorMessage(error, "error.pickAnswer", null, document.getElementById("answers"));
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

// Time left to vote, sent by the server when the answers are asked for: counted down from the
// moment it is received (the clocks of the phone and of the server do not matter). At 0 the
// server closes the votes and sends the phone to the waiting page ("voteTimeUp" below).
var voteTimerElement = document.getElementById("voteTimer");
var voteTimerInterval = null;
// Also called by common.js when the page sync brings the time left (a phone that missed "voteTimer")
function applyVoteTimer(data) {
	if (!data || !voteTimerElement) {
		return;
	}
	let remainingMs = Number(data.remainingMs);
	if (!Number.isFinite(remainingMs)) {
		remainingMs = Number(data.remaining) * 1000;
	}
	if (!Number.isFinite(remainingMs)) {
		return;
	}
	let endAt = Date.now() + Math.max(0, remainingMs);
	clearInterval(voteTimerInterval);
	let tick = function () {
		let seconds = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
		voteTimerElement.textContent = seconds;
		voteTimerElement.classList.toggle("is-urgent", seconds <= 10);
		if (seconds === 0) {
			clearInterval(voteTimerInterval);
		}
	};
	tick();
	voteTimerElement.classList.remove("hidden");
	voteTimerInterval = setInterval(tick, 250);
}
window.applyVoteTimer = applyVoteTimer;
socket.on("voteTimer", applyVoteTimer);

// The votes are closed and this player did not vote: a toast on the waiting page ("redirect" follows)
socket.on("voteTimeUp", function (key) {
	clearInterval(voteTimerInterval);
	button.setAttribute("disabled", "disabled");
	rememberNotice(key);
	try {
		sessionStorage.setItem("punchlineLastAction", "voteLate");
	} catch (e) {
		// only used for the copy of the waiting screen
	}
});
