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

// Toast animations (src/input.css, "Feedback animations"): an error drops in with a springy
// overshoot, shakes "nope" and stays slightly tilted; a notice drops in with a soft bounce;
// both pop out (scale down + fade). The old animate.css classes of the markup are dropped.
var TOAST_ANIMATIONS = ["animate__animated", "animate__fadeInDown", "animate__fadeOutRight", "toast--error-in", "toast--notice-in", "toast--out"];
var TOAST_OUT_MS = 320;

function toastIn(toast, kind) {
	clearTimeout(toast.toastOutTimer);
	toast.classList.remove.apply(toast.classList, TOAST_ANIMATIONS);
	// restarts the animation when the same toast is shown again
	void toast.offsetWidth;
	// an error stays slightly tilted, until it pops out
	toast.style.setProperty("--toast-tilt", kind === "notice" ? "0deg" : "-1.5deg");
	toast.classList.add(kind === "notice" ? "toast--notice-in" : "toast--error-in");
}

function toastOut(toast, done) {
	toast.classList.remove("toast--error-in", "toast--notice-in");
	toast.classList.add("toast--out");
	clearTimeout(toast.toastOutTimer);
	toast.toastOutTimer = setTimeout(done, TOAST_OUT_MS + 40);
}

// Shakes the field whose value was refused, with a pink outline pulse ("field": element or id).
// An input / textarea is also marked aria-invalid until the player edits it.
function shakeField(field) {
	if (typeof field === "string") {
		field = document.getElementById(field);
	}
	if (!field || !field.classList) {
		return;
	}
	// the answer textarea has no border of its own: its speech bubble shakes
	let target = (field.closest && field.closest(".answer-bubble")) || field;
	target.classList.remove("field-shake");
	void target.offsetWidth;
	target.classList.add("field-shake");
	if (target.shakeEnd) {
		target.removeEventListener("animationend", target.shakeEnd);
	}
	target.shakeEnd = function (event) {
		// the outline pulse is the longest of the two animations
		if (event.target !== target || event.animationName !== "field-alarm") return;
		target.classList.remove("field-shake");
		target.removeEventListener("animationend", target.shakeEnd);
		target.shakeEnd = null;
	};
	target.addEventListener("animationend", target.shakeEnd);
	if (field.matches && field.matches("input, textarea")) {
		field.setAttribute("aria-invalid", "true");
		field.addEventListener("input", function () {
			field.removeAttribute("aria-invalid");
		}, { once: true });
	}
}

// Toast at the top of the page for a few seconds ("key" is translated, any other text shown as is)
function showNotice(key) {
	let toast = document.createElement("div");
	toast.id = "notice";
	toast.setAttribute("role", "status");
	toast.className = "toast pointer-events-none";
	if (window.PunchlineI18n && PunchlineI18n.has(key)) {
		i18nText(toast, key);
	} else {
		toast.textContent = String(key);
	}
	document.body.append(toast);
	toastIn(toast, "notice");
	setTimeout(function () {
		toastOut(toast, function () {
			toast.remove();
		});
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
		socket.emit("getPunchlineURL", { origin: window.location.origin });
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
// "field" (optional, element or id): the field whose value was refused, it shakes too.
function displayErrorMessage(element, message, params, field) {
	if (!element) {
		return;
	}
	let container = document.getElementById("errorMessages");
	if (container) container.classList.remove("hidden");
	if (window.PunchlineI18n && PunchlineI18n.has(message)) {
		i18nText(element, message, params);
	} else {
		i18nClear(element);
		element.textContent = message == null ? "" : String(message);
	}
	element.classList.remove("hidden");
	toastIn(element, "error");
	if (field) {
		shakeField(field);
	}
	// Message shown for about 2 seconds (restart the timer if a new message comes in)
	clearTimeout(element.fadeOutTimer);
	element.fadeOutTimer = setTimeout(function () {
		toastOut(element, function () {
			element.classList.add("hidden");
			element.classList.remove("toast--out");
		});
	}, 2200);
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