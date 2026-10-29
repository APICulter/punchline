/* Punchline admin: sign-in page */
(function () {
	"use strict";

	var form = document.getElementById("loginForm");
	var username = document.getElementById("username");
	var password = document.getElementById("password");
	var button = document.getElementById("loginButton");
	var errorBox = document.getElementById("loginError");
	var unlockTimer;

	function showError(key, params) {
		i18nText(errorBox, key, params);
		errorBox.classList.remove("hidden");
	}

	function hideError() {
		errorBox.classList.add("hidden");
		i18nClear(errorBox);
		errorBox.textContent = "";
	}

	// Too many attempts: the button stays disabled until the server accepts new attempts
	function lockFor(seconds) {
		var until = Date.now() + seconds * 1000;
		button.disabled = true;
		clearInterval(unlockTimer);
		function tick() {
			var left = Math.ceil((until - Date.now()) / 1000);
			if (left <= 0) {
				clearInterval(unlockTimer);
				button.disabled = false;
				hideError();
				return;
			}
			showError("admin.error.tooManyAttempts.wait", { seconds: left });
		}
		tick();
		unlockTimer = setInterval(tick, 1000);
	}

	form.addEventListener("submit", function (event) {
		event.preventDefault();
		hideError();
		if (!username.value.trim() || !password.value) {
			showError("admin.login.missing");
			(username.value.trim() ? password : username).focus();
			return;
		}
		button.disabled = true;
		button.setAttribute("aria-busy", "true");
		Admin.api("POST", "/admin/api/login", { username: username.value.trim(), password: password.value }, { allow401: true })
			.then(function () {
				window.location.replace("/admin");
			})
			.catch(function (error) {
				button.disabled = false;
				button.removeAttribute("aria-busy");
				if (error.status === 429 && error.data && error.data.retryAfter) {
					lockFor(Number(error.data.retryAfter));
				} else if (error.status === 401) {
					showError("admin.error.badCredentials");
					password.value = "";
					password.focus();
				} else {
					showError(Admin.errorText(error));
				}
			});
	});

	username.focus();
})();
