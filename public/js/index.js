// const socket = io();
// import DOMPurify from 'dompurify';
// import DOMPurify from "isomorphic-dompurify";

let nbOfPlayers = 0;
var minNbOfPlayers = 2;
const forbiddenCaracters = ["&","~","\"","#","'","{","(","[","|","`","\\","@",")","]","=","+","¨","$","¤","£","%","*","µ",",","?",";",".",":","/","§","/"];

// const playerNameElement = document.getElementById("player-name");

sessionStorage.clear();
window.onload = function () {
	socket.emit("getPunchlineURL");
};

// get Punchline URL
socket.on("sendPunchlineURL", function(data) {
	document.getElementById("gameURL").setAttribute("href", data);
});


/** Choose the player's name **/
function setUsername() {

	let playerName = document.getElementById("player-name");
	let pin = document.getElementById("pin");
	let error = document.getElementById("errorName");

	
	if (playerName.value.length == 0) {
		displayErrorMessage(error, "Please enter a name");
		return;
	} else if ( playerName.value.length > 22) {
		displayErrorMessage(error, "Name too long");
		return;
	} else {

		var result = forbiddenCaracters.filter((caracter) => playerName.value.includes(caracter));
		if (result.length > 0) {
			displayErrorMessage(error, "Invalid caracter(s): " + result);
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
	error.textContent = data;
	error.classList.remove("hidden");
	
	setTimeout(function () {
		// messageElement.style.display = 'none';
		error.classList.add("hidden");
	}, 1500);
});





var user;
// socket.on("userExists", function (data) {
// 	document.getElementById("errorName").innerText = data;
// });
socket.on("userSet", function (data, newGameURL) {
	sessionStorage.setItem("playerName", data.playerName);
	sessionStorage.setItem("punchlinePin", data.pin);
	window.location = newGameURL;
});

// Choose the player's name with Enter (key 13)
document.getElementById("name").addEventListener("keyup", function (event) {
	event.preventDefault();
	if (event.keyCode === 13) {
		setUsername();
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
	socket.emit("createGame");
	document.getElementById("startGame").classList.remove("hidden");
	document.getElementById("optionMenu").classList.remove("hidden");
	document.getElementById("join").classList.add("hidden");
	document.getElementById("joinGameInit").classList.add("hidden");
	document
		.getElementById("createGame")
		.classList.remove("hover:cursor-pointer");
		// var height = document.getElementById("startGame").height;
		// height += document.getElementById("optionMenu").height;
		// height += document.getElementById("join").offsetHeight;
		// height += document.getElementById("joinGameInit").offsetHeight;
	// document.getElementById("mainDiv").style.height ="1500px";
	// setTimeout(() => {
		// document.getElementById("mainDiv").style.height = 'auto';
		// var height = document.getElementById("mainDiv").height;
		// height += document.getElementById("startGame").style.height;
		// height += document.getElementById("optionMenu").style.height;

		var height = Number(getComputedStyle(document.getElementById("main")).height.slice(0, -2));
		height += Number(getComputedStyle(document.getElementById("startGame")).height.slice(0, -2));
		height += Number(getComputedStyle(document.getElementById("optionMenu")).height.slice(0, -2));
		// height = "sm:min-h-["+ height.toString() +"px]";
		// document.getElementById("mainDiv").classList.replace("sm:min-h-[430px]", `sm:min-h-[${height.toString()}px]`);
		document.getElementById("main").classList.replace("sm:min-h-[430px]", "sm:min-h-[860px]");
		// document.getElementById("mainDiv").classList.replace("sm:max-h-max", "sm:max-h-0");

		// setTimeout(() => {
		// 	document.getElementById("mainDiv").classList.replace("sm:max-h-0", "sm:max-h-max");
		// }, 500);

		// console.log();
		// console.log(height);
	//   }, 500);
	
}

socket.on("newGame", function (data) {
	let pinCreated = document.createElement("div");
	document.getElementById("punchlinePin").textContent = data;
	document.getElementById("punchlinePin").classList.remove("invisible");
	document.getElementById("punchlinePin").className += " animate-pulse";
	document
		.getElementById("punchlinePin")
		.classList.replace("bg-amber-500", "bg-amber-400");

	pinCreated.classList.add("text-4xl");
	// document.getElementById("createGame").innerText = data;
	// document.getElementById("createGame").className += " rounded-full";
	// document.getElementById("createGame").className += " animate-pulse";
	document.getElementById("createGame").classList.add("hidden");
	// document
	// 	.getElementById("createGame")
	// 	.classList.replace("bg-amber-500", "bg-amber-400");

	sessionStorage.setItem("punchlinePin", data);
});

function joinGameInit() {
	document.getElementById("createGame").classList.add("hidden");
	document.getElementById("joinGameInit").classList.add("hidden");
	document.getElementById("join").classList.remove("hidden");
	document.getElementById("roomPin").focus();
	document.getElementById("optionJoin").classList.replace("sm:items-start", "sm:items-center");

}


let roomPin = document.getElementById("roomPin");
// Ajoutez un écouteur d'événements pour le focus sur le champ input
// roomPin.addEventListener('focus', () => {
// 	// Faites défiler la page jusqu'au champ input
	

// 	setTimeout(function() {
// 		document.getElementById("joinRoomButton").scrollIntoView({ behavior: 'smooth' });
// 	}, 300); // Delay to allow for keyboard animation

// 	// document.getElementById("joinRoomButton").addEventListener('blur', function() {
//     //     // Optionally, you can scroll back to the top when the input loses focus
//     //     window.scrollTo({ top: 0, behavior: 'smooth' });
//     // });

//   });


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
	} else if (isNaN(roomPin.value)) {
		displayErrorMessage(error, "Only numbers");
		return;
	} else if (roomPin.value.length > 4) {
		displayErrorMessage(error, "4 digit PIN");
		return;
	} else {
		socket.emit("findRoomById", {
			pin: DOMPurify.sanitize(roomPin.value),
			// pin: roomPin.value,
		});
	}
	

}

// Displays error message coming from the backend if the PIN encounters a problem
socket.on("findRoomByIdErrorMessages", function (data) {
	displayErrorMessage(document.getElementById("errorPin"), data);
	
});


// Displays the elements to enter the player's name once he/she has joined the room or if he/she reconnects to the game
socket.on("gamePinFound", function (pin, inGame, players) {
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
		let playerNameButton = document.getElementById("player-name");
		playerNameButton.focus();
		// playerNameButton.addEventListener('focus', () => {
		// 	// Faites défiler la page jusqu'au champ input
		// 	setTimeout(function() {
		// 		document.getElementById("name-button").scrollIntoView({ behavior: 'smooth' });
		// 	}, 300); // Delay to allow for keyboard animation


		//   });

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
		let errorRoomFull = document.createElement("div");
		errorRoomFull.id = "errorRoomFull";
		errorRoomFull.className = "text-sm hidden z-10 absolute bg-red-700 rounded-lg p-2 w-max text-slate-200 font-bold text-lg shadow-xl animate__animated animate__bounceInLeft  ease-in-out duration-200 transition";

	} else {
		let nameChoice = document.createElement("div");
		nameChoice.id = "nameList";
		document.querySelector("#name").append(nameChoice);

		let availablePlayers = document.createElement("ul");
		availablePlayers.id = "availablePlayers";
		document.querySelector("#nameList").append(availablePlayers);

		players.forEach((element) => {
			let player = document.createElement("input");
			player.setAttribute("type", "radio");
			player.id = element.name;
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

		nameButton.addEventListener("click", function () {
			let playerName = document.querySelector("input[name=player]:checked").id;
			socket.emit("joinGame", document.querySelector("#pin").value, playerName);
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
	document.getElementById(data).remove();
	nbOfPlayers -= 1;
	updateNbOfPlayers();
	// if (document.getElementById("players").childElementCount === 0) {
	// 	document.getElementById("players-table").classList.add("hidden");
	// }
});

// redirect the screen
socket.on("redirect", (newGameURL, pin, playerName) => {
	// redirect to new URL

	if (pin) {
		sessionStorage.setItem("punchlinePin", pin);
	}

	if (playerName) {
		sessionStorage.setItem("playerName", playerName);
	}

	window.location = newGameURL;
	// sessionStorage.setItem("punchlinePin", gamePin);
});

// Start of the game
function startGame() {

	// check premium code if selected
	let premiumCode = document.getElementById("secretCode");
	let error = document.getElementById("startGameError");


	if (premiumCode.value.length == 0 &&
		document.getElementById("premiumMode").getAttribute("checked") == "yes") {
		displayErrorMessage(error, "premium code needed");
		return;
	
	// check the number of players
	} else if (premiumCode.value.length > 15 &&
		document.getElementById("premiumMode").getAttribute("checked") == "yes") {
		displayErrorMessage(error, "Code too long");
		return;
	} else if (nbOfPlayers < minNbOfPlayers) {
		displayErrorMessage(error, "2 players minimum");
		return;

	} else {
		socket.emit("startGame", {
			pin: DOMPurify.sanitize(document.getElementById("punchlinePin").textContent),
			nbOfQuestions: DOMPurify.sanitize(document.getElementById("nbOfQuestionsValue").textContent),
			secretCode: DOMPurify.sanitize(premiumCode.value),
			premiumMode:
			DOMPurify.sanitize(document.getElementById("premiumMode").getAttribute("checked") == "yes"),
		});
	}


	
}

socket.on("startGameErrorMessages", function (data) {
	let error = document.getElementById("startGameError");
	error.textContent = data;
	error.classList.remove("hidden");
	
	setTimeout(function () {
		// messageElement.style.display = 'none';
		error.classList.add("hidden");
	}, 1500);
});


// function validate(inputField){
// 	document.getElementById("secretCode").value.length == 

// }

let secretCode = document.getElementById("secretCode");
// secretCode.addEventListener('focus', () => {

// 	setTimeout(function() {
// 		document.getElementById("secretCode").scrollIntoView({ behavior: 'smooth' });
// 	}, 300); // Delay to allow for keyboard animation

// 	// document.getElementById("secretCode").addEventListener('blur', function() {
// 	// 	// Optionally, you can scroll back to the top when the input loses focus
// 	// 	window.scrollTo({ top: 0, behavior: 'smooth' });
// 	// });

//   });
// To change between classic mode and premium mode
function changeMode() {
	let radio = document.querySelector("input[name=modeSelection]:checked").value;
	
	if (radio == "premium") {
		document.getElementById("premiumMode").setAttribute("checked", "yes");
		document.getElementById("normalMode").setAttribute("checked", "no");

		secretCode.classList.remove("invisible");
		secretCode.focus();
	} else {
		document.getElementById("premiumMode").setAttribute("checked", "no");
		document.getElementById("normalMode").setAttribute("checked", "yes");
		secretCode.classList.add("invisible");
	}
}




// Displays an error message if the premium code entered is invalid
// socket.on("premiumCodeError", function (data) {
// 	let error = document.getElementById("premiumCodeError");
// 	error.textContent = data;
// 	error.classList.remove("hidden");
// 	// Hides the text after 1.5 seconds
// 	setTimeout(function () {
// 		// messageElement.style.display = 'none';
// 		error.classList.add("hidden");
// 	}, 1500);
// });

// Displays an error message if the players tries to join and the room is full
socket.on("errorRoomFull", function (data) {
	displayErrorMessage(document.getElementById("maxNbOfPlayersReached"), data);
	
});

// function errorMessage(error) {

// }



