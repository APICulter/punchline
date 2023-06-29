
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
					pin: document.getElementById("room-pin").value
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
		socket.on("game already exists", function (data) {
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

		socket.on("gamePinFound", function (data) {
			//make the name div appear in order to enter player name
			document.querySelector("#name").classList.remove("invisible");
		});

	
		socket.on("newJoiner", function (data) {
			// if (user) {
				if (data) {

                    let player = document.createElement("div");
                    player.textContent = data.user;
                    player.className = "flex items-stretch rounded bg-indigo-400 text-gray-300 m-2 p-2";
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
			sessionStorage.setItem("punchlinePin", date.pin);
		});

		socket.on("redirect", (newGameURL, gamePin) => {
			// redirect to new URL
			window.location = newGameURL;
			// sessionStorage.setItem("punchlinePin", gamePin);
		});

		//début du jeu
		function startGame() {

            if (nbOfPlayers < 1 ) {

            } else {

                socket.emit("startGame", {
                    pin: document.getElementById("createGame").textContent,
                });
            }

			
		}
