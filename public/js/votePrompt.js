const socket = io();
// let punchlinePin;

window.onload = function () {
        punchlinePin = sessionStorage.getItem("punchlinePin");
        socket.emit('getAnswers', { punchlinePin: punchlinePin });
    };

    socket.on('postAnswers', function (data) {
        //randomizer
        data.forEach(element => {
            let answerBlock = document.createElement('div');
            answerBlock.id = data.indexOf(element);
            answerBlock.className += "cursor-pointer h-10 min-w-max text-left mx-4 p-2 bg-indigo-400 rounded-md shadow text-gray-200 hover:bg-indigo-500 checked:bg-indigo-500 checked:checked:bg-indigo-500";
            answerBlock.textContent = element.textAnswer;

            let answer = document.createElement('input');
            answer.setAttribute("type", "radio");
            answer.id = element.playerName;
            answer.value = element.textAnswer;
            answer.name = 'answer';
            answer.className += "invisible";

            let label = document.createElement('label');
            label.setAttribute("for", answer.id);
            label.id = "label-" + data.indexOf(element);

            document.getElementById('answers').append(answer);
            document.getElementById('answers').append(label);
            document.getElementById(label.id).append(answerBlock);

            // document.getElementById(answerBlock.id).prepend(answer);
            // document.getElementById(answerBlock.id).prepend(label);
            
            // document.getElementById(answerBlock.id).append(answer);
            // document.getElementById(answerBlock.id).append(label);
        });



        
    });

    // const form = document.querySelector("form");
    //envoyer juste l'id ou le nom du joueur plutot que la réponse...
    const button = document.querySelector('#vote');
    button.addEventListener('click', function() {

        let answer = document.querySelector('input[name=answer]:checked').id;
        socket.emit('vote', answer, punchlinePin);
        // window.location = "/html/waiting.html";
        });

   socket.on('redirect', newGameURL => {
            // redirect to new URL
            window.location = newGameURL;
    });
