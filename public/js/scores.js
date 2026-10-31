// const socket = io();
const scoreTable = document.querySelector("#scoreTable");


window.onload = function () {
	punchlinePin = sessionStorage.getItem("punchlinePin");
	if (!punchlinePin) {
		window.location = "/";
		return;
	}
	socket.emit("joinRoom", punchlinePin, undefined, hostToken());
	if (window.PunchlineAudio) PunchlineAudio.setPhase("scores");
	socket.emit("getScores", {
		pin: punchlinePin,
	});
};

// Last scores received, to render the page again when the language changes
let lastScores = null;

function joinNames(names) {
	return names.length > 1 ? names.slice(0, -1).join(", ") + t("common.and") + names[names.length - 1] : names[0];
}

// Winner banner above the table (several names when there is a tie)
function displayWinner(scores) {
	const winner = document.getElementById("winner");
	if (!winner || scores.length === 0) {
		return;
	}
	const topPoints = scores[0].points;
	const winners = scores.filter((element) => element.points === topPoints);
	const names = winners.map((element) => element.name);

	i18nText(document.getElementById("winnerLabel"), winners.length > 1 ? "scores.tie" : "scores.winner");
	document.getElementById("winnerName").textContent = joinNames(names);
	i18nText(document.getElementById("winnerPoints"), "scores.pointsLabel", { count: topPoints });

	if (window.PunchlineAudio && winner.classList.contains("invisible")) PunchlineAudio.sfx("fanfare");
	winner.classList.remove("invisible");
	winner.classList.add("animate__animated", "animate__tada");
}

// Displays the final results
socket.on("scores", function (scores) {
	if (!Array.isArray(scores)) {
		return;
	}
	lastScores = scores;
	const table = document.createElement("table");
	table.className = "score-table";

	const caption = document.createElement("caption");
	caption.className = "sr-only";
	i18nText(caption, "scores.caption");
	table.appendChild(caption);

	const head = document.createElement("thead");
	const headRow = head.insertRow();
	["scores.rank", "scores.player", "scores.points"].forEach((key) => {
		const th = document.createElement("th");
		th.scope = "col";
		i18nText(th, key);
		headRow.appendChild(th);
	});
	table.appendChild(head);

	const body = document.createElement("tbody");

	// ranks are shared on a tie (1, 1, 3...)
	let rank = 0;
	let previousPoints;

	scores.forEach((element, position) => {
		if (element.points !== previousPoints) {
			rank = position + 1;
			previousPoints = element.points;
		}

		const row = body.insertRow();
		row.className = rank === 1 ? "score-row is-winner" : "score-row";

		let cell = row.insertCell();
		cell.className = "score-rank";
		const badge = document.createElement("span");
		badge.className = "score-rank-badge";
		badge.textContent = rank;
		cell.appendChild(badge);

		cell = row.insertCell();
		cell.className = "score-name";
		cell.textContent = element.name;

		cell = row.insertCell();
		cell.className = "score-points";
		cell.textContent = element.points;
	});

	table.appendChild(body);
	// avoids a duplicated table if the event is received twice
	scoreTable.replaceChildren(table);
	displayWinner(scores);
});


// The winner's names are joined with "&" / "et": render it again in the new language
onLangChange(function () {
	if (lastScores && lastScores.length > 0) {
		const names = lastScores.filter((element) => element.points === lastScores[0].points).map((element) => element.name);
		document.getElementById("winnerName").textContent = joinNames(names);
	}
});
