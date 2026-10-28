// const socket = io();

// default values if not loaded from config
var questionCountDown = 60;
var beforeQuestionCountDown = 6;
var voteCountDown = 10;
// seconds between two answers during the reveals (set by the host in the lobby)
var revealTime = 10;

// Reveal timeline, derived from revealTime (all in ms):
// - each answer starts revealSlot() after the previous one,
// - it stays visible revealVisible() (the slot minus a short blank gap),
// - the first answer comes after revealLeadIn() ("Time's up!" caption).
var REVEAL_GAP_MS = 3000;
function revealSlot() {
	return revealTime * 1000;
}
function revealVisible() {
	return revealSlot() - REVEAL_GAP_MS;
}
function revealLeadIn() {
	return Math.min(revealSlot(), 10000);
}
// time at which the reveal of n answers is over (last answer shown for its full time)
function revealEnd(n) {
	return n > 0 ? revealLeadIn() + (n - 1) * revealSlot() + revealVisible() : 5000;
}

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
// (a translation key + parameters, translated again if the language changes)
function setPhase(phase, labelKey, params) {
	stageElement.dataset.phase = phase;
	i18nText(phaseElement, labelKey, params);
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
	if (window.PunchlineAudio) PunchlineAudio.setPhase("countdown", count - 1);
	countdownInterval = setInterval(function () {
		count--;
		countdownElement.innerText = count;
		countdownElement.classList.remove("invisible");
		countdownElement.classList.add("fade-in");
		if (window.PunchlineAudio && count > 1) PunchlineAudio.sfx("tick");

		// Check if countdown has reached 0
		if (count === 1) {
			clearInterval(countdownInterval);
			gameZoneElement.classList.remove("invisible");
			setPhase("answering", "game.roundAnswering", { round: roundNumber });
			if (window.PunchlineAudio) { PunchlineAudio.setPhase("answering"); PunchlineAudio.sfx("go"); }
			// countdownElement.classList.add("hidden");
			socket.emit("startPrompt", { pin: punchlinePin });
			startCountDownQuestion(questionCount);
		}
	}, 1000);
}

function startCountDownQuestion(count) {
	clearInterval(countdownIntervalQuestion);
	countdownIntervalQuestion = setInterval(function () {
		count--;
		countdownElement.innerText = count;
		countdownElement.classList.toggle("is-urgent", count <= 10);
		if (window.PunchlineAudio && count <= 10 && count > 0) { PunchlineAudio.setUrgent(true); PunchlineAudio.sfx("urgentTick"); }

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
	socket.emit("getConfig", { pin: punchlinePin });
}

socket.on("getConfigResponse", function(data) {
	questionCountDown = data[0];
    beforeQuestionCountDown =data[1];
    voteCountDown = data[2];
	if (data[3]) {
		revealTime = data[3];
	}
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
	setPhase("ready", "game.roundReady", { round: roundNumber });
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
	setPhase("answers", "game.timesUp");
	if (window.PunchlineAudio) PunchlineAudio.setPhase("reveal");

	let index = 1;

	data.forEach((element, position) => {
		setTimeout(() => {
			setPhase("answers", "game.answerOf", { index: position + 1, total: data.length });
			answerElement.textContent = element.textAnswer;
			responseBoxElement.scrollIntoView({ behavior: 'smooth' });
			responseBoxElement.classList.remove("invisible");
			if (window.PunchlineAudio) PunchlineAudio.sfx("pop");

			setTimeout(() => {
				responseBoxElement.classList.add("invisible");
			}, revealVisible());

		}, revealLeadIn() + revealSlot() * (index - 1));
		
		index++;
	});

	setTimeout(function () {
		socket.emit("getVotes", { pin: punchlinePin });
		setPhase("voting", "game.voting");
		responseBoxElement.classList.add("invisible");
	}, revealEnd(data.length));
});

socket.on("displayVotes", function (answers) {
	if (votesDisplayed) {
		return;
	}
	votesDisplayed = true;
	// no countdown during the votes reveal
	clearInterval(countdownIntervalQuestion);
	countdownElement.classList.add("invisible");

	// only the answers which received votes are displayed (no empty 9s pause for the others)
	let votedAnswers = answers.filter((element) => element.votes > 0);
	setPhase("votes", votedAnswers.length > 0 ? "game.votesIntro" : "game.noVotes");
	let index = 1;
	votedAnswers.forEach((element, position) => {
		setTimeout(() => {
			setPhase("votes", "game.votesOf", { index: position + 1, total: votedAnswers.length });
			responseBoxElement.classList.remove("invisible");
			answerElement.textContent = element.textAnswer;
			playerElement.textContent = element.playerName;
			pointsBoxElement.classList.remove("invisible");
			pointsElement.textContent = "+" + element.votes;
			if (window.PunchlineAudio) PunchlineAudio.sfx("ding", element.votes);

			pointsBoxElement.scrollIntoView({ behavior: 'smooth' });

			setTimeout(() => {
				responseBoxElement.classList.add("invisible");
				pointsBoxElement.classList.add("invisible");
			}, revealVisible());

		}, revealLeadIn() + revealSlot() * (index - 1));
		index++;
	});

	setTimeout(function () {
		socket.emit("getQuestion", {
			pin: punchlinePin,
			numberQuestion: numberQuestion,
		});
		countdownElement.scrollIntoView({ behavior: 'smooth' });
	}, revealEnd(votedAnswers.length));
});

