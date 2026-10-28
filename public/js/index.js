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
		displayErrorMessage(error, "Please enter a name");
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

	socket.emit("createGame");
	document.getElementById("startGame").classList.remove("hidden");
	document.getElementById("optionMenu").classList.remove("hidden");
	document.getElementById("join").classList.add("hidden");
	document.getElementById("joinGameInit").classList.add("hidden");
	document
		.getElementById("createGame")
		.classList.remove("hover:cursor-pointer");
	document.getElementById("main").classList.replace("sm:min-h-[430px]", "sm:min-h-[860px]");
}

socket.on("newGame", function (data) {
	document.getElementById("punchlinePin").textContent = data;
	document.getElementById("punchlinePin").classList.remove("invisible");
	document.getElementById("punchlinePin").className += " animate-pulse";
	document
		.getElementById("punchlinePin")
		.classList.replace("bg-amber-500", "bg-amber-400");

	document.getElementById("createGame").classList.add("hidden");

	sessionStorage.setItem("punchlinePin", data);
});

function joinGameInit() {
	document.getElementById("createGame").classList.add("hidden");
	document.getElementById("joinGameInit").classList.add("hidden");
	document.getElementById("join").classList.remove("hidden");
	document.getElementById("roomPin").focus();
	document.getElementById("optionJoin").classList.replace("sm:items-start", "sm:items-center");

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
		displayErrorMessage(error, "Empty PIN");
		return;
	} else if (!/^[0-9]+$/.test(roomPin.value)) {
		displayErrorMessage(error, "Only numbers");
		return;
	} else if (roomPin.value.length != 4) {
		displayErrorMessage(error, "4 digit PIN");
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
	document.querySelector("#name").classList.remove("hidden");
	if (!inGame) {
		let nameInput = document.createElement("div");
		document.querySelector("#name").append(nameInput);

		let playerName = document.createElement("input");
		document.querySelector("#name").append(playerName);
		playerName.id = "player-name";
		playerName.type = "text";
		playerName.name = "player-name";
		playerName.value = "";
		playerName.maxLength = 21;
		playerName.placeholder = "Name";
		playerName.className =
			"shadow-xl w-full sm:max-w-md rounded-md py-2 my-2 px-4 placeholder-gray-500 max-w-xs bg-orange-200 autofill:bg-orange-200 focus:outline-none";
		playerName.focus();

		let nameButton = document.createElement("button");
		document.querySelector("#name").append(nameButton);
		nameButton.id = "name-button";
		nameButton.type = "button";
		nameButton.name = "button";
		nameButton.innerText = "Go";
		nameButton.setAttribute("onclick", "setUsername()");
		nameButton.className =
			"w-full text-2xl sm:max-w-md bg-amber-500 rounded-md shadow-xl py-2 my-4 transition ease-in hover:cursor-pointer active:-rotate-6 duration-150 hover:bg-amber-400";

		let errorContainer = document.createElement("div");
		document.querySelector("#name").append(errorContainer);
		errorContainer.id = "errorName";
		errorContainer.className = "text-sm z-10 hidden  bg-red-700 rounded-lg p-2 w-max text-slate-200 font-bold text-lg shadow-xl animate__animated animate__bounceInLeft  ease-in-out duration-200 transition";

	} else {
		let nameChoice = document.createElement("div");
		nameChoice.id = "nameList";
		document.querySelector("#name").append(nameChoice);

		let availablePlayers = document.createElement("ul");
		availablePlayers.id = "availablePlayers";
		document.querySelector("#nameList").append(availablePlayers);

		players.forEach((element, index) => {
			let player = document.createElement("input");
			player.setAttribute("type", "radio");
			// the id must not depend on the player's name (a name like "main" or "pin" would clash with the page ids)
			player.id = "player-" + index;
			player.value = element.name;
			player.name = "player";
			player.className += "invisible w-0";

			let playerBlock = document.createElement("div");
			playerBlock.id = players.indexOf(element);
			playerBlock.className +=
				" cursor-pointer text-left p-2 bg-indigo-400 rounded-md shadow text-gray-200 max-w-lg";
			playerBlock.textContent = element.name;

			let label = document.createElement("label");
			label.setAttribute("for", player.id);
			label.id = "label-" + players.indexOf(element);

			document.getElementById("name").append(player);
			document.getElementById("name").append(label);
			document.getElementById(label.id).append(playerBlock);
		});

		let nameButton = document.createElement("button");
		document.querySelector("#name").append(nameButton);
		nameButton.id = "name-button";
		nameButton.type = "button";
		nameButton.name = "button";
		nameButton.innerText = "Go";
		nameButton.className =
			"w-full sm:max-w-md bg-amber-500 rounded-md shadow-xl py-2 my-4 transition ease-in hover:cursor-pointer active:-rotate-6 duration-150 hover:bg-amber-400";

		let errorContainer = document.createElement("div");
		document.querySelector("#name").append(errorContainer);
		errorContainer.id = "errorName";
		errorContainer.className = "text-sm z-10 hidden  bg-red-700 rounded-lg p-2 w-max text-slate-200 font-bold text-lg shadow-xl animate__animated animate__bounceInLeft  ease-in-out duration-200 transition";

		nameButton.addEventListener("click", function () {
			let checkedPlayer = document.querySelector("input[name=player]:checked");
			if (!checkedPlayer) {
				displayErrorMessage(errorContainer, "Please pick a name");
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
		let playerBlock = document.createElement("div");
		playerBlock.id = data.playerId;
		playerBlock.className = "text-wrap w-full flex flex-row rounded m-1 p-2 justify-between items-center  whitespace-nowrap";

		let player = document.createElement("div");
		playerBlock.append(player);
		// player.className = "text-left font-medium w-full break-words  text-gray-900 ";
		player.className = "bg-amber-400 p-2 rounded-md shadow-sm w-10/12 break-words ";
		let playerText = document.createElement("div");
		player.append(playerText);
		playerText.textContent = data.playerName;
		playerText.className = " font-medium text-ellipsis overflow-hidden";

		let deleteButton = document.createElement("button");
		deleteButton.className = " bg-indigo-500 rounded-full h-6 w-6 flex items-center justify-center relative shadow-sm hover:bg-red-600 ease-in-out duration-200 transition active:scale-90 ";
		deleteButton.setAttribute("onclick", "deletePlayer(this)");

		let cross = document.createElement("p");
		cross.innerText = "x";
		// cross.className = "rotate-45 text-gray-100";
		cross.className = "text-gray-100 absolute h-7 font-semibold";
		deleteButton.append(cross);
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
		displayErrorMessage(error, "premium code needed");
		return;
	
	// check the number of players
	} else if (premiumCode.value.length > 15 &&
		isPremiumMode()) {
		displayErrorMessage(error, "Code too long");
		return;
	} else if (nbOfPlayers < minNbOfPlayers) {
		displayErrorMessage(error, "2 players minimum");
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
		secretCode.classList.remove("invisible");
		secretCode.focus();
	} else {
		secretCode.classList.add("invisible");
	}
}

// Displays an error message if the players tries to join and the room is full
socket.on("errorRoomFull", function (data) {
	displayErrorMessage(document.getElementById("maxNbOfPlayersReached"), data);
	
});
