// const socket = io();
// import DOMPurify from 'dompurify';
// import DOMPurify from "isomorphic-dompurify";

let nbOfPlayers = 0;
var minNbOfPlayers = 2;
const forbiddenCaracters = ["&","~","\"","#","'","{","(","[","|","`","\\","@",")","]","=","+","¨","$","¤","£","%","*","µ",",","?",";",".",":","/","§","<",">"];
let gameCreationRequested = false;

// const playerNameElement = document.getElementById("player-name");

sessionStorage.clear();


/** Choose the player's name **/
function setUsername() {

	let playerName = document.getElementById("player-name");
	let pin = document.getElementById("pin");
	let error = document.getElementById("errorName");

	if (!playerName) {
		return;
	}

	playerName.value = playerName.value.trim();

	if (playerName.value.length == 0) {
		displayErrorMessage(error, "error.nameEmpty", null, playerName);
		return;
	} else if ( playerName.value.length > 22) {
		displayErrorMessage(error, "error.nameTooLong", null, playerName);
		return;
	} else {

		var result = forbiddenCaracters.filter((caracter) => playerName.value.includes(caracter));
		if (result.length > 0) {
			displayErrorMessage(error, "error.nameInvalidChars", { chars: result.join(" ") }, playerName);
			return;
		} else {
			socket.emit("setUsername", {
			playerName: DOMPurify.sanitize(playerName.value),
			pin: DOMPurify.sanitize(pin.value),
		});
		}

		
	}


}



// Displays error message coming from the backend if the PIN encounters a problem
socket.on("setUsernameErrorMessages", function (data) {
	let error = document.getElementById("errorName");
	if (error) {
		displayErrorMessage(error, data, null, document.getElementById("player-name"));
	}
});





socket.on("userSet", function (data, newGameURL) {
	sessionStorage.setItem("playerName", data.playerName);
	sessionStorage.setItem("punchlinePin", data.pin);
	window.location = newGameURL;
});

// Choose the player's name with Enter (key 13)
// (works for both a new player and a player rejoining a game in progress)
document.getElementById("name").addEventListener("keyup", function (event) {
	event.preventDefault();
	if (event.keyCode === 13) {
		let nameButton = document.getElementById("name-button");
		if (nameButton) {
			nameButton.click();
		}
	}
});

// Choose the gamePIN with Enter (key 13)
document.getElementById("roomPin").addEventListener("keyup", function (event) {
	event.preventDefault();
	if (event.keyCode === 13) {
		joinRoom();
	}
});

/** Creation of a game **/
function createGame() {
	// prevents creating several games with a double click
	if (gameCreationRequested) {
		return;
	}
	gameCreationRequested = true;

	if (window.PunchlineAudio) PunchlineAudio.start("lobby");
	socket.emit("createGame");
	document.getElementById("startButtons").classList.add("hidden");
	document.getElementById("join").classList.add("hidden");
	document.getElementById("tagline").classList.add("hidden");
	document.getElementById("hero").classList.remove("flex-1");
	document.getElementById("lobby").classList.remove("hidden");
	setRulesAnswerTime(document.getElementById("answerTime").value);
	setRulesVoteTime(document.getElementById("voteTime").value);
	socket.emit("getPunchlineURL", { origin: window.location.origin });
}

// The join address shown in the lobby (same URL as the one in the rules)
socket.on("sendPunchlineURL", function (data) {
	let lobbyURL = document.getElementById("lobbyURL");
	if (lobbyURL && data) {
		let address = String(data).replace(/^https?:\/\//, "").replace(/\/$/, "");
		// line breaks preferably after "." or "/" and before ":" (not in the middle of a number)
		lobbyURL.replaceChildren();
		address.replace(/[./]/g, "$&\n").replace(/:/g, "\n:").split("\n").forEach((part, index) => {
			if (index > 0) lobbyURL.append(document.createElement("wbr"));
			lobbyURL.append(part);
		});
	}
	if (data) {
		lobbyQR.baseURL = String(data);
		renderLobbyQR();
	}
});

/** Lobby QR code: the join link with the PIN (<punchlineURL>/?pin=1234), opened by the phones **/
const lobbyQR = { baseURL: null, pin: null, rendered: null };
const QR_DARK = "#2B1740"; // plum
const QR_LIGHT = "#FFF7F0"; // milk
const QR_QUIET_ZONE = 4; // modules, as required by the QR code standard

function lobbyJoinURL(baseURL, pin) {
	try {
		let url = new URL(baseURL, window.location.href);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			return null;
		}
		url.searchParams.set("pin", pin);
		return url.href;
	} catch (e) {
		return null;
	}
}

// Inline SVG (crisp at any size, on TVs too): one path, horizontal runs of dark modules
function qrCodeSVG(text) {
	let qr = qrcode(0, "M"); // smallest version that fits, error correction M
	qr.addData(text, "Byte");
	qr.make();
	let count = qr.getModuleCount();
	let size = count + 2 * QR_QUIET_ZONE;
	let d = "";
	for (let row = 0; row < count; row++) {
		for (let col = 0; col < count; col++) {
			if (!qr.isDark(row, col)) {
				continue;
			}
			let start = col;
			while (col + 1 < count && qr.isDark(row, col + 1)) {
				col++;
			}
			let length = col - start + 1;
			d += "M" + (start + QR_QUIET_ZONE) + " " + (row + QR_QUIET_ZONE) + "h" + length + "v1h-" + length + "z";
		}
	}

	const NS = "http://www.w3.org/2000/svg";
	let svg = document.createElementNS(NS, "svg");
	svg.setAttribute("viewBox", "0 0 " + size + " " + size);
	svg.setAttribute("shape-rendering", "crispEdges");
	svg.setAttribute("focusable", "false");
	let background = document.createElementNS(NS, "rect");
	background.setAttribute("width", size);
	background.setAttribute("height", size);
	background.setAttribute("fill", QR_LIGHT);
	let modules = document.createElementNS(NS, "path");
	modules.setAttribute("d", d);
	modules.setAttribute("fill", QR_DARK);
	svg.append(background, modules);
	return svg;
}

// Shown once both the address and the PIN are known, regenerated if one of them changes
function renderLobbyQR() {
	let figure = document.getElementById("lobbyQR");
	let container = document.getElementById("lobbyQRCode");
	let grid = document.getElementById("lobbyJoinGrid");
	if (!figure || !container || !lobbyQR.baseURL || !lobbyQR.pin || typeof qrcode !== "function") {
		return;
	}
	let joinURL = lobbyJoinURL(lobbyQR.baseURL, lobbyQR.pin);
	if (joinURL === lobbyQR.rendered) {
		return;
	}
	let svg = null;
	if (joinURL) {
		try {
			svg = qrCodeSVG(joinURL);
		} catch (e) {
			svg = null;
		}
	}
	if (!svg) {
		lobbyQR.rendered = null;
		container.replaceChildren();
		figure.classList.add("hidden");
		grid.classList.remove("lobby-join-grid--qr");
		return;
	}
	svg.setAttribute("role", "img");
	i18nAttr(svg, "aria-label", "lobby.qrLabel", { url: joinURL });
	container.replaceChildren(svg);
	figure.classList.remove("hidden");
	grid.classList.add("lobby-join-grid--qr");
	lobbyQR.rendered = joinURL;
}

// Big PIN tiles in the lobby, readable from across the room
function displayLobbyPin(pin) {
	let lobbyPin = document.getElementById("lobbyPin");
	lobbyPin.replaceChildren();
	String(pin).split("").forEach((digit) => {
		let tile = document.createElement("span");
		tile.className =
			"grid h-20 w-16 place-items-center rounded-2xl bg-butter text-5xl font-extrabold tabular-nums text-plum sm:h-24 sm:w-20 sm:text-6xl";
		tile.textContent = digit;
		lobbyPin.append(tile);
	});
}

