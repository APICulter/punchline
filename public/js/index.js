
		const socket = io();

        // sessionStorage.setItem("nbOfPlayers", 0);
        let nbOfPlayers = 0;
        let playerNumero = 1;

		/** choix du nom **/
		function setUsername() {
			if (document.getElementById("player-name").value.length !== 0) {
				socket.emit(
					"setUsername",
					document.getElementById("player-name").value
				);
			}
		}

		var user;
		socket.on("userExists", function (data) {
			document.getElementById("error-container").innerHTML = data;
		});
		socket.on("userSet", function (data) {
			user = data.username;
			let finalName = document.createElement("div");
			finalName.id = "userName";
			sessionStorage.setItem("playerName", user);
			finalName.textContent = user;
			finalName.classList.add("text-4xl");
			// document.getElementById("table-name").append(finalName);
			// document.getElementById("table-name-row").classList.remove("invisible");
			// document.getElementById("nameInput").classList.add("text-left");
			// document.getElementById("nameInput").classList.add("text-xl");
			// document.getElementById("nameInput").classList.remove("flew-row");
			document.getElementById("player-name").remove();
			document.getElementById("name-button").remove();
			document.getElementById("error-container").innerHTML = "";

			document.getElementById("choice").classList.remove("invisible");
			document.getElementById("join").classList.remove("invisible");
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
			socket.emit("createGame", { user: user });
			document.getElementById("startGame").classList.remove("invisible");
		}

		socket.on("new pin", function (data) {
			if (user) {
				let pinCreated = document.createElement("div");
				pinCreated.textContent = data;
				pinCreated.classList.add("text-4xl");
				document.getElementById("createGame").innerText = data;
				document.getElementById("createGame").className += " rounded-full";
				document.getElementById("createGame").className += " animate-pulse";
				document.getElementById("createGame").classList.replace("bg-amber-500", "bg-amber-400");

			}
		});
		socket.on("game already exists", function (data) {
			if (user) {
				document.getElementById("createGame").setAttribute("disabled", "");
			}
		});

		//rejoindre une room

		function displayJoinRoom() {
			document.getElementById("display-join-room-button").remove();
			document.getElementById("join").classList.remove("invisible");
		}

		function joinRoom() {
			//faire une vérif que c'est pas vide et que c'est bien un nombre
			if (
				document.getElementById("room-pin").value.length > 0 &&
				!isNaN(document.getElementById("room-pin").value)
			) {
				socket.emit("joinRoom", {
					pin: document.getElementById("room-pin").value,
					user: user,
				});
			} else {
				document.getElementById("room-pin").value = "";
			}

			// 	if(!document.getElementById("errorJoinPin")) {
			// 		let errorMessage = document.createElement("p");
			// 	errorMessage.textContent = "Ne peut pas être vide et doit contenir uniquement des chiffres";
			// 	errorMessage.id="errorJoinPin";
			// 	document.getElementById("join").append(errorMessage);
			// 	document.getElementById("room-pin").value="";
			// 	}
		}
		socket.on("joined", function (data) {
			if (user) {
				if (data) {
					let joined = document.createElement("div");
					joined.textContent =
						"Vous avez rejoint la game avec le pin " + data.game.pin;
					document.body.append(joined);
				}
			}
		});
		socket.on("newJoiner", function (data) {
			console.log(data);
			if (user) {
				if (data) {
					document
						.getElementById("table-players-row")
						.classList.remove("invisible");
					let tableRef = document.getElementById("players-table");

                    if(playerNumero == 1 || playerNumero == 2 || playerNumero == 3) {
                        
                    }

					let newRow = tableRef.insertRow(-1);
					let newCell = newRow.insertCell(0);
					let newText = document.createTextNode(data);
					newCell.appendChild(newText);
                    newCell.className += "rounded bg-indigo-400 text-gray-300 m-2 p-2";
                    nbOfPlayers  += 1;
                    // sessionStorage.setItem("nbOfPlayers", nbOfPlayers);
				}
			}
		});

		socket.on("redirect", (newGameURL, gamePin) => {
			// redirect to new URL
			window.location = newGameURL;
			sessionStorage.setItem("punchlinePin", gamePin);
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
