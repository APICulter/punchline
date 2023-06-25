const socket = io();
		let punchlinePin;
		let playerName;
		let numberQuestion = 0;

		window.onload = function () {
			playerName = sessionStorage.getItem("playerName");
			punchlinePin = sessionStorage.getItem("punchlinePin");
			getQuestion(numberQuestion);
			startCountdown();
		};

		// Function to start the countdown
		function startCountdown() {
			var countdownElement = document.getElementById("countdown");
			var count = 5;
		
			// Update the countdown every second
			var countdownInterval = setInterval(function() {
			count--;
			countdownElement.innerText = count;
		
			// Check if countdown has reached 0
			if (count === 0) {
				clearInterval(countdownInterval);
				// countdownElement.innerText = "Done!";
				document.getElementById("game-zone").classList.remove("invisible");
				document.getElementById("countdown").remove();
				startCountDownQuestion();
				
			}
			}, 1000);
		}

		function startCountDownQuestion() {
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

					 socket.emit("timeIsUp", { punchlinePin: punchlinePin });
					
				}
				}, 1000);
		}
		
 
  

		function getQuestion(numberQuestion) {
			socket.emit("getQuestion", {
				punchlinePin: punchlinePin,
				numberQuestion: numberQuestion,
			});
		}

		socket.on("question", function (data) {
				document.getElementById("question").textContent = data.question;
		});

		socket.on("displayAnswers", function (data) {
			//montrer toutes les réponses une à une de manière aléatoire (pas dans l'ordre d'arrivée des réponses)
			// let randomAnswers = shuffle(data.game.answers);
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
				socket.emit("getQuestion", { punchlinePin: punchlinePin });
			}, answers.length * 5000 + 5000);

			//faire le vote pour chaque réponse le cas échéant
			//si un joueur / réponse a un ou plusieurs votes, afficher la réponse et le nombre de votes
			//afficher le nombre de points pour chaque joueur ?
			//renvoyer le nombre de points MAJ vers le back
			//passer à la question suivante s'il en reste une, sinon passer au tableau de score final
		});
