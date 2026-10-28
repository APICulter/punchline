const socket = io();

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