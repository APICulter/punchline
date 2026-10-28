// const socket = io();
const scoreTable = document.querySelector("#scoreTable");


window.onload = function () {
	punchlinePin = sessionStorage.getItem("punchlinePin");
	if (!punchlinePin) {
		window.location = "/";
		return;
	}
	socket.emit("joinRoom", punchlinePin);
	socket.emit("getScores", {
		pin: punchlinePin,
	});
};

function pointsLabel(points) {
	return points + (Number(points) === 1 ? " point" : " points");
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

	document.getElementById("winnerLabel").textContent = winners.length > 1 ? "It's a tie!" : "The winner is";
	document.getElementById("winnerName").textContent =
		names.length > 1 ? names.slice(0, -1).join(", ") + " & " + names[names.length - 1] : names[0];
	document.getElementById("winnerPoints").textContent = pointsLabel(topPoints);

	winner.classList.remove("invisible");
	winner.classList.add("animate__animated", "animate__tada");
}

// Displays the final results
socket.on("scores", function (scores) {
	const table = document.createElement("table");
	table.className = "score-table";

	const caption = document.createElement("caption");
	caption.className = "sr-only";
	caption.textContent = "Final scores";
	table.appendChild(caption);

	const head = document.createElement("thead");
	const headRow = head.insertRow();
	["Rank", "Player", "Points"].forEach((label) => {
		const th = document.createElement("th");
		th.scope = "col";
		th.textContent = label;
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
