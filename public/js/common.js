let punchlinePin;
let playerName;

// Rules var
var modal = document.getElementById("rulesModal");
var btn = document.getElementById("rules");
var span = document.getElementById("closeRules");
var btnRules = document.getElementById("rulesButton");

// when the page is fully charged
window.addEventListener('load', function() {

	punchlinePin = sessionStorage.getItem("punchlinePin");
    if (punchlinePin) {
        document.getElementById("punchlinePin").textContent = punchlinePin;
	document.getElementById("punchlinePin").classList.remove("invisible");
	document.getElementById("punchlinePin").className += " animate-pulse";
    document
		.getElementById("punchlinePin")
		.classList.replace("bg-amber-500", "bg-amber-400");
    }
});


// When the user clicks the button, open the modal
btn.onclick = function () {
	modal.classList.remove("hidden");
};

// When the user clicks on <span> (x), close the modal
span.onclick = function () {
	modal.classList.add("hidden");
	window.scrollTo(0, 0);
};

btnRules.onclick = function () {
	modal.classList.add("hidden");
	window.scrollTo(0, 0);
};

// When the user clicks anywhere outside of the modal, close it
window.onclick = function (event) {
	if (event.target == modal) {
		modal.classList.add("hidden");
		window.scrollTo(0, 0);
	}
};




// To go back to the lobby
function home() {
	playerName = sessionStorage.getItem("playerName");
	if ( !playerName) {
		socket.emit("endGame", {
		punchlinePin: punchlinePin,
	});
	sessionStorage.clear();
	} 
	window.location.href = "/";

	
}