/* ==========================================================================
   Punchline admin panel: questions, live games, activity log.
   Every value coming from the server is written with textContent (Admin.el).
   ========================================================================== */
(function () {
	"use strict";

	var el = Admin.el;
	var $ = function (id) {
		return document.getElementById(id);
	};

	var IMPORT_MAX_BYTES = 1024 * 1024;
	var GAMES_REFRESH_MS = 5000;

	// ======================================================================
	// Session
	// ======================================================================

	Admin.api("GET", "/admin/api/session").then(function (session) {
		$("adminUser").textContent = session.user;
	}).catch(function () {});

	$("logoutButton").addEventListener("click", function () {
		Admin.api("POST", "/admin/api/logout", {}, { allow401: true })
			.catch(function () {})
			.then(function () {
				window.location.replace("/admin");
			});
	});

	// ======================================================================
	// Tabs
	// ======================================================================

	var TABS = ["questions", "review", "games", "activity"];
	var currentTab = "questions";

	function selectTab(name, focus) {
		if (TABS.indexOf(name) < 0) name = "questions";
		currentTab = name;
		TABS.forEach(function (tab) {
			var button = $("tab-" + tab);
			var selected = tab === name;
			button.setAttribute("aria-selected", selected ? "true" : "false");
			button.tabIndex = selected ? 0 : -1;
			$("panel-" + tab).classList.toggle("hidden", !selected);
		});
		if (focus) $("tab-" + name).focus();
		try {
			history.replaceState(null, "", "#" + name);
		} catch (e) {}
		if (name === "games") loadGames();
		if (name === "activity") loadLog();
		if (name === "questions" && !questions.data) loadQuestions();
		if (name === "review") {
			loadReview();
			loadAiStatus();
		}
	}

	TABS.forEach(function (tab, index) {
		var button = $("tab-" + tab);
		button.addEventListener("click", function () {
			selectTab(tab);
		});
		button.addEventListener("keydown", function (event) {
			var next = null;
			if (event.key === "ArrowRight") next = TABS[(index + 1) % TABS.length];
			else if (event.key === "ArrowLeft") next = TABS[(index + TABS.length - 1) % TABS.length];
			else if (event.key === "Home") next = TABS[0];
			else if (event.key === "End") next = TABS[TABS.length - 1];
			if (next) {
				event.preventDefault();
				selectTab(next, true);
			}
		});
	});

	// ======================================================================
	// Questions: list, search, filter, pagination
	// ======================================================================

	var questions = { q: "", filter: "all", lang: "all", category: "all", status: "approved", page: 1, pageSize: 20, data: null, request: 0 };

	var CATEGORIES = ["quotidien", "travail", "couple", "famille", "nourriture", "voyage", "ecole", "tech", "pop", "absurde", "animaux", "sport", "fete"];
	var LANGS = ["fr", "en"];

	// <select> of categories; kind: "filter" (all / none / ...), "edit" (none / ...), "generate" (mix / ...)
	function fillCategorySelect(select, kind) {
		var current = select.value;
		select.replaceChildren();
		var first = kind === "filter" ? [["all", "admin.cat.all"], ["none", "admin.cat.none"]] : kind === "edit" ? [["", "admin.cat.none"]] : [["", "admin.cat.mix"]];
		first.concat(
			CATEGORIES.map(function (name) {
				return [name, "admin.cat." + name];
			})
		).forEach(function (entry) {
			select.appendChild(el("option", { i18n: entry[1], attrs: { value: entry[0] } }));
		});
		if (current) select.value = current;
		if (select.selectedIndex < 0) select.selectedIndex = 0;
	}
	Array.prototype.forEach.call(document.querySelectorAll("[data-category-select]"), function (select) {
		fillCategorySelect(select, select.getAttribute("data-category-select"));
	});

	function filtersQuery(state) {
		return (
			"q=" + encodeURIComponent(state.q) +
			"&filter=" + encodeURIComponent(state.filter) +
			"&lang=" + encodeURIComponent(state.lang) +
			"&category=" + encodeURIComponent(state.category) +
			"&status=" + encodeURIComponent(state.status)
		);
	}

	// the export follows the filters of the list
	function updateExportLink() {
		$("exportButton").setAttribute("href", "/admin/api/questions/export?" + filtersQuery(questions));
	}

	function loadQuestions() {
		var request = ++questions.request;
		var list = $("questionsList");
		list.setAttribute("aria-busy", "true");
		updateExportLink();
		var url =
			"/admin/api/questions?" + filtersQuery(questions) +
			"&page=" + questions.page +
			"&pageSize=" + questions.pageSize;
		return Admin.api("GET", url)
			.then(function (data) {
				if (request !== questions.request) return; // a newer search is on its way
				questions.data = data;
				questions.page = data.page;
				renderQuestions();
			})
			.catch(function (error) {
				if (request !== questions.request) return;
				list.setAttribute("aria-busy", "false");
				Admin.toast(Admin.errorText(error));
			});
	}

	function setCount(node, count) {
		node.textContent = count === undefined || count === null ? "" : String(count);
	}

	function badge(explicit) {
		return el("span", {
			className: "badge " + (explicit ? "badge--premium" : "badge--classic"),
			i18n: explicit ? "lobby.premium" : "lobby.classic",
		});
	}

	function answersBlock(item) {
		var answers = [item.reponse_1, item.reponse_2, item.reponse_3].filter(function (answer) {
			return answer;
		});
		return el("div", { className: "q-answers" }, [
			el("span", { className: "q-answers-label", i18n: "admin.q.bot" }),
			el(
				"ul",
				{ className: "q-answer-list", attrs: { "aria-label": t("admin.field.answers") } },
				answers.length
					? answers.map(function (answer) {
							return el("li", { className: "q-answer", text: answer });
					  })
					: [el("li", { className: "q-answer q-answer--none", i18n: "admin.q.noAnswer" })]
			),
		]);
	}

	// Tags of a card: type, language, category, status (if not approved)
	// (badge--lang badge--cat badge--pending badge--rejected: full names kept for the Tailwind build)
	function badges(item) {
		var nodes = [badge(item.explicit)];
		if (item.lang) nodes.push(el("span", { className: "badge badge--lang", text: item.lang.toUpperCase(), attrs: { lang: item.lang, title: t("admin.lang." + item.lang) } }));
		if (item.category) nodes.push(el("span", { className: "badge badge--cat", i18n: "admin.cat." + item.category }));
		if (item.status === "pending") nodes.push(el("span", { className: "badge badge--pending", i18n: "admin.status.pending" }));
		if (item.status === "rejected") nodes.push(el("span", { className: "badge badge--rejected", i18n: "admin.status.rejected" }));
		return el("div", { className: "q-badges" }, nodes);
	}

	// "Bank · played 3 times · last 2 days ago"
	function metaLine(item) {
		var parts = [el("span", { i18n: "admin.source." + item.source })];
		if (item.playCount > 0) {
			parts.push(el("span", { i18n: "admin.q.played", params: { count: item.playCount } }));
			if (item.lastPlayedAt) {
				parts.push(
					el("span", {
						i18n: "admin.q.lastPlayed",
						params: { when: Admin.relativeTime(item.lastPlayedAt) },
						attrs: { title: Admin.formatDate(item.lastPlayedAt) },
					})
				);
			}
		} else {
			parts.push(el("span", { i18n: "admin.q.neverPlayed" }));
		}
		var nodes = [];
		parts.forEach(function (part, index) {
			if (index) nodes.push(el("span", { className: "q-meta-sep", text: "·", attrs: { "aria-hidden": "true" } }));
			nodes.push(part);
		});
		return el("p", { className: "q-meta" }, nodes);
	}

	function questionCard(item, options) {
		options = options || {};
		var editButton = el(
			"button",
			{
				className: "icon-btn icon-btn--sm",
				attrs: { type: "button", "aria-label": t("admin.q.edit"), title: t("admin.q.edit") },
				on: {
					click: function () {
						openEditor(item);
					},
				},
			},
			[Admin.icon("edit")]
		);
		var deleteButton = el(
			"button",
			{
				className: "icon-btn icon-btn--sm icon-btn--danger",
				attrs: { type: "button", "aria-label": t("admin.q.delete"), title: t("admin.q.delete") },
				on: {
					click: function () {
						confirmDelete(item);
					},
				},
			},
			[Admin.icon("trash")]
		);
		var foot = null;
		if (options.review) {
			foot = el("div", { className: "q-card-foot" }, [
				el(
					"button",
					{
						className: "btn btn-secondary btn-sm",
						attrs: { type: "button" },
						on: {
							click: function (event) {
								setStatus(item, "rejected", event.currentTarget);
							},
						},
					},
					[Admin.icon("close"), el("span", { i18n: "admin.review.reject" })]
				),
				el(
					"button",
					{
						className: "btn btn-primary btn-sm",
						attrs: { type: "button" },
						on: {
							click: function (event) {
								setStatus(item, "approved", event.currentTarget);
							},
						},
					},
					[Admin.icon("check"), el("span", { i18n: "admin.review.approve" })]
				),
			]);
		} else if (item.status === "rejected") {
			foot = el("div", { className: "q-card-foot" }, [
				el(
					"button",
					{
						className: "btn btn-secondary btn-sm",
						attrs: { type: "button" },
						on: {
							click: function (event) {
								setStatus(item, "approved", event.currentTarget);
							},
						},
					},
					[Admin.icon("check"), el("span", { i18n: "admin.review.approve" })]
				),
			]);
		}
		return el("article", { className: "q-card", attrs: { "data-id": item.id } }, [
			el("div", { className: "q-card-head" }, [badges(item), el("div", { className: "q-card-actions" }, [editButton, deleteButton])]),
			el("p", { className: "q-text", text: item.question, attrs: { lang: item.lang || null } }),
			answersBlock(item),
			metaLine(item),
			foot,
		]);
	}

	// Approve / reject one question (review tab, or a rejected one in the list)
	function setStatus(item, status, button) {
		if (button) button.disabled = true;
		return Admin.api("POST", "/admin/api/questions/" + encodeURIComponent(item.id) + "/status", { status: status })
			.then(function () {
				Admin.toast(status === "approved" ? "admin.review.approved" : "admin.review.rejected");
				refreshLists();
			})
			.catch(function (error) {
				if (button) button.disabled = false;
				Admin.toast(Admin.errorText(error));
			});
	}

	// After a change: the lists that are loaded
	function refreshLists() {
		loadQuestions();
		if (review.data || currentTab === "review") loadReview();
	}

	function renderQuestions() {
		var data = questions.data;
		if (!data) return;
		var list = $("questionsList");
		list.replaceChildren();
		list.setAttribute("aria-busy", "false");

		setCount($("countAll"), data.counts.all);
		setCount($("countClassic"), data.counts.classic);
		setCount($("countPremium"), data.counts.premium);
		if (data.counts.approved) {
			setCount($("countLangFr"), data.counts.approved.fr);
			setCount($("countLangEn"), data.counts.approved.en);
			setCount($("tabCountQuestions"), (data.counts.approved.fr || 0) + (data.counts.approved.en || 0));
		}
		setCount($("tabCountReview"), data.counts.pending || null);

		var summary = $("questionsSummary");
		if (questions.q) {
			i18nText(summary, "admin.q.found", { count: data.total });
		} else {
			i18nText(summary, "admin.q.count", { count: data.total });
		}

		if (data.items.length === 0) {
			list.appendChild(
				el("div", { className: "q-empty panel" }, [
					el("p", { className: "panel-title", i18n: questions.q ? "admin.q.noResult" : "admin.q.empty" }),
					el("p", { className: "muted mt-1", i18n: questions.q ? "admin.q.noResultHint" : "admin.q.emptyHint" }),
				])
			);
		} else {
			data.items.forEach(function (item) {
				list.appendChild(questionCard(item));
			});
		}

		var pager = $("pager");
		pager.classList.toggle("hidden", data.pages <= 1);
		i18nText($("pageInfo"), "admin.pager.info", { page: data.page, pages: data.pages });
		$("prevPage").disabled = data.page <= 1;
		$("nextPage").disabled = data.page >= data.pages;
	}

	var searchTimer;
	$("search").addEventListener("input", function (event) {
		clearTimeout(searchTimer);
		var value = event.target.value;
		searchTimer = setTimeout(function () {
			questions.q = value.trim();
			questions.page = 1;
			loadQuestions();
		}, 250);
	});

	Array.prototype.forEach.call(document.querySelectorAll('input[name="filter"]'), function (radio) {
		radio.addEventListener("change", function () {
			if (!radio.checked) return;
			questions.filter = radio.value;
			questions.page = 1;
			loadQuestions();
		});
	});

	Array.prototype.forEach.call(document.querySelectorAll('input[name="langFilter"]'), function (radio) {
		radio.addEventListener("change", function () {
			if (!radio.checked) return;
			questions.lang = radio.value;
			questions.page = 1;
			loadQuestions();
		});
	});

	$("categoryFilter").addEventListener("change", function (event) {
		questions.category = event.target.value;
		questions.page = 1;
		loadQuestions();
	});

	$("statusFilter").addEventListener("change", function (event) {
		questions.status = event.target.value;
		questions.page = 1;
		loadQuestions();
	});

	function goToPage(page) {
		questions.page = page;
		loadQuestions().then(function () {
			$("panel-questions").scrollIntoView({ block: "start", behavior: "smooth" });
		});
	}

	$("prevPage").addEventListener("click", function () {
		if (questions.data && questions.page > 1) goToPage(questions.page - 1);
	});
	$("nextPage").addEventListener("click", function () {
		if (questions.data && questions.page < questions.data.pages) goToPage(questions.page + 1);
	});

	// ======================================================================
	// Add / edit sheet
	// ======================================================================

	var editSheet = $("editSheet");
	var editForm = $("editForm");
	var editing = null; // question being edited, null when adding
	var FIELDS = [
		{ name: "question", input: "fieldQuestion", error: "errorQuestion" },
		{ name: "reponse_1", input: "fieldR1", error: "errorR1" },
		{ name: "reponse_2", input: "fieldR2", error: "errorR2" },
		{ name: "reponse_3", input: "fieldR3", error: "errorR3" },
		{ name: "lang", input: "editLangFr", error: "errorLang" },
		{ name: "category", input: "fieldCategory", error: "errorCategory" },
	];

	function updateCounter() {
		var length = Array.from($("fieldQuestion").value).length;
		var counter = $("countQuestion");
		counter.textContent = length + " / 300";
		counter.classList.toggle("is-near-limit", length > 270);
	}
	$("fieldQuestion").addEventListener("input", updateCounter);

	function clearFieldErrors() {
		FIELDS.forEach(function (field) {
			var error = $(field.error);
			error.classList.add("hidden");
			i18nClear(error);
			error.textContent = "";
			$(field.input).removeAttribute("aria-invalid");
		});
		var formError = $("errorForm");
		formError.classList.add("hidden");
		i18nClear(formError);
	}

	function showFieldErrors(fields) {
		var first = null;
		FIELDS.forEach(function (field) {
			var key = fields && fields[field.name];
			if (!key) return;
			var error = $(field.error);
			i18nText(error, PunchlineI18n.has(key) ? key : "admin.error.invalid", { max: field.name === "question" ? 300 : 100 });
			error.classList.remove("hidden");
			$(field.input).setAttribute("aria-invalid", "true");
			if (!first) first = $(field.input);
		});
		if (first) first.focus();
		return Boolean(first);
	}

	function openEditor(item) {
		editing = item || null;
		clearFieldErrors();
		i18nText($("editTitle"), item ? "admin.q.editTitle" : "admin.q.addTitle");
		$("fieldQuestion").value = item ? item.question : "";
		$("fieldR1").value = item ? item.reponse_1 : "";
		$("fieldR2").value = item ? item.reponse_2 : "";
		$("fieldR3").value = item ? item.reponse_3 : "";
		$(item && item.explicit ? "typePremium" : "typeClassic").checked = true;
		// a new question: the language shown in the list, otherwise the panel's language
		var lang = item && item.lang ? item.lang : questions.lang !== "all" ? questions.lang : getLang() === "en" ? "en" : "fr";
		$(lang === "en" ? "editLangEn" : "editLangFr").checked = true;
		$("fieldCategory").value = item ? item.category || "" : CATEGORIES.indexOf(questions.category) >= 0 ? questions.category : "";
		updateCounter();
		Admin.openSheet(editSheet, $("fieldQuestion"));
	}

	$("addButton").addEventListener("click", function () {
		openEditor(null);
	});

	// Light client-side checks; the server validates everything again
	function localErrors(value) {
		var errors = {};
		if (!value.question.trim()) errors.question = "admin.error.required";
		["question", "reponse_1", "reponse_2", "reponse_3"].forEach(function (name) {
			if (value[name].indexOf(";") >= 0) errors[name] = "admin.error.semicolon";
		});
		if (!value.reponse_1.trim() && !value.reponse_2.trim() && !value.reponse_3.trim()) {
			errors.reponse_1 = "admin.error.answerRequired";
		}
		return errors;
	}

	editForm.addEventListener("submit", function (event) {
		event.preventDefault();
		clearFieldErrors();
		var value = {
			question: $("fieldQuestion").value,
			reponse_1: $("fieldR1").value,
			reponse_2: $("fieldR2").value,
			reponse_3: $("fieldR3").value,
			explicit: $("typePremium").checked,
			lang: $("editLangEn").checked ? "en" : "fr",
			category: $("fieldCategory").value,
		};
		if (showFieldErrors(localErrors(value))) return;

		var save = $("saveButton");
		save.disabled = true;
		var request = editing
			? Admin.api("PUT", "/admin/api/questions/" + encodeURIComponent(editing.id), value)
			: Admin.api("POST", "/admin/api/questions", value);
		request
			.then(function () {
				var wasEditing = Boolean(editing);
				Admin.closeSheet(editSheet);
				Admin.toast(wasEditing ? "admin.q.saved" : "admin.q.added");
				if (!wasEditing) questions.page = 1;
				refreshLists();
			})
			.catch(function (error) {
				if (!showFieldErrors(error.data && error.data.fields)) {
					var formError = $("errorForm");
					i18nText(formError, Admin.errorText(error));
					formError.classList.remove("hidden");
				}
			})
			.then(function () {
				save.disabled = false;
			});
	});

	// ======================================================================
	// Confirmation sheet (no window.confirm)
	// ======================================================================

	var confirmSheet = $("confirmSheet");
	var confirmAction = null;

	function confirmDialog(options) {
		i18nText($("confirmTitle"), options.title, options.params);
		i18nText($("confirmText"), options.text, options.params);
		var quote = $("confirmQuote");
		quote.textContent = options.quote || "";
		quote.classList.toggle("hidden", !options.quote);
		i18nText($("confirmOk"), options.ok);
		$("confirmOk").disabled = false;
		confirmAction = options.action;
		// the safe choice gets the focus
		Admin.openSheet(confirmSheet, $("confirmCancel"));
	}

	$("confirmOk").addEventListener("click", function () {
		var action = confirmAction;
		if (!action) return;
		var button = $("confirmOk");
		button.disabled = true;
		Promise.resolve(action())
			.then(function () {
				confirmAction = null;
				Admin.closeSheet(confirmSheet);
			})
			.catch(function (error) {
				Admin.toast(Admin.errorText(error));
				button.disabled = false;
			});
	});

	function confirmDelete(item, after) {
		confirmDialog({
			title: "admin.q.deleteTitle",
			text: "admin.q.deleteText",
			quote: item.question,
			ok: "admin.q.deleteConfirm",
			action: function () {
				return Admin.api("DELETE", "/admin/api/questions/" + encodeURIComponent(item.id)).then(function () {
					Admin.toast("admin.q.deleted");
					refreshLists();
					if (after) after();
				});
			},
		});
	}

	// ======================================================================
	// Import
	// ======================================================================

	var importSheet = $("importSheet");
	var importFile = $("importFile");
	var importReport = $("importReport");
	var importRun = $("importRun");
	var importCheck = $("importCheck");
	var lastReport = null;

	function setImportError(key, params) {
		var error = $("importError");
		if (!key) {
			error.classList.add("hidden");
			i18nClear(error);
			error.textContent = "";
			return;
		}
		i18nText(error, key, params);
		error.classList.remove("hidden");
	}

	function resetImport() {
		importFile.value = "";
		$(questions.lang === "en" || (questions.lang === "all" && getLang() === "en") ? "importLangEn" : "importLangFr").checked = true;
		lastReport = null;
		setImportError(null);
		importReport.replaceChildren();
		importReport.classList.add("hidden");
		importRun.classList.add("hidden");
		importCheck.classList.remove("hidden");
	}

	$("importButton").addEventListener("click", function () {
		resetImport();
		Admin.openSheet(importSheet, importFile);
	});

	importFile.addEventListener("change", function () {
		lastReport = null;
		setImportError(null);
		importReport.classList.add("hidden");
		importRun.classList.add("hidden");
		importCheck.classList.remove("hidden");
		if (importFile.files[0]) checkImport();
	});

	function selectedFile() {
		var file = importFile.files && importFile.files[0];
		if (!file) {
			setImportError("admin.import.noFile");
			importFile.focus();
			return null;
		}
		if (file.size > IMPORT_MAX_BYTES) {
			setImportError("admin.error.tooLarge");
			return null;
		}
		if (file.size === 0) {
			setImportError("admin.import.emptyFile");
			return null;
		}
		return file;
	}

	// "question:admin.error.tooLong" -> "Question: too long"
	function lineErrorText(code) {
		var parts = String(code).split(":");
		if (parts.length === 2) {
			return t("admin.field." + parts[0]) + t("admin.colon") + t(parts[1], { max: parts[0] === "question" ? 300 : 100 });
		}
		return t(code);
	}

	// tone: import-stat--ok import-stat--warn import-stat--error (full names kept for the Tailwind build)
	function stat(value, key, tone) {
		return el("li", { className: "import-stat" + (tone ? " import-stat--" + tone : "") }, [
			el("span", { className: "import-stat-value", text: value }),
			el("span", { className: "import-stat-label", i18n: key, params: { count: value } }),
		]);
	}

	function detailList(titleKey, count, shown, items) {
		var list = el(
			"ul",
			{ className: "import-lines" },
			items.map(function (item) {
				return el("li", {}, [el("span", { className: "import-line-no", i18n: "admin.import.line", params: { line: item.line } }), item.node]);
			})
		);
		var details = el("details", { className: "import-details", attrs: { open: count <= 10 } }, [
			el("summary", { i18n: titleKey, params: { count: count } }),
			list,
		]);
		if (count > shown) {
			details.appendChild(el("p", { className: "muted mt-2 text-sm", i18n: "admin.import.more", params: { count: count - shown } }));
		}
		return details;
	}

	function renderImportReport(report) {
		importReport.replaceChildren();
		importReport.classList.remove("hidden");

		if (report.tooManyLines) {
			importReport.appendChild(el("p", { className: "form-error", i18n: "admin.import.tooManyLines" }));
			return;
		}

		var duplicates = report.duplicatesDbCount + report.duplicatesFileCount;
		var head = report.dryRun
			? el("p", { className: "panel-title", i18n: "admin.import.previewTitle" })
			: el("p", { className: "panel-title", i18n: "admin.import.doneTitle", params: { count: report.inserted } });
		importReport.appendChild(head);

		importReport.appendChild(
			el("ul", { className: "import-stats" }, [
				stat(report.dryRun ? report.toInsert : report.inserted, report.dryRun ? "admin.import.stat.new" : "admin.import.stat.added", (report.dryRun ? report.toInsert : report.inserted) ? "ok" : null),
				stat(duplicates, "admin.import.stat.duplicates", duplicates ? "warn" : null),
				stat(report.errorCount, "admin.import.stat.errors", report.errorCount ? "error" : null),
			])
		);

		if (report.errorCount > 0) {
			importReport.appendChild(
				detailList(
					"admin.import.errorsTitle",
					report.errorCount,
					report.errors.length,
					report.errors.map(function (item) {
						return { line: item.line, node: el("span", { text: item.errors.map(lineErrorText).join(" · ") }) };
					})
				)
			);
		}
		if (duplicates > 0) {
			var items = report.duplicatesDb
				.map(function (item) {
					return { line: item.line, node: el("span", {}, [el("q", { text: item.question }), " ", el("span", { className: "muted", i18n: "admin.import.inDb" })]) };
				})
				.concat(
					report.duplicatesFile.map(function (item) {
						return {
							line: item.line,
							node: el("span", {}, [el("q", { text: item.question }), " ", el("span", { className: "muted", i18n: "admin.import.sameAs", params: { line: item.sameAs } })]),
						};
					})
				)
				.sort(function (a, b) {
					return a.line - b.line;
				});
			importReport.appendChild(detailList("admin.import.duplicatesTitle", duplicates, items.length, items));
		}

		if (report.dryRun) {
			importRun.classList.toggle("hidden", report.toInsert === 0);
			importRun.disabled = report.toInsert === 0;
			i18nText(importRun, "admin.import.run", { count: report.toInsert });
			if (report.toInsert === 0) {
				importReport.appendChild(el("p", { className: "muted", i18n: "admin.import.nothing" }));
			}
		} else {
			importRun.classList.add("hidden");
			importCheck.classList.add("hidden");
		}
	}

	function sendImport(dryRun) {
		var file = selectedFile();
		if (!file) return Promise.resolve();
		setImportError(null);
		importCheck.disabled = true;
		importRun.disabled = true;
		importReport.setAttribute("aria-busy", "true");
		var lang = $("importLangEn").checked ? "en" : "fr";
		return Admin.api("POST", "/admin/api/questions/import?lang=" + lang + (dryRun ? "&dryRun=1" : ""), file, { type: "text/csv" })
			.then(function (report) {
				lastReport = report;
				renderImportReport(report);
				if (!dryRun) {
					Admin.toast("admin.import.doneTitle", { count: report.inserted });
					questions.page = 1;
					loadQuestions();
				}
			})
			.catch(function (error) {
				setImportError(Admin.errorText(error));
			})
			.then(function () {
				importCheck.disabled = false;
				importRun.disabled = false;
				importReport.setAttribute("aria-busy", "false");
			});
	}

	function checkImport() {
		return sendImport(true);
	}

	importCheck.addEventListener("click", checkImport);
	// another default language: check the file again
	Array.prototype.forEach.call(document.querySelectorAll('input[name="importLang"]'), function (radio) {
		radio.addEventListener("change", function () {
			if (radio.checked && importFile.files && importFile.files[0]) checkImport();
		});
	});
	importRun.addEventListener("click", function () {
		if (lastReport && lastReport.dryRun && lastReport.toInsert > 0) sendImport(false);
	});

	// ======================================================================
	// Duplicates
	// ======================================================================

	var duplicatesSheet = $("duplicatesSheet");

	function loadDuplicates() {
		var list = $("duplicatesList");
		list.setAttribute("aria-busy", "true");
		return Admin.api("GET", "/admin/api/questions/duplicates")
			.then(function (data) {
				list.replaceChildren();
				if (data.total === 0) {
					list.appendChild(el("p", { className: "dup-none", i18n: "admin.dup.none" }));
					return;
				}
				list.appendChild(el("p", { className: "font-bold", i18n: "admin.dup.count", params: { count: data.total } }));
				data.groups.forEach(function (group) {
					list.appendChild(
						el(
							"ul",
							{ className: "dup-group" },
							group.map(function (item) {
								return el("li", { className: "dup-item" }, [
									el("div", { className: "min-w-0 flex-1" }, [
										el("div", { className: "mb-1" }, [badges(item)]),
										el("p", { className: "q-text", text: item.question }),
										answersBlock(item),
									]),
									el(
										"button",
										{
											className: "icon-btn icon-btn--sm icon-btn--danger",
											attrs: { type: "button", "aria-label": t("admin.q.delete"), title: t("admin.q.delete") },
											on: {
												click: function () {
													confirmDelete(item, loadDuplicates);
												},
											},
										},
										[Admin.icon("trash")]
									),
								]);
							})
						)
					);
				});
			})
			.catch(function (error) {
				Admin.toast(Admin.errorText(error));
			})
			.then(function () {
				list.setAttribute("aria-busy", "false");
			});
	}

	$("duplicatesButton").addEventListener("click", function () {
		$("duplicatesList").replaceChildren(el("p", { className: "muted", i18n: "admin.loading" }));
		Admin.openSheet(duplicatesSheet);
		loadDuplicates();
	});

	// ======================================================================
	// To review: pending questions (AI generation)
	// ======================================================================

	var review = { lang: "all", page: 1, pageSize: 20, data: null, request: 0 };

	function loadReview() {
		var request = ++review.request;
		var list = $("reviewList");
		list.setAttribute("aria-busy", "true");
		var url = "/admin/api/questions?status=pending&lang=" + encodeURIComponent(review.lang) + "&page=" + review.page + "&pageSize=" + review.pageSize;
		return Admin.api("GET", url)
			.then(function (data) {
				if (request !== review.request) return;
				review.data = data;
				review.page = data.page;
				renderReview();
			})
			.catch(function (error) {
				if (request !== review.request) return;
				list.setAttribute("aria-busy", "false");
				Admin.toast(Admin.errorText(error));
			});
	}

	function renderReview() {
		var data = review.data;
		if (!data) return;
		var list = $("reviewList");
		list.replaceChildren();
		list.setAttribute("aria-busy", "false");
		setCount($("tabCountReview"), data.counts.pending || null);
		i18nText($("reviewSummary"), "admin.review.count", { count: data.total });
		$("approveAllButton").disabled = data.total === 0;
		$("rejectAllButton").disabled = data.total === 0;
		if (data.items.length === 0) {
			list.appendChild(
				el("div", { className: "q-empty panel" }, [
					el("p", { className: "panel-title", i18n: "admin.review.empty" }),
					el("p", { className: "muted mt-1", i18n: ai.status && ai.status.enabled ? "admin.review.emptyHint" : "admin.review.emptyHintOff" }),
				])
			);
		} else {
			data.items.forEach(function (item) {
				list.appendChild(questionCard(item, { review: true }));
			});
		}
		var pager = $("reviewPager");
		pager.classList.toggle("hidden", data.pages <= 1);
		i18nText($("reviewPageInfo"), "admin.pager.info", { page: data.page, pages: data.pages });
		$("reviewPrev").disabled = data.page <= 1;
		$("reviewNext").disabled = data.page >= data.pages;
	}

	Array.prototype.forEach.call(document.querySelectorAll('input[name="reviewLang"]'), function (radio) {
		radio.addEventListener("change", function () {
			if (!radio.checked) return;
			review.lang = radio.value;
			review.page = 1;
			loadReview();
		});
	});
	$("reviewPrev").addEventListener("click", function () {
		if (review.data && review.page > 1) {
			review.page -= 1;
			loadReview();
		}
	});
	$("reviewNext").addEventListener("click", function () {
		if (review.data && review.page < review.data.pages) {
			review.page += 1;
			loadReview();
		}
	});

	function reviewAll(action) {
		var count = review.data ? review.data.total : 0;
		if (!count) return;
		var approve = action === "approve";
		confirmDialog({
			title: approve ? "admin.review.approveAllTitle" : "admin.review.rejectAllTitle",
			text: approve ? "admin.review.approveAllText" : "admin.review.rejectAllText",
			params: { count: count },
			ok: approve ? "admin.review.approveAll" : "admin.review.rejectAll",
			action: function () {
				return Admin.api("POST", "/admin/api/questions/review", { action: action, lang: review.lang }).then(function (result) {
					Admin.toast(approve ? "admin.review.approvedCount" : "admin.review.rejectedCount", { count: result.count });
					review.page = 1;
					refreshLists();
				});
			},
		});
	}
	$("approveAllButton").addEventListener("click", function () {
		reviewAll("approve");
	});
	$("rejectAllButton").addEventListener("click", function () {
		reviewAll("reject");
	});

	// ======================================================================
	// Generate with AI
	// ======================================================================

	var ai = { status: null, running: false };
	var generateSheet = $("generateSheet");

	function loadAiStatus() {
		return Admin.api("GET", "/admin/api/ai/status")
			.then(function (status) {
				ai.status = status;
				renderAiStatus();
			})
			.catch(function () {});
	}

	function renderAiStatus() {
		var status = ai.status;
		var text = $("aiStatusText");
		if (!status) return;
		if (status.enabled) {
			i18nText(text, status.autoTopup ? "admin.ai.statusOnAuto" : "admin.ai.statusOn", { model: status.model, remaining: status.remaining, perHour: status.perHour });
		} else {
			i18nText(text, "admin.ai.statusOff");
		}
		// the dialog: form disabled with an explanation when the feature is off
		$("aiOff").classList.toggle("hidden", status.enabled);
		Array.prototype.forEach.call($("generateForm").querySelectorAll("input, select"), function (node) {
			node.disabled = !status.enabled || ai.running;
		});
		$("generateRun").disabled = !status.enabled || ai.running || status.remaining <= 0;
		if (status.enabled) {
			i18nText($("generateInfo"), status.remaining > 0 ? "admin.ai.info" : "admin.ai.noneLeft", { model: status.model, remaining: status.remaining, perHour: status.perHour });
		} else {
			i18nClear($("generateInfo"));
			$("generateInfo").textContent = "";
		}
		if (review.data && review.data.items.length === 0) renderReview();
	}

	function setGenerateError(key, reason) {
		var node = $("generateError");
		if (!key) {
			node.classList.add("hidden");
			i18nClear(node);
			node.textContent = "";
			return;
		}
		if (reason) i18nText(node, "admin.ai.error.withReason", { message: t(key), reason: reason });
		else i18nText(node, key);
		node.classList.remove("hidden");
	}

	function setGenerateFieldError(id, key) {
		var node = $(id);
		if (!key) {
			node.classList.add("hidden");
			i18nClear(node);
			node.textContent = "";
			return;
		}
		i18nText(node, PunchlineI18n.has(key) ? key : "admin.error.invalid", { max: 80 });
		node.classList.remove("hidden");
	}

	$("generateButton").addEventListener("click", function () {
		if (!ai.running) {
			setGenerateError(null);
			setGenerateFieldError("errorGenCount", null);
			setGenerateFieldError("errorGenTheme", null);
			$("generateReport").classList.add("hidden");
			$("generateReview").classList.add("hidden");
			var lang = review.lang !== "all" ? review.lang : getLang() === "en" ? "en" : "fr";
			$(lang === "en" ? "genLangEn" : "genLangFr").checked = true;
		}
		Admin.openSheet(generateSheet, $("genCount"));
		loadAiStatus();
	});

	$("generateReview").addEventListener("click", function () {
		Admin.closeSheet(generateSheet);
		selectTab("review");
	});

	function renderGenerateReport(report) {
		var node = $("generateReport");
		node.replaceChildren();
		node.classList.remove("hidden");
		node.appendChild(el("p", { className: "panel-title", i18n: "admin.ai.doneTitle", params: { count: report.inserted } }));
		node.appendChild(
			el("ul", { className: "import-stats" }, [
				stat(report.inserted, "admin.ai.stat.added", report.inserted ? "ok" : null),
				stat(report.duplicates, "admin.import.stat.duplicates", report.duplicates ? "warn" : null),
				stat(report.invalid, "admin.ai.stat.invalid", report.invalid ? "error" : null),
			])
		);
		node.appendChild(
			el("p", { className: "muted text-sm", i18n: "admin.ai.usage", params: { model: report.model, input: report.usage.input || 0, output: report.usage.output || 0 } })
		);
		$("generateReview").classList.toggle("hidden", report.inserted === 0);
	}

	$("generateForm").addEventListener("submit", function (event) {
		event.preventDefault();
		if (ai.running || !ai.status || !ai.status.enabled) return;
		setGenerateError(null);
		setGenerateFieldError("errorGenCount", null);
		setGenerateFieldError("errorGenTheme", null);
		var count = Number($("genCount").value);
		if (!Number.isInteger(count) || count < 1 || count > 50) {
			setGenerateFieldError("errorGenCount", "admin.ai.error.count");
			$("genCount").focus();
			return;
		}
		var theme = $("genTheme").value;
		if (theme.indexOf(";") >= 0) {
			setGenerateFieldError("errorGenTheme", "admin.error.semicolon");
			$("genTheme").focus();
			return;
		}
		var body = {
			lang: $("genLangEn").checked ? "en" : "fr",
			count: count,
			category: $("genCategory").value,
			theme: theme,
			premium: $("genPremium").checked,
		};
		ai.running = true;
		$("generateReport").classList.add("hidden");
		$("generateReview").classList.add("hidden");
		$("generateForm").setAttribute("aria-busy", "true");
		i18nText($("generateRunLabel"), "admin.ai.running");
		renderAiStatus();
		Admin.api("POST", "/admin/api/ai/generate", body)
			.then(function (report) {
				renderGenerateReport(report);
				Admin.toast("admin.ai.doneTitle", { count: report.inserted });
				if (ai.status) ai.status.remaining = report.remaining;
				review.page = 1;
				refreshLists();
			})
			.catch(function (error) {
				var key = Admin.errorText(error);
				var reason = error.data && typeof error.data.reason === "string" ? error.data.reason : "";
				if (error.data && error.data.fields) {
					if (error.data.fields.count) setGenerateFieldError("errorGenCount", error.data.fields.count);
					if (error.data.fields.theme) setGenerateFieldError("errorGenTheme", error.data.fields.theme);
				}
				setGenerateError(key, reason);
				if (reason) Admin.toast("admin.ai.error.withReason", { message: t(key), reason: reason });
				else Admin.toast(key);
			})
			.then(function () {
				ai.running = false;
				$("generateForm").setAttribute("aria-busy", "false");
				i18nText($("generateRunLabel"), "admin.ai.run");
				loadAiStatus();
			});
	});

	// ======================================================================
	// Live games
	// ======================================================================

	var games = { data: null, timer: null, busy: false };

	// Phase badges: badge--lobby badge--answering badge--voting badge--playing badge--scores
	// (full class names written here so that Tailwind keeps them in the CSS build)
	var PHASES = {
		lobby: "admin.games.phase.lobby",
		answering: "admin.games.phase.answering",
		voting: "admin.games.phase.voting",
		playing: "admin.games.phase.playing",
		scores: "admin.games.phase.scores",
	};

	function loadGames() {
		if (games.busy) return Promise.resolve();
		games.busy = true;
		return Admin.api("GET", "/admin/api/games")
			.then(function (data) {
				games.data = data;
				renderGames();
			})
			.catch(function (error) {
				Admin.toast(Admin.errorText(error));
			})
			.then(function () {
				games.busy = false;
			});
	}

	function gameCard(game, now) {
		var players = game.players.filter(function (player) {
			return !player.bot;
		});
		var meta = [];
		if (game.phase !== "lobby" && game.rounds) {
			meta.push(el("span", { className: "game-round", i18n: "admin.games.round", params: { round: game.round, rounds: game.rounds } }));
		}
		meta.push(
			el("span", {
				i18n: "admin.games.seen",
				params: { since: Admin.relativeTime(game.firstSeen, now), activity: Admin.relativeTime(game.lastActivity, now) },
			})
		);

		var playerList = el(
			"ul",
			{ className: "game-players", attrs: { "aria-label": t("lobby.players") } },
			game.players.map(function (player) {
				return el("li", { className: "game-player" + (player.connected ? "" : " is-offline") + (player.bot ? " is-bot" : "") }, [
					el("span", { className: "chip-name", text: player.name }),
					!player.connected && !player.bot ? el("span", { className: "game-player-tag", i18n: "admin.games.offline" }) : null,
					el("span", {
						className: "game-player-points",
						text: String(player.points),
						attrs: { "aria-label": t("scores.pointsLabel", { count: player.points }), title: t("scores.pointsLabel", { count: player.points }) },
					}),
				]);
			})
		);

		var end = el(
			"button",
			{
				className: "btn btn-pink btn-sm",
				attrs: { type: "button" },
				on: {
					click: function () {
						confirmDialog({
							title: "admin.games.endTitle",
							text: "admin.games.endText",
							params: { pin: game.pin, count: players.length },
							ok: "admin.games.endConfirm",
							action: function () {
								return Admin.api("POST", "/admin/api/games/" + encodeURIComponent(game.pin) + "/end", {}).then(function () {
									Admin.toast("admin.games.ended", { pin: game.pin });
									loadGames();
								});
							},
						});
					},
				},
			},
			[Admin.icon("stop"), el("span", { i18n: "admin.games.end" })]
		);

		return el("article", { className: "game-card", attrs: { "aria-label": t("admin.games.label", { pin: game.pin }) } }, [
			el("div", { className: "game-card-head" }, [
				el("p", { className: "pin-badge game-pin", text: game.pin }),
				el("div", { className: "flex flex-wrap items-center justify-end gap-2" }, [
					el("span", { className: "badge badge--phase badge--" + game.phase, i18n: PHASES[game.phase] || PHASES.playing }),
					game.premium ? el("span", { className: "badge badge--premium", i18n: "lobby.premium" }) : el("span", { className: "badge badge--classic", i18n: "lobby.classic" }),
				]),
			]),
			el("p", { className: "game-meta" }, meta),
			el("div", {}, [
				el("p", { className: "field-label", i18n: "admin.games.players", params: { count: players.length } }),
				players.length || game.players.length ? playerList : el("p", { className: "muted", i18n: "lobby.empty" }),
			]),
			el("div", { className: "game-card-foot" }, [end]),
		]);
	}

	function renderGames() {
		var data = games.data;
		if (!data) return;
		var list = $("gamesList");
		var now = Date.now();
		list.replaceChildren();
		data.games.forEach(function (game) {
			list.appendChild(gameCard(game, now));
		});
		setCount($("tabCountGames"), data.total);
		i18nText($("gamesSummary"), "admin.games.count", { count: data.total });
		i18nText($("gamesUpdated"), "admin.games.updated", { time: Admin.formatTime(now) });
	}

	$("refreshGames").addEventListener("click", loadGames);

	// Auto-refresh while the tab is shown and the page visible
	setInterval(function () {
		if (currentTab === "games" && document.visibilityState === "visible" && !document.body.classList.contains("has-sheet")) {
			loadGames();
		}
	}, GAMES_REFRESH_MS);

	// ======================================================================
	// Activity log
	// ======================================================================

	var log = { data: null };

	function logDetails(entry) {
		var d = entry.details || {};
		if (entry.action === "login.failed" && d.username) return t("admin.log.detail.username", { name: d.username });
		if (d.question) return d.question;
		if (entry.action === "game.end" && d.pin) return t("admin.log.detail.pin", { pin: d.pin });
		if (entry.action === "question.import") {
			return t("admin.log.detail.import", { inserted: d.inserted || 0, duplicates: d.duplicates || 0, errors: d.errors || 0 });
		}
		if (entry.action === "ai.generate" || entry.action === "ai.topup") {
			return t("admin.log.detail.ai", {
				lang: String(d.lang || "").toUpperCase(),
				inserted: d.inserted || 0,
				duplicates: d.duplicates || 0,
				invalid: d.invalid || 0,
			});
		}
		if (entry.action === "ai.error") {
			var key = String(d.error || "");
			return (PunchlineI18n.has(key) ? t(key) : key) + (d.reason ? " (" + d.reason + ")" : "");
		}
		if (entry.action === "question.approveAll" || entry.action === "question.rejectAll") {
			return t("admin.log.detail.count", { count: d.count || 0 });
		}
		return "";
	}

	function renderLog() {
		var list = $("logList");
		list.replaceChildren();
		if (!log.data) return;
		log.data.entries.forEach(function (entry) {
			var key = "admin.action." + entry.action;
			var failed = entry.action === "login.failed";
			list.appendChild(
				el("li", { className: "log-row" + (failed ? " is-failed" : "") }, [
					el("time", { className: "log-time", text: Admin.formatDate(entry.at, true), attrs: { datetime: entry.at } }),
					el("span", { className: "log-action", text: PunchlineI18n.has(key) ? t(key) : entry.action }),
					el("span", { className: "log-detail", text: logDetails(entry) }),
					el("span", { className: "log-who", text: [entry.user, entry.ip].filter(Boolean).join(" · ") }),
				])
			);
		});
	}

	function loadLog() {
		return Admin.api("GET", "/admin/api/log?limit=100")
			.then(function (data) {
				log.data = data;
				renderLog();
			})
			.catch(function (error) {
				Admin.toast(Admin.errorText(error));
			});
	}

	$("refreshLog").addEventListener("click", loadLog);

	// ======================================================================
	// Language change: rebuild the lists (dates, aria-labels…)
	// ======================================================================

	onLangChange(function () {
		renderQuestions();
		renderReview();
		renderAiStatus();
		renderGames();
		renderLog();
	});

	// ======================================================================
	// Start
	// ======================================================================

	var initial = (window.location.hash || "").replace("#", "");
	selectTab(TABS.indexOf(initial) >= 0 ? initial : "questions");
	if (currentTab !== "questions") loadQuestions();
	if (currentTab !== "games") loadGames();
	if (currentTab !== "review") loadAiStatus();
})();
