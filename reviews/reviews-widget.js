/*
 * Bewertungs-Widget für free-img-compressor.de
 *
 * Einbindung (auf jeder Seite, wo Bewertungen erscheinen sollen):
 *   <link rel="stylesheet" href="/reviews/reviews-widget.css">
 *   <div id="fic-reviews"
 *        data-api="https://api.free-img-compressor.de"
 *        data-sitekey="DEIN_TURNSTILE_SITE_KEY"></div>
 *   <script src="/reviews/reviews-widget.js" defer></script>
 *
 * Die Sprache wird aus <html lang="..."> übernommen (de, en, tr).
 */
(function () {
  "use strict";

  var root = document.getElementById("fic-reviews");
  if (!root) return;

  var API = (root.getAttribute("data-api") || "").replace(/\/$/, "");
  var SITEKEY = root.getAttribute("data-sitekey") || "";

  var T = {
    de: {
      title: "Bewertungen",
      reviewsWord: ["Bewertung", "Bewertungen"],
      outOf: "von 5",
      empty: "Noch keine Bewertungen. Sei der Erste!",
      formTitle: "Deine Meinung",
      rating: "Deine Sterne",
      starLabel: function (n) { return n + (n === 1 ? " Stern" : " Sterne"); },
      name: "Name (optional)",
      text: "Deine Bewertung",
      textHint: "Mindestens 10 Zeichen.",
      submit: "Bewertung senden",
      sending: "Wird gesendet …",
      okMsg: "Danke! Deine Bewertung erscheint, sobald sie geprüft wurde.",
      errRating: "Bitte wähle eine Sternebewertung.",
      errText: "Bitte schreibe mindestens 10 Zeichen.",
      errCaptcha: "Bitte bestätige zuerst die Sicherheitsprüfung.",
      errRate: "Zu viele Bewertungen in kurzer Zeit. Bitte versuche es später erneut.",
      errGeneric: "Das hat leider nicht geklappt. Bitte versuche es später erneut.",
      errLoad: "Bewertungen konnten nicht geladen werden.",
      anonymous: "Anonym"
    },
    en: {
      title: "Reviews",
      reviewsWord: ["review", "reviews"],
      outOf: "out of 5",
      empty: "No reviews yet. Be the first!",
      formTitle: "Your opinion",
      rating: "Your stars",
      starLabel: function (n) { return n + (n === 1 ? " star" : " stars"); },
      name: "Name (optional)",
      text: "Your review",
      textHint: "At least 10 characters.",
      submit: "Submit review",
      sending: "Sending …",
      okMsg: "Thanks! Your review will appear once it has been checked.",
      errRating: "Please choose a star rating.",
      errText: "Please write at least 10 characters.",
      errCaptcha: "Please complete the security check first.",
      errRate: "Too many reviews in a short time. Please try again later.",
      errGeneric: "That didn't work. Please try again later.",
      errLoad: "Reviews could not be loaded.",
      anonymous: "Anonymous"
    },
    tr: {
      title: "Değerlendirmeler",
      reviewsWord: ["değerlendirme", "değerlendirme"],
      outOf: "/ 5",
      empty: "Henüz değerlendirme yok. İlk yorumu sen yap!",
      formTitle: "Görüşün",
      rating: "Yıldız puanın",
      starLabel: function (n) { return n + " yıldız"; },
      name: "Ad (isteğe bağlı)",
      text: "Değerlendirmen",
      textHint: "En az 10 karakter.",
      submit: "Değerlendirmeyi gönder",
      sending: "Gönderiliyor …",
      okMsg: "Teşekkürler! Değerlendirmen kontrol edildikten sonra yayınlanacak.",
      errRating: "Lütfen bir yıldız puanı seç.",
      errText: "Lütfen en az 10 karakter yaz.",
      errCaptcha: "Lütfen önce güvenlik doğrulamasını tamamla.",
      errRate: "Kısa sürede çok fazla değerlendirme. Lütfen daha sonra tekrar dene.",
      errGeneric: "Bu işlem başarısız oldu. Lütfen daha sonra tekrar dene.",
      errLoad: "Değerlendirmeler yüklenemedi.",
      anonymous: "Anonim"
    }
  };

  var lang = (document.documentElement.lang || "de").slice(0, 2).toLowerCase();
  if (!T[lang]) lang = "en";
  var t = T[lang];

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function starsDisplay(value) {
    var wrap = el("span", "fic-stars");
    wrap.setAttribute("role", "img");
    wrap.setAttribute("aria-label", value + " " + t.outOf);
    wrap.appendChild(document.createTextNode("★★★★★"));
    var fill = el("span", "fic-stars-fill", "★★★★★");
    fill.setAttribute("aria-hidden", "true");
    fill.style.width = Math.max(0, Math.min(5, value)) / 5 * 100 + "%";
    wrap.appendChild(fill);
    return wrap;
  }

  function formatDate(sqlDate) {
    var d = new Date(String(sqlDate).replace(" ", "T") + "Z");
    return isNaN(d) ? "" : d.toLocaleDateString(lang);
  }

  // ---------- Aufbau ----------
  var heading = el("h2", "", t.title);
  var summary = el("div", "fic-summary");
  var list = el("ul", "fic-list");
  var empty = el("p", "fic-empty", t.empty);
  empty.hidden = true;

  root.appendChild(heading);
  root.appendChild(summary);
  root.appendChild(empty);
  root.appendChild(list);

  function renderReviews(data) {
    summary.textContent = "";
    list.textContent = "";

    if (!data.count) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    summary.appendChild(el("span", "fic-avg", data.average.toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })));
    summary.appendChild(starsDisplay(data.average));
    summary.appendChild(el("span", "fic-count", data.count + " " + t.reviewsWord[data.count === 1 ? 0 : 1]));

    data.reviews.forEach(function (r) {
      var li = el("li", "fic-item");
      var head = el("div", "fic-item-head");
      head.appendChild(starsDisplay(r.rating));
      head.appendChild(el("span", "fic-item-name", r.name || t.anonymous));
      head.appendChild(el("span", "fic-item-date", formatDate(r.created_at)));
      li.appendChild(head);
      li.appendChild(el("p", "fic-item-text", r.text));
      list.appendChild(li);
    });
  }

  function loadReviews() {
    fetch(API + "/api/reviews")
      .then(function (r) { return r.json(); })
      .then(renderReviews)
      .catch(function () {
        summary.textContent = t.errLoad;
      });
  }

  // ---------- Formular ----------
  var form = el("form", "fic-form");
  form.setAttribute("novalidate", "");
  form.appendChild(el("h3", "", t.formTitle));

  // Sterne
  var ratingValue = 0;
  var starField = el("div", "fic-field");
  var legend = el("span", "fic-legend", t.rating);
  legend.id = "fic-rating-label";
  var pick = el("div", "fic-pick");
  pick.setAttribute("role", "radiogroup");
  pick.setAttribute("aria-labelledby", "fic-rating-label");
  var starBtns = [];

  function paintStars(n) {
    starBtns.forEach(function (b, i) {
      b.classList.toggle("is-on", i < n);
    });
  }

  function setRating(n) {
    ratingValue = n;
    starBtns.forEach(function (b, i) {
      b.setAttribute("aria-checked", i + 1 === n ? "true" : "false");
      b.tabIndex = (n === 0 ? i === 0 : i + 1 === n) ? 0 : -1;
    });
    paintStars(n);
  }

  for (var i = 1; i <= 5; i++) {
    (function (n) {
      var b = el("button", "fic-star-btn", "★");
      b.type = "button";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", "false");
      b.setAttribute("aria-label", t.starLabel(n));
      b.tabIndex = n === 1 ? 0 : -1;
      b.addEventListener("click", function () { setRating(n); });
      b.addEventListener("mouseenter", function () { paintStars(n); });
      b.addEventListener("mouseleave", function () { paintStars(ratingValue); });
      b.addEventListener("keydown", function (e) {
        var next = null;
        if (e.key === "ArrowRight" || e.key === "ArrowUp") next = Math.min(5, (ratingValue || n) + 1);
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = Math.max(1, (ratingValue || n) - 1);
        if (next) {
          e.preventDefault();
          setRating(next);
          starBtns[next - 1].focus();
        }
      });
      starBtns.push(b);
      pick.appendChild(b);
    })(i);
  }
  starField.appendChild(legend);
  starField.appendChild(pick);
  form.appendChild(starField);

  // Name
  var nameField = el("div", "fic-field");
  var nameLabel = el("label", "", t.name);
  nameLabel.htmlFor = "fic-name";
  var nameInput = el("input");
  nameInput.type = "text";
  nameInput.id = "fic-name";
  nameInput.maxLength = 50;
  nameInput.autocomplete = "nickname";
  nameField.appendChild(nameLabel);
  nameField.appendChild(nameInput);
  form.appendChild(nameField);

  // Text
  var textField = el("div", "fic-field");
  var textLabel = el("label", "", t.text);
  textLabel.htmlFor = "fic-text";
  var textArea = el("textarea");
  textArea.id = "fic-text";
  textArea.maxLength = 1000;
  textArea.required = true;
  var hint = el("div", "fic-hint", t.textHint);
  textField.appendChild(textLabel);
  textField.appendChild(textArea);
  textField.appendChild(hint);
  form.appendChild(textField);

  // Honeypot (für Menschen unsichtbar)
  var hpWrap = el("div", "fic-hp");
  hpWrap.setAttribute("aria-hidden", "true");
  var hp = el("input");
  hp.type = "text";
  hp.name = "website";
  hp.tabIndex = -1;
  hp.autocomplete = "off";
  hpWrap.appendChild(hp);
  form.appendChild(hpWrap);

  // Turnstile
  var tsBox = el("div", "fic-field");
  form.appendChild(tsBox);
  var tsToken = "";
  var tsWidgetId = null;

  function renderTurnstile() {
    if (!window.turnstile || tsWidgetId !== null || !SITEKEY) return;
    tsWidgetId = window.turnstile.render(tsBox, {
      sitekey: SITEKEY,
      language: lang,
      callback: function (token) { tsToken = token; },
      "expired-callback": function () { tsToken = ""; },
      "error-callback": function () { tsToken = ""; }
    });
  }

  function loadTurnstile() {
    if (window.turnstile) { renderTurnstile(); return; }
    var s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = renderTurnstile;
    document.head.appendChild(s);
  }

  // Senden
  var submit = el("button", "fic-submit", t.submit);
  submit.type = "submit";
  var msg = el("div", "fic-msg");
  msg.setAttribute("role", "status");
  msg.setAttribute("aria-live", "polite");
  form.appendChild(submit);
  form.appendChild(msg);

  function say(text, kind) {
    msg.textContent = text;
    msg.className = "fic-msg" + (kind ? " is-" + kind : "");
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    say("");

    var text = textArea.value.trim();
    if (!ratingValue) return say(t.errRating, "error");
    if (text.length < 10) return say(t.errText, "error");
    if (!tsToken) return say(t.errCaptcha, "error");

    submit.disabled = true;
    submit.textContent = t.sending;

    fetch(API + "/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rating: ratingValue,
        name: nameInput.value.trim(),
        text: text,
        lang: lang,
        website: hp.value,
        turnstileToken: tsToken
      })
    })
      .then(function (r) {
        return r.json().then(function (data) { return { status: r.status, data: data }; });
      })
      .then(function (res) {
        if (res.status === 201) {
          form.reset();
          setRating(0);
          say(t.okMsg, "ok");
        } else if (res.status === 429) {
          say(t.errRate, "error");
        } else if (res.data && res.data.error === "captcha_failed") {
          say(t.errCaptcha, "error");
        } else if (res.data && res.data.error === "invalid_text") {
          say(t.errText, "error");
        } else {
          say(t.errGeneric, "error");
        }
      })
      .catch(function () { say(t.errGeneric, "error"); })
      .then(function () {
        submit.disabled = false;
        submit.textContent = t.submit;
        tsToken = "";
        if (window.turnstile && tsWidgetId !== null) window.turnstile.reset(tsWidgetId);
      });
  });

  root.appendChild(form);

  loadReviews();
  loadTurnstile();
})();
