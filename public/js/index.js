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
		displayErrorMessage(error, "Enter a name to join");
		return;
	} else if ( playerName.value.length > 22) {
		displayErrorMessage(error, "Name too long");
		return;
	} else {

		var result = forbiddenCaracters.filter((caracter) => playerName.value.includes(caracter));
		if (result.length > 0) {
			displayErrorMessage(error, "Invalid character(s): " + result.join(" "));
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
		displayErrorMessage(error, data);
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
	socket.emit("getPunchlineURL");
}

// The join address shown in the lobby (same URL as the one in the rules)
socket.on("sendPunchlineURL", function (data) {
	let lobbyURL = document.getElementById("lobbyURL");
	if (lobbyURL && data) {
		lobbyURL.textContent = String(data).replace(/^https?:\/\//, "").replace(/\/$/, "");
	}
});

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

socket.on("newGame", function (data) {
	document.getElementById("punchlinePin").textContent = data;
	document.getElementById("punchlinePin").classList.remove("invisible");
	displayLobbyPin(data);

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

	
	// Validation
	if (roomPin.value.length == 0) {
		displayErrorMessage(error, "Enter the 4-digit PIN");
		return;
	} else if (!/^[0-9]+$/.test(roomPin.value)) {
		displayErrorMessage(error, "The PIN only has numbers");
		return;
	} else if (roomPin.value.length != 4) {
		displayErrorMessage(error, "The PIN has 4 digits");
		return;
	} else {
		socket.emit("findRoomById", {
			pin: DOMPurify.sanitize(roomPin.value),
		});
	}
	

}

// Displays error message coming from the backend if the PIN encounters a problem
socket.on("findRoomByIdErrorMessages", function (data) {
	displayErrorMessage(document.getElementById("errorPin"), data);
	
});


// Displays the elements to enter the player's name once he/she has joined the room or if he/she reconnects to the game
socket.on("gamePinFound", function (pin, inGame, players) {
	// the name selection is already displayed (e.g. "Join" clicked twice)
	if (!document.querySelector("#choice")) {
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
		title.textContent = "What should we call you?";
		hint.textContent = "Up to 21 characters. Your friends will see it on the scoreboard.";

		let playerName = document.createElement("input");
		playerName.id = "player-name";
		playerName.type = "text";
		playerName.name = "player-name";
		playerName.value = "";
		playerName.maxLength = 21;
		playerName.placeholder = "Your name";
		playerName.autocomplete = "nickname";
		playerName.setAttribute("autocapitalize", "words");
		playerName.setAttribute("enterkeyhint", "go");
		playerName.setAttribute("aria-label", "Your name");
		playerName.className = "field";
		panel.append(playerName);

		let nameButton = document.createElement("button");
		nameButton.id = "name-button";
		nameButton.type = "button";
		nameButton.name = "button";
		nameButton.textContent = "Let's go";
		nameButton.setAttribute("onclick", "setUsername()");
		nameButton.className = "btn btn-primary btn-block";
		panel.append(nameButton);
		panel.append(errorContainer);

		playerName.focus();
	} else {
		title.textContent = "Who are you?";
		hint.textContent = "The game has already started. Pick your name to jump back in.";

		let availablePlayers = document.createElement("div");
		availablePlayers.id = "nameList";
		availablePlayers.className = "flex flex-col gap-3";
		availablePlayers.setAttribute("role", "radiogroup");
		panel.append(availablePlayers);

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

			availablePlayers.append(player);
			availablePlayers.append(label);
		});

		let nameButton = document.createElement("button");
		nameButton.id = "name-button";
		nameButton.type = "button";
		nameButton.name = "button";
		nameButton.textContent = "Rejoin";
		nameButton.className = "btn btn-primary btn-block";
		panel.append(nameButton);
		panel.append(errorContainer);

		nameButton.addEventListener("click", function () {
			let checkedPlayer = document.querySelector("input[name=player]:checked");
			if (!checkedPlayer) {
				displayErrorMessage(errorContainer, "Pick your name first");
				return;
			}
			socket.emit("joinGame", document.querySelector("#pin").value, checkedPlayer.value);
		});
	}
});

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
		deleteButton.setAttribute("aria-label", "Remove " + data.playerName);
		deleteButton.setAttribute("onclick", "deletePlayer(this)");
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
}


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
		displayErrorMessage(error, "Enter the premium code");
		return;
	
	// check the number of players
	} else if (premiumCode.value.length > 15 &&
		isPremiumMode()) {
		displayErrorMessage(error, "Code too long");
		return;
	} else if (nbOfPlayers < minNbOfPlayers) {
		displayErrorMessage(error, "You need at least 2 players");
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
		});
	}


	
}

socket.on("startGameErrorMessages", function (data) {
	document.getElementById("startGame").disabled = false;
	displayErrorMessage(document.getElementById("startGameError"), data);
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
	displayErrorMessage(document.getElementById("maxNbOfPlayersReached"), data);
	
});
