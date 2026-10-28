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
		punchlinePinElement.className += " animate-pulse";
		punchlinePinElement.classList.replace("bg-amber-500", "bg-amber-400");
    }

	// Link to the game in the rules panel
	if (document.getElementById("gameURL")) {
		socket.emit("getPunchlineURL");
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


// Displays error messages
function displayErrorMessage(element, message) {
	document.getElementById("errorMessages").classList.remove("hidden");
	element.textContent = message;
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