socket.on("newGame", function (data, token) {
	// the host token: this screen drives the game (lobby, game and scores pages)
	saveHostToken(token);
	document.getElementById("punchlinePin").textContent = data;
	document.getElementById("punchlinePin").classList.remove("invisible");
	displayLobbyPin(data);
	lobbyQR.pin = String(data);
	renderLobbyQR();

	sessionStorage.setItem("punchlinePin", data);
});

function joinGameInit() {
	document.getElementById("startButtons").classList.add("hidden");
	document.getElementById("join").classList.remove("hidden");
	document.getElementById("roomPin").focus();

}


socket.on("gameExists", function (data) {
	// implement some code
	socket.emit("createGame");
});



// Join a room
function joinRoom() {

	let roomPin = document.getElementById("roomPin");
	let error = document.getElementById("errorPin");

	hideRejoinEmpty();

	// Validation
	if (roomPin.value.length == 0) {
		displayErrorMessage(error, "error.pinEmpty", null, roomPin);
		return;
	} else if (!/^[0-9]+$/.test(roomPin.value)) {
		displayErrorMessage(error, "error.pinDigitsOnly", null, roomPin);
		return;
	} else if (roomPin.value.length != 4) {
		displayErrorMessage(error, "error.pinLength", null, roomPin);
		return;
	} else {
		let payload = { pin: DOMPurify.sanitize(roomPin.value) };
		// this phone already plays in that game: the server offers to take the place back
		let saved = readSavedSession();
		if (saved && saved.pin === payload.pin) {
			payload.playerName = saved.playerName;
			payload.token = saved.token;
		}
		socket.emit("findRoomById", payload);
	}
}

/* "Rejoin as <name>": this phone joined a game less than 6 hours ago (rejoin token saved by
   common.js) and that game still has this player. Shown on the home page and after typing the PIN
   of that game; the QR code link of that game rejoins directly. "That's not me" forgets the
   saved session (shared phone) and goes on with the usual steps. */
let resumeRequested = false;
let resumeFallback = null; // what to do if the token is refused

function resumeSession(saved, fallback) {
	if (resumeRequested) {
		return;
	}
	resumeRequested = true;
	resumeFallback = fallback || null;
	socket.emit("resumeSession", { pin: saved.pin, playerName: saved.playerName, token: saved.token });
}

socket.on("resumeFailed", function (key) {
	resumeRequested = false;
	forgetSavedSession();
	removeResumeOffer();
	let fallback = resumeFallback;
	resumeFallback = null;
	if (fallback) {
		fallback(key);
	} else {
		showHomeChoices();
		displayErrorMessage(document.getElementById("errorPin"), key);
	}
});

function removeResumeOffer() {
	let offer = document.getElementById("resumeOffer");
	if (offer) {
		offer.remove();
	}
}

function showHomeChoices() {
	document.getElementById("startButtons").classList.remove("hidden");
	document.getElementById("tagline").classList.remove("hidden");
}

