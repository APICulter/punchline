
		const socket = io();

        // sessionStorage.setItem("nbOfPlayers", 0);
        let nbOfPlayers = 0;
        let playerNumero = 1;

        sessionStorage.clear();

		/** choix du nom **/
		function setUsername() {
			if (document.getElementById("player-name").value.length !== 0) {
				socket.emit(
					"setUsername", {
					playerName	: document.getElementById("player-name").value,
					pin: document.getElementById("pin").value
					}
					
				);
			}
		}

		var user;
		socket.on("userExists", function (data) {
			document.getElementById("error-container").innerHTML = data;
		});
		socket.on("userSet", function (data, newGameURL) {

			sessionStorage.setItem("playerName", data.playerName);
			sessionStorage.setItem("punchlinePin", data.pin);
			window.location = newGameURL;
			
		});

		//choix du nom en validant avec la touche "Entrée"
		document.getElementById("name").addEventListener("keyup", function (event) {
			event.preventDefault();
			if (event.keyCode === 13) {
				setUsername();
			}
		});

		/**choix du game **/
		function createGame() {
			socket.emit("createGame");
			document.getElementById("startGame").classList.remove("invisible");
			document.getElementById("join").classList.add("invisible");
			document.getElementById("createGame").classList.remove("hover:cursor-pointer");

		}

		socket.on("newGame", function (data) {
			// if (user) {
				let pinCreated = document.createElement("div");
				pinCreated.textContent = data;
				pinCreated.classList.add("text-4xl");
				document.getElementById("createGame").innerText = data;
				document.getElementById("createGame").className += " rounded-full";
				document.getElementById("createGame").className += " animate-pulse";
				document.getElementById("createGame").classList.replace("bg-amber-500", "bg-amber-400");
				
				sessionStorage.setItem("punchlinePin", data);
			// }
		});
		socket.on("gameExists", function (data) {
			if (user) {
				document.getElementById("createGame").setAttribute("disabled", "");
			}
		});

		//rejoindre une room


		function joinRoom() {
			if (
				document.getElementById("room-pin").value.length > 0 &&
				!isNaN(document.getElementById("room-pin").value)
			) {
				socket.emit("findRoomById", {
					pin: document.getElementById("room-pin").value
				
				});
			} else {
				document.getElementById("room-pin").value = "";
			}

		}

		socket.on("noGameFound", function (data) {
			//display a message "the game of pin XYZ does not exist"
		});

		socket.on("gamePinFound", function (pin, inGame, players) {
			//make the name div appear in order to enter player name
			document.querySelector('#pin').setAttribute("value", pin);
			
			document.querySelector("#choice").remove();
			document.querySelector("#name").classList.remove("invisible");
			if(!inGame) {
				
				let nameInput = document.createElement('div');
				document.querySelector('#name').append(nameInput);
				
				let playerName = document.createElement('input');
				document.querySelector('#name').append(playerName);
				playerName.id = "player-name";
				playerName.type = "text";
				playerName.name = "name";
				playerName.value = "";
				playerName.placeholder = "Name";
				playerName.className = "w-full sm:max-w-md rounded-md py-2 my-2 px-4 placeholder-gray-500 max-w-xs bg-slate-100 focus:outline-none";
				
				let nameButton = document.createElement('button');
				document.querySelector('#name').append(nameButton);
				nameButton.id = "name-button";
				nameButton.type = "button";
				nameButton.name = "button";
				nameButton.innerText = "Go";
				nameButton.setAttribute("onclick", "setUsername()");
				nameButton.className = "w-full sm:max-w-md bg-amber-500 rounded-md shadow-xl py-2 my-4 transition ease-in hover:cursor-pointer active:-rotate-6 duration-150 hover:bg-amber-400"
	
				let errorContainer = document.createElement('div');
				document.querySelector('#name').append(errorContainer);
				errorContainer.id = "error-container";
			} else {
				let nameChoice = document.createElement('div');
				nameChoice.id = 'nameList';
				document.querySelector('#name').append(nameChoice);

				let availablePlayers = document.createElement('ul');
				availablePlayers.id = "availablePlayers";
				document.querySelector('#nameList').append(availablePlayers);

				// players.forEach(element => {
				// 	let player = document.createElement('li');
				// 	player.textContent = element.name;
				// 	player.id = element.name;
				// 	document.querySelector('#availablePlayers').append(player);
					
				// });

				players.forEach(element => {
					let player = document.createElement('input');
					player.setAttribute("type", "radio");
					player.id = element.name;
					player.value = element.name;
					player.name = 'player';
					player.className += "invisible w-0";

					let playerBlock = document.createElement('div');
					playerBlock.id = players.indexOf(element);
					playerBlock.className += " cursor-pointer text-left p-2 bg-indigo-400 rounded-md shadow text-gray-200 max-w-lg";
					playerBlock.textContent = element.name;

					let label = document.createElement('label');
					label.setAttribute("for", player.id);
					label.id = "label-" + players.indexOf(element);

					document.getElementById('name').append(player);
					document.getElementById('name').append(label);
					document.getElementById(label.id).append(playerBlock);
				});

				let nameButton = document.createElement('button');
				document.querySelector('#name').append(nameButton);
				nameButton.id = "name-button";
				nameButton.type = "button";
				nameButton.name = "button";
				nameButton.innerText = "Go";
				// nameButton.setAttribute("onclick", "joinGame()");
				nameButton.className = "w-full sm:max-w-md bg-amber-500 rounded-md shadow-xl py-2 my-4 transition ease-in hover:cursor-pointer active:-rotate-6 duration-150 hover:bg-amber-400"
				
				nameButton.addEventListener('click', function() {
	
					let playerName = document.querySelector('input[name=player]:checked').id;
					socket.emit('joinGame', document.querySelector('#pin').value, playerName);
					// window.location = "/html/waiting.html";
					});
			}
			
		});

		
		// const button = document.querySelector('#pickName');
		// button.addEventListener('click', function() {
	
		// 	let player = document.querySelector('input[name=playerName]:checked').id;
		// 	socket.emit('joinGame', punchlinePin, player);
		// 	// window.location = "/html/waiting.html";
		// 	});

	
		socket.on("newJoiner", function (data) {
			// if (user) {
				if (data) {

                    let player = document.createElement("div");
                    player.textContent = data.user;
                    player.className = "flex items-stretch rounded bg-gray-900 text-gray-300 m-2 p-2";
                    document.getElementById("players").append(player);
                    nbOfPlayers  += 1;
					// document
					// 	.getElementById("table-players-row")
					// 	.classList.remove("invisible");
					// let tableRef = document.getElementById("players-table");

                  

					// let newRow = tableRef.insertRow(-1);
					// let newCell = newRow.insertCell(0);
					// let newText = document.createTextNode(data);
					// newCell.appendChild(newText);
                    // newCell.className += "rounded bg-indigo-400 text-gray-300 m-2 p-2";
                    // nbOfPlayers  += 1;
                    // sessionStorage.setItem("nbOfPlayers", nbOfPlayers);
				}
			// }
			// sessionStorage.setItem("punchlinePin", date.pin);
		});

		socket.on("redirect", (newGameURL, pin,  playerName) => {
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

		//début du jeu
		function startGame() {

            if (nbOfPlayers < 1 ) {

            } else {

                socket.emit("startGame", {
                    pin: document.getElementById("createGame").textContent,
					nbOfQuestions: document.getElementById("nbOfQuestionsValue").textContent
                });
            }

			
		}

		function home() {
			window.location.href = '/';
		}
