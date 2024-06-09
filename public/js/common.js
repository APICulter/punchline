let punchlinePin;
let playerName;
var punchlinePinElement = document.getElementById("punchlinePin");


// Rules var
var modalRules = document.getElementById("rulesModal");
var rules = document.getElementById("rules");
var exitRulesX = document.getElementById("closeRules");
var exitRules = document.getElementById("exitRules");


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
};

// When the user clicks on <span> (x), close the modal
exitRulesX.onclick = function () {
	modalRules.classList.add("hidden");
	window.scrollTo(0, 0);
};

exitRules.onclick = function () {
	modalRules.classList.add("hidden");
	window.scrollTo(0, 0);
};

// When the user clicks anywhere outside of the modal, close it
window.onclick = function (event) {
	if (event.target == modalRules) {
		modalRules.classList.add("hidden");
		window.scrollTo(0, 0);
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
	} 
	window.location.href = "/";

	
}


// Displays error messages
function displayErrorMessage(element, message) {
	element.textContent = message;
	element.classList.remove("hidden");
	// Message error for 1.5 seconds display
	setTimeout(function () {
		element.classList.add("hidden");
	}, 1500);
}