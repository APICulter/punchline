/* ==========================================================================
   Punchline admin: shared helpers (loaded after i18n.js on every admin page)
   - Admin.api(method, url, body)   fetch wrapper (JSON, CSRF header, 401 => login)
   - Admin.el(tag, options, children) DOM builder, text only (never innerHTML)
   - Admin.toast(key, params)       short message at the top of the page
   - Admin.openSheet / closeSheet   accessible modal sheets (focus trap, Escape, inert)
   - Admin.formatDate / relativeTime
   ========================================================================== */
(function () {
	"use strict";

	// ----- Page title (i18n.js sets document.title to app.title) -----

	function updateTitle() {
		document.title = t("admin.title");
	}
	updateTitle();
	onLangChange(updateTitle);
	// i18n.js translates the page again on DOMContentLoaded (registered before this one)
	document.addEventListener("DOMContentLoaded", updateTitle);

	// ----- API -----

	function ApiError(status, data) {
		this.status = status;
		this.data = data || {};
		this.key = (data && data.error) || (status === 0 ? "admin.error.network" : "admin.error.server");
	}

	/**
	 * method, url, body: a plain object is sent as JSON, a Blob / File / string as is
	 * (with options.type as Content-Type). Resolves with the JSON answer.
	 * options.allow401: do not redirect to the login page on 401.
	 */
	function api(method, url, body, options) {
		options = options || {};
		var headers = { "X-Requested-With": "fetch", Accept: "application/json" };
		var payload;
		if (body !== undefined && body !== null) {
			if (typeof Blob !== "undefined" && body instanceof Blob) {
				payload = body;
				headers["Content-Type"] = options.type || "text/csv";
			} else if (typeof body === "string") {
				payload = body;
				headers["Content-Type"] = options.type || "text/plain";
			} else {
				payload = JSON.stringify(body);
				headers["Content-Type"] = "application/json";
			}
		}
		return fetch(url, {
			method: method,
			headers: headers,
			body: payload,
			credentials: "same-origin",
			cache: "no-store",
			redirect: "error",
		}).then(
			function (response) {
				return response
					.json()
					.catch(function () {
						return {};
					})
					.then(function (data) {
						if (response.ok) return data;
						if (response.status === 401 && !options.allow401) {
							window.location.replace("/admin");
						}
						throw new ApiError(response.status, data);
					});
			},
			function () {
				throw new ApiError(0, null);
			}
		);
	}

	// ----- DOM builder -----

	/**
	 * el("p", { className: "x", text: "Hello", attrs: { id: "a" }, i18n: "key", params: {} }, [children])
	 * Text always goes through textContent.
	 */
	function el(tag, options, children) {
		var node = document.createElement(tag);
		options = options || {};
		if (options.className) node.className = options.className;
		if (options.i18n) i18nText(node, options.i18n, options.params);
		else if (options.text !== undefined && options.text !== null) node.textContent = String(options.text);
		if (options.attrs) {
			Object.keys(options.attrs).forEach(function (name) {
				var value = options.attrs[name];
				if (value === false || value === null || value === undefined) return;
				node.setAttribute(name, value === true ? "" : String(value));
			});
		}
		if (options.on) {
			Object.keys(options.on).forEach(function (event) {
				node.addEventListener(event, options.on[event]);
			});
		}
		(children || []).forEach(function (child) {
			if (child === null || child === undefined || child === false) return;
			node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
		});
		return node;
	}

	// Static SVG icons (fixed markup, no user data)
	var ICONS = {
		edit: ["M4 20h4L19 9l-4-4L4 16v4z", "M13.5 6.5l4 4"],
		trash: ["M4 7h16", "M9.5 7V4.5h5V7", "M6.5 7l1 13h9l1-13", "M10 11v5.5", "M14 11v5.5"],
		stop: ["M7 7h10v10H7z"],
	};

	function icon(name) {
		var ns = "http://www.w3.org/2000/svg";
		var svg = document.createElementNS(ns, "svg");
		svg.setAttribute("viewBox", "0 0 24 24");
		svg.setAttribute("fill", "none");
		svg.setAttribute("stroke", "currentColor");
		svg.setAttribute("stroke-width", "2.5");
		svg.setAttribute("stroke-linecap", "round");
		svg.setAttribute("stroke-linejoin", "round");
		svg.setAttribute("aria-hidden", "true");
		(ICONS[name] || []).forEach(function (d) {
			var p = document.createElementNS(ns, "path");
			p.setAttribute("d", d);
			svg.appendChild(p);
		});
		return svg;
	}

	// ----- Toast -----

	var toastTimer;
	function toast(key, params) {
		var node = document.getElementById("toast");
		if (!node) return;
		if (PunchlineI18n.has(key)) i18nText(node, key, params);
		else {
			i18nClear(node);
			node.textContent = String(key);
		}
		node.classList.remove("hidden");
		clearTimeout(toastTimer);
		toastTimer = setTimeout(function () {
			node.classList.add("hidden");
		}, 3200);
	}

	// Message of an API error, translated
	function errorText(error) {
		var key = error && error.key ? error.key : "admin.error.server";
		return PunchlineI18n.has(key) ? key : "admin.error.server";
	}

	// ----- Sheets (modal dialogs) -----

	var openSheets = []; // stack of { sheet, opener }
	var FOCUSABLE =
		'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

	function focusables(sheet) {
		return Array.prototype.filter.call(sheet.querySelectorAll(FOCUSABLE), function (node) {
			return node.offsetParent !== null || node === document.activeElement;
		});
	}

	function refreshInert() {
		var main = document.getElementById("main");
		var top = openSheets.length ? openSheets[openSheets.length - 1].sheet : null;
		if (main) main.inert = Boolean(top);
		openSheets.forEach(function (entry) {
			entry.sheet.inert = entry.sheet !== top;
		});
		document.body.classList.toggle("has-sheet", Boolean(top));
	}

	function openSheet(sheet, focusTarget) {
		if (openSheets.some(function (entry) { return entry.sheet === sheet; })) return;
		openSheets.push({ sheet: sheet, opener: document.activeElement });
		sheet.classList.remove("hidden");
		refreshInert();
		var target = focusTarget || focusables(sheet)[0];
		if (target) target.focus();
	}

	function closeSheet(sheet) {
		var index = openSheets.findIndex(function (entry) {
			return entry.sheet === sheet;
		});
		if (index < 0) return;
		var entry = openSheets.splice(index, 1)[0];
		sheet.classList.add("hidden");
		sheet.inert = false;
		refreshInert();
		if (sheet.onclose) sheet.onclose();
		if (entry.opener && document.contains(entry.opener) && typeof entry.opener.focus === "function") {
			entry.opener.focus();
		}
	}

	document.addEventListener("keydown", function (event) {
		var top = openSheets.length ? openSheets[openSheets.length - 1].sheet : null;
		if (!top) return;
		if (event.key === "Escape") {
			event.preventDefault();
			closeSheet(top);
		} else if (event.key === "Tab") {
			var nodes = focusables(top);
			if (nodes.length === 0) return;
			var first = nodes[0];
			var last = nodes[nodes.length - 1];
			if (event.shiftKey && (document.activeElement === first || !top.contains(document.activeElement))) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && (document.activeElement === last || !top.contains(document.activeElement))) {
				event.preventDefault();
				first.focus();
			}
		}
	});

	// [data-close] buttons and a click on the backdrop close their sheet
	document.addEventListener("click", function (event) {
		var target = event.target;
		if (!(target instanceof Element)) return;
		var sheet = target.closest(".sheet");
		if (!sheet) return;
		if (target === sheet || target.closest("[data-close]")) {
			closeSheet(sheet);
		}
	});

	// ----- Dates -----

	function formatDate(value, withSeconds) {
		var date = new Date(value);
		if (isNaN(date.getTime())) return "";
		try {
			return new Intl.DateTimeFormat(getLang(), {
				day: "numeric",
				month: "short",
				hour: "2-digit",
				minute: "2-digit",
				second: withSeconds ? "2-digit" : undefined,
			}).format(date);
		} catch (e) {
			return date.toLocaleString();
		}
	}

	function formatTime(value) {
		var date = new Date(value);
		if (isNaN(date.getTime())) return "";
		try {
			return new Intl.DateTimeFormat(getLang(), { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date);
		} catch (e) {
			return date.toLocaleTimeString();
		}
	}

	function relativeTime(value, now) {
		var date = new Date(value);
		if (isNaN(date.getTime())) return "";
		var seconds = Math.round((date.getTime() - (now || Date.now())) / 1000);
		var abs = Math.abs(seconds);
		var unit = "second";
		var amount = seconds;
		if (abs >= 86400) {
			unit = "day";
			amount = Math.round(seconds / 86400);
		} else if (abs >= 3600) {
			unit = "hour";
			amount = Math.round(seconds / 3600);
		} else if (abs >= 60) {
			unit = "minute";
			amount = Math.round(seconds / 60);
		} else if (abs < 10) {
			return t("admin.time.now");
		}
		try {
			return new Intl.RelativeTimeFormat(getLang(), { numeric: "auto" }).format(amount, unit);
		} catch (e) {
			return formatDate(value);
		}
	}

	window.Admin = {
		api: api,
		el: el,
		icon: icon,
		toast: toast,
		errorText: errorText,
		openSheet: openSheet,
		closeSheet: closeSheet,
		formatDate: formatDate,
		formatTime: formatTime,
		relativeTime: relativeTime,
	};
})();
