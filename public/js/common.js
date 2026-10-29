// Reconnections (network loss, server restart): the socket id changes, so the page tells the
// server again which game / player it belongs to. The handshake carries the PIN and the player
// name (the server rejoins before handling any event sent while offline), then "joinRoom" is sent
// again, as on page load. No player name = the host's screen.
let socketConnectedOnce = false;
function storedSession() {
	try {
		return {
			pin: sessionStorage.getItem("punchlinePin"),
			playerName: sessionStorage.getItem("playerName"),
		};
	} catch (e) {
		return { pin: null, playerName: null };
	}
}
const socket = io({
	auth: function (cb) {
		const session = storedSession();
		cb(socketConnectedOnce && session.pin ? { rejoin: true, pin: session.pin, playerName: session.playerName || "" } : {});
	},
});
socket.on("connect", function () {
	if (socketConnectedOnce) {
		const session = storedSession();
		if (session.pin) {
			socket.emit("joinRoom", session.pin, session.playerName || undefined);
		}
	}
	socketConnectedOnce = true;
});

// Message to show once the next page is loaded (game stopped by an error or by an admin,
// game resumed after a server restart). Read before index.js clears the session storage.
var NOTICE_KEY = "punchlineNotice";
var pendingNotice = null;
try {
	pendingNotice = sessionStorage.getItem(NOTICE_KEY);
	sessionStorage.removeItem(NOTICE_KEY);
} catch (e) {}

function rememberNotice(key) {
	if (typeof key !== "string" || key.length === 0 || key.length > 100) {
		return;
	}
	try {
		sessionStorage.setItem(NOTICE_KEY, key);
	} catch (e) {}
}

// The server stops this game (bug in the game, or an admin ended it); a "redirect" home follows
socket.on("gameAborted", rememberNotice);
// The server restarted and picks the game up again; a "redirect" follows
socket.on("gameResumed", rememberNotice);

// Toast at the top of the page for a few seconds ("key" is translated, any other text shown as is)
function showNotice(key) {
	let toast = document.createElement("div");
	toast.id = "notice";
	toast.setAttribute("role", "status");
	toast.className = "toast pointer-events-none animate__animated animate__fadeInDown";
	if (window.PunchlineI18n && PunchlineI18n.has(key)) {
		i18nText(toast, key);
	} else {
		toast.textContent = String(key);
	}
	document.body.append(toast);
	setTimeout(function () {
		toast.classList.remove("animate__fadeInDown");
		toast.classList.add("animate__fadeOutRight");
		setTimeout(function () {
			toast.remove();
		}, 1000);
	}, 7000);
}

let punchlinePin;
let playerName;
var punchlinePinElement = document.getElementById("punchlinePin");


// Rules var
var modalRules = document.getElementById("rulesModal");
var rules = document.getElementById("rules");
var exitRulesX = document.getElementById("closeRules");
var exitRules = document.getElementById("exitRules");
var mainDiv = document.getElementById("main");
var errorMessages = document.getElementById("errorMessages");


// when the page is fully charged
window.addEventListener('load', function() {

	if (pendingNotice) {
		showNotice(pendingNotice);
		pendingNotice = null;
	}

	punchlinePin = sessionStorage.getItem("punchlinePin");
    if (punchlinePin) {
        punchlinePinElement.textContent = punchlinePin;
		punchlinePinElement.classList.remove("invisible");
    }

	// Link to the game in the rules panel
	if (document.getElementById("gameURL")) {
		socket.emit("getPunchlineURL");
	}

	// Answer time of the current game, shown in the rules (and on the answer screen)
	if (punchlinePin) {
		socket.emit("getConfig", { pin: punchlinePin });
	}
});

// Rules step 3: the actual answer time when it is known, otherwise a generic sentence
function setRulesAnswerTime(seconds) {
	let step = document.getElementById("rulesAnswerTime");
	if (!step) {
		return;
	}
	seconds = Number(seconds);
	if (seconds > 0) {
		i18nText(step, "rules.step3.known", { seconds: seconds });
	} else {
		i18nText(step, "rules.step3");
	}
}

// [answer time, before question countdown, vote countdown, reveal time] in seconds
socket.on("getConfigResponse", function (data) {
	if (Array.isArray(data) && data[0]) {
		setRulesAnswerTime(data[0]);
	}
});

// get Punchline URL (rules panel)
socket.on("sendPunchlineURL", function (data) {
	let gameURL = document.getElementById("gameURL");
	if (gameURL) {
		gameURL.setAttribute("href", data);
	}
});


// When the user clicks the button, open the modal
rules.onclick = function () {
	modalRules.classList.remove("hidden");
	mainDiv.classList.add("hidden");
};

// When the user clicks on <span> (x), close the modal
exitRulesX.onclick = function () {
	modalRules.classList.add("hidden");
	mainDiv.classList.remove("hidden");
	window.scrollTo(0, 0);
	if (errorMessages) errorMessages.classList.add("hidden");
};

exitRules.onclick = function () {
	modalRules.classList.add("hidden");
	mainDiv.classList.remove("hidden");
	window.scrollTo(0, 0);
	if (errorMessages) errorMessages.classList.add("hidden");
};

// When the user clicks anywhere outside of the modal, close it
window.onclick = function (event) {
	if (event.target == modalRules) {
		modalRules.classList.add("hidden");
		mainDiv.classList.remove("hidden");
		window.scrollTo(0, 0);
		if (errorMessages) errorMessages.classList.add("hidden");
	}
};




// To go back to the lobby
function home() {
	let pin = punchlinePin || sessionStorage.getItem("punchlinePin");
	playerName = sessionStorage.getItem("playerName");
	// the host ends the game (only if a game was created)
	if (!playerName) {
		if (pin) {
			socket.emit("endGame", { pin: pin });
		}
		sessionStorage.clear();
	}
	window.location.href = "/";
}


// Displays error messages. "message" is a translation key (from this page or sent by the
// server, e.g. "error.roomFull"), translated again if the language changes while it is shown;
// any other string (older server) is displayed as is.
function displayErrorMessage(element, message, params) {
	if (!element) {
		return;
	}
	document.getElementById("errorMessages").classList.remove("hidden");
	if (window.PunchlineI18n && PunchlineI18n.has(message)) {
		i18nText(element, message, params);
	} else {
		i18nClear(element);
		element.textContent = message == null ? "" : String(message);
	}
	element.classList.remove("hidden");
	element.classList.remove("animate__fadeOutRight");
	// Message error for 1.5 seconds display (restart the timer if a new message comes in)
	clearTimeout(element.fadeOutTimer);
	element.fadeOutTimer = setTimeout(function () {
		element.classList.add("animate__fadeOutRight");
	}, 1500);
}

// redirect the screen (the server may also send the pin / player name to keep between pages)
socket.on("redirect", (newGameURL, pin, playerName) => {
	if (pin) {
		sessionStorage.setItem("punchlinePin", pin);
	}
	if (playerName) {
		sessionStorage.setItem("playerName", playerName);
	}
	window.location = newGameURL;
});