function showResumeOffer(saved, onNotMe) {
	removeResumeOffer();
	document.getElementById("startButtons").classList.add("hidden");
	document.getElementById("join").classList.add("hidden");
	document.getElementById("tagline").classList.add("hidden");

	let offer = document.createElement("div");
	offer.id = "resumeOffer";
	offer.className = "panel mx-auto flex w-full max-w-md flex-col gap-4 animate__animated animate__fadeInUp";

	let title = document.createElement("h2");
	title.className = "panel-title";
	i18nText(title, "resume.title");

	let hint = document.createElement("p");
	hint.className = "muted -mt-2";
	i18nText(hint, "resume.hint", { pin: saved.pin });

	let resumeButton = document.createElement("button");
	resumeButton.id = "resumeButton";
	resumeButton.type = "button";
	resumeButton.className = "btn btn-primary btn-lg btn-block btn-wrap";
	// the name only goes through the translation parameters (text, never HTML)
	i18nText(resumeButton, "resume.button", { name: saved.playerName });
	resumeButton.addEventListener("click", function () {
		resumeButton.disabled = true;
		resumeSession(saved, function (key) {
			// refused (game over, player removed, replaced): back to the home page
			showHomeChoices();
			displayErrorMessage(document.getElementById("errorPin"), key);
		});
	});

	let notMeButton = document.createElement("button");
	notMeButton.id = "notMeButton";
	notMeButton.type = "button";
	notMeButton.className = "btn btn-secondary btn-block";
	i18nText(notMeButton, "resume.notMe");
	notMeButton.addEventListener("click", function () {
		forgetSavedSession();
		removeResumeOffer();
		onNotMe();
	});

	offer.append(title, hint, resumeButton, notMeButton);
	document.getElementById("createOrJoin").prepend(offer);
	resumeButton.focus();
}

// Home page opened again (no PIN in the link) with a saved session: is that game still on?
socket.on("sessionStatus", function (status) {
	let saved = readSavedSession();
	if (!saved) {
		return;
	}
	if (!status || !status.valid || status.pin !== saved.pin || status.playerName !== saved.playerName) {
		forgetSavedSession();
		return;
	}
	// the player already went on (clicked "Join a game" or "Create a game")
	if (!document.querySelector("#choice") || document.getElementById("startButtons").classList.contains("hidden")) {
		return;
	}
	showResumeOffer(saved, showHomeChoices);
});

// "All the players of this game are connected": shown under the PIN field, which stays usable
function showRejoinEmpty() {
	let joinPanel = document.querySelector("#join .panel");
	if (!joinPanel) {
		return;
	}
	document.getElementById("startButtons").classList.add("hidden");
	document.getElementById("join").classList.remove("hidden");
	let box = document.getElementById("rejoinEmpty");
	if (!box) {
		box = document.createElement("div");
		box.id = "rejoinEmpty";
		box.className = "callout animate__animated animate__fadeIn";
		box.setAttribute("role", "status");
		let title = document.createElement("p");
		title.className = "font-extrabold";
		i18nText(title, "rejoin.empty.title");
		let text = document.createElement("p");
		text.className = "mt-1";
		i18nText(text, "rejoin.empty.text");
		box.append(title, text);
		joinPanel.append(box);
	}
	let roomPin = document.getElementById("roomPin");
	roomPin.focus();
	roomPin.select();
}

function hideRejoinEmpty() {
	let box = document.getElementById("rejoinEmpty");
	if (box) {
		box.remove();
	}
}

// Link from the lobby QR code (/?pin=1234): straight to the join step with the PIN filled in
// and submitted the same way as typed (on error the toast shows and the field stays editable).
// The PIN is removed from the address bar first, so a refresh or "back" doesn't submit it again.
// A phone that already plays in that game (saved session) goes straight back into it.
(function joinFromLink() {
	let params;
	try {
		params = new URLSearchParams(window.location.search);
	} catch (e) {
		params = null;
	}
	let saved = readSavedSession();
	if (!params || !params.has("pin")) {
		// home page: offer to rejoin the game this phone was playing in
		if (saved) {
			socket.emit("checkSession", { pin: saved.pin, playerName: saved.playerName, token: saved.token });
		}
		return;
	}
	let pin = String(params.get("pin") || "").trim().slice(0, 12);

	params.delete("pin");
	try {
		let query = params.toString();
		history.replaceState(history.state, "", window.location.pathname + (query ? "?" + query : "") + window.location.hash);
	} catch (e) {}

	joinGameInit();
	document.getElementById("roomPin").value = pin;
	if (saved && saved.pin === pin) {
		// token refused (game over, player removed): the usual join steps
		resumeSession(saved, function () {
			joinRoom();
		});
		return;
	}
	joinRoom();
})();

