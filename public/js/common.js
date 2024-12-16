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
	errorMessages.classList.add("hidden");
};

exitRules.onclick = function () {
	modalRules.classList.add("hidden");
	mainDiv.classList.remove("hidden");
	window.scrollTo(0, 0);
	errorMessages.classList.add("hidden");
};

// When the user clicks anywhere outside of the modal, close it
window.onclick = function (event) {
	if (event.target == modalRules) {
		modalRules.classList.add("hidden");
		mainDiv.classList.remove("hidden");
		window.scrollTo(0, 0);
		errorMessages.classList.add("hidden");
	}
};




// To go back to the lobby
function home() {
	playerName = sessionStorage.getItem("playerName");
	if (!playerName) {
		socket.emit("endGame", {
		pin: punchlinePin ? punchlinePin : punchlinePinElement.textContent,
	});
	sessionStorage.clear();
	} else {
		// socket.emit("leaveGame", {
		// 	pin: punchlinePin,
		// 	playerName: playerName
		// });
			
	}
	window.location.href = "/";

	
}


// Displays error messages
function displayErrorMessage(element, message) {
	document.getElementById("errorMessages").classList.remove("hidden");
	element.textContent = message;
	element.classList.remove("hidden");
	element.classList.remove("animate__fadeOutRight");
	// Message error for 1.5 seconds display
	setTimeout(function () {
		// element.classList.add("hidden");
		element.classList.add("animate__fadeOutRight");
	}, 1500);
}

socket.on("redirect", (newGameURL) => {
	window.location = newGameURL;
});