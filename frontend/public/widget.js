/**
 * SignLanguage Pro — Embeddable widget
 * Usage:
 *   <script src="https://signados.cibermedida.es/widget.js" defer></script>
 *   <div data-signlanguage-widget data-api-key="slp_xxx" data-mode="text-to-sign"></div>
 *
 * Modes:
 *   - text-to-sign  (default) : input + button, shows the generated step list
 *   - dictionary           : compact dictionary search box
 */
(function () {
  if (window.__signlanguageWidgetLoaded) return;
  window.__signlanguageWidgetLoaded = true;

  // Detect API base from this script's src
  const me = document.currentScript || Array.from(document.scripts).pop();
  const myURL = me ? new URL(me.src, location.href) : new URL(location.href);
  const API_BASE = myURL.origin;

  const css = `
.slp-widget{font-family:system-ui,-apple-system,sans-serif;border:1px solid #e2e8f0;border-radius:12px;padding:14px;background:#fff;color:#0f172a;max-width:560px}
.slp-widget *{box-sizing:border-box}
.slp-widget h4{margin:0 0 8px;font-size:14px;font-weight:600;color:#002FA7}
.slp-widget input,.slp-widget textarea{width:100%;font-size:14px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;outline:none;font-family:inherit}
.slp-widget input:focus,.slp-widget textarea:focus{border-color:#002FA7}
.slp-widget button{margin-top:8px;background:#002FA7;color:#fff;border:0;padding:9px 14px;border-radius:6px;font-size:14px;font-weight:500;cursor:pointer}
.slp-widget button:hover{background:#00227A}
.slp-widget button:disabled{opacity:.6;cursor:not-allowed}
.slp-widget .slp-result{margin-top:10px;padding:10px;background:#f8fafc;border-radius:8px;font-size:13px;line-height:1.5}
.slp-widget .slp-step{margin:6px 0;padding:8px;background:#fff;border:1px solid #e2e8f0;border-radius:6px}
.slp-widget .slp-step b{color:#002FA7}
.slp-widget .slp-pill{display:inline-block;background:#002FA7;color:#fff;font-size:11px;padding:2px 8px;border-radius:99px;margin-left:6px}
.slp-widget .slp-meta{font-size:11px;color:#64748b;margin-top:6px}
.slp-widget .slp-error{color:#b91c1c;font-size:12px;margin-top:6px}
`;

  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  function escape(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  async function callApi(path, options = {}, apiKey) {
    const res = await fetch(API_BASE + path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
        ...(options.headers || {}),
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Error" }));
      throw new Error(err.detail || res.statusText);
    }
    return res.json();
  }

  function mountTextToSign(el) {
    const apiKey = el.dataset.apiKey || "";
    const lang = el.dataset.language || "auto";
    const placeholder = el.dataset.placeholder || "Escribe lo que quieres signar…";
    el.classList.add("slp-widget");
    el.innerHTML = `
      <h4>SignLanguage Pro <span class="slp-pill">Texto a signos</span></h4>
      <textarea data-input rows="2" placeholder="${escape(placeholder)}"></textarea>
      <button data-btn>Traducir</button>
      <div data-out></div>
      <div class="slp-meta">Por <a href="${API_BASE}" target="_blank" style="color:inherit">SignLanguage Pro</a></div>
    `;
    const inp = el.querySelector("[data-input]");
    const btn = el.querySelector("[data-btn]");
    const out = el.querySelector("[data-out]");
    btn.onclick = async () => {
      const text = inp.value.trim();
      if (!text) return;
      btn.disabled = true;
      btn.textContent = "Traduciendo…";
      out.innerHTML = "";
      try {
        const d = await callApi(
          "/api/v1/translate/text-to-sign",
          { method: "POST", body: JSON.stringify({ text, target_language: lang }) },
          apiKey,
        );
        const steps = (d.steps || [])
          .map(
            (s) => `<div class="slp-step"><b>${escape(s.word || "")}</b><br>
            <small>👋 ${escape(s.hands || "")}</small><br>
            <small>👄 ${escape(s.mouth || "")}</small><br>
            <small>😊 ${escape(s.expression || "")}</small></div>`,
          )
          .join("");
        out.innerHTML = `<div class="slp-result">
          <strong>${escape(d.language || "")}</strong> · ${escape(d.summary || "")}
          ${steps}
        </div>`;
      } catch (e) {
        out.innerHTML = `<div class="slp-error">${escape(e.message)}</div>`;
      } finally {
        btn.disabled = false;
        btn.textContent = "Traducir";
      }
    };
  }

  function mountDictionary(el) {
    const apiKey = el.dataset.apiKey || "";
    el.classList.add("slp-widget");
    el.innerHTML = `
      <h4>Diccionario de signos <span class="slp-pill">SignLanguage Pro</span></h4>
      <input data-q placeholder="Buscar (hola, gracias…)" />
      <div data-out style="margin-top:10px"></div>
    `;
    const q = el.querySelector("[data-q]");
    const out = el.querySelector("[data-out]");
    let timer = null;
    q.oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          const items = await callApi(
            "/api/v1/dictionary?q=" + encodeURIComponent(q.value),
            {},
            apiKey,
          );
          out.innerHTML = items
            .slice(0, 8)
            .map(
              (i) => `<div class="slp-step"><b>${escape(i.word)}</b>
              <span class="slp-pill">${escape(i.language)}</span><br>
              <small>${escape(i.description)}</small></div>`,
            )
            .join("") || `<div class="slp-meta">Sin resultados</div>`;
        } catch (e) {
          out.innerHTML = `<div class="slp-error">${escape(e.message)}</div>`;
        }
      }, 250);
    };
  }

  function mountAll() {
    document.querySelectorAll("[data-signlanguage-widget]").forEach((el) => {
      if (el.dataset.slpMounted) return;
      el.dataset.slpMounted = "1";
      const mode = el.dataset.mode || "text-to-sign";
      if (mode === "dictionary") mountDictionary(el);
      else mountTextToSign(el);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountAll);
  } else {
    mountAll();
  }
  // Watch for dynamically added widget containers
  if (window.MutationObserver) {
    new MutationObserver(mountAll).observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
  }
})();
