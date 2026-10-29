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
	let copy = null;
	if (lastAction === "answer") {
		copy = "wait.answer";
	} else if (lastAction === "vote") {
		copy = "wait.vote";
	} else if (lastAction === "voteLate") {
		copy = "wait.voteLate";
	} else if (from.includes("/html/prompt.html")) {
		copy = "wait.late";
	} else if (from.endsWith("/") || from.includes("/html/index.html")) {
		copy = "wait.in";
	}
	// translation keys: the copy follows a language change
	if (copy) {
		i18nText(title, copy + ".title");
		i18nText(text, copy + ".text");
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
