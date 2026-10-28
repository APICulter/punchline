// const socket = io();

// default values if not loaded from config
var questionCountDown = 61;
var beforeQuestionCountDown = 6;
var voteCountDown = 10;

// let punchlinePin;
let numberQuestion = 0;

var countdownInterval;
var countdownIntervalQuestion;
// prevents displaying the answers / votes twice for the same round
var answersDisplayed = false;
var votesDisplayed = false;
var countdownElement = document.getElementById("countdown");
var gameZoneElement = document.getElementById("gameZone");
var responseBoxElement = document.getElementById("answerBox");
var pointsBoxElement = document.getElementById("pointsBox");
var answerElement = document.getElementById("answer");
var playerElement = document.getElementById("player");
var pointsElement = document.getElementById("points");
var stageElement = document.getElementById("stage");
var phaseElement = document.getElementById("phase");
// display only: the round number shown above the question (the server keeps the real count)
var roundNumber = 0;

// Last round shown for this game (survives a reload of the host screen)
function readRoundNumber() {
	try {
		let saved = String(sessionStorage.getItem("punchlineRound") || "").split(":");
		if (saved[0] === String(punchlinePin)) {
			return parseInt(saved[1], 10) || 0;
		}
	} catch (e) {}
	return 0;
}

// Visual phase of the big screen (ready, answering, answers, voting, votes) and its caption
function setPhase(phase, label) {
	stageElement.dataset.phase = phase;
	phaseElement.textContent = label;
}


window.onload = function () {
	punchlinePin = sessionStorage.getItem("punchlinePin");
	playerName = sessionStorage.getItem("playerName");

	if (punchlinePin && !playerName) {
		socket.emit("joinRoom", punchlinePin, playerName);
		getConfig();
		getQuestion(numberQuestion);
		document.querySelector("#punchlinePin").textContent = punchlinePin;
	} else {
		// not the host of a game (no pin, or a player): back to the lobby
		// (no "endGame" here: a player opening this page must not end the game of everyone)
		window.location = "/";
	}
};

// Function to start the countdown
function startCountdown(count, questionCount) {
	// Update the countdown every second (stop the previous countdowns if any)
	clearInterval(countdownInterval);
	clearInterval(countdownIntervalQuestion);
	countdownInterval = setInterval(function () {
		count--;
		countdownElement.innerText = count;
		countdownElement.classList.remove("invisible");
		countdownElement.classList.add("fade-in");

		// Check if countdown has reached 0
		if (count === 1) {
			clearInterval(countdownInterval);
			gameZoneElement.classList.remove("invisible");
			setPhase("answering", "Round " + roundNumber + " \u00b7 Answer on your phone");
			// countdownElement.classList.add("hidden");
			socket.emit("startPrompt", { pin: punchlinePin });
			startCountDownQuestion(questionCount);
			document.getElementById("audio-player").play().catch(() => {
				// autoplay blocked by the browser: the music starts after a user interaction
			});
		}
	}, 1000);
}

function startCountDownQuestion(count) {
	clearInterval(countdownIntervalQuestion);
	countdownIntervalQuestion = setInterval(function () {
		count--;
		countdownElement.innerText = count;
		countdownElement.classList.toggle("is-urgent", count <= 10);

		// Check if countdown has reached 0
		if (count === 0) {
			clearInterval(countdownIntervalQuestion);
			socket.emit("timeIsUpToAnswer", { pin: punchlinePin });
			countdownElement.classList.add("fade-out");
			countdownElement.classList.remove("fade-in");
		}
	}, 1000);
}

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

// prepares the game screen for the next question
socket.on("question", function (data) {
	answersDisplayed = false;
	votesDisplayed = false;
	document.getElementById("question").textContent = data.question;
	roundNumber = readRoundNumber() + 1;
	try {
		sessionStorage.setItem("punchlineRound", punchlinePin + ":" + roundNumber);
	} catch (e) {}
	setPhase("ready", "Round " + roundNumber + " \u00b7 Get ready");
	countdownElement.classList.remove("is-urgent");
	responseBoxElement.classList.add("invisible");
	pointsBoxElement.classList.add("invisible");
	gameZoneElement.classList.add("invisible");
	startCountdown(beforeQuestionCountDown, questionCountDown);
});

// Displays answers randomly
socket.on("displayAnswers", function (data) {
	clearInterval(countdownIntervalQuestion);
	if (answersDisplayed) {
		return;
	}
	answersDisplayed = true;
	countdownElement.classList.add("invisible");
	setPhase("answers", "Time's up! Here are the answers");

	let index = 1;

	data.forEach((element, position) => {
		setTimeout(() => {
			setPhase("answers", "Answer " + (position + 1) + " of " + data.length);
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
		setPhase("voting", "Vote for your favourite on your phone");
		responseBoxElement.classList.add("invisible");
	}, data.length * 9000 + 5000);
});

socket.on("displayVotes", function (answers) {
	if (votesDisplayed) {
		return;
	}
	votesDisplayed = true;

	// only the answers which received votes are displayed (no empty 9s pause for the others)
	let votedAnswers = answers.filter((element) => element.votes > 0);
	setPhase("votes", votedAnswers.length > 0 ? "And the votes go to…" : "No votes this round");
	let index = 1;
	votedAnswers.forEach((element, position) => {
		setTimeout(() => {
			setPhase("votes", "Votes \u00b7 " + (position + 1) + " of " + votedAnswers.length);
			responseBoxElement.classList.remove("invisible");
			answerElement.textContent = element.textAnswer;
			playerElement.textContent = element.playerName;
			pointsBoxElement.classList.remove("invisible");
			pointsElement.textContent = "+" + element.votes;

			pointsBoxElement.scrollIntoView({ behavior: 'smooth' });

			setTimeout(() => {
				responseBoxElement.classList.add("invisible");
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
	}, votedAnswers.length * 9000 + 5000);
});

