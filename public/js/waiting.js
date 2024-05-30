const socket = io();
let punchlinePin;
let playerName;

window.onload = function () {
    playerName = sessionStorage.getItem('playerName');
    punchlinePin = sessionStorage.getItem('punchlinePin');

    if (playerName && punchlinePin) {
        socket.emit('joinRoom', punchlinePin, playerName);
    } else {
        window.location = "/";
    }

    
}

        socket.on('redirect', (newGameURL, clear) => {
   			 // redirect to new URL
   			 window.location = newGameURL;
             if(clear === 'clear') {
                sessionStorage.clear();
             }
		});


        function home() {
        window.location.href = '/';
    }
