/* مكتبة هيئة حقوق الإنسان — منطق لوحة المعلومات والبحث والعرض */
(function () {
  "use strict";

  var DATA = (window.BOOKS_DATA && window.BOOKS_DATA.books) ? window.BOOKS_DATA : { books: [], categories: {}, count: 0 };
  var ALL = DATA.books || [];
  var PAGE_SIZE = 48;
  var HAY_CATEGORY = "إصدارات الهيئة";

  var state = {
    query: "",
    category: "all",
    author: "",     // فلتر المؤلف (نص مطابق تمامًا)
    pubType: null,  // فلتر نوع إصدار الهيئة (null=بلا فلتر، ""=غير مُصنّف)
    sort: "title",
    shown: PAGE_SIZE,
    results: ALL,
  };

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
    stats: document.getElementById("stats"),
    topAuthorsList: document.getElementById("top-authors-list"),
    hayTypes: document.getElementById("hay-types"),
    haySub: document.getElementById("hay-sub"),
    authorSearch: document.getElementById("author-search"),
    authorClear: document.getElementById("author-clear"),
    authorList: document.getElementById("author-list"),
  };

  // ===== أدوات =====
  var arabicNum = new Intl.NumberFormat("ar-EG");
  function fmt(n) { return arabicNum.format(n); }
  // السنة بلا فاصلة آلاف (٢٠١٤ لا ٢٬٠١٤)
  var yearNum = new Intl.NumberFormat("ar-EG", { useGrouping: false });
  function fmtYear(n) { return yearNum.format(n); }
  var coll = new Intl.Collator("ar");

  function normChar(ch) {
    if (/[ً-ْٰـ]/.test(ch)) return "";
    if (/[أإآٱ]/.test(ch)) return "ا";
    if (ch === "ى") return "ي";
    if (ch === "ة") return "ه";
    if (ch === "ؤ") return "و";
    if (ch === "ئ") return "ي";
    return ch.toLowerCase();
  }
  function normalize(s) {
    if (!s) return "";
    var out = "";
    for (var i = 0; i < s.length; i++) out += normChar(s[i]);
    return out.trim();
  }
  function normalizeWithMap(s) {
    var norm = "", map = [];
    for (var i = 0; i < s.length; i++) {
      var n = normChar(s[i]);
      if (n) { norm += n; map.push(i); }
    }
    return { norm: norm, map: map };
  }

  ALL.forEach(function (b) {
    b._t = normalize(b.title);
    b._a = normalize(b.author);
  });

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function highlight(original, tokens) {
    if (!tokens.length) return escapeHtml(original);
    var nm = normalizeWithMap(original);
    var norm = nm.norm, map = nm.map;
    var ranges = [];
    tokens.forEach(function (tok) {
      if (!tok) return;
      var from = 0, idx;
      while ((idx = norm.indexOf(tok, from)) !== -1) {
        ranges.push([map[idx], map[idx + tok.length - 1] + 1]);
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

  // ===== إحصاءات مشتقة =====
  var authorCounts = {};   // اسم المؤلف -> عدد الكتب
  ALL.forEach(function (b) {
    if (b.author) authorCounts[b.author] = (authorCounts[b.author] || 0) + 1;
  });
  var authorNames = Object.keys(authorCounts);
  authorNames.forEach(function (a) { /* فهرس مُطبّع للبحث */ });
  var authorIndex = authorNames.map(function (a) { return { name: a, count: authorCounts[a], n: normalize(a) }; });

  function computeStats() {
    var totalBooks = ALL.length;
    var totalCopies = 0, hayCount = 0;
    ALL.forEach(function (b) {
      totalCopies += (b.copies != null ? b.copies : 0);
      if (b.category === HAY_CATEGORY) hayCount++;
    });
    return {
      books: totalBooks,
      copies: totalCopies,
      authors: authorNames.length,
      hay: hayCount,
      categories: Object.keys(DATA.categories || {}).length || countCats(),
    };
  }

  function renderStats() {
    var s = computeStats();
    var cards = [
      { ico: "📚", value: s.books, label: "إجمالي الكتب" },
      { ico: "📦", value: s.copies, label: "إجمالي النسخ الحالية" },
      { ico: "✍️", value: s.authors, label: "إجمالي المؤلفين" },
      { ico: "🏛️", value: s.hay, label: "إصدارات الهيئة" },
    ];
    el.stats.innerHTML = cards.map(function (c) {
      return '<div class="stat-card">' +
        '<div class="stat-ico" aria-hidden="true">' + c.ico + "</div>" +
        '<div class="stat-body"><span class="stat-value">' + fmt(c.value) + "</span>" +
        '<span class="stat-label">' + c.label + "</span></div></div>";
    }).join("");
  }

  function renderTopAuthors() {
    var top = authorIndex.slice().sort(function (a, b) {
      return b.count - a.count || coll.compare(a.name, b.name);
    }).slice(0, 8);
    el.topAuthorsList.innerHTML = top.map(function (a, i) {
      return '<li data-author="' + escapeHtml(a.name) + '" title="عرض كتب هذا المؤلف">' +
        '<span class="ta-rank">' + fmt(i + 1) + "</span>" +
        '<span class="ta-name">' + escapeHtml(a.name) + "</span>" +
        '<span class="ta-count">' + fmt(a.count) + " كتاب</span></li>";
    }).join("");
  }

  // ===== لوحة إصدارات الهيئة حسب النوع =====
  function renderHayTypes() {
    var hay = ALL.filter(function (b) { return b.category === HAY_CATEGORY; });
    var titles = {}, copies = {};
    hay.forEach(function (b) {
      var t = b.type || "";
      titles[t] = (titles[t] || 0) + 1;
      copies[t] = (copies[t] || 0) + (b.copies != null ? b.copies : 0);
    });
    var types = Object.keys(titles).sort(function (a, b) {
      if (!a) return 1; if (!b) return -1;               // «غير مصنّف» أخيرًا
      return titles[b] - titles[a] || coll.compare(a, b);
    });
    var maxCount = Math.max.apply(null, types.map(function (t) { return titles[t]; }));
    var totalCopies = hay.reduce(function (s, b) { return s + (b.copies != null ? b.copies : 0); }, 0);
    el.haySub.textContent = fmt(hay.length) + " إصدارًا · " + fmt(totalCopies) + " نسخة";

    el.hayTypes.innerHTML = types.map(function (t) {
      var label = t || "غير مُصنّف";
      var w = Math.round((titles[t] / maxCount) * 100);
      return '<button class="hay-type" type="button" data-type="' + escapeHtml(t) + '" aria-pressed="false" ' +
        'title="عرض إصدارات: ' + escapeHtml(label) + '">' +
        '<div class="ht-top"><span class="ht-label">' + escapeHtml(label) + "</span>" +
        '<span class="ht-count">' + fmt(titles[t]) + "</span></div>" +
        '<div class="ht-bar"><i style="width:' + w + '%"></i></div>' +
        '<div class="ht-copies">' + fmt(copies[t]) + " نسخة</div></button>";
    }).join("");
  }
  function updateHaySelection() {
    Array.prototype.forEach.call(el.hayTypes.querySelectorAll(".hay-type"), function (chip) {
      var active = state.pubType !== null && state.category === HAY_CATEGORY && chip.dataset.type === state.pubType;
      chip.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  // ===== الترشيح والترتيب =====
  function currentTokens() { return normalize(state.query).split(/\s+/).filter(Boolean); }

  function computeResults() {
    var tokens = currentTokens();
    var cat = state.category, author = state.author;
    var res = ALL.filter(function (b) {
      if (cat !== "all" && b.category !== cat) return false;
      if (author && b.author !== author) return false;
      if (state.pubType !== null && b.type !== state.pubType) return false;
      if (!tokens.length) return true;
      var hay = b._t + " " + b._a;
      for (var i = 0; i < tokens.length; i++) if (hay.indexOf(tokens[i]) === -1) return false;
      return true;
    });
    var sort = state.sort;
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
    var authorHtml = b.author ? '<span aria-hidden="true">✍️</span> ' + highlight(b.author, tokens) : "مؤلف غير محدد";
    var meta = '<span class="badge">' + escapeHtml(b.category) + "</span>";
    if (b.copies != null) meta += '<span class="pill">النسخ: ' + fmt(b.copies) + "</span>";
    if (b.year) meta += '<span class="pill">' + fmtYear(b.year) + "</span>";
    if (b.type) meta += '<span class="pill">' + escapeHtml(b.type) + "</span>";
    return '<article class="card" tabindex="0" role="button" data-id="' + b.id + '" aria-label="' + escapeHtml(b.title) + '">' +
      '<h3 class="card-title">' + highlight(b.title, tokens) + "</h3>" +
      '<div class="card-author' + (b.author ? "" : " empty") + '">' + authorHtml + "</div>" +
      '<div class="card-meta">' + meta + "</div></article>";
  }

  function render(reset) {
    var tokens = currentTokens();
    if (reset) {
      state.results = computeResults();
      state.shown = PAGE_SIZE;
      el.results.innerHTML = "";
      updateHaySelection();
    }
    var res = state.results, total = res.length;
    if (total === 0) {
      el.count.innerHTML = countLabel(0);
      el.results.hidden = true; el.empty.hidden = false; el.loadStatus.textContent = "";
      return;
    }
    el.results.hidden = false; el.empty.hidden = true;
    el.count.innerHTML = countLabel(total);

    var start = el.results.childElementCount;
    var end = Math.min(state.shown, total);
    if (end <= start && !reset) return;
    var html = "";
    for (var i = (reset ? 0 : start); i < end; i++) html += cardHtml(res[i], tokens);
    if (reset) el.results.innerHTML = html; else el.results.insertAdjacentHTML("beforeend", html);
    el.loadStatus.textContent = end < total
      ? "عُرض " + fmt(end) + " من " + fmt(total) + " — مرّر للأسفل للمزيد"
      : "تم عرض كل النتائج (" + fmt(total) + ")";
  }

  function countLabel(total) {
    var s = "عدد النتائج: " + fmt(total) + " كتاب";
    if (state.category !== "all") s += " · " + '<span class="active-filter">' + escapeHtml(state.category) + "</span>";
    if (state.author) s += " · " + '<span class="active-filter">✍️ ' + escapeHtml(state.author) + "</span>";
    if (state.pubType !== null && state.category === HAY_CATEGORY) s += " · " + '<span class="active-filter">🏛️ ' + escapeHtml(state.pubType || "غير مُصنّف") + "</span>";
    if (state.query) s += " · بحث: «" + escapeHtml(state.query) + "»";
    return s;
  }

  function loadMore() {
    if (state.shown >= state.results.length) return;
    state.shown += PAGE_SIZE; render(false);
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
        state.category = chip.dataset.cat; state.pubType = null; updateChipSelection(); render(true);
        el.results.scrollIntoView({ behavior: "smooth", block: "start" });
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

  // ===== فلتر المؤلف (قائمة منسدلة قابلة للبحث) =====
  function setAuthor(name) {
    state.author = name || "";
    el.authorSearch.value = name || "";
    el.authorClear.hidden = !name;
    hideAuthorList();
    render(true);
  }
  function openAuthorList(filterText) {
    var q = normalize(filterText);
    var matches = authorIndex.filter(function (a) { return !q || a.n.indexOf(q) !== -1; });
    matches.sort(function (a, b) { return b.count - a.count || coll.compare(a.name, b.name); });
    var shown = matches.slice(0, 60);
    if (!shown.length) {
      el.authorList.innerHTML = '<li class="af-empty">لا يوجد مؤلف مطابق</li>';
    } else {
      el.authorList.innerHTML = shown.map(function (a) {
        return '<li role="option" data-author="' + escapeHtml(a.name) + '">' +
          "<span>" + escapeHtml(a.name) + '</span><span class="af-c">' + fmt(a.count) + " كتاب</span></li>";
      }).join("");
      if (matches.length > shown.length) {
        el.authorList.insertAdjacentHTML("beforeend",
          '<li class="af-empty">…و ' + fmt(matches.length - shown.length) + " مؤلفًا آخر، تابع الكتابة للتضييق</li>");
      }
    }
    el.authorList.hidden = false;
    el.authorSearch.setAttribute("aria-expanded", "true");
  }
  function hideAuthorList() {
    el.authorList.hidden = true;
    el.authorSearch.setAttribute("aria-expanded", "false");
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
    if (b.year) items += dlgItem("سنة الإصدار", fmtYear(b.year));
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

  function countCats() { var s = {}; ALL.forEach(function (b) { s[b.category] = 1; }); return Object.keys(s).length; }

  // ===== التهيئة =====
  var debTimer;
  function onSearch() {
    el.clear.hidden = !el.search.value;
    clearTimeout(debTimer);
    debTimer = setTimeout(function () { state.query = el.search.value; render(true); }, 160);
  }

  function init() {
    if (!ALL.length) {
      el.subtitle.textContent = "تعذّر تحميل البيانات";
      el.count.textContent = "لم يتم العثور على ملف البيانات (assets/books-data.js). شغّل أداة التحويل أولًا.";
      return;
    }
    el.subtitle.textContent = "الفهرس الإلكتروني";
    el.footerCount.textContent = fmt(ALL.length) + " كتاب";

    renderStats();
    renderTopAuthors();
    renderHayTypes();
    buildChips();
    render(true);

    // البحث العام
    el.search.addEventListener("input", onSearch);
    el.clear.addEventListener("click", function () {
      el.search.value = ""; el.clear.hidden = true; state.query = ""; render(true); el.search.focus();
    });
    el.sort.addEventListener("change", function () { state.sort = el.sort.value; render(true); });
    el.resetAll.addEventListener("click", function () {
      state.query = ""; state.category = "all"; state.pubType = null; setAuthor("");
      el.search.value = ""; el.clear.hidden = true; updateChipSelection(); render(true);
    });

    // أكثر المؤلفين — نقرة تفعّل الفلتر
    el.topAuthorsList.addEventListener("click", function (e) {
      var li = e.target.closest("li[data-author]");
      if (li) { setAuthor(li.dataset.author); el.results.scrollIntoView({ behavior: "smooth", block: "start" }); }
    });

    // فلتر المؤلف
    el.authorSearch.addEventListener("focus", function () { openAuthorList(el.authorSearch.value); });
    el.authorSearch.addEventListener("input", function () {
      el.authorClear.hidden = !el.authorSearch.value;
      openAuthorList(el.authorSearch.value);
    });
    el.authorList.addEventListener("click", function (e) {
      var li = e.target.closest("li[data-author]");
      if (li) setAuthor(li.dataset.author);
    });
    el.authorClear.addEventListener("click", function () { setAuthor(""); el.authorSearch.focus(); });

    // لوحة إصدارات الهيئة — نقرة تفعّل فلتر النوع
    el.hayTypes.addEventListener("click", function (e) {
      var chip = e.target.closest(".hay-type");
      if (!chip) return;
      var t = chip.dataset.type;
      if (state.category === HAY_CATEGORY && state.pubType === t) { state.category = "all"; state.pubType = null; }
      else { state.category = HAY_CATEGORY; state.pubType = t; }
      updateChipSelection(); render(true);
      el.results.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    document.addEventListener("click", function (e) {
      if (!e.target.closest("#author-filter")) hideAuthorList();
    });
    el.authorSearch.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { hideAuthorList(); }
      else if (e.key === "Enter") {
        e.preventDefault();
        var first = el.authorList.querySelector("li[data-author]");
        if (first) setAuthor(first.dataset.author);
      }
    });

    // بطاقات الكتب
    el.results.addEventListener("click", function (e) {
      var card = e.target.closest(".card"); if (card) openDialog(card.dataset.id);
    });
    el.results.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var card = e.target.closest(".card"); if (card) { e.preventDefault(); openDialog(card.dataset.id); }
    });

    // تمرير لانهائي
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) { if (entries[0].isIntersecting) loadMore(); },
        { rootMargin: "600px" }).observe(el.sentinel);
    } else {
      window.addEventListener("scroll", function () {
        if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 600) loadMore();
      });
    }

    // اختصار «/» للبحث
    document.addEventListener("keydown", function (e) {
      if (e.key === "/" && document.activeElement !== el.search && document.activeElement !== el.authorSearch) {
        e.preventDefault(); el.search.focus();
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