// Displays error message coming from the backend if the PIN encounters a problem
socket.on("findRoomByIdErrorMessages", function (data) {
	displayErrorMessage(document.getElementById("errorPin"), data, null, "roomPin");
	let nameError = document.getElementById("errorName");
	if (nameError && data === "error.playerConnected") {
		displayErrorMessage(nameError, data);
	}
});

// The radio buttons of the players that can be picked (names only, no connected player)
function fillNameList(list, players) {
	list.replaceChildren();
	players.forEach((element, index) => {
		let player = document.createElement("input");
		player.setAttribute("type", "radio");
		// the id must not depend on the player's name (a name like "main" or "pin" would clash with the page ids)
		player.id = "player-" + index;
		player.value = element.name;
		player.name = "player";
		player.className = "sr-only";

		let label = document.createElement("label");
		label.setAttribute("for", player.id);
		label.id = "label-" + index;

		let playerBlock = document.createElement("div");
		playerBlock.className = "choice-option";
		playerBlock.textContent = element.name;
		label.append(playerBlock);

		list.append(player);
		list.append(label);
	});
}

// Displays the elements to enter the player's name once he/she has joined the room or if he/she reconnects to the game
// extra: { resume: name of this phone's player (valid saved token) or null, refresh: true when the
// list is sent again after a refused pick }
socket.on("gamePinFound", function (pin, inGame, players, extra) {
	players = Array.isArray(players) ? players : [];
	extra = extra && typeof extra === "object" ? extra : {};

	if (extra.refresh) {
		let list = document.getElementById("nameList");
		if (list && players.length > 0) {
			fillNameList(list, players);
		} else if (list) {
			// nobody left to pick: back to the PIN step with the message
			window.location.replace("/?pin=" + encodeURIComponent(pin));
		}
		return;
	}

	// the name selection is already displayed (e.g. "Join" clicked twice)
	if (!document.querySelector("#choice") || document.getElementById("resumeOffer")) {
		return;
	}

	let saved = readSavedSession();
	if (extra.resume && saved && saved.pin === String(pin) && saved.playerName === extra.resume) {
		showResumeOffer(saved, function () {
			document.getElementById("join").classList.remove("hidden");
			showNameStep(pin, inGame, players);
		});
		return;
	}
	showNameStep(pin, inGame, players);
});

function showNameStep(pin, inGame, players) {
	if (!document.querySelector("#choice")) {
		return;
	}
	// game in progress and every player is connected: nobody to pick
	if (inGame && players.length === 0) {
		showRejoinEmpty();
		return;
	}

	document.querySelector("#pin").setAttribute("value", pin);

	document.querySelector("#choice").remove();
	document.getElementById("tagline").classList.add("hidden");

	let nameBox = document.querySelector("#name");
	nameBox.classList.remove("hidden");

	let panel = document.createElement("div");
	panel.className = "panel flex flex-col gap-4";
	nameBox.append(panel);

	let title = document.createElement("h2");
	title.className = "panel-title";
	panel.append(title);

	let hint = document.createElement("p");
	hint.className = "muted -mt-2";
	panel.append(hint);

	let errorContainer = document.createElement("div");
	errorContainer.id = "errorName";
	errorContainer.setAttribute("role", "alert");
	errorContainer.className = "toast pointer-events-none hidden animate__animated animate__fadeInDown";

	if (!inGame) {
		i18nText(title, "name.title");
		i18nText(hint, "name.hint");

		let playerName = document.createElement("input");
		playerName.id = "player-name";
		playerName.type = "text";
		playerName.name = "player-name";
		playerName.value = "";
		playerName.maxLength = 21;
		i18nAttr(playerName, "placeholder", "name.placeholder");
		playerName.autocomplete = "nickname";
		playerName.setAttribute("autocapitalize", "words");
		playerName.setAttribute("enterkeyhint", "go");
		i18nAttr(playerName, "aria-label", "name.placeholder");
		playerName.className = "field";
		panel.append(playerName);

		let nameButton = document.createElement("button");
		nameButton.id = "name-button";
		nameButton.type = "button";
		nameButton.name = "button";
		i18nText(nameButton, "name.go");
		nameButton.addEventListener("click", setUsername);
		nameButton.className = "btn btn-primary btn-block";
		panel.append(nameButton);
		panel.append(errorContainer);

		playerName.focus();
	} else {
		i18nText(title, "rejoin.title");
		i18nText(hint, "rejoin.hint");

		let availablePlayers = document.createElement("div");
		availablePlayers.id = "nameList";
		availablePlayers.className = "flex flex-col gap-3";
		availablePlayers.setAttribute("role", "radiogroup");
		panel.append(availablePlayers);
		fillNameList(availablePlayers, players);

		let nameButton = document.createElement("button");
		nameButton.id = "name-button";
		nameButton.type = "button";
		nameButton.name = "button";
		i18nText(nameButton, "rejoin.button");
		nameButton.className = "btn btn-primary btn-block";
		panel.append(nameButton);
		panel.append(errorContainer);

		nameButton.addEventListener("click", function () {
			let checkedPlayer = document.querySelector("input[name=player]:checked");
			if (!checkedPlayer) {
				displayErrorMessage(errorContainer, "error.pickName");
				return;
			}
			socket.emit("joinGame", document.querySelector("#pin").value, checkedPlayer.value);
		});
	}
}

