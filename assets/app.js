/* مكتبة الكتب — منطق البحث والعرض */
(function () {
  "use strict";

  var DATA = (window.BOOKS_DATA && window.BOOKS_DATA.books) ? window.BOOKS_DATA : { books: [], categories: {}, count: 0 };
  var ALL = DATA.books || [];
  var PAGE_SIZE = 48;

  // الحالة
  var state = {
    query: "",
    category: "all",
    sort: "title",
    shown: PAGE_SIZE,
    results: ALL,
  };

  // عناصر الصفحة
  var el = {
    search: document.getElementById("search"),
    clear: document.getElementById("clear-search"),
    chips: document.getElementById("category-chips"),
    sort: document.getElementById("sort"),
    results: document.getElementById("results"),
    count: document.getElementById("result-count"),
    empty: document.getElementById("empty-state"),
    resetAll: document.getElementById("reset-all"),
    sentinel: document.getElementById("sentinel"),
    loadStatus: document.getElementById("load-status"),
    subtitle: document.getElementById("subtitle"),
    footerCount: document.getElementById("footer-count"),
    dialog: document.getElementById("book-dialog"),
    dialogBody: document.getElementById("dialog-body"),
  };

  // ===== أدوات مساعدة =====
  var arabicNum = new Intl.NumberFormat("ar-EG");
  function fmt(n) { return arabicNum.format(n); }

  // تطبيع حرف واحد: يعيد "" (حرف يُحذف كالتشكيل) أو حرفًا موحّدًا للبحث
  function normChar(ch) {
    if (/[ً-ْٰـ]/.test(ch)) return ""; // تشكيل + تطويل
    if (/[أإآٱ]/.test(ch)) return "ا"; // أ إ آ ٱ -> ا
    if (ch === "ى") return "ي"; // ى -> ي
    if (ch === "ة") return "ه"; // ة -> ه
    if (ch === "ؤ") return "و"; // ؤ -> و
    if (ch === "ئ") return "ي"; // ئ -> ي
    return ch.toLowerCase();
  }

  // تطبيع النص العربي للبحث
  function normalize(s) {
    if (!s) return "";
    var out = "";
    for (var i = 0; i < s.length; i++) out += normChar(s[i]);
    return out.trim();
  }

  // تطبيع مع خريطة تربط كل موضع في النص المطبّع بموضعه الأصلي
  function normalizeWithMap(s) {
    var norm = "", map = [];
    for (var i = 0; i < s.length; i++) {
      var n = normChar(s[i]);
      if (n) { norm += n; map.push(i); }
    }
    return { norm: norm, map: map };
  }

  // فهرس بحث مُطبّع مسبقًا لتسريع الترشيح
  ALL.forEach(function (b) {
    b._t = normalize(b.title);
    b._a = normalize(b.author);
  });

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // تظليل الكلمات المطابقة داخل النص الأصلي (باستخدام خريطة المواضع)
  function highlight(original, tokens) {
    if (!tokens.length) return escapeHtml(original);
    var nm = normalizeWithMap(original);
    var norm = nm.norm, map = nm.map;
    var ranges = [];
    tokens.forEach(function (tok) {
      if (!tok) return;
      var from = 0, idx;
      while ((idx = norm.indexOf(tok, from)) !== -1) {
        var oStart = map[idx];
        var oEnd = map[idx + tok.length - 1] + 1;
        ranges.push([oStart, oEnd]);
        from = idx + tok.length;
      }
    });
    if (!ranges.length) return escapeHtml(original);
    ranges.sort(function (a, b) { return a[0] - b[0]; });
    var merged = [ranges[0].slice()];
    for (var i = 1; i < ranges.length; i++) {
      var last = merged[merged.length - 1];
      if (ranges[i][0] <= last[1]) last[1] = Math.max(last[1], ranges[i][1]);
      else merged.push(ranges[i].slice());
    }
    var out = "", cursor = 0;
    merged.forEach(function (r) {
      out += escapeHtml(original.slice(cursor, r[0]));
      out += "<mark>" + escapeHtml(original.slice(r[0], r[1])) + "</mark>";
      cursor = r[1];
    });
    out += escapeHtml(original.slice(cursor));
    return out;
  }

  // ===== الترشيح والترتيب =====
  function currentTokens() {
    return normalize(state.query).split(/\s+/).filter(Boolean);
  }

  function computeResults() {
    var tokens = currentTokens();
    var cat = state.category;
    var res = ALL.filter(function (b) {
      if (cat !== "all" && b.category !== cat) return false;
      if (!tokens.length) return true;
      var hay = b._t + " " + b._a;
      for (var i = 0; i < tokens.length; i++) {
        if (hay.indexOf(tokens[i]) === -1) return false;
      }
      return true;
    });

    var sort = state.sort;
    var coll = new Intl.Collator("ar");
    res.sort(function (a, b) {
      switch (sort) {
        case "author": return coll.compare(a.author || "￿", b.author || "￿") || coll.compare(a.title, b.title);
        case "copies": return (b.copies || 0) - (a.copies || 0) || coll.compare(a.title, b.title);
        case "category": return coll.compare(a.category, b.category) || coll.compare(a.title, b.title);
        default: return coll.compare(a.title, b.title);
      }
    });
    return res;
  }

  // ===== العرض =====
  function cardHtml(b, tokens) {
    var authorHtml = b.author
      ? '<span aria-hidden="true">✍️</span> ' + highlight(b.author, tokens)
      : "مؤلف غير محدد";
    var meta = '<span class="badge">' + escapeHtml(b.category) + "</span>";
    if (b.copies != null) meta += '<span class="pill">النسخ: ' + fmt(b.copies) + "</span>";
    if (b.year) meta += '<span class="pill">' + fmt(b.year) + "</span>";
    if (b.type) meta += '<span class="pill">' + escapeHtml(b.type) + "</span>";

    return '<article class="card" tabindex="0" role="button" data-id="' + b.id + '" ' +
      'aria-label="' + escapeHtml(b.title) + '">' +
      '<h3 class="card-title">' + highlight(b.title, tokens) + "</h3>" +
      '<div class="card-author' + (b.author ? "" : " empty") + '">' + authorHtml + "</div>" +
      '<div class="card-meta">' + meta + "</div>" +
      "</article>";
  }

  function render(reset) {
    var tokens = currentTokens();
    if (reset) {
      state.results = computeResults();
      state.shown = PAGE_SIZE;
      el.results.innerHTML = "";
    }
    var res = state.results;
    var total = res.length;

    // العدّاد
    if (total === 0) {
      el.count.textContent = "";
      el.results.hidden = true;
      el.empty.hidden = false;
      el.loadStatus.textContent = "";
      return;
    }
    el.results.hidden = false;
    el.empty.hidden = true;
    el.count.textContent = "عدد النتائج: " + fmt(total) + " كتاب" +
      (state.category !== "all" ? " في «" + state.category + "»" : "") +
      (state.query ? " · بحث: «" + state.query + "»" : "");

    // عرض تدريجي
    var start = el.results.childElementCount;
    var end = Math.min(state.shown, total);
    if (end <= start && !reset) return;

    var html = "";
    for (var i = (reset ? 0 : start); i < end; i++) {
      html += cardHtml(res[i], tokens);
    }
    if (reset) el.results.innerHTML = html;
    else el.results.insertAdjacentHTML("beforeend", html);

    el.loadStatus.textContent = end < total
      ? "عُرض " + fmt(end) + " من " + fmt(total) + " — مرّر للأسفل للمزيد"
      : "تم عرض كل النتائج (" + fmt(total) + ")";
  }

  function loadMore() {
    if (state.shown >= state.results.length) return;
    state.shown += PAGE_SIZE;
    render(false);
  }

  // ===== شرائح التصنيفات =====
  function buildChips() {
    var counts = {};
    ALL.forEach(function (b) { counts[b.category] = (counts[b.category] || 0) + 1; });
    var cats = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });

    var html = chipHtml("all", "الكل", ALL.length);
    cats.forEach(function (c) { html += chipHtml(c, c, counts[c]); });
    el.chips.innerHTML = html;

    Array.prototype.forEach.call(el.chips.querySelectorAll(".chip"), function (chip) {
      chip.addEventListener("click", function () {
        state.category = chip.dataset.cat;
        updateChipSelection();
        render(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });
    updateChipSelection();
  }
  function chipHtml(value, label, count) {
    return '<button class="chip" role="tab" data-cat="' + escapeHtml(value) + '" aria-selected="false">' +
      "<span>" + escapeHtml(label) + '</span><span class="chip-count">' + fmt(count) + "</span></button>";
  }
  function updateChipSelection() {
    Array.prototype.forEach.call(el.chips.querySelectorAll(".chip"), function (chip) {
      chip.setAttribute("aria-selected", chip.dataset.cat === state.category ? "true" : "false");
    });
  }

  // ===== نافذة التفاصيل =====
  function openDialog(id) {
    var b = ALL.find(function (x) { return x.id === Number(id); });
    if (!b) return;
    var items = "";
    items += dlgItem("التصنيف", b.category);
    items += dlgItem("المؤلف", b.author || "غير محدد");
    if (b.copies != null) items += dlgItem("عدد النسخ", fmt(b.copies));
    if (b.box) items += dlgItem("رقم الصندوق", b.box);
    if (b.year) items += dlgItem("سنة الإصدار", fmt(b.year));
    if (b.type) items += dlgItem("النوع", b.type);

    el.dialogBody.innerHTML =
      '<span class="badge dlg-badge">' + escapeHtml(b.category) + "</span>" +
      "<h2>" + escapeHtml(b.title) + "</h2>" +
      '<p class="dlg-author">' + (b.author ? "✍️ " + escapeHtml(b.author) : "مؤلف غير محدد") + "</p>" +
      '<div class="dlg-grid">' + items + "</div>";

    if (typeof el.dialog.showModal === "function") el.dialog.showModal();
    else el.dialog.setAttribute("open", "");
  }
  function dlgItem(k, v) {
    return '<div class="dlg-item"><div class="k">' + escapeHtml(k) + '</div><div class="v">' + escapeHtml(v) + "</div></div>";
  }

  // ===== المستمعات =====
  var debTimer;
  function onSearch() {
    el.clear.hidden = !el.search.value;
    clearTimeout(debTimer);
    debTimer = setTimeout(function () {
      state.query = el.search.value;
      render(true);
    }, 160);
  }

  function init() {
    if (!ALL.length) {
      el.subtitle.textContent = "تعذّر تحميل البيانات";
      el.count.textContent = "لم يتم العثور على ملف البيانات (assets/books-data.js). شغّل أداة التحويل أولًا.";
      return;
    }
    el.subtitle.textContent = fmt(ALL.length) + " كتاب في " + fmt(Object.keys(DATA.categories || {}).length || countCats()) + " تصنيفًا";
    el.footerCount.textContent = fmt(ALL.length) + " كتاب";

    buildChips();
    render(true);

    el.search.addEventListener("input", onSearch);
    el.clear.addEventListener("click", function () {
      el.search.value = ""; el.clear.hidden = true; state.query = ""; render(true); el.search.focus();
    });
    el.sort.addEventListener("change", function () { state.sort = el.sort.value; render(true); });
    el.resetAll.addEventListener("click", function () {
      state.query = ""; state.category = "all"; el.search.value = ""; el.clear.hidden = true;
      updateChipSelection(); render(true);
    });

    el.results.addEventListener("click", function (e) {
      var card = e.target.closest(".card");
      if (card) openDialog(card.dataset.id);
    });
    el.results.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var card = e.target.closest(".card");
      if (card) { e.preventDefault(); openDialog(card.dataset.id); }
    });

    // تمرير لانهائي
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) loadMore();
      }, { rootMargin: "600px" }).observe(el.sentinel);
    } else {
      window.addEventListener("scroll", function () {
        if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 600) loadMore();
      });
    }

    // اختصار «/» للتركيز على البحث
    document.addEventListener("keydown", function (e) {
      if (e.key === "/" && document.activeElement !== el.search) { e.preventDefault(); el.search.focus(); }
    });
  }

  function countCats() {
    var s = {}; ALL.forEach(function (b) { s[b.category] = 1; }); return Object.keys(s).length;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
