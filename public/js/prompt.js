const socket = io();
let punchlinePin;
let playerName;

window.onload = function () {
    playerName = sessionStorage.getItem('playerName');
    punchlinePin = sessionStorage.getItem('punchlinePin');
}

socket.on('redirect', newGameURL => {
            // redirect to new URL
            window.location = newGameURL;
    });

function sendAnswer() {
    if (document.getElementById('answer').value.length > 0) {
        socket.emit('answer', { answer: document.getElementById('answer').value, punchlinePin: punchlinePin, playerName: playerName });
        document.getElementById('button').setAttribute('disabled', 'disabled');
    }
   
}

socket.on('redirect', newGameURL => {
            // redirect to new URL
            window.location = newGameURL;
        //  sessionStorage.setItem('punchlinePin', gamePin);
    });