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

/* Rejoin token: given by the server when a player joins ("playerSession"), kept
   - in sessionStorage ("punchlineToken") for the pages of this tab (joinRoom, syncPlayer),
   - in localStorage ("punchline.session": pin, name, token, savedAt) so that the phone can take
     its place back after the page was closed ("Rejoin as …" on the home page), for 6 hours. */
var SAVED_SESSION_KEY = "punchline.session";
var SAVED_SESSION_TTL_MS = 6 * 60 * 60 * 1000;

function readSavedSession() {
	try {
		let saved = JSON.parse(localStorage.getItem(SAVED_SESSION_KEY) || "null");
		if (!saved || typeof saved !== "object" || !saved.pin || !saved.playerName || !saved.token) {
			return null;
		}
		if (!(Date.now() - Number(saved.savedAt) < SAVED_SESSION_TTL_MS)) {
			localStorage.removeItem(SAVED_SESSION_KEY);
			return null;
		}
		return { pin: String(saved.pin), playerName: String(saved.playerName), token: String(saved.token) };
	} catch (e) {
		return null;
	}
}

function forgetSavedSession() {
	try {
		localStorage.removeItem(SAVED_SESSION_KEY);
	} catch (e) {}
}

function saveSession(pin, playerName, token) {
	try {
		sessionStorage.setItem("punchlinePin", pin);
		sessionStorage.setItem("playerName", playerName);
		sessionStorage.setItem("punchlineToken", token);
	} catch (e) {}
	try {
		localStorage.setItem(SAVED_SESSION_KEY, JSON.stringify({ pin: pin, playerName: playerName, token: token, savedAt: Date.now() }));
	} catch (e) {}
}

// Token of the player of this tab (the saved one if it is for the same game and name)
function playerToken() {
	let session = storedSession();
	try {
		let token = sessionStorage.getItem("punchlineToken");
		if (token) return token;
	} catch (e) {}
	let saved = readSavedSession();
	return saved && saved.pin === String(session.pin) && saved.playerName === session.playerName ? saved.token : "";
}

const socket = io({
	auth: function (cb) {
		const session = storedSession();
		cb(socketConnectedOnce && session.pin ? { rejoin: true, pin: session.pin, playerName: session.playerName || "", token: playerToken() } : {});
	},
});
socket.on("connect", function () {
	if (socketConnectedOnce) {
		const session = storedSession();
		if (session.pin) {
			socket.emit("joinRoom", session.pin, session.playerName || undefined, playerToken() || undefined);
		}
	}
	socketConnectedOnce = true;
	// a phone that was away (network loss, screen locked, server restart) may have missed a redirect
	syncPlayerPage();
});

// The server gives this phone its rejoin token (on joining, and again on every rejoin)
socket.on("playerSession", function (data) {
	if (data && data.pin && data.playerName && data.token) {
		saveSession(String(data.pin), String(data.playerName), String(data.token));
	}
});

/* Phone pages (waiting, prompt, vote): the server says which page this player should show right
   now ("syncPlayer"), and the phone goes there if it is on another one. Asked on load / every
   (re)connection, when the page becomes visible again (screen unlocked, browser back in front,
   page restored from the back-forward cache), when the network comes back, and every few
   seconds while visible, so that a phone that missed a "redirect" (iOS and Android suspend the
   connection of a page in the background) never stays stuck on a stale page. */
var PHONE_PAGES = ["/html/waiting.html", "/html/prompt.html", "/html/votePrompt.html"];
var SYNC_TIMEOUT_MS = 5000;
var SYNC_EVERY_MS = 10000;
var leavingPage = false;
var syncPending = false;

function currentPhonePage() {
	return PHONE_PAGES.indexOf(window.location.pathname) !== -1 ? window.location.pathname : null;
}

function goToPage(url) {
	if (leavingPage) return;
	leavingPage = true;
	window.location = url;
}

function syncPlayerPage() {
	let page = currentPhonePage();
	let session = storedSession();
	if (!page || leavingPage || !session.pin || !session.playerName) {
		return;
	}
	// not connected: asked again as soon as the socket is back ("connect" above)
	if (!socket.connected) {
		// (and if it stopped trying to reconnect, try again now)
		if (!socket.active) socket.connect();
		return;
	}
	if (syncPending) {
		return;
	}
	syncPending = true;
	socket.timeout(SYNC_TIMEOUT_MS).emit(
		"syncPlayer",
		{ pin: session.pin, playerName: session.playerName, token: playerToken(), page: page },
		function (err, result) {
			syncPending = false;
			if (err) {
				// no answer: the connection looks open but is dead (phone woke up), open a new one
				if (socket.connected) {
					socket.disconnect();
					socket.connect();
				}
				return;
			}
			if (!result || typeof result.url !== "string" || result.url.charAt(0) !== "/") {
				return;
			}
			if (result.url === page) {
				// vote page: the time left comes with every sync (in case "voteTimer" was missed)
				if (result.vote && typeof window.applyVoteTimer === "function") {
					window.applyVoteTimer(result.vote);
				}
				return;
			}
			if (result.notice) {
				rememberNotice(result.notice);
			}
			if (result.lastAction) {
				try {
					sessionStorage.setItem("punchlineLastAction", result.lastAction);
				} catch (e) {}
			}
			goToPage(result.url);
		}
	);
}

if (PHONE_PAGES.indexOf(window.location.pathname) !== -1) {
	document.addEventListener("visibilitychange", function () {
		if (document.visibilityState === "visible") syncPlayerPage();
	});
	window.addEventListener("pageshow", function (event) {
		if (event.persisted) {
			// back-forward cache: the page is shown again as it was, maybe long ago
			leavingPage = false;
			if (!socket.connected) socket.connect();
			syncPlayerPage();
		}
	});
	window.addEventListener("online", syncPlayerPage);
	window.addEventListener("focus", syncPlayerPage);
	setInterval(function () {
		if (document.visibilityState === "visible") syncPlayerPage();
	}, SYNC_EVERY_MS);
}

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

// Rules step 4: the vote time of the game when it is known
function setRulesVoteTime(seconds) {
	let step = document.getElementById("rulesVoteTime");
	if (!step) {
		return;
	}
	seconds = Number(seconds);
	if (seconds > 0) {
		i18nText(step, "rules.step4.known", { seconds: seconds });
	} else {
		i18nText(step, "rules.step4");
	}
}

// [answer time, before question countdown, vote time, reveal time] in seconds
socket.on("getConfigResponse", function (data) {
	if (Array.isArray(data) && data[0]) {
		setRulesAnswerTime(data[0]);
	}
	if (Array.isArray(data) && data[2]) {
		setRulesVoteTime(data[2]);
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
	leavingPage = true;
	window.location = newGameURL;
});