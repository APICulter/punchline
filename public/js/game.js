const socket = io();

var questionCountDown = 61;
var beforeQuestionCountDown = 6;
var voteCountDown = 10;

let punchlinePin;
let numberQuestion = 0;

var countdownIntervalQuestion;

window.onload = function () {
	punchlinePin = sessionStorage.getItem("punchlinePin");
	playerName = sessionStorage.getItem("playerName");

	if (punchlinePin && !playerName) {
		socket.emit("joinRoom", punchlinePin, playerName);
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

	// Update the countdown every second
	var countdownInterval = setInterval(function () {
		count--;
		countdownElement.innerText = count;
		document.getElementById("countdown").classList.remove("invisible");

		// Check if countdown has reached 0
		if (count === 0) {
			clearInterval(countdownInterval);
			document.getElementById("game-zone").classList.remove("invisible");
			document.getElementById("countdown").classList.add("invisible");
			socket.emit("startPrompt", { punchlinePin: punchlinePin });
			startCountDownQuestion(questionCount);
		}
	}, 1000);
}

function startCountDownQuestion(count) {
	var countdownElement = document.getElementById("time");

	countdownIntervalQuestion = setInterval(function () {
		count--;
		countdownElement.innerText = count;

		// Check if countdown has reached 0
		if (count === 0) {
			clearInterval(countdownIntervalQuestion);
			socket.emit("timeIsUpToAnswer", { punchlinePin: punchlinePin });
		}
	}, 1000);
}

function startCountDownVote() {
	var countdownElement = document.getElementById("time");
	var count = voteCountDown;

	var countdownInterval = setInterval(function () {
		count--;
		countdownElement.innerText = count;

		// Check if countdown has reached 0
		if (count === 0) {
			clearInterval(countdownInterval);
			document.getElementById("time").classList.add("invisible");
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
	startCountdown(beforeQuestionCountDown, questionCountDown);
});

// Displays answers randomly
socket.on("displayAnswers", function (data) {
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
		socket.emit("getVotes", { punchlinePin: punchlinePin });
		document.getElementById("answer").classList.add("invisible");
	}, data.length * 5000 + 5000);
});

socket.on("redirect", (newGameURL) => {
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
				document.getElementById("points").textContent = "+ " + element.votes;
			}, 5000 * index);
		index++;
	});

	setTimeout(function () {
		socket.emit("getQuestion", {
			punchlinePin: punchlinePin,
			numberQuestion: numberQuestion,
		});
	}, answers.length * 5000 + 5000);
});

function home() {
	socket.emit("endGame", {
		punchlinePin: punchlinePin,
	});
	sessionStorage.clear();
	window.location.href = "/";
}