// Displays the new player in the room with a delete button to remove him/her if needed
socket.on("newJoiner", function (data) {
	if (data) {
		// if (document.getElementById("players-table").classList.contains("hidden")) {
		// 	document.getElementById("players-table").classList.remove("hidden");
		// }
		nbOfPlayers += 1;
		updateNbOfPlayers();
		if (window.PunchlineAudio) PunchlineAudio.sfx("join");
		let playerBlock = document.createElement("div");
		playerBlock.id = data.playerId;
		playerBlock.className = "chip animate__animated animate__bounceIn";

		let playerText = document.createElement("span");
		playerText.className = "chip-name";
		playerText.textContent = data.playerName;
		playerBlock.append(playerText);

		// must stay a direct child of playerBlock (deletePlayer reads the parent id)
		let deleteButton = document.createElement("button");
		deleteButton.type = "button";
		deleteButton.className = "chip-remove";
		// the player's name only goes through the translation parameters (set as an attribute, never as HTML)
		i18nAttr(deleteButton, "aria-label", "lobby.remove", { name: data.playerName });
		deleteButton.addEventListener("click", function () {
			deletePlayer(deleteButton);
		});
		deleteButton.innerHTML =
			'<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
		playerBlock.append(deleteButton);

		document.getElementById("players").append(playerBlock);
	}
});

// deletes a player on the back-end side
function deletePlayer(selfElement) {
	socket.emit("deletePlayer", {
		pin: sessionStorage.getItem("punchlinePin"),
		playerId: selfElement.parentElement.getAttribute("id"),
	});
}

function updateNbOfPlayers() {
	document.getElementById("playerCounter").textContent = nbOfPlayers;
	i18nText(document.getElementById("playerCounterLabel"), "lobby.joined", { count: nbOfPlayers });
}

// Lobby sliders: the answer and vote times chosen by the host are also shown in the rules
document.getElementById("answerTime").addEventListener("input", function () {
	setRulesAnswerTime(this.value);
});
document.getElementById("voteTime").addEventListener("input", function () {
	setRulesVoteTime(this.value);
});


// deletes the display of a player (front end side)
socket.on("playerDeleted", function (data) {
	let playerBlock = document.getElementById(data);
	if (!playerBlock) {
		return;
	}
	playerBlock.remove();
	nbOfPlayers -= 1;
	updateNbOfPlayers();
	// if (document.getElementById("players").childElementCount === 0) {
	// 	document.getElementById("players-table").classList.add("hidden");
	// }
});

