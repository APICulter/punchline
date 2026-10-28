/* ==========================================================================
   Punchline i18n: English / French
   Loaded on every page before common.js and the page scripts.

   - t(key, params)      translated string, {name} placeholders, {name|duration}
                         formats a number of seconds; a value can be an object
                         { one, other } chosen with params.count (plural).
   - getLang(), setLang(lang), onLangChange(fn)
   - applyTranslations(root) fills the elements marked with
       data-i18n="key"             textContent
       data-i18n-placeholder="key" placeholder
       data-i18n-aria-label="key"  aria-label
       data-i18n-title="key"       title
       data-i18n-empty="key"       data-empty (empty list message)
       data-i18n-html="key"        innerHTML, ONLY for static trusted strings
                                   of this file, never for player content
     with optional data-i18n-params='{"count":2}' (JSON) for the placeholders.
   - i18nText(el, key, params) / i18nAttr(el, attr, key, params) mark an element
     created in JS so that it is translated again when the language changes.
   - i18nMessage(payload) translates a message key sent by the server
     ("error.roomFull"), or returns any other string unchanged.

   French typography:   (narrow no-break space) before ! ? ; and
     (no-break space) before : and inside « ».
   ========================================================================== */
(function () {
	"use strict";

	var STORAGE_KEY = "punchline.lang";
	var DEFAULT_LANG = "en";

	var DICT = {
		en: {
			"app.title": "Punchline",

			// language switch
			"lang.switch": "Switch to French",
			"lang.target": "FR",

			// common
			"common.close": "Close",
			"common.home": "Back to home",
			"common.homeHost": "End the game and go home",
			"common.rules": "How to play",
			"common.gamePin": "Game PIN",
			"common.and": " & ",

			// durations
			"duration.seconds": { one: "{count} second", other: "{count} seconds" },
			"duration.minutes": { one: "{count} minute", other: "{count} minutes" },
			"duration.mixed": "{minutes} min {seconds} s",

			// rules sheet
			"rules.title": "How to play",
			"rules.intro": "One big screen for the questions, one phone per player.",
			"rules.step1": "Create a game on the big screen. Choose 1 to 10 rounds, or enter a premium code for extra questions.",
			"rules.step2.before": "Everyone opens ",
			"rules.step2.after": " on their phone, types the PIN and picks a name.",
			"rules.step3": "A question appears. Write your answer before the clock runs out: the host sets how long you get.",
			"rules.step3.known": "A question appears. You have {seconds|duration} to write your answer.",
			"rules.step4": "The answers show up on every phone, without names. Vote for your favourite, just not your own.",
			"rules.step5": "Every vote you get is worth 1 point. Most points after the last round wins.",
			"rules.gotIt": "Got it",

			// lobby / home
			"home.tagline": "Write the funniest answer. Vote for the best one.",
			"home.create": "Create a game",
			"home.join": "Join a game",
			"home.hint": "Create on the big screen, join from your phone.",
			"join.title": "Enter the game PIN",
			"join.hint": "You'll find it on the big screen.",
			"join.button": "Join",
			"lobby.openOnPhone": "On your phone, open",
			"lobby.enterPin": "and enter this PIN",
			"lobby.rounds": "Rounds",
			"lobby.answerTime": "Time to answer",
			"lobby.revealTime": "Time per reveal",
			"lobby.questions": "Questions",
			"lobby.classic": "Classic",
			"lobby.premium": "Premium",
			"lobby.premiumCode": "Premium code",
			"lobby.players": "Players",
			"lobby.joined": { one: "joined", other: "joined" },
			"lobby.empty": "Waiting for players to join…",
			"lobby.start": "Start the game",
			"lobby.remove": "Remove {name}",

			// choose a name (phone)
			"name.title": "What should we call you?",
			"name.hint": "Up to 21 characters. Your friends will see it on the scoreboard.",
			"name.placeholder": "Your name",
			"name.go": "Let's go",
			"rejoin.title": "Who are you?",
			"rejoin.hint": "The game has already started. Pick your name to jump back in.",
			"rejoin.button": "Rejoin",

			// game (host screen)
			"game.getReady": "Get ready…",
			"game.roundReady": "Round {round} · Get ready",
			"game.roundAnswering": "Round {round} · Answer on your phone",
			"game.timesUp": "Time's up! Here are the answers",
			"game.answerOf": "Answer {index} of {total}",
			"game.voting": "Vote for your favourite on your phone",
			"game.votesIntro": "And the votes go to…",
			"game.noVotes": "No votes this round",
			"game.votesOf": "Votes · {index} of {total}",
			"game.secondsLeft": "Seconds left",

			// prompt (phone)
			"prompt.title": "Your punchline",
			"prompt.hint": "Read the question on the big screen and beat the clock.",
			"prompt.hint.known": "Read the question on the big screen. You have {seconds|duration}.",
			"prompt.label": "Your answer",
			"prompt.placeholder": "Type something funny…",
			"prompt.send": "Send my answer",

			// vote (phone)
			"vote.title": "Pick your favourite",
			"vote.hint": "No names, no pressure. You can't vote for your own.",
			"vote.answers": "Answers",
			"vote.loading": "Loading the answers…",
			"vote.button": "Vote",
			"vote.yours": "Yours",

			// waiting (phone)
			"wait.title": "Hang tight!",
			"wait.text": "Waiting for the others. Keep an eye on the big screen.",
			"wait.answer.title": "Answer sent!",
			"wait.answer.text": "Waiting for the others to finish writing…",
			"wait.vote.title": "Vote counted!",
			"wait.vote.text": "Waiting for everyone to vote. Results on the big screen.",
			"wait.late.title": "Time's up!",
			"wait.late.text": "Too late for this one. Get ready to vote…",
			"wait.in.title": "You're in!",
			"wait.in.text": "The game starts soon. Keep an eye on the big screen.",

			// scores (host screen)
			"scores.kicker": "That's a wrap!",
			"scores.winner": "The winner is",
			"scores.tie": "It's a tie!",
			"scores.counting": "Counting the votes…",
			"scores.again": "Play again",
			"scores.caption": "Final scores",
			"scores.rank": "Rank",
			"scores.player": "Player",
			"scores.points": "Points",
			"scores.pointsLabel": { one: "{count} point", other: "{count} points" },

			// sound controls (audio.js)
			"sound.volume": "Music volume",
			"sound.unlock": "Tap to enable sound",
			"sound.enable": "Enable sound",
			"sound.mute": "Mute",
			"sound.unmute": "Unmute",
			"sound.sfx": "Sound effects",
			"sound.sfxOn": "Sound effects on",
			"sound.sfxOff": "Sound effects off",

			// errors (client checks and server message keys)
			"error.pinEmpty": "Enter the 4-digit PIN",
			"error.pinDigitsOnly": "The PIN only has numbers",
			"error.pinLength": "The PIN has 4 digits",
			"error.gameNotFound": "No game found with this PIN",
			"error.roomFull": "This game is full",
			"error.nameEmpty": "Enter a name to join",
			"error.nameTooLong": "Name too long",
			"error.nameInvalidChars": "Invalid character(s): {chars}",
			"error.nameUnauthorized": "This name isn't allowed",
			"error.nameTaken": "This name is already taken",
			"error.pickName": "Pick your name first",
			"error.premiumCodeEmpty": "Enter the premium code",
			"error.premiumCodeTooLong": "Code too long",
			"error.premiumCodeLength": "The premium code must be 1 to 15 characters",
			"error.premiumCodeInvalid": "Invalid premium code",
			"error.notEnoughPlayers": "You need at least {count} players",
			"error.roundsInvalid": "Invalid number of rounds",
			"error.answerTimeInvalid": "Invalid answer time",
			"error.revealTimeInvalid": "Invalid reveal time",
			"error.questionsUnavailable": "Couldn't load the questions. Try again.",
			"error.answerEmpty": "Write something first",
			"error.answerTooLong": "That answer is too long",
			"error.pickAnswer": "Tap an answer first",
		},

		fr: {
			"app.title": "Punchline",

			"lang.switch": "Passer en anglais",
			"lang.target": "EN",

			"common.close": "Fermer",
			"common.home": "Retour à l’accueil",
			"common.homeHost": "Terminer la partie et revenir à l’accueil",
			"common.rules": "Comment jouer",
			"common.gamePin": "Code PIN de la partie",
			"common.and": " et ",

			"duration.seconds": { one: "{count} seconde", other: "{count} secondes" },
			"duration.minutes": { one: "{count} minute", other: "{count} minutes" },
			"duration.mixed": "{minutes} min {seconds}",

			"rules.title": "Comment jouer",
			"rules.intro": "Un grand écran pour les questions, un téléphone par joueur.",
			"rules.step1": "Crée une partie sur le grand écran. Choisis de 1 à 10 manches, ou entre un code premium pour débloquer plus de questions.",
			"rules.step2.before": "Tout le monde ouvre ",
			"rules.step2.after": " sur son téléphone, tape le code PIN et choisit un nom.",
			"rules.step3": "Une question apparaît. Écris ta réponse avant la fin du chrono : c’est l’hôte qui choisit sa durée.",
			"rules.step3.known": "Une question apparaît. Tu as {seconds|duration} pour écrire ta réponse.",
			"rules.step4": "Les réponses s’affichent sur tous les téléphones, sans les noms. Vote pour ta préférée, mais pas pour la tienne.",
			"rules.step5": "Chaque vote reçu rapporte 1 point. Le plus de points après la dernière manche l’emporte.",
			"rules.gotIt": "Compris !",

			"home.tagline": "Écris la réponse la plus drôle. Vote pour la meilleure.",
			"home.create": "Créer une partie",
			"home.join": "Rejoindre une partie",
			"home.hint": "Crée la partie sur le grand écran, rejoins-la depuis ton téléphone.",
			"join.title": "Entre le code PIN de la partie",
			"join.hint": "Tu le trouveras sur le grand écran.",
			"join.button": "Rejoindre",
			"lobby.openOnPhone": "Sur ton téléphone, ouvre",
			"lobby.enterPin": "et entre ce code PIN",
			"lobby.rounds": "Manches",
			"lobby.answerTime": "Temps pour répondre",
			"lobby.revealTime": "Temps par réponse",
			"lobby.questions": "Questions",
			"lobby.classic": "Classique",
			"lobby.premium": "Premium",
			"lobby.premiumCode": "Code premium",
			"lobby.players": "Joueurs",
			"lobby.joined": { one: "joueur", other: "joueurs" },
			"lobby.empty": "On attend les joueurs…",
			"lobby.start": "Lancer la partie",
			"lobby.remove": "Retirer {name}",

			"name.title": "Comment on t’appelle ?",
			"name.hint": "21 caractères max. Tes potes le verront sur le tableau des scores.",
			"name.placeholder": "Ton nom",
			"name.go": "C’est parti !",
			"rejoin.title": "Qui es-tu ?",
			"rejoin.hint": "La partie a déjà commencé. Choisis ton nom pour revenir dans le jeu.",
			"rejoin.button": "Revenir dans la partie",

			"game.getReady": "Préparez-vous…",
			"game.roundReady": "Manche {round} · Préparez-vous",
			"game.roundAnswering": "Manche {round} · À vos téléphones !",
			"game.timesUp": "Temps écoulé ! Voici les réponses",
			"game.answerOf": "Réponse {index} sur {total}",
			"game.voting": "Votez pour votre préférée sur votre téléphone",
			"game.votesIntro": "Et les votes vont à…",
			"game.noVotes": "Aucun vote pour cette manche",
			"game.votesOf": "Votes · {index} sur {total}",
			"game.secondsLeft": "Secondes restantes",

			"prompt.title": "Ta punchline",
			"prompt.hint": "Lis la question sur le grand écran et bats le chrono.",
			"prompt.hint.known": "Lis la question sur le grand écran. Tu as {seconds|duration}.",
			"prompt.label": "Ta réponse",
			"prompt.placeholder": "Écris un truc drôle…",
			"prompt.send": "Envoyer ma réponse",

			"vote.title": "Choisis ta préférée",
			"vote.hint": "Pas de noms, pas de pression. Tu ne peux pas voter pour la tienne.",
			"vote.answers": "Réponses",
			"vote.loading": "Chargement des réponses…",
			"vote.button": "Voter",
			"vote.yours": "La tienne",

			"wait.title": "Patience !",
			"wait.text": "On attend les autres. Garde un œil sur le grand écran.",
			"wait.answer.title": "Réponse envoyée !",
			"wait.answer.text": "On attend que les autres finissent d’écrire…",
			"wait.vote.title": "A voté !",
			"wait.vote.text": "On attend que tout le monde ait voté. Résultats sur le grand écran.",
			"wait.late.title": "Temps écoulé !",
			"wait.late.text": "Trop tard pour celle-ci. Prépare-toi à voter…",
			"wait.in.title": "C’est bon, tu es dedans !",
			"wait.in.text": "La partie va bientôt commencer. Garde un œil sur le grand écran.",

			"scores.kicker": "C’est fini !",
			"scores.winner": "La victoire revient à",
			"scores.tie": "Égalité !",
			"scores.counting": "On compte les votes…",
			"scores.again": "Rejouer",
			"scores.caption": "Scores finaux",
			"scores.rank": "Rang",
			"scores.player": "Joueur",
			"scores.points": "Points",
			"scores.pointsLabel": { one: "{count} point", other: "{count} points" },

			"sound.volume": "Volume de la musique",
			"sound.unlock": "Touche pour activer le son",
			"sound.enable": "Activer le son",
			"sound.mute": "Couper le son",
			"sound.unmute": "Remettre le son",
			"sound.sfx": "Effets sonores",
			"sound.sfxOn": "Effets sonores activés",
			"sound.sfxOff": "Effets sonores désactivés",

			"error.pinEmpty": "Entre le code PIN à 4 chiffres",
			"error.pinDigitsOnly": "Le code PIN ne contient que des chiffres",
			"error.pinLength": "Le code PIN fait 4 chiffres",
			"error.gameNotFound": "Aucune partie avec ce code PIN",
			"error.roomFull": "La partie est complète",
			"error.nameEmpty": "Entre un nom pour rejoindre la partie",
			"error.nameTooLong": "Nom trop long",
			"error.nameInvalidChars": "Caractère(s) interdit(s) : {chars}",
			"error.nameUnauthorized": "Ce nom n’est pas autorisé",
			"error.nameTaken": "Ce nom est déjà pris",
			"error.pickName": "Choisis d’abord ton nom",
			"error.premiumCodeEmpty": "Entre le code premium",
			"error.premiumCodeTooLong": "Code trop long",
			"error.premiumCodeLength": "Le code premium doit faire entre 1 et 15 caractères",
			"error.premiumCodeInvalid": "Code premium invalide",
			"error.notEnoughPlayers": "Il faut au moins {count} joueurs",
			"error.roundsInvalid": "Nombre de manches invalide",
			"error.answerTimeInvalid": "Temps de réponse invalide",
			"error.revealTimeInvalid": "Temps par réponse invalide",
			"error.questionsUnavailable": "Impossible de charger les questions. Réessaie.",
			"error.answerEmpty": "Écris d’abord quelque chose",
			"error.answerTooLong": "Ta réponse est trop longue",
			"error.pickAnswer": "Choisis d’abord une réponse",
		},
	};

	var listeners = [];
	var hasOwn = Object.prototype.hasOwnProperty;

	function isSupported(lang) {
		return typeof lang === "string" && hasOwn.call(DICT, lang);
	}

	// Saved choice, otherwise the browser language (fr* => French, anything else => English)
	function detectLang() {
		try {
			var saved = localStorage.getItem(STORAGE_KEY);
			if (isSupported(saved)) return saved;
		} catch (e) {}
		var browser = (navigator.languages && navigator.languages[0]) || navigator.language || "";
		return /^fr\b/i.test(browser) ? "fr" : DEFAULT_LANG;
	}

	var lang = detectLang();

	function pluralCategory(count) {
		try {
			return new Intl.PluralRules(lang).select(Number(count));
		} catch (e) {
			return Number(count) === 1 ? "one" : "other";
		}
	}

	function formatDuration(totalSeconds) {
		var total = Math.max(0, Math.round(Number(totalSeconds) || 0));
		var minutes = Math.floor(total / 60);
		var seconds = total % 60;
		if (minutes === 0) return t("duration.seconds", { count: seconds });
		if (seconds === 0) return t("duration.minutes", { count: minutes });
		return t("duration.mixed", { minutes: minutes, seconds: String(seconds).padStart(2, "0") });
	}

	var FORMATTERS = {
		duration: formatDuration,
	};

	function has(key) {
		return typeof key === "string" && hasOwn.call(DICT[DEFAULT_LANG], key);
	}

	// Translated string; falls back to English, then to the key itself
	function t(key, params) {
		params = params || {};
		var entry = hasOwn.call(DICT[lang], key) ? DICT[lang][key] : DICT[DEFAULT_LANG][key];
		if (entry === undefined) return String(key);
		if (typeof entry === "object") {
			entry = entry[pluralCategory(params.count)] || entry.other || "";
		}
		return String(entry).replace(/\{(\w+)(?:\|(\w+))?\}/g, function (match, name, format) {
			if (!hasOwn.call(params, name)) return match;
			var value = params[name];
			return format && FORMATTERS[format] ? FORMATTERS[format](value) : String(value);
		});
	}

	// Message from the server: a known key is translated, anything else is shown as is
	function i18nMessage(payload, params) {
		if (has(payload)) return t(payload, params);
		return payload == null ? "" : String(payload);
	}

	function readParams(element) {
		var raw = element.getAttribute("data-i18n-params");
		if (!raw) return undefined;
		try {
			return JSON.parse(raw);
		} catch (e) {
			return undefined;
		}
	}

	var ATTRIBUTES = [
		["data-i18n-placeholder", "placeholder"],
		["data-i18n-aria-label", "aria-label"],
		["data-i18n-title", "title"],
		["data-i18n-empty", "data-empty"],
	];

	function translateElement(element) {
		var params = readParams(element);
		var key = element.getAttribute("data-i18n");
		if (key) element.textContent = t(key, params);
		key = element.getAttribute("data-i18n-html");
		// trusted static strings of this file only (never player content)
		if (key) element.innerHTML = t(key, params);
		ATTRIBUTES.forEach(function (pair) {
			var attrKey = element.getAttribute(pair[0]);
			if (attrKey) element.setAttribute(pair[1], t(attrKey, params));
		});
	}

	var SELECTOR =
		"[data-i18n],[data-i18n-html],[data-i18n-placeholder],[data-i18n-aria-label],[data-i18n-title],[data-i18n-empty]";

	function applyTranslations(root) {
		root = root || document;
		if (root === document) {
			document.documentElement.lang = lang;
		}
		if (root.nodeType === 1 && root.matches(SELECTOR)) translateElement(root);
		Array.prototype.forEach.call(root.querySelectorAll(SELECTOR), translateElement);
		if (root === document) {
			document.title = t("app.title");
			updateToggles();
		}
	}

	function setParams(element, params) {
		if (params && Object.keys(params).length > 0) {
			element.setAttribute("data-i18n-params", JSON.stringify(params));
		} else {
			element.removeAttribute("data-i18n-params");
		}
	}

	// Marks a JS-created element so it is translated now and on every language change
	function i18nText(element, key, params) {
		if (!element) return;
		element.setAttribute("data-i18n", key);
		setParams(element, params);
		element.textContent = t(key, params);
	}

	// Same for an attribute (placeholder, aria-label, title, data-empty)
	function i18nAttr(element, attribute, key, params) {
		if (!element) return;
		var marker = attribute === "data-empty" ? "data-i18n-empty" : "data-i18n-" + attribute;
		element.setAttribute(marker, key);
		if (params !== undefined) setParams(element, params);
		element.setAttribute(attribute, t(key, params));
	}

	// Plain text set by JS that must not be translated anymore (e.g. a raw server string)
	function i18nClear(element) {
		if (!element) return;
		element.removeAttribute("data-i18n");
		element.removeAttribute("data-i18n-params");
	}

	function updateToggles() {
		var toggles = document.querySelectorAll("[data-lang-toggle]");
		Array.prototype.forEach.call(toggles, function (button) {
			var label = t("lang.switch");
			button.setAttribute("aria-label", label);
			button.setAttribute("title", label);
			var code = button.querySelector("[data-lang-code]") || button;
			code.textContent = t("lang.target");
			code.setAttribute("lang", lang === "fr" ? "en" : "fr");
		});
	}

	function getLang() {
		return lang;
	}

	function setLang(next) {
		if (!isSupported(next)) return;
		try {
			localStorage.setItem(STORAGE_KEY, next);
		} catch (e) {}
		if (next === lang) return;
		lang = next;
		applyTranslations(document);
		listeners.slice().forEach(function (fn) {
			try {
				fn(lang);
			} catch (e) {
				console.error(e);
			}
		});
	}

	function onLangChange(fn) {
		if (typeof fn === "function") listeners.push(fn);
	}

	function mountToggles() {
		var toggles = document.querySelectorAll("[data-lang-toggle]");
		Array.prototype.forEach.call(toggles, function (button) {
			if (button.dataset.langBound) return;
			button.dataset.langBound = "1";
			button.addEventListener("click", function () {
				setLang(lang === "fr" ? "en" : "fr");
			});
		});
		updateToggles();
	}

	// Public API (globals used by the page scripts)
	window.t = t;
	window.getLang = getLang;
	window.setLang = setLang;
	window.onLangChange = onLangChange;
	window.applyTranslations = applyTranslations;
	window.i18nText = i18nText;
	window.i18nAttr = i18nAttr;
	window.i18nClear = i18nClear;
	window.i18nMessage = i18nMessage;
	window.PunchlineI18n = {
		t: t,
		has: has,
		getLang: getLang,
		setLang: setLang,
		onLangChange: onLangChange,
		applyTranslations: applyTranslations,
		formatDuration: formatDuration,
		dictionaries: DICT,
	};

	document.documentElement.lang = lang;
	function init() {
		applyTranslations(document);
		mountToggles();
	}
	// The script sits at the end of <body>: the static markup is already parsed, so it is
	// translated right away (no flash of English); a second pass once the page is complete.
	init();
	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init);
	}
})();
