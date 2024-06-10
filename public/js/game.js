// const socket = io();

// default values in not loaded from config
var questionCountDown = 61;
var beforeQuestionCountDown = 6;
var voteCountDown = 10;

// let punchlinePin;
let numberQuestion = 0;

var countdownIntervalQuestion;
var countdownElement = document.getElementById("countdown");
var gameZoneElement = document.getElementById("gameZone");
var responseBoxElement = document.getElementById("answerBox");
var pointsBoxElement = document.getElementById("pointsBox");
var answerElement = document.getElementById("answer");
var playerElement = document.getElementById("player");
var pointsElement = document.getElementById("points");


window.onload = function () {
	punchlinePin = sessionStorage.getItem("punchlinePin");
	playerName = sessionStorage.getItem("playerName");

	if (punchlinePin && !playerName) {
		socket.emit("joinRoom", punchlinePin, playerName);
		getConfig();
		getQuestion(numberQuestion);
		document.querySelector("#punchlinePin").textContent = punchlinePin;
	} else {
		window.location = "/";
		socket.emit("endGame", {
			pin: punchlinePin,
		});
		sessionStorage.clear();
	}
};

// Function to start the countdown
function startCountdown(count, questionCount) {
	

	// Update the countdown every second
	var countdownInterval = setInterval(function () {
		count--;
		countdownElement.innerText = count;
		countdownElement.classList.remove("hidden");

		// Check if countdown has reached 0
		if (count === 0) {
			clearInterval(countdownInterval);
			gameZoneElement.classList.remove("invisible");
			// countdownElement.classList.add("hidden");
			socket.emit("startPrompt", { pin: punchlinePin });
			startCountDownQuestion(questionCount);
		}
	}, 1000);
}

function startCountDownQuestion(count) {

	countdownIntervalQuestion = setInterval(function () {
		count--;
		countdownElement.innerText = count;

		// Check if countdown has reached 0
		if (count === 0) {
			clearInterval(countdownIntervalQuestion);
			socket.emit("timeIsUpToAnswer", { pin: punchlinePin });
		}
	}, 1000);
}

// function startCountDownVote() {
// 	var countdownElement = document.getElementById("time");
// 	var count = voteCountDown;

// 	var countdownInterval = setInterval(function () {
// 		count--;
// 		countdownElement.innerText = count;

// 		// Check if countdown has reached 0
// 		if (count === 0) {
// 			clearInterval(countdownInterval);
// 			document.getElementById("time").classList.add("invisible");
// 			socket.emit("timeIsUpToVote", { punchlinePin: punchlinePin });
// 		}
// 	}, 1000);
// }

function getQuestion(numberQuestion) {
	socket.emit("getQuestion", {
		pin: punchlinePin,
		numberQuestion: numberQuestion,
	});
}

function getConfig(){
	socket.emit("getConfig");
}

socket.on("getConfigResponse", function(data) {
	questionCountDown = data[0];
    beforeQuestionCountDown =data[1];
    voteCountDown = data[2];
});

// socket.on("skipVoteQuestion", (data) => {
// 	getQuestion(data);
// });

// prepares the game screen for the next question
socket.on("question", function (data) {
	document.getElementById("question").textContent = data.question;
	responseBoxElement.classList.add("invisible");
	pointsBoxElement.classList.add("invisible");
	gameZoneElement.classList.add("invisible");
	countdownElement.classList.remove("invisible");
	startCountdown(beforeQuestionCountDown, questionCountDown);
});

// Displays answers randomly
socket.on("displayAnswers", function (data) {
	clearInterval(countdownIntervalQuestion);
	// ligne pour tester
	// document.getElementById("time").classList.add("invisible");
	countdownElement.classList.add("invisible");

	let index = 1;

	data.forEach((element) => {
		setTimeout(() => {
			answerElement.textContent = element.textAnswer;
			responseBoxElement.scrollIntoView({ behavior: 'smooth' });
			responseBoxElement.classList.remove("invisible");
			
			setTimeout(() => {
				responseBoxElement.classList.add("invisible");
			}, 6000);

		}, 9000 * index);
		
		index++;
	});

	setTimeout(function () {
		socket.emit("getVotes", { pin: punchlinePin });
		responseBoxElement.classList.add("invisible");
	}, data.length * 9000 + 5000);
});



// socket.on("redirect", (newGameURL) => {
// 	window.location = newGameURL;
// });

socket.on("displayVotes", function (answers) {
	
	let index = 1;
	answers.forEach((element) => {
		if (element.votes > 0)
			setTimeout(() => {
				responseBoxElement.classList.remove("invisible");
				answerElement.textContent = element.textAnswer;
				// document.getElementById("player").classList.remove("invisible");
				playerElement.textContent = element.playerName;
				pointsBoxElement.classList.remove("invisible");
				pointsElement.textContent = "+" + element.votes;

				pointsBoxElement.scrollIntoView({ behavior: 'smooth' });

				setTimeout(() => {
					responseBoxElement.classList.add("invisible");
					// document.getElementById("player").classList.add("invisible");
					pointsBoxElement.classList.add("invisible");

				}, 6000);

			}, 9000 * index);
		index++;
	});

	setTimeout(function () {
		socket.emit("getQuestion", {
			pin: punchlinePin,
			numberQuestion: numberQuestion,
		});
		countdownElement.scrollIntoView({ behavior: 'smooth' });
	}, answers.length * 9000 + 5000);
});



// To go back to the lobby
// function home() {
// 	socket.emit("endGame", {
// 		pin: punchlinePin,
// 	});
// 	sessionStorage.clear();
// }
// document.getElementById("home").addEventListener("click", function () {
	
// });
