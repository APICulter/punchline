// const socket = io();

// default values if not loaded from config
var questionCountDown = 60;
var beforeQuestionCountDown = 6;
// seconds to vote (set by the host in the lobby); the server sends the exact time left
var voteCountDown = 30;
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
// number of rounds of the game (sent with each question), 0 if unknown
var totalRounds = 0;

// Clock of the reveals and of the votes (next to the phase caption, where the answer countdown
// was): seconds before the next step, or the votes received while the phones vote
var phaseClockElement = document.getElementById("phaseClock");
var phaseTimerElement = document.getElementById("phaseTimer");
var phaseClockLabelElement = document.getElementById("phaseClockLabel");
var phaseVotesElement = document.getElementById("phaseVotes");
var revealBarElement = document.getElementById("revealBar");
var phaseClockInterval = null;

function stopPhaseClock() {
	clearInterval(phaseClockInterval);
	phaseClockInterval = null;
	phaseClockElement.classList.add("invisible");
	phaseTimerElement.classList.remove("is-urgent", "is-waiting");
	phaseVotesElement.classList.add("hidden");
	voteClock = null;
}

// Counts down durationMs (never below 0) and hides itself when the time is over
function startPhaseClock(durationMs, labelKey) {
	stopPhaseClock();
	let endAt = Date.now() + Math.max(0, durationMs);
	i18nText(phaseClockLabelElement, labelKey);
	phaseTimerElement.classList.remove("is-waiting");
	let tick = function () {
		let left = endAt - Date.now();
		if (left <= 0) {
			stopPhaseClock();
			return;
		}
		phaseTimerElement.textContent = Math.ceil(left / 1000);
	};
	tick();
	if (endAt > Date.now()) {
		phaseClockElement.classList.remove("invisible");
		phaseClockInterval = setInterval(tick, 200);
	}
}

// The votes: votes received / awaited and the seconds left to vote (the server closes the votes
// at the deadline). "remainingMs" is the time left when the server sent it: the local end time is
// computed at reception, so the clocks of the server and of this screen do not matter.
// Until the server tells, "…".
var voteClock = null; // { votes, expected, endAt } (endAt: local ms, null if unknown)

function showVoteProgress(votes, expected, remainingMs) {
	let previous = voteClock;
	stopPhaseClock();
	voteClock = {
		votes: Number.isInteger(votes) ? votes : null,
		expected: Number.isInteger(expected) ? expected : null,
		endAt: Number.isFinite(remainingMs) ? Date.now() + Math.max(0, remainingMs) : previous ? previous.endAt : null,
	};
	i18nText(phaseClockLabelElement, "game.clock.votes");
	let clock = voteClock;
	let lastSecond = null;
	let tick = function () {
		let hasCount = clock.votes !== null && clock.expected !== null && clock.expected > 0;
		phaseVotesElement.textContent = hasCount ? clock.votes + "/" + clock.expected : "";
		phaseVotesElement.classList.toggle("hidden", !hasCount);
		if (clock.endAt === null) {
			phaseTimerElement.classList.add("is-waiting");
			phaseTimerElement.textContent = "…";
			if (hasCount) {
				i18nAttr(phaseClockElement, "aria-label", "game.clock.votesCount", { votes: clock.votes, expected: clock.expected });
			}
			return;
		}
		let seconds = Math.max(0, Math.ceil((clock.endAt - Date.now()) / 1000));
		phaseTimerElement.classList.remove("is-waiting");
		phaseTimerElement.textContent = seconds;
		// urgent under 10 s, like the answer countdown (stays at 0 until the server closes the votes)
		phaseTimerElement.classList.toggle("is-urgent", seconds <= 10);
		if (seconds !== lastSecond) {
			if (lastSecond !== null && seconds > 0 && seconds <= 5 && window.PunchlineAudio) PunchlineAudio.sfx("tick");
			lastSecond = seconds;
			i18nAttr(phaseClockElement, "aria-label", "game.clock.votesTimed", {
				votes: hasCount ? clock.votes : 0,
				expected: hasCount ? clock.expected : 0,
				seconds: seconds,
			});
		}
	};
	tick();
	phaseClockElement.classList.remove("invisible");
	if (clock.endAt !== null) {
		phaseClockInterval = setInterval(tick, 200);
	}
}

// Thin bar under the answer shown: drains while the answer stays on screen
function startRevealBar(durationMs) {
	revealBarElement.classList.remove("is-running");
	revealBarElement.style.setProperty("--reveal-ms", Math.max(0, durationMs) + "ms");
	void revealBarElement.offsetWidth;
	revealBarElement.classList.add("is-running");
}

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
		socket.emit("joinRoom", punchlinePin, playerName, hostToken());
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
	// the full answer time right away: otherwise the "1" of the countdown before the question
	// stays on screen until the first tick, one second later
	countdownElement.innerText = count;
	countdownElement.classList.toggle("is-urgent", count <= 10);
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
    if (data[2]) {
		voteCountDown = data[2];
	}
	if (data[3]) {
		revealTime = data[3];
	}
});

// prepares the game screen for the next question
socket.on("question", function (data) {
	answersDisplayed = false;
	votesDisplayed = false;
	stopPhaseClock();
	totalRounds = Number.isInteger(data.total) ? data.total : 0;
	document.getElementById("question").textContent = data.question;
	// the question's position in the game (also right after a server restart), else a local count
	roundNumber = Number.isInteger(data.id) ? data.id + 1 : readRoundNumber() + 1;
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

// The host switches the language: the server replaces the questions still to come
if (typeof onLangChange === "function") {
	onLangChange(function (lang) {
		if (punchlinePin) socket.emit("setGameLang", { pin: punchlinePin, lang: lang });
	});
}
socket.on("gameLangChanged", function (key) {
	showNotice(key);
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
	// time before the votes open (same timeline as the reveal below)
	startPhaseClock(revealEnd(data.length), "game.clock.toVotes");

	let index = 1;

	data.forEach((element, position) => {
		setTimeout(() => {
			setPhase("answers", "game.answerOf", { index: position + 1, total: data.length });
			answerElement.textContent = element.textAnswer;
			responseBoxElement.scrollIntoView({ behavior: 'smooth' });
			responseBoxElement.classList.remove("invisible");
			startRevealBar(revealVisible());
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
		showVoteProgress(null, null, NaN);
	}, revealEnd(data.length));
});

// Votes received so far (sent when the vote opens and after each vote)
socket.on("voteProgress", function (data) {
	if (stageElement.dataset.phase !== "voting" || votesDisplayed || !data) {
		return;
	}
	let remainingMs = Number(data.remainingMs);
	if (!Number.isFinite(remainingMs) && Number.isFinite(Number(data.remaining))) {
		remainingMs = Number(data.remaining) * 1000;
	}
	showVoteProgress(Number(data.votes), Number(data.expected), remainingMs);
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
	// time before the next question (or the final scores after the last round)
	let lastRound = totalRounds > 0 && roundNumber >= totalRounds;
	startPhaseClock(revealEnd(votedAnswers.length), lastRound ? "game.clock.toScores" : "game.clock.toNext");
	let index = 1;
	votedAnswers.forEach((element, position) => {
		setTimeout(() => {
			setPhase("votes", "game.votesOf", { index: position + 1, total: votedAnswers.length });
			responseBoxElement.classList.remove("invisible");
			answerElement.textContent = element.textAnswer;
			playerElement.textContent = element.playerName;
			pointsBoxElement.classList.remove("invisible");
			pointsElement.textContent = "+" + element.votes;
			startRevealBar(revealVisible());
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

