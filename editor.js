/* =====================================================================
   SNEP VISUAL EDITOR v2  — editor.js
   • Modifica testi inline (contenteditable)
   • Elimina / duplica / sposta su-giù caselle
   • Sostituisce immagini (file upload o URL)
   • Modifica testo + href dei pulsanti
   • Sfondo personalizzato su ogni elemento
   • Aggiunge nuove card, sezioni, badge, statistiche
   • Colori, tipografia, layout tramite pannello laterale
   • Salvataggio completo in localStorage (snapshot body)
   • Esportazione CSS colori
   ===================================================================== */
(function () {
  'use strict';

  /* ─── CHIAVI localStorage ─────────────────────────────────────────── */
  var PAGE     = (location.pathname.split('/').pop() || 'index').replace('.html','');
  var SNAP_KEY = 'snep-snap-'    + PAGE;
  var VARS_KEY = 'snep-vars';
  var SLID_KEY = 'snep-sliders';
  var I18N_KEY = 'snep-i18n-'    + PAGE;
  var LANG_STORAGE_KEY = 'snep-lang';

  /* ─── MAPPA LINGUE → codici MyMemory ─────────────────────────────── */
  var LANG_MAP = { al: 'sq', it: 'it', en: 'en' };

  /* ─── PALETTE COLORI CSS ──────────────────────────────────────────── */
  var CSS_VARS = [
    { key: '--pink',           label: 'Rosa Principale',  def: '#D4789A' },
    { key: '--pink-light',     label: 'Rosa Chiaro',      def: '#F5D0DF' },
    { key: '--pink-lighter',   label: 'Rosa Sfondo',      def: '#FFF0F5' },
    { key: '--pink-dark',      label: 'Rosa Scuro',       def: '#A8547A' },
    { key: '--plum',           label: 'Prugna',           def: '#7B3F6E' },
    { key: '--plum-dark',      label: 'Prugna Scuro',     def: '#5A2E50' },
    { key: '--lavender',       label: 'Lavanda',          def: '#B09FC8' },
    { key: '--lavender-light', label: 'Lavanda Chiaro',   def: '#E8E0F5' },
    { key: '--gold',           label: 'Oro / Salmone',    def: '#C9957A' },
    { key: '--cream',          label: 'Crema (Sfondo)',   def: '#FDF5F3' },
    { key: '--text',           label: 'Testo Principale', def: '#3D2040' },
    { key: '--text-muted',     label: 'Testo Secondario', def: '#8A6080' },
  ];

  /* ─── SELETTORI TESTO MODIFICABILE ───────────────────────────────── */
  var EDITABLE = 'h1,h2,h3,h4,h5,p,span,li,td,th,'
    + '.hero-badge,.stat-num,.stat-label,.section-tag,'
    + '.badge,.brand-name,.brand-sub,.about-logo-name,'
    + '.about-logo-sub,.footer-tag,[data-i18n]';

  /* ─── STATO EDITOR ────────────────────────────────────────────────── */
  var editActive = false;
  var floatBar, imgModal, linkModal;
  var hideTimer;
  var currentFloatTarget = null;
  var currentImgTarget   = null;
  var currentLinkTarget  = null;
  var hoverListeners     = [];

  /* ══════════════════════════════════════════════════════════════════
     UTILITÀ
  ══════════════════════════════════════════════════════════════════ */
  function isEd(el) {
    return el && (el.hasAttribute('data-editor-panel') || !!el.closest('[data-editor-panel]'));
  }

  function isLocalPreview() {
    return location.protocol === 'file:'
      || location.hostname === 'localhost'
      || location.hostname === '127.0.0.1'
      || location.hostname === '::1'
      || location.hostname === '';
  }

  function getSavedLang() {
    try { return localStorage.getItem(LANG_STORAGE_KEY); } catch (e) { return null; }
  }

  function saveSelectedLang(lang) {
    try { if (lang) localStorage.setItem(LANG_STORAGE_KEY, lang); } catch (e) {}
  }

  function updateLangButtons(activeLang) {
    document.querySelectorAll('.lang-switcher .lang-btn').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.lang === activeLang);
    });
  }

  function applyLangSwitcher() {
    var buttons = document.querySelectorAll('.lang-switcher .lang-btn');
    if (!buttons.length) return;

    buttons.forEach(function(btn) {
      var lang = btn.getAttribute('data-lang');
      if (!lang) {
        lang = btn.textContent.trim().slice(-2).toLowerCase();
        btn.dataset.lang = lang;
      }
      btn.addEventListener('click', function() {
        saveSelectedLang(lang);
        updateLangButtons(lang);
        if (typeof setLang === 'function') setLang(lang);
      });
    });

    var saved = getSavedLang();
    if (saved) {
      updateLangButtons(saved);
      if (typeof setLang === 'function') setLang(saved);
    } else {
      var active = document.querySelector('.lang-btn.active');
      if (active && active.dataset.lang) updateLangButtons(active.dataset.lang);
    }
  }

  function rgbToHex(rgb) {
    if (!rgb || rgb === 'transparent' || rgb.indexOf('rgba(0') === 0) return '#ffffff';
    var m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return '#ffffff';
    return '#' + [m[1],m[2],m[3]].map(function(x){
      return ('0'+parseInt(x).toString(16)).slice(-2);
    }).join('');
  }

  /* ══════════════════════════════════════════════════════════════════
     SNAPSHOT  (salva / ripristina l'intera struttura della pagina)
  ══════════════════════════════════════════════════════════════════ */
  function saveSnapshot() {
    var clone = document.body.cloneNode(true);
    clone.querySelectorAll('[data-editor-panel]').forEach(function(el){ el.remove(); });
    clone.querySelectorAll('[data-editor-el],[data-editor-edited],[data-edit-active]').forEach(function(el){
      el.removeAttribute('data-editor-el');
      el.removeAttribute('data-editor-edited');
      el.removeAttribute('contenteditable');
    });
    clone.removeAttribute('data-edit-active');
    localStorage.setItem(SNAP_KEY, clone.innerHTML);
  }

  function loadSnapshot() {
    var snap = localStorage.getItem(SNAP_KEY);
    if (!snap) return false;
    try { document.body.innerHTML = snap; } catch(e){ return false; }
    try { if (typeof setLang === 'function' && typeof detectLang === 'function') setLang(detectLang()); } catch(e){}
    try { if (typeof generateQRCodes === 'function') generateQRCodes(); } catch(e){}
    try { if (typeof initReveal === 'function') initReveal(); } catch(e){}
    return true;
  }

  /* ══════════════════════════════════════════════════════════════════
     AUTO-TRADUZIONE  (MyMemory API, gratuita, nessuna chiave)
     Quando l'editor salva testi con data-i18n modificati, traduce
     automaticamente nelle altre lingue e salva in localStorage.
  ══════════════════════════════════════════════════════════════════ */

  /** Carica le traduzioni personalizzate dal localStorage e le applica a T */
  function loadI18nOverrides() {
    try {
      if (typeof T === 'undefined') return;
      var stored = localStorage.getItem(I18N_KEY);
      if (!stored) return;
      var ovr = JSON.parse(stored);
      Object.keys(ovr).forEach(function(lang) {
        if (T[lang]) Object.assign(T[lang], ovr[lang]);
      });
      var lang = (typeof currentLang !== 'undefined') ? currentLang : 'al';
      if (typeof setLang === 'function') setLang(lang);
    } catch(e) {}
  }

  /** Salva/aggiorna le traduzioni personalizzate in localStorage */
  function saveI18nOverrides(overrides) {
    var existing = {};
    try { existing = JSON.parse(localStorage.getItem(I18N_KEY) || '{}'); } catch(e) {}
    Object.keys(overrides).forEach(function(lang) {
      if (!existing[lang]) existing[lang] = {};
      Object.assign(existing[lang], overrides[lang]);
    });
    localStorage.setItem(I18N_KEY, JSON.stringify(existing));
  }

  /** Rileva la lingua attiva (codice interno: al/it/en) */
  function detectActiveLang() {
    if (typeof currentLang !== 'undefined') return currentLang;
    var l = (document.documentElement.lang || '').toLowerCase();
    if (l === 'sq' || l.startsWith('sq') || l === 'al') return 'al';
    if (l === 'it') return 'it';
    return 'en';
  }

  /** Chiama l'API MyMemory per tradurre un testo */
  function myMemoryTranslate(text, fromCode, toCode, callback) {
    if (!text || text.trim() === '') { callback(null, ''); return; }
    var url = 'https://api.mymemory.translated.net/get?q='
      + encodeURIComponent(text.substring(0, 480))   /* limite 500 char API gratuita */
      + '&langpair=' + fromCode + '%7C' + toCode;
    fetch(url)
      .then(function(r) { return r.json(); })
      .then(function(d) {
        var t = d.responseData && d.responseData.translatedText;
        if (t && t !== 'INVALID LANGUAGE PAIR' && t !== 'QUERY LENGTH LIMIT EXCEEDED') {
          callback(null, t);
        } else {
          callback(new Error('no translation'));
        }
      })
      .catch(function(e) { callback(e); });
  }

  /**
   * Traduce tutti i testi modificati (data-editor-edited + data-i18n)
   * dalla lingua corrente verso le altre lingue.
   * Mostra toast di avanzamento e salva in localStorage.
   */
  function translateEdited() {
    if (typeof T === 'undefined') {
      toast('⚠️ Sistema i18n non disponibile su questa pagina.');
      return;
    }

    var srcLang = detectActiveLang();
    var srcCode = LANG_MAP[srcLang] || 'sq';
    var allLangs = ['al', 'it', 'en'];
    var targetLangs = allLangs.filter(function(l) { return l !== srcLang; });

    /* raccoglie elementi modificati con chiave i18n */
    var edited = [];
    document.querySelectorAll('[data-editor-edited]').forEach(function(el) {
      if (isEd(el)) return;
      var key = el.getAttribute('data-orig-i18n') || el.getAttribute('data-i18n');
      if (!key) return;
      var text = el.innerText.trim();
      if (text) edited.push({ key: key, text: text });
    });

    if (edited.length === 0) {
      toast('ℹ️ Nessun testo i18n modificato da tradurre.');
      return;
    }

    toast('🌐 Traduzione in corso (' + edited.length + ' testi)…');

    var overrides = {};
    /* registra la lingua sorgente */
    overrides[srcLang] = {};
    edited.forEach(function(item) {
      overrides[srcLang][item.key] = item.text;
      if (T[srcLang]) T[srcLang][item.key] = item.text;
    });

    var total = edited.length * targetLangs.length;
    var done  = 0;

    function onDone() {
      done++;
      if (done >= total) {
        saveI18nOverrides(overrides);
        toast('✅ Tradotto e salvato in tutte le lingue!');
        if (typeof setLang === 'function') setLang(srcLang);
      }
    }

    targetLangs.forEach(function(tgtLang) {
      var tgtCode = LANG_MAP[tgtLang] || 'en';
      if (!overrides[tgtLang]) overrides[tgtLang] = {};
      edited.forEach(function(item) {
        myMemoryTranslate(item.text, srcCode, tgtCode, function(err, translated) {
          if (!err && translated) {
            overrides[tgtLang][item.key] = translated;
            if (T[tgtLang]) T[tgtLang][item.key] = translated;
          }
          onDone();
        });
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     CSS VARIABILI
  ══════════════════════════════════════════════════════════════════ */
  function loadVars() {
    try {
      var s = JSON.parse(localStorage.getItem(VARS_KEY) || '{}');
      Object.keys(s).forEach(function(k){ document.documentElement.style.setProperty(k, s[k]); });
    } catch(e){}
  }
  function saveVars() {
    var v = {};
    CSS_VARS.forEach(function(cv){
      var val = document.documentElement.style.getPropertyValue(cv.key).trim();
      if (val) v[cv.key] = val;
    });
    localStorage.setItem(VARS_KEY, JSON.stringify(v));
  }
  function syncPickers() {
    var s = {}; try { s = JSON.parse(localStorage.getItem(VARS_KEY)||'{}'); } catch(e){}
    CSS_VARS.forEach(function(cv,i){
      var inp = document.getElementById('_ec_'+i);
      if (inp) inp.value = s[cv.key] || cv.def;
    });
  }
  function resetColors() {
    CSS_VARS.forEach(function(v,i){
      document.documentElement.style.setProperty(v.key, v.def);
      var inp = document.getElementById('_ec_'+i); if (inp) inp.value = v.def;
    });
    toast('↩️ Colori ripristinati!');
  }

  /* ══════════════════════════════════════════════════════════════════
     SLIDER
  ══════════════════════════════════════════════════════════════════ */
  function saveSliders() {
    var st = {};
    document.querySelectorAll('[data-slider-id]').forEach(function(el){
      st[el.getAttribute('data-slider-id')] = el.value;
    });
    localStorage.setItem(SLID_KEY, JSON.stringify(st));
  }
  function loadSliders() {
    try {
      var s = JSON.parse(localStorage.getItem(SLID_KEY)||'{}');
      Object.keys(s).forEach(function(id){
        var el = document.getElementById('_s_'+id);
        if (el) { el.value = s[id]; el.dispatchEvent(new Event('input')); }
      });
    } catch(e){}
  }

  /* ══════════════════════════════════════════════════════════════════
     SALVA TUTTO / RESET / EXPORT
  ══════════════════════════════════════════════════════════════════ */
  function saveAll() {
    saveSnapshot(); saveVars(); saveSliders();
    toast('💾 Salvato! Avvio traduzione automatica…');
    translateEdited();
  }
  function resetAll() {
    if (!confirm('Annullare TUTTE le modifiche e tornare all\'originale?')) return;
    [SNAP_KEY, VARS_KEY, SLID_KEY, I18N_KEY].forEach(function(k){ localStorage.removeItem(k); });
    location.reload();
  }
  function exportCSS() {
    var lines = [':root {'];
    CSS_VARS.forEach(function(v){
      var val = document.documentElement.style.getPropertyValue(v.key).trim() || v.def;
      lines.push('  ' + v.key + ': ' + val + ';');
    });
    lines.push('}');
    var blob = new Blob([lines.join('\n')], { type: 'text/css' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'colori-snep.css'; a.click();
    toast('📥 CSS esportato!');
  }

  /* ══════════════════════════════════════════════════════════════════
     TOAST
  ══════════════════════════════════════════════════════════════════ */
  function toast(msg) {
    var t = document.getElementById('_snep_toast');
    if (!t) {
      t = document.createElement('div'); t.id = '_snep_toast';
      t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);'
        +'background:#3D2040;color:#fff;padding:.7rem 1.5rem;border-radius:50px;'
        +'font-family:Nunito,sans-serif;font-size:.9rem;font-weight:700;z-index:9999999;'
        +'box-shadow:0 4px 20px rgba(0,0,0,.3);opacity:0;transition:opacity .3s;pointer-events:none;';
      document.body.appendChild(t);
    }
    t.textContent = msg; t.style.opacity = '1';
    clearTimeout(t._t); t._t = setTimeout(function(){ t.style.opacity='0'; }, 2800);
  }

  /* ══════════════════════════════════════════════════════════════════
     MODALITÀ MODIFICA  — attiva contenteditable su tutti i testi
  ══════════════════════════════════════════════════════════════════ */
  function onEdit(e) {
    var el = e.target;
    el.setAttribute('data-editor-edited','');
    if (!el.getAttribute('data-orig-i18n') && el.getAttribute('data-i18n')) {
      el.setAttribute('data-orig-i18n', el.getAttribute('data-i18n'));
      el.removeAttribute('data-i18n');
    }
  }

  function enterEdit() {
    editActive = true;
    document.body.setAttribute('data-edit-active','');
    document.querySelectorAll(EDITABLE).forEach(function(el){
      if (isEd(el)) return;
      el.contentEditable = 'true';
      el.setAttribute('data-editor-el','');
      el.addEventListener('input', onEdit);
    });
    enableBlockInteraction();
    toast('✏️ Clicca su testi, immagini o caselle!');
  }

  function exitEdit() {
    editActive = false;
    document.body.removeAttribute('data-edit-active');
    document.querySelectorAll('[data-editor-el]').forEach(function(el){
      el.contentEditable = 'false';
      el.removeAttribute('contenteditable');
      el.removeEventListener('input', onEdit);
    });
    disableBlockInteraction();
    hideFloatBar();
  }

  /* ══════════════════════════════════════════════════════════════════
     INTERAZIONE ELEMENTI  — hover toolbar, click immagini, click btn
  ══════════════════════════════════════════════════════════════════ */
  function enableBlockInteraction() {
    /* immagini — clic per sostituire */
    document.querySelectorAll('img').forEach(function(img){
      if (isEd(img)) return;
      img.setAttribute('data-img-ed','');
      var fn = function(e){ e.preventDefault(); e.stopPropagation(); showImgModal(img); };
      img.addEventListener('click', fn, true);
      hoverListeners.push({ el:img, ev:'click', fn:fn, cap:true });
    });

    /* pulsanti a.btn — clic destro o floatbar per modifica link */
    /* float-bar su card, stat, sezioni, hero, btn */
    var groups = [
      { sel: '.feature-card', type: 'card' },
      { sel: '.stat-item',    type: 'stat' },
      { sel: '.hero',         type: 'hero' },
      { sel: 'section.section, section.section-alt', type: 'section' },
      { sel: 'a.btn',         type: 'btn'  },
    ];
    groups.forEach(function(g){
      document.querySelectorAll(g.sel).forEach(function(el){
        if (isEd(el)) return;
        el.setAttribute('data-block','');
        var fnEnter = function(e){
          if (!editActive) return;
          e.stopPropagation();
          clearTimeout(hideTimer);
          showFloatBar(el, g.type);
        };
        var fnLeave = function(){
          hideTimer = setTimeout(hideFloatBar, 350);
        };
        el.addEventListener('mouseenter', fnEnter);
        el.addEventListener('mouseleave', fnLeave);
        hoverListeners.push({ el:el, ev:'mouseenter', fn:fnEnter });
        hoverListeners.push({ el:el, ev:'mouseleave', fn:fnLeave });
      });
    });
  }

  function disableBlockInteraction() {
    hoverListeners.forEach(function(item){
      item.el.removeEventListener(item.ev, item.fn, item.cap||false);
    });
    hoverListeners = [];
    document.querySelectorAll('[data-img-ed]').forEach(function(el){ el.removeAttribute('data-img-ed'); });
    document.querySelectorAll('[data-block]').forEach(function(el){ el.removeAttribute('data-block'); });
    hideFloatBar();
  }

  /* ══════════════════════════════════════════════════════════════════
     FLOATING MINI-TOOLBAR
  ══════════════════════════════════════════════════════════════════ */
  function showFloatBar(el, type) {
    if (!floatBar || !editActive) return;
    clearTimeout(hideTimer);
    currentFloatTarget = el;

    var rect = el.getBoundingClientRect();
    floatBar.style.top  = (rect.top  + window.scrollY + 4) + 'px';
    floatBar.style.left = (rect.left + window.scrollX + 4) + 'px';
    floatBar.innerHTML  = '';
    floatBar.style.display = 'flex';

    function fbBtn(icon, title, fn) {
      var b = document.createElement('button');
      b.innerHTML = icon; b.title = title;
      b.setAttribute('data-editor-panel','');
      b.onclick = function(e){ e.stopPropagation(); fn(el); };
      floatBar.appendChild(b);
    }
    function fbSep() {
      var s = document.createElement('span');
      s.className = '_fbsep'; s.setAttribute('data-editor-panel','');
      floatBar.appendChild(s);
    }
    function fbColor(title) {
      var wrap = document.createElement('span');
      wrap.setAttribute('data-editor-panel','');
      wrap.style.cssText = 'display:flex;align-items:center;gap:2px;padding:0 3px;';
      var lbl = document.createElement('span'); lbl.textContent = '🎨'; lbl.style.fontSize='.82rem';
      var inp = document.createElement('input'); inp.type = 'color';
      inp.setAttribute('data-editor-panel','');
      inp.title = title;
      inp.style.cssText = 'width:22px;height:22px;border:none;border-radius:4px;padding:0;cursor:pointer;background:transparent;';
      inp.value = rgbToHex(getComputedStyle(el).backgroundColor);
      inp.addEventListener('input', function(){ el.style.background = inp.value; });
      wrap.appendChild(lbl); wrap.appendChild(inp);
      floatBar.appendChild(wrap);
    }

    fbColor('Colore sfondo');
    fbSep();

    if (type === 'card' || type === 'stat') {
      fbBtn('⬆️','Sposta su',   moveUp);
      fbBtn('⬇️','Sposta giù',  moveDown);
      fbBtn('📋','Duplica',     duplicateEl);
      fbSep();
      fbBtn('🗑️','Elimina',    deleteEl);
    } else if (type === 'section') {
      fbBtn('📋','Duplica',     duplicateEl);
      fbSep();
      fbBtn('🗑️','Elimina sezione', deleteEl);
    } else if (type === 'hero') {
      /* solo sfondo, niente delete */
    } else if (type === 'btn') {
      fbBtn('🔗','Modifica testo e link', function(e){ showLinkModal(el); });
      fbSep();
      fbBtn('🗑️','Elimina pulsante', deleteEl);
    }
  }

  function hideFloatBar() {
    if (floatBar) floatBar.style.display = 'none';
    currentFloatTarget = null;
  }

  /* ── azioni blocco ────────────────────────────────────────────────── */
  function deleteEl(el) {
    if (!el) return;
    if (!confirm('Eliminare questo elemento?')) return;
    el.remove(); hideFloatBar(); toast('🗑️ Eliminato.');
  }
  function duplicateEl(el) {
    if (!el) return;
    var clone = el.cloneNode(true);
    clone.removeAttribute('data-editor-el'); clone.removeAttribute('data-editor-edited');
    el.parentNode.insertBefore(clone, el.nextSibling);
    if (editActive) setupNewBlock(clone, getBlockType(clone));
    toast('📋 Duplicato!');
  }
  function moveUp(el) {
    if (!el) return;
    var prev = el.previousElementSibling;
    while (prev && isEd(prev)) prev = prev.previousElementSibling;
    if (prev) el.parentNode.insertBefore(el, prev);
  }
  function moveDown(el) {
    if (!el) return;
    var next = el.nextElementSibling;
    while (next && isEd(next)) next = next.nextElementSibling;
    if (next) el.parentNode.insertBefore(next, el);
  }
  function getBlockType(el) {
    if (el.classList && el.classList.contains('feature-card')) return 'card';
    if (el.classList && el.classList.contains('stat-item'))    return 'stat';
    if (el.classList && el.classList.contains('hero'))         return 'hero';
    if (el.tagName === 'SECTION')                              return 'section';
    if (el.tagName === 'A')                                    return 'btn';
    return 'block';
  }

  /* ── setup di un blocco appena inserito ───────────────────────────── */
  function setupNewBlock(el, type) {
    if (isEd(el)) return;
    el.setAttribute('data-block','');
    var fnEnter = function(e){ if(!editActive) return; e.stopPropagation(); clearTimeout(hideTimer); showFloatBar(el, type); };
    var fnLeave = function(){ hideTimer = setTimeout(hideFloatBar, 350); };
    el.addEventListener('mouseenter', fnEnter);
    el.addEventListener('mouseleave', fnLeave);
    hoverListeners.push({ el:el, ev:'mouseenter', fn:fnEnter });
    hoverListeners.push({ el:el, ev:'mouseleave', fn:fnLeave });
    el.querySelectorAll(EDITABLE).forEach(function(child){
      if (isEd(child)) return;
      child.contentEditable = 'true'; child.setAttribute('data-editor-el','');
      child.addEventListener('input', onEdit);
    });
    el.querySelectorAll('img').forEach(function(img){
      if (isEd(img)) return;
      img.setAttribute('data-img-ed','');
      var fn = function(e){ e.preventDefault(); e.stopPropagation(); showImgModal(img); };
      img.addEventListener('click', fn, true);
      hoverListeners.push({ el:img, ev:'click', fn:fn, cap:true });
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     MODAL IMMAGINE
  ══════════════════════════════════════════════════════════════════ */
  function showImgModal(img) {
    if (!imgModal) return;
    currentImgTarget = img;
    imgModal.querySelector('#_img_url').value = img.src.startsWith('data:') ? '' : img.src;
    imgModal.querySelector('#_img_preview').src   = img.src;
    imgModal.querySelector('#_img_preview').style.display = 'block';
    imgModal.querySelector('#_img_file').value = '';
    imgModal.style.display = 'flex';
  }
  function hideImgModal() { if(imgModal) imgModal.style.display='none'; currentImgTarget=null; }
  function applyImg(src) {
    if (currentImgTarget && src) {
      currentImgTarget.src = src;
      hideImgModal(); toast('🖼️ Immagine aggiornata!');
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     MODAL LINK / PULSANTE
  ══════════════════════════════════════════════════════════════════ */
  function showLinkModal(aEl) {
    if (!linkModal) return;
    currentLinkTarget = aEl;
    linkModal.querySelector('#_link_text').value = aEl.textContent.trim();
    linkModal.querySelector('#_link_href').value = aEl.getAttribute('href') || '';
    linkModal.style.display = 'flex';
  }
  function hideLinkModal() { if(linkModal) linkModal.style.display='none'; currentLinkTarget=null; }

  /* ══════════════════════════════════════════════════════════════════
     AGGIUNGI NUOVI ELEMENTI  — template HTML
  ══════════════════════════════════════════════════════════════════ */
  var TPL_CARD_PROD = '<div class="feature-card">'
    +'<div class="feature-card-header"><div class="feature-icon feature-icon-products">🌿</div>'
    +'<h3>Titolo Card</h3><p>Descrizione del prodotto. Clicca per modificare.</p></div>'
    +'<div class="feature-card-body"><div class="feature-card-actions">'
    +'<a href="#" class="btn btn-primary">Scopri di più ✨</a></div></div></div>';

  var TPL_CARD_JOIN = '<div class="feature-card">'
    +'<div class="feature-card-header"><div class="feature-icon feature-icon-join">🌟</div>'
    +'<h3>Titolo Card</h3><p>Descrizione dell\'opportunità. Clicca per modificare.</p></div>'
    +'<div class="feature-card-body"><div class="feature-card-actions">'
    +'<a href="#" class="btn btn-secondary">Inizia Ora 💫</a></div></div></div>';

  var TPL_SECTION = '<section class="section"><div class="container">'
    +'<div class="section-header"><span class="section-tag">Tag</span>'
    +'<h2 class="section-title">Nuova Sezione</h2>'
    +'<p class="section-subtitle">Sottotitolo della sezione. Clicca per modificare.</p></div>'
    +'<p style="text-align:center;max-width:700px;margin:0 auto;margin-top:1rem;">'
    +'Contenuto della sezione. Clicca per modificare questo testo.</p>'
    +'</div></section>';

  var TPL_IMG_SEC = '<section class="section section-alt"><div class="container">'
    +'<div class="section-header"><span class="section-tag">Immagine</span>'
    +'<h2 class="section-title">Sezione Immagine</h2></div>'
    +'<div style="text-align:center;margin-top:1.5rem;">'
    +'<img src="foto.jpg" alt="Immagine" style="max-width:400px;border-radius:20px;'
    +'box-shadow:0 8px 32px rgba(168,84,122,0.2);cursor:pointer;">'
    +'<p style="margin-top:1rem;color:#8A6080;font-size:.9rem;">Clicca sull\'immagine per cambiarla</p>'
    +'</div></div></section>';

  var TPL_BADGE = '<span class="badge">✓ Nuovo Badge</span>';
  var TPL_STAT  = '<div class="stat-item"><div class="stat-num">99</div>'
                 +'<div class="stat-label">Nuova Statistica</div></div>';
  var TPL_BTN_PRIMARY   = '<a href="#" class="btn btn-primary">Nuovo Pulsante ✨</a>';
  var TPL_BTN_SECONDARY = '<a href="#" class="btn btn-secondary">Nuovo Pulsante 💫</a>';
  var TPL_BTN_OUTLINE   = '<a href="#" class="btn btn-outline">Pulsante Outline</a>';

  function insertFromTPL(tpl, container, position) {
    var d = document.createElement('div'); d.innerHTML = tpl.trim();
    var el = d.firstElementChild;
    if (position === 'append') { container.appendChild(el); }
    else { container.parentNode.insertBefore(el, container.nextSibling); }
    if (editActive) setupNewBlock(el, getBlockType(el));
    return el;
  }

  function addCard(tpl) {
    var grid = document.querySelector('.feature-grid');
    if (grid) { insertFromTPL(tpl, grid, 'append'); toast('✅ Card aggiunta! Hover per modificarla.'); }
    else toast('⚠️ Nessun .feature-grid trovato su questa pagina.');
  }
  function addSection(tpl) {
    var secs = document.querySelectorAll('section.section, section.section-alt');
    var last = null; secs.forEach(function(s){ if(!isEd(s)) last=s; });
    var el = insertFromTPL(tpl, last || document.body, last ? 'after' : 'append');
    toast('✅ Sezione aggiunta!');
  }
  function addBadge() {
    var c = document.querySelector('.about-badges');
    if (c) { insertFromTPL(TPL_BADGE, c, 'append'); toast('✅ Badge aggiunto!'); }
    else toast('⚠️ Nessun .about-badges trovato.');
  }
  function addStat() {
    var c = document.querySelector('.stat-row');
    if (c) { insertFromTPL(TPL_STAT, c, 'append'); toast('✅ Statistica aggiunta!'); }
    else toast('⚠️ Nessun .stat-row trovato.');
  }
  function addButton(tpl) {
    /* inserisce un pulsante alla fine dell'ultima .feature-card-actions */
    var c = document.querySelector('.feature-card-actions, .hero-actions');
    if (c) {
      var d = document.createElement('div'); d.innerHTML = tpl.trim();
      var el = d.firstElementChild; c.appendChild(el);
      if (editActive) setupNewBlock(el, 'btn');
      toast('✅ Pulsante aggiunto!');
    } else toast('⚠️ Nessuna .hero-actions o .feature-card-actions trovata.');
  }

  /* ══════════════════════════════════════════════════════════════════
     HELPER UI: slider, sezione titolo, tab switch
  ══════════════════════════════════════════════════════════════════ */
  function makeSlider(id, label, min, max, def, unit, step, onChange) {
    var wrap = document.createElement('div'); wrap.className='_srow'; wrap.setAttribute('data-editor-panel','');
    var lbl = document.createElement('label'); lbl.textContent = label;
    var inp = document.createElement('input');
    inp.type='range'; inp.id='_s_'+id; inp.setAttribute('data-slider-id',id);
    inp.min=min; inp.max=max; inp.step=step||1; inp.value=def;
    var val = document.createElement('span'); val.id='_sv_'+id; val.textContent=def+unit;
    inp.addEventListener('input', function(){ val.textContent=inp.value+unit; onChange(inp.value); saveSliders(); });
    wrap.appendChild(lbl); wrap.appendChild(inp); wrap.appendChild(val);
    return wrap;
  }
  function makeSec(text) {
    var d=document.createElement('div'); d.className='_sec'; d.textContent=text; return d;
  }
  function switchTab(name) {
    document.querySelectorAll('[data-tab-btn]').forEach(function(b){
      b.classList.toggle('_act', b.getAttribute('data-tab-btn')===name);
    });
    document.querySelectorAll('[data-tab-pane]').forEach(function(p){
      p.style.display = p.getAttribute('data-tab-pane')===name ? 'block' : 'none';
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     COSTRUISCE L'INTERFACCIA
  ══════════════════════════════════════════════════════════════════ */
  function buildUI() {

    /* ── CSS ── */
    var style = document.createElement('style'); style.setAttribute('data-editor-panel','');
    style.textContent = `
      [data-edit-active] [data-editor-el]:not([data-editor-panel] *){outline:2px dashed #D4789A!important;outline-offset:3px;cursor:text!important;border-radius:3px}
      [data-edit-active] [data-editor-el]:focus{outline:2px solid #7B3F6E!important;outline-offset:3px;background:rgba(245,208,223,.1)!important}
      [data-edit-active] [data-img-ed]{cursor:pointer!important}
      [data-edit-active] [data-img-ed]:hover{outline:3px solid #D4789A!important;outline-offset:2px;border-radius:4px}
      [data-edit-active] [data-block]:not([data-editor-panel] *):not(a){position:relative}

      #_snep_btn{position:fixed;bottom:20px;right:20px;z-index:99999;background:linear-gradient(135deg,#D4789A,#7B3F6E);color:#fff;border:none;border-radius:50px;padding:.65rem 1.4rem;font-family:Nunito,sans-serif;font-size:.88rem;font-weight:800;cursor:pointer;box-shadow:0 4px 20px rgba(123,63,110,.45);transition:all .25s;white-space:nowrap;user-select:none}
      #_snep_btn:hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(123,63,110,.55)}
      #_snep_btn._on{background:linear-gradient(135deg,#5A2E50,#3D2040)}

      #_snep_bar{position:fixed;top:0;left:0;right:0;z-index:99998;background:linear-gradient(135deg,#3D2040,#5A2E50);padding:.5rem 1rem;display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;box-shadow:0 3px 18px rgba(0,0,0,.4);transform:translateY(-100%);transition:transform .3s ease}
      #_snep_bar._vis{transform:translateY(0)}
      #_snep_bar .blbl{color:#F5D0DF;font-family:Nunito,sans-serif;font-size:.82rem;font-weight:800;margin-right:.3rem;white-space:nowrap}
      #_snep_bar button{background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.2);border-radius:7px;padding:.32rem .82rem;font-family:Nunito,sans-serif;font-size:.78rem;font-weight:700;cursor:pointer;transition:background .18s;white-space:nowrap}
      #_snep_bar button:hover{background:rgba(255,255,255,.25)}
      #_snep_bar .sep{width:1px;height:20px;background:rgba(255,255,255,.2);margin:0 .15rem;flex-shrink:0}
      #_snep_bar .danger{color:#FFB3C6!important}
      #_snep_bar .ml{margin-left:auto}

      #_snep_panel{position:fixed;top:0;right:-340px;width:320px;height:100vh;z-index:99997;background:#fff;box-shadow:-4px 0 30px rgba(0,0,0,.18);transition:right .32s ease;overflow-y:auto;font-family:Nunito,sans-serif}
      #_snep_panel._open{right:0}
      ._ph{background:linear-gradient(135deg,#7B3F6E,#D4789A);padding:1rem 1.2rem;position:sticky;top:0;z-index:3}
      ._ph h3{color:#fff;font-size:1rem;font-weight:800;margin:0;font-family:Nunito,sans-serif}
      ._ph p{color:rgba(255,255,255,.85);font-size:.74rem;margin-top:.2rem}
      ._ptabs{display:flex;position:sticky;top:64px;background:#fff;border-bottom:2px solid #F5D0DF;z-index:2}
      [data-tab-btn]{flex:1;padding:.5rem .2rem;text-align:center;font-size:.7rem;font-weight:700;color:#8A6080;cursor:pointer;border:none;background:transparent;border-bottom:2.5px solid transparent;margin-bottom:-2px;transition:all .2s;font-family:Nunito,sans-serif;white-space:nowrap}
      [data-tab-btn]._act{color:#7B3F6E;border-bottom-color:#7B3F6E}
      [data-tab-pane]{padding:.9rem;padding-bottom:2rem}
      ._sec{font-size:.71rem;font-weight:800;color:#A8547A;text-transform:uppercase;letter-spacing:1px;margin:.9rem 0 .45rem;padding-bottom:.3rem;border-bottom:1px solid #F5D0DF}
      ._crow{display:flex;align-items:center;justify-content:space-between;margin-bottom:.55rem;padding:.4rem .65rem;background:#FFF0F5;border-radius:9px;gap:.5rem}
      ._crow label{font-size:.77rem;font-weight:700;color:#3D2040;flex:1}
      ._crow input[type=color]{width:36px;height:30px;border:2px solid #F5D0DF;border-radius:7px;padding:2px;cursor:pointer;background:none;flex-shrink:0}
      ._srow{display:flex;align-items:center;margin-bottom:.5rem;gap:.45rem}
      ._srow label{font-size:.75rem;font-weight:700;color:#3D2040;min-width:90px}
      ._srow input[type=range]{flex:1;accent-color:#D4789A;cursor:pointer}
      ._srow span{font-size:.72rem;color:#8A6080;min-width:36px;text-align:right}
      ._pbtn{display:block;width:100%;margin-top:.4rem;padding:.5rem;background:#FFF0F5;border:1.5px solid #F5D0DF;border-radius:8px;color:#7B3F6E;font-weight:700;cursor:pointer;font-family:Nunito,sans-serif;font-size:.78rem;text-align:center;transition:background .18s}
      ._pbtn:hover{background:#F5D0DF}
      ._pinfo{background:#FFF0F5;border-radius:10px;padding:.8rem;font-size:.76rem;color:#5A2E50;line-height:1.6;margin-top:.5rem}
      ._pinfo b{color:#3D2040}
      ._add-t{font-size:.7rem;font-weight:800;color:#8A6080;text-transform:uppercase;letter-spacing:.8px;margin:.8rem 0 .3rem}
      ._add-btn{display:flex;align-items:center;gap:.5rem;width:100%;padding:.55rem .8rem;margin-bottom:.3rem;background:#fff;border:1.5px solid #F5D0DF;border-radius:10px;color:#3D2040;font-weight:700;cursor:pointer;font-family:Nunito,sans-serif;font-size:.78rem;text-align:left;transition:all .18s}
      ._add-btn:hover{background:#FFF0F5;border-color:#D4789A;color:#7B3F6E}
      ._add-btn .ico{font-size:1rem}

      #_snep_fbar{position:absolute;z-index:99995;display:none;background:rgba(45,20,50,.92);backdrop-filter:blur(8px);border-radius:8px;padding:3px;gap:2px;box-shadow:0 3px 16px rgba(0,0,0,.4);flex-wrap:nowrap;align-items:center;border:1px solid rgba(255,255,255,.15)}
      #_snep_fbar button{background:transparent;color:#fff;border:none;border-radius:6px;width:30px;height:28px;cursor:pointer;font-size:.9rem;display:flex;align-items:center;justify-content:center;transition:background .15s}
      #_snep_fbar button:hover{background:rgba(255,255,255,.2)}
      #_snep_fbar ._fbsep{width:1px;height:16px;background:rgba(255,255,255,.2);margin:0 1px;flex-shrink:0}

      #_snep_imgmodal,#_snep_linkmodal{position:fixed;inset:0;z-index:999999;background:rgba(61,32,64,.65);backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center}
      ._mbox{background:#fff;border-radius:20px;padding:1.8rem;max-width:440px;width:90%;box-shadow:0 16px 56px rgba(0,0,0,.3);font-family:Nunito,sans-serif}
      ._mbox h3{font-size:1.1rem;font-weight:800;color:#3D2040;margin-bottom:.2rem;font-family:Nunito,sans-serif}
      ._mbox .msub{font-size:.8rem;color:#8A6080;margin-bottom:1rem}
      ._mbox label{display:block;font-size:.8rem;font-weight:700;color:#5A2E50;margin-bottom:.3rem}
      ._mbox input[type=url],._mbox input[type=text]{width:100%;padding:.6rem .9rem;border:2px solid #F5D0DF;border-radius:10px;font-size:.88rem;font-family:Nunito,sans-serif;outline:none;margin-bottom:.8rem;transition:border-color .2s}
      ._mbox input:focus{border-color:#D4789A}
      ._mbtns{display:flex;gap:.5rem}
      ._mbtns button{flex:1;padding:.55rem;border-radius:10px;font-family:Nunito,sans-serif;font-weight:700;font-size:.85rem;cursor:pointer;border:none}
      ._mbtns .apply{background:linear-gradient(135deg,#D4789A,#7B3F6E);color:#fff}
      ._mbtns .cancel{background:#F5D0DF;color:#5A2E50}
      ._img-preview{width:100%;height:110px;object-fit:cover;border-radius:10px;margin-bottom:.8rem;border:2px solid #F5D0DF;display:none}
      ._or{text-align:center;font-size:.75rem;color:#8A6080;font-weight:700;margin:.3rem 0;letter-spacing:1px}
      ._file-row{display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem}
      ._file-row input[type=file]{flex:1;font-size:.78rem;font-family:Nunito,sans-serif}
    `;
    document.head.appendChild(style);

    /* ── PULSANTE TOGGLE ── */
    var btn = document.createElement('button');
    btn.id='_snep_btn'; btn.setAttribute('data-editor-panel','');
    btn.textContent='✏️ Modifica Sito'; btn.onclick=toggleEditor;
    document.body.appendChild(btn);

    /* ── BARRA SUPERIORE ── */
    var bar = document.createElement('div'); bar.id='_snep_bar'; bar.setAttribute('data-editor-panel','');
    function bBtn(text,fn,cls){ var b=document.createElement('button'); b.textContent=text; if(cls) b.className=cls; b.onclick=fn; return b; }
    function bSep(){ var d=document.createElement('div'); d.className='sep'; return d; }
    var blbl=document.createElement('span'); blbl.className='blbl'; blbl.textContent='✏️ MODALITÀ MODIFICA';
    bar.appendChild(blbl);
    bar.appendChild(bBtn('💾 Salva tutto', saveAll));
    bar.appendChild(bBtn('🌐 Traduci ora', translateEdited));
    bar.appendChild(bBtn('📥 Esporta CSS', exportCSS));
    bar.appendChild(bSep());
    bar.appendChild(bBtn('🎨 Colori & Stili', togglePanel));
    bar.appendChild(bSep());
    bar.appendChild(bBtn('↩️ Azzera tutto', resetAll, 'danger'));
    bar.appendChild(bBtn('✕ Chiudi', closeEditor, 'ml'));
    document.body.appendChild(bar);

    /* ── FLOATING MINI-TOOLBAR ── */
    floatBar = document.createElement('div');
    floatBar.id='_snep_fbar'; floatBar.setAttribute('data-editor-panel','');
    floatBar.addEventListener('mouseenter', function(){ clearTimeout(hideTimer); });
    floatBar.addEventListener('mouseleave', function(){ hideTimer=setTimeout(hideFloatBar,350); });
    document.body.appendChild(floatBar);

    /* ── PANNELLO LATERALE ── */
    var panel = document.createElement('div'); panel.id='_snep_panel'; panel.setAttribute('data-editor-panel','');
    var ph=document.createElement('div'); ph.className='_ph';
    ph.innerHTML='<h3>🎨 Editor Visuale</h3><p>Modifica tutto: colori, testi, caselle, immagini</p>';
    panel.appendChild(ph);
    var ptabs=document.createElement('div'); ptabs.className='_ptabs';
    [['colors','🎨 Colori'],['add','➕ Aggiungi'],['typo','🔤 Testo'],['layout','📐 Layout'],['info','ℹ️']].forEach(function(s){
      var t=document.createElement('button'); t.setAttribute('data-tab-btn',s[0]); t.textContent=s[1];
      if(s[0]==='colors') t.classList.add('_act');
      t.onclick=function(){ switchTab(s[0]); };
      ptabs.appendChild(t);
    });
    panel.appendChild(ptabs);

    /* TAB COLORI */
    var cpane=document.createElement('div'); cpane.setAttribute('data-tab-pane','colors'); cpane.setAttribute('data-editor-panel','');
    cpane.appendChild(makeSec('Palette colori'));
    var sv={}; try{ sv=JSON.parse(localStorage.getItem(VARS_KEY)||'{}'); }catch(e){}
    CSS_VARS.forEach(function(v,i){
      var row=document.createElement('div'); row.className='_crow'; row.setAttribute('data-editor-panel','');
      var l=document.createElement('label'); l.textContent=v.label;
      var inp=document.createElement('input'); inp.type='color'; inp.id='_ec_'+i;
      inp.setAttribute('data-var',v.key); inp.value=sv[v.key]||v.def;
      inp.addEventListener('input', function(){ document.documentElement.style.setProperty(v.key,inp.value); });
      row.appendChild(l); row.appendChild(inp); cpane.appendChild(row);
    });
    var rcb=document.createElement('button'); rcb.className='_pbtn'; rcb.textContent='↩️ Ripristina colori originali'; rcb.onclick=resetColors;
    cpane.appendChild(rcb); panel.appendChild(cpane);

    /* TAB AGGIUNGI */
    var apane=document.createElement('div'); apane.setAttribute('data-tab-pane','add'); apane.setAttribute('data-editor-panel',''); apane.style.display='none';
    function aTitle(text){ var d=document.createElement('div'); d.className='_add-t'; d.textContent=text; apane.appendChild(d); }
    function aBtn(icon, label, fn){ var b=document.createElement('button'); b.className='_add-btn'; b.setAttribute('data-editor-panel',''); b.innerHTML='<span class="ico">'+icon+'</span>'+label; b.onclick=fn; apane.appendChild(b); }
    aTitle('Caselle (Card)');
    aBtn('🌿','Nuova Card Prodotto',    function(){ addCard(TPL_CARD_PROD); });
    aBtn('🌟','Nuova Card Iscrizione',  function(){ addCard(TPL_CARD_JOIN); });
    aTitle('Sezioni');
    aBtn('📄','Nuova Sezione Testo',    function(){ addSection(TPL_SECTION); });
    aBtn('🖼️','Nuova Sezione Immagine', function(){ addSection(TPL_IMG_SEC); });
    aTitle('Elementi');
    aBtn('🏷️','Aggiungi Badge',         function(){ addBadge(); });
    aBtn('📊','Aggiungi Statistica',    function(){ addStat(); });
    aTitle('Pulsanti');
    aBtn('🔵','Pulsante Rosa (Primary)',     function(){ addButton(TPL_BTN_PRIMARY); });
    aBtn('🟣','Pulsante Viola (Secondary)',  function(){ addButton(TPL_BTN_SECONDARY); });
    aBtn('⚪','Pulsante Outline',            function(){ addButton(TPL_BTN_OUTLINE); });
    var ai=document.createElement('div'); ai.className='_pinfo'; ai.style.marginTop='.8rem';
    ai.innerHTML='<b>Dopo aver aggiunto</b> un elemento, passa il mouse sopra di esso per vedere la mini-barra con ⬆️⬇️🗑️📋.';
    apane.appendChild(ai); panel.appendChild(apane);

    /* TAB TESTO */
    var tpane=document.createElement('div'); tpane.setAttribute('data-tab-pane','typo'); tpane.setAttribute('data-editor-panel',''); tpane.style.display='none';
    tpane.appendChild(makeSec('Dimensione carattere'));
    tpane.appendChild(makeSlider('font-base','Testo base', 12,24,16,'px',1,function(v){ document.documentElement.style.fontSize=v+'px'; }));
    tpane.appendChild(makeSlider('font-h1',  'Titolo H1',  24,80,48,'px',1,function(v){ document.querySelectorAll('h1').forEach(function(e){ if(!e.closest('[data-editor-panel]')) e.style.fontSize=v+'px'; }); }));
    tpane.appendChild(makeSlider('font-h2',  'Titolo H2',  18,60,36,'px',1,function(v){ document.querySelectorAll('h2').forEach(function(e){ if(!e.closest('[data-editor-panel]')) e.style.fontSize=v+'px'; }); }));
    tpane.appendChild(makeSlider('font-h3',  'Titolo H3',  14,42,24,'px',1,function(v){ document.querySelectorAll('h3').forEach(function(e){ if(!e.closest('[data-editor-panel]')) e.style.fontSize=v+'px'; }); }));
    tpane.appendChild(makeSec('Interlinea & Spaziatura'));
    tpane.appendChild(makeSlider('line-h',   'Interlinea',   1.2,2.5,1.75,'', .05,function(v){ document.body.style.lineHeight=v; }));
    tpane.appendChild(makeSlider('letter-h', 'Spaz. titoli', -2, 6,  0,  'px',.5, function(v){ document.querySelectorAll('h1,h2,h3,h4').forEach(function(e){ if(!e.closest('[data-editor-panel]')) e.style.letterSpacing=v+'px'; }); }));
    var ti=document.createElement('div'); ti.className='_pinfo';
    ti.innerHTML='<b>Per modificare testi:</b> clicca direttamente su qualsiasi scritta nella pagina e digita.';
    tpane.appendChild(ti); panel.appendChild(tpane);

    /* TAB LAYOUT */
    var lpane=document.createElement('div'); lpane.setAttribute('data-tab-pane','layout'); lpane.setAttribute('data-editor-panel',''); lpane.style.display='none';
    lpane.appendChild(makeSec('Bordi arrotondati'));
    lpane.appendChild(makeSlider('rad-sm', 'Card piccole', 0,40, 12,'px',1,function(v){ document.documentElement.style.setProperty('--radius-sm',v+'px'); }));
    lpane.appendChild(makeSlider('rad-md', 'Card medie',   0,60, 20,'px',1,function(v){ document.documentElement.style.setProperty('--radius',   v+'px'); }));
    lpane.appendChild(makeSlider('rad-lg', 'Card grandi',  0,80, 32,'px',1,function(v){ document.documentElement.style.setProperty('--radius-lg',v+'px'); }));
    lpane.appendChild(makeSec('Spaziatura'));
    lpane.appendChild(makeSlider('sec-pad', 'Padding sezioni', 20,140,60, 'px',4, function(v){ document.querySelectorAll('.section').forEach(function(e){ e.style.paddingTop=v+'px'; e.style.paddingBottom=v+'px'; }); }));
    lpane.appendChild(makeSlider('hero-pad','Padding hero',    40,180,80, 'px',4, function(v){ document.querySelectorAll('.hero').forEach(function(e){ e.style.paddingTop=v+'px'; e.style.paddingBottom=v+'px'; }); }));
    lpane.appendChild(makeSlider('max-w',   'Larghezza max',   700,1600,1200,'px',50,function(v){ document.querySelectorAll('.container').forEach(function(e){ e.style.maxWidth=v+'px'; }); }));
    panel.appendChild(lpane);

    /* TAB INFO */
    var ipane=document.createElement('div'); ipane.setAttribute('data-tab-pane','info'); ipane.setAttribute('data-editor-panel',''); ipane.style.display='none';
    ipane.innerHTML='<div class="_sec">Come usare l\'editor</div>'
      +'<div class="_pinfo">'
      +'<b>✏️ Testi</b> — Clicca su qualsiasi testo<br><br>'
      +'<b>🖼️ Immagini</b> — Clicca su una foto per sostituirla<br><br>'
      +'<b>🎨 Sfondo</b> — Hover su card/sezione → color picker<br><br>'
      +'<b>🗑️ Elimina</b> — Hover su card/sezione → 🗑️<br><br>'
      +'<b>📋 Duplica</b> — Hover su card/sezione → 📋<br><br>'
      +'<b>⬆️⬇️ Sposta</b> — Hover su card → frecce<br><br>'
      +'<b>🔗 Pulsanti</b> — Hover su btn → 🔗<br><br>'
      +'<b>➕ Aggiungi</b> — Tab "Aggiungi" → scegli template<br><br>'
      +'<b>💾 Salva</b> — "Salva tutto" (persiste tra sessioni)<br><br>'
      +'<b>↩️ Azzera</b> — torna all\'originale</div>';
    panel.appendChild(ipane);
    document.body.appendChild(panel);

    /* ── MODAL IMMAGINE ── */
    imgModal = document.createElement('div'); imgModal.id='_snep_imgmodal'; imgModal.setAttribute('data-editor-panel','');
    imgModal.innerHTML='<div class="_mbox">'
      +'<h3>🖼️ Sostituisci Immagine</h3><p class="msub">Carica dal computer oppure inserisci un URL</p>'
      +'<img id="_img_preview" class="_img-preview" src="" alt="Anteprima">'
      +'<div class="_file-row"><input type="file" id="_img_file" accept="image/*"></div>'
      +'<div class="_or">— oppure —</div>'
      +'<label>URL immagine</label>'
      +'<input type="url" id="_img_url" placeholder="https://esempio.com/foto.jpg">'
      +'<div class="_mbtns">'
      +'<button class="apply" id="_img_apply">✅ Applica</button>'
      +'<button class="cancel" id="_img_cancel">Annulla</button>'
      +'</div></div>';
    imgModal.querySelector('#_img_file').addEventListener('change', function(e){
      var f=e.target.files[0]; if(!f) return;
      var r=new FileReader(); r.onload=function(ev){
        imgModal.querySelector('#_img_preview').src=ev.target.result;
        imgModal.querySelector('#_img_preview').style.display='block';
        imgModal.querySelector('#_img_url').value='';
      }; r.readAsDataURL(f);
    });
    imgModal.querySelector('#_img_url').addEventListener('input', function(e){
      var p=imgModal.querySelector('#_img_preview');
      if(e.target.value){ p.src=e.target.value; p.style.display='block'; } else p.style.display='none';
    });
    imgModal.querySelector('#_img_apply').addEventListener('click', function(){
      var f=imgModal.querySelector('#_img_file'), u=imgModal.querySelector('#_img_url'), p=imgModal.querySelector('#_img_preview');
      if(f.files[0]) applyImg(p.src);
      else if(u.value.trim()) applyImg(u.value.trim());
      else toast('⚠️ Seleziona file o inserisci URL!');
    });
    imgModal.querySelector('#_img_cancel').addEventListener('click', hideImgModal);
    imgModal.addEventListener('click', function(e){ if(e.target===imgModal) hideImgModal(); });
    document.body.appendChild(imgModal);

    /* ── MODAL LINK/PULSANTE ── */
    linkModal = document.createElement('div'); linkModal.id='_snep_linkmodal'; linkModal.setAttribute('data-editor-panel','');
    linkModal.innerHTML='<div class="_mbox">'
      +'<h3>🔗 Modifica Pulsante / Link</h3><p class="msub">Cambia testo e destinazione</p>'
      +'<label>Testo del pulsante</label>'
      +'<input type="text" id="_link_text" placeholder="Testo del pulsante">'
      +'<label>Link (href)</label>'
      +'<input type="url" id="_link_href" placeholder="https://esempio.com o pagina.html">'
      +'<div class="_mbtns">'
      +'<button class="apply" id="_link_apply">✅ Applica</button>'
      +'<button class="cancel" id="_link_cancel">Annulla</button>'
      +'</div></div>';
    linkModal.querySelector('#_link_apply').addEventListener('click', function(){
      if(!currentLinkTarget) return;
      var txt=linkModal.querySelector('#_link_text').value;
      var href=linkModal.querySelector('#_link_href').value;
      if(txt) currentLinkTarget.innerHTML=txt;
      if(href) currentLinkTarget.setAttribute('href',href);
      hideLinkModal(); toast('🔗 Pulsante aggiornato!');
    });
    linkModal.querySelector('#_link_cancel').addEventListener('click', hideLinkModal);
    linkModal.addEventListener('click', function(e){ if(e.target===linkModal) hideLinkModal(); });
    document.body.appendChild(linkModal);

    /* ── click su sfondo per chiudere floatBar ── */
    document.body.addEventListener('mousedown', function(e){
      if(floatBar && !floatBar.contains(e.target) && !e.target.hasAttribute('data-block'))
        hideTimer = setTimeout(hideFloatBar, 200);
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     APRI / CHIUDI EDITOR
  ══════════════════════════════════════════════════════════════════ */
  function toggleEditor() { if(!editActive) openEditor(); else closeEditor(); }

  function openEditor() {
    document.getElementById('_snep_bar').classList.add('_vis');
    var btn=document.getElementById('_snep_btn');
    btn.classList.add('_on'); btn.textContent='✕ Chiudi Editor';
    document.body.style.paddingTop='48px';
    enterEdit();
    loadSliders();
    syncPickers();
  }
  function closeEditor() {
    document.getElementById('_snep_bar').classList.remove('_vis');
    var btn=document.getElementById('_snep_btn');
    btn.classList.remove('_on'); btn.textContent='✏️ Modifica Sito';
    document.body.style.paddingTop='';
    document.getElementById('_snep_panel').classList.remove('_open');
    exitEdit();
  }
  function togglePanel() { document.getElementById('_snep_panel').classList.toggle('_open'); }

  /* ══════════════════════════════════════════════════════════════════
     API GLOBALE
  ══════════════════════════════════════════════════════════════════ */
  window.snepEdit = { save:saveAll, exportCSS:exportCSS, reset:resetAll, panel:togglePanel, close:closeEditor };

  /* ══════════════════════════════════════════════════════════════════
     INIZIALIZZAZIONE
  ══════════════════════════════════════════════════════════════════ */
  function init() {
    if (isLocalPreview()) {
      loadVars();
      loadSnapshot();
      loadI18nOverrides();   /* applica traduzioni personalizzate salvate */
      buildUI();
      loadSliders();
    }
    applyLangSwitcher();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }

})();
