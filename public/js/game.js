const socket = io();
		let punchlinePin;
		// let playerName;
		let numberQuestion = 0;

		var countdownIntervalQuestion;

		window.onload = function () {
			// playerName = sessionStorage.getItem("playerName");
			punchlinePin = sessionStorage.getItem("punchlinePin");
			playerName = sessionStorage.getItem('playerName');
			
			if (punchlinePin && !playerName) {
			socket.emit('joinRoom', punchlinePin, playerName);
			getQuestion(numberQuestion);
			document.querySelector("#punchlinePin").textContent = punchlinePin;
			} else {
				window.location = "/";
				socket.emit("endGame", {
					punchlinePin: punchlinePin,
				});
				sessionStorage.clear();
			}
			
		};

		// Function to start the countdown
		function startCountdown(count, questionCount) {
			var countdownElement = document.getElementById("countdown");
			// var count = 6;
		
			// Update the countdown every second
			var countdownInterval = setInterval(function() {
			count--;
			countdownElement.innerText = count;
			document.getElementById("countdown").classList.remove("invisible");
		
			// Check if countdown has reached 0
			if (count === 0) {
				clearInterval(countdownInterval);
				// countdownElement.innerText = "Done!";
				document.getElementById("game-zone").classList.remove("invisible");
				document.getElementById("countdown").classList.add("invisible");
				socket.emit("startPrompt", { punchlinePin: punchlinePin });
				startCountDownQuestion(questionCount);

			}
			}, 1000);
		}

		function startCountDownQuestion(count) {
			var countdownElement = document.getElementById("time");
			// var count = 11;

			countdownIntervalQuestion = setInterval(function() {
				count--;
				countdownElement.innerText = count;
			
				// Check if countdown has reached 0
				if (count === 0) {
					clearInterval(countdownIntervalQuestion);
					// document.getElementById("time").classList.add("invisible");
					// countdownElement.innerText = "Done!";
					// document.getElementById("game-zone").classList.add("invisible");
					// document.getElementById("countdown").remove();

					 socket.emit("timeIsUpToAnswer", { punchlinePin: punchlinePin });
					
				}
				}, 1000);
		}

		function startCountDownVote() {
			var countdownElement = document.getElementById("time");
			var count = 10;

			var countdownInterval = setInterval(function() {
				count--;
				countdownElement.innerText = count;
				
				// Check if countdown has reached 0
				if (count === 0) {
					clearInterval(countdownInterval);
					document.getElementById("time").classList.add("invisible");
					// countdownElement.innerText = "Done!";
					// document.getElementById("game-zone").classList.add("invisible");
					// document.getElementById("countdown").remove();

					 socket.emit("timeIsUpToVote", { punchlinePin: punchlinePin });
					
				}
				}, 1000);
		}
		
 
  

		function getQuestion(numberQuestion) {
			socket.emit("getQuestion", {
				punchlinePin: punchlinePin,
				numberQuestion: numberQuestion,
			});
		}

		socket.on("skipVoteQuestion", (data) => {
			// document.getElementById("game-zone").classList.add("invisible");
			// document.getElementById("time").classList.remove("invisible");
			// document.getElementById("countdown").classList.remove("invisible");
			getQuestion(data);
		});

		socket.on("question", function (data) {
			document.getElementById("question").textContent = data.question;
			document.getElementById("answer").classList.add("invisible");
			document.getElementById("points").classList.add("invisible");
			document.getElementById("player").classList.add("invisible");
			document.getElementById("game-zone").classList.add("invisible");
			document.getElementById("time").classList.remove("invisible");
			document.getElementById("countdown").classList.remove("invisible");
				startCountdown(6, 111);
		});

		socket.on("displayAnswers", function (data) {
			//montrer toutes les réponses une à une de manière aléatoire (pas dans l'ordre d'arrivée des réponses)
			// let randomAnswers = shuffle(data.game.answers);
			clearInterval(countdownIntervalQuestion);
			document.getElementById("time").classList.add("invisible");

			let index = 1;
            
			data.forEach((element) => {
				setTimeout(() => {
					document.getElementById("answer").textContent = element.textAnswer;
                    document.getElementById("answer").classList.remove("invisible");
				}, 5000 * index);
				index++;
			});

           

			setTimeout(function () {
				// document.getElementById('answer').remove();
				socket.emit("getVotes", { punchlinePin: punchlinePin });
                document.getElementById("answer").classList.add("invisible");
			}, data.length * 5000 + 5000);

            // startCountDownVote();

			//faire un emit "getVote" qui renvoie les joeurs sur la page de vote

			//créer la page de vote et envoyer les réponses de manière aléatoire
		});

		socket.on("redirect", (newGameURL) => {
			// redirect to new URL
			window.location = newGameURL;
		});

	

		socket.on("displayVotes", function (answers) {
			let index = 1;
			answers.forEach((element) => {
				if (element.votes > 0)
					setTimeout(() => {
                        document.getElementById("answer").classList.remove("invisible");
						document.getElementById("answer").textContent = element.textAnswer;
                        document.getElementById("player").classList.remove("invisible");
                        document.getElementById("player").textContent = element.playerName;
                        document.getElementById("points").classList.remove("invisible");
                        document.getElementById("points").textContent = "+ " + element.votes ;
					                           
					}, 5000 * index);
				index++;
			});

			setTimeout(function () {
				// document.getElementById('answer').remove();
				socket.emit("getQuestion", { punchlinePin: punchlinePin, numberQuestion: numberQuestion });
			
			
			}, answers.length * 5000 + 5000);

			

			//faire le vote pour chaque réponse le cas échéant
			//si un joueur / réponse a un ou plusieurs votes, afficher la réponse et le nombre de votes
			//afficher le nombre de points pour chaque joueur ?
			//renvoyer le nombre de points MAJ vers le back
			//passer à la question suivante s'il en reste une, sinon passer au tableau de score final
		});


		function home() {
			socket.emit("endGame", {
				punchlinePin: punchlinePin,
			});
			sessionStorage.clear();
			window.location.href = '/';
		}



		// Function to be executed when the URL changes
// function handleLocationChange() {
// 	// Add your code here to act upon the URL change
	
// 	socket.emit("endGame", {
// 		punchlinePin: punchlinePin,
// 	});
// 	sessionStorage.clear();
//   }
  
//   // Event listener for hash changes
//   window.onhashchange = handleLocationChange;
  
//   // Event listener for popstate changes
//   window.onpopstate = handleLocationChange;