// Start of the game
function startGame() {

	// check premium code if selected
	let premiumCode = document.getElementById("secretCode");
	let error = document.getElementById("startGameError");


	if (premiumCode.value.length == 0 &&
		isPremiumMode()) {
		displayErrorMessage(error, "error.premiumCodeEmpty", null, premiumCode);
		return;
	
	// check the number of players
	} else if (premiumCode.value.length > 15 &&
		isPremiumMode()) {
		displayErrorMessage(error, "error.premiumCodeTooLong", null, premiumCode);
		return;
	} else if (nbOfPlayers < minNbOfPlayers) {
		displayErrorMessage(error, "error.notEnoughPlayers", { count: minNbOfPlayers });
		return;

	} else {
		// prevents starting the game twice with a double click (re-enabled on error)
		document.getElementById("startGame").disabled = true;
		socket.emit("startGame", {
			pin: DOMPurify.sanitize(document.getElementById("punchlinePin").textContent),
			nbOfQuestions: DOMPurify.sanitize(document.getElementById("nbOfQuestionsValue").textContent),
			secretCode: DOMPurify.sanitize(premiumCode.value),
			premiumMode:
			DOMPurify.sanitize(isPremiumMode()),
			// timers in seconds
			answerTime: DOMPurify.sanitize(document.getElementById("answerTime").value),
			revealTime: DOMPurify.sanitize(document.getElementById("revealTime").value),
			voteTime: DOMPurify.sanitize(document.getElementById("voteTime").value),
			// language of the questions: the host's interface language
			lang: typeof getLang === "function" ? getLang() : "fr",
		});
	}


	
}

socket.on("startGameErrorMessages", function (data) {
	document.getElementById("startGame").disabled = false;
	// a refused premium code: its field shakes too
	let premiumError = typeof data === "string" && data.indexOf("error.premium") === 0;
	displayErrorMessage(document.getElementById("startGameError"), data, null, premiumError ? "secretCode" : null);
});

// The game starts with fewer rounds than asked (not enough questions in this language):
// the message is shown as a toast on the game page (the "redirect" follows)
socket.on("startGameNotice", function (key) {
	rememberNotice(key);
});


let secretCode = document.getElementById("secretCode");

// Is the premium mode selected ?
function isPremiumMode() {
	return document.getElementById("premiumMode").checked;
}

// To change between classic mode and premium mode
function changeMode() {
	let radio = document.querySelector("input[name=modeSelection]:checked").value;
	
	if (radio == "premium") {
		secretCode.classList.remove("hidden");
		secretCode.focus();
	} else {
		secretCode.classList.add("hidden");
	}
}

// Displays an error message if the players tries to join and the room is full
socket.on("errorRoomFull", function (data) {
	displayErrorMessage(document.getElementById("maxNbOfPlayersReached"), data, null, "roomPin");
	
});

/* Controls of the markup (no inline onclick / oninput: the Content-Security-Policy of the game
   pages forbids inline scripts) */
(function bindHomeControls() {
	function on(id, event, handler) {
		let element = document.getElementById(id);
		if (element) element.addEventListener(event, handler);
	}
	on("createGame", "click", createGame);
	on("joinGameInit", "click", joinGameInit);
	on("joinRoomButton", "click", joinRoom);
	on("startGame", "click", startGame);
	on("normalMode", "click", changeMode);
	on("premiumMode", "click", changeMode);

	// lobby sliders: the value next to each one (m:ss for the times)
	function minutes(value) {
		return Math.floor(value / 60) + ":" + String(value % 60).padStart(2, "0");
	}
	on("nbOfQuestions", "input", function () {
		document.getElementById("nbOfQuestionsValue").value = this.value;
	});
	["answerTime", "revealTime", "voteTime"].forEach(function (id) {
		on(id, "input", function () {
			document.getElementById(id + "Value").value = minutes(this.value);
		});
	});
})();
