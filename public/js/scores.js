var socket = io();
let punchlinePin;

window.onload = function () {
	punchlinePin = sessionStorage.getItem("punchlinePin");
	socket.emit("joinRoom", punchlinePin);
	socket.emit("getScores", {
		punchlinePin: punchlinePin,
	});
};

socket.on("redirect", (newGameURL) => {
	window.location = newGameURL;
});

// Displays the final results
socket.on("scores", function (scores) {
	const table = document.createElement("table");
	table.className += "mb-20";
	const body = document.createElement("tbody");
	body.className += "drop-shadow-xl";

	var row = body.insertRow();
	var cell = row.insertCell();
	var text = document.createTextNode("Rank");
	cell.className =
		"w-20 p-4 text-center bg-stone-900 rounded-tl-lg border-stone-900 text-gray-200  text-bold";
	cell.appendChild(text);

	cell = row.insertCell();
	text = document.createTextNode("Player");
	cell.className =
		"w-20 p-4 text-center bg-indigo-500 border-indigo-500  text-bold";
	cell.appendChild(text);

	cell = row.insertCell();
	text = document.createTextNode("Points");
	cell.className =
		"w-20 p-4 text-center bg-amber-500 rounded-tr-lg border-amber-500 text-bold";
	cell.appendChild(text);

	var lastElement = scores[scores.length - 1];

	scores.forEach((element) => {
		var row = body.insertRow();

		var cell = row.insertCell();
		var text = document.createTextNode(scores.indexOf(element) + 1);
		cell.appendChild(text);
		cell.className =
			"w-20 p-4 border-r-2 text-center text-stone-950 bg-gray-100";
		if (lastElement == element) {
			cell.className += " rounded-bl-lg";
		}

		cell = row.insertCell();
		text = document.createTextNode(element.name);
		cell.appendChild(text);
		cell.className =
			"w-20 p-4 border-r-2 text-center text-stone-950 bg-gray-100";

		cell = row.insertCell();
		text = document.createTextNode(element.points);
		cell.appendChild(text);
		cell.className = "w-20 p-4 text-center text-stone-950 bg-gray-100";
		if (lastElement == element) {
			cell.className += " rounded-br-lg";
		}

		body.appendChild(row);
	});

	table.appendChild(body);
	document.querySelector("#score-table").appendChild(table);
});

// To go back to the lobby
document.getElementById("home").addEventListener("click", function () {
	socket.emit("endGame", {
		punchlinePin: punchlinePin,
	});
	sessionStorage.clear();
});
