// const socket = io();


// Friendlier copy depending on what the player just did (flag set by prompt.js / votePrompt.js)
(function setWaitingCopy() {
	let title = document.getElementById("waitTitle");
	let text = document.getElementById("waitText");
	if (!title || !text) {
		return;
	}
	let lastAction = null;
	try {
		lastAction = sessionStorage.getItem("punchlineLastAction");
		sessionStorage.removeItem("punchlineLastAction");
	} catch (e) {
		// storage unavailable: keep the default copy
	}
	let from = document.referrer || "";
	if (lastAction === "answer") {
		title.textContent = "Answer sent!";
		text.textContent = "Waiting for the others to finish writing…";
	} else if (lastAction === "vote") {
		title.textContent = "Vote counted!";
		text.textContent = "Waiting for everyone to vote. Results on the big screen.";
	} else if (from.includes("/html/prompt.html")) {
		title.textContent = "Time's up!";
		text.textContent = "Too late for this one. Get ready to vote…";
	} else if (from.endsWith("/") || from.includes("/html/index.html")) {
		title.textContent = "You're in!";
		text.textContent = "The game starts soon. Keep an eye on the big screen.";
	}
})();

window.onload = function () {
	playerName = sessionStorage.getItem("playerName");
	punchlinePin = sessionStorage.getItem("punchlinePin");

	if (playerName && punchlinePin) {
		socket.emit("joinRoom", punchlinePin, playerName);
	} else {
		window.location = "/";
	}
};

socket.on("redirectDeletePlayer", (newGameURL, verb, playerNameID) => {
	
	if (verb === "deletePlayer" && playerNameID === playerName) {
		window.location = newGameURL;
	}
});
