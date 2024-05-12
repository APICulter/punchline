const socket = io();
// let punchlinePin;

window.onload = function () {
        punchlinePin = sessionStorage.getItem("punchlinePin");
        playerName = sessionStorage.getItem('playerName');

        if (playerName && punchlinePin) {
            socket.emit('joinRoom', punchlinePin, playerName);
            socket.emit('getAnswers', { punchlinePin: punchlinePin });
        } else {
            window.location = "/";
        }

        
    };

    socket.on('postAnswers', function (data) {
        //randomizer
        data.forEach(element => {

            let answer = document.createElement('input');
            answer.setAttribute("type", "radio");
            answer.id = element.playerName;
            answer.value = element.textAnswer;
            answer.name = 'answer';
            answer.className += "invisible w-0";

            let answerBlock = document.createElement('div');
            answerBlock.id = data.indexOf(element);
            answerBlock.className += " cursor-pointer text-left p-2 bg-indigo-400 rounded-md shadow text-gray-200 max-w-lg";
            if (element.playerName == sessionStorage.getItem("playerName")) {
                answer.setAttribute("disabled", "true");
                answerBlock.classList.remove("bg-indigo-400");
                answerBlock.classList.add("bg-stone-600");
            }
            answerBlock.textContent = element.textAnswer;
            
            let label = document.createElement('label');
            label.setAttribute("for", answer.id);
            label.id = "label-" + data.indexOf(element);
            // document.getElementById(label.id).style.pointerEvents = "none";
            // document.getElementById(label.id).disabled=true;
            // document.getElementById(label.id).setAttribute("disabled", "true");

            document.getElementById('answers').append(answer);
            document.getElementById('answers').append(label);
            document.getElementById(label.id).append(answerBlock);

            // document.getElementById(answerBlock.id).prepend(answer);
            // document.getElementById(answerBlock.id).prepend(label);
            
            // document.getElementById(answerBlock.id).append(answer);
            // document.getElementById(answerBlock.id).append(label);
        });



        
    });


    // const radioButtons = document.querySelectorAll('input[name="answer"]');
    // radioButtons.forEach(function(radioButton) {
    //     if (radioButton.id == sessionStorage.getItem("playerName")) {
    //         document.getElementById(label.id).setAttribute("disabled");
    //     }
    // });
    // // Loop through each radio button and add an event listener
    // radioButtons.forEach(function(radioButton) {
    // radioButton.addEventListener('change', function() {
    //     if (this.checked) {
    //         console.log("Radio button is checked");
    //     // Code to execute when the radio button is checked
    //     // radioButton.classList.add("bg-indigo-500");
    //     } else {
    //         console.log("Radio button is NOT checked");
    //     // Code to execute when the radio button is unchecked
    //     // radioButton.classList.add("bg-indigo-400");
    //     }
    // });
    // });

// let checked = document.querySelector('input[name=answer]');
// checked.addEventListener('change', function() {
//     alert('dt');
// });




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



    function home() {
        window.location.href = '/';
    }

   
