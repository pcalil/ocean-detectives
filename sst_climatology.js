/*
 * Ocean Detectives — monthly SST climatology map
 * ------------------------------------------------
 * This script replaces only the map card. The IMOS observations, charts,
 * heatwave detection and story cards remain unchanged.
 *
 * The Bureau of Meteorology source is a 3 × 4 monthly SST-climatology sprite.
 * Each month is cropped to the same Australia-wide geographic frame so the
 * coastline and mooring positions remain fixed while only SST changes.
 */
(() => {
  "use strict";

  if (
    typeof DATA === "undefined" ||
    typeof state === "undefined" ||
    typeof renderAll !== "function" ||
    typeof renderMap !== "function"
  ) {
    console.error(
      "Ocean Detectives SST climatology: load sst-climatology.js after the main Ocean Detectives script."
    );
    return;
  }

  const MONTHS = [
    "January", "February", "March", "April",
    "May", "June", "July", "August",
    "September", "October", "November", "December"
  ];

  const SEASONS = [
    "Summer", "Summer",
    "Autumn", "Autumn", "Autumn",
    "Winter", "Winter", "Winter",
    "Spring", "Spring", "Spring",
    "Summer"
  ];

  /*
   * Exact, consistent panel bounds in the 1000 × 1000 Bureau sprite.
   * Every crop uses the same Australia-wide geographic frame; only the
   * monthly SST colours change. Keeping one fixed crop size prevents the
   * coastline from appearing to pan or zoom as the month changes.
   */
  const SOURCE = { w: 1000, h: 1000 };
  const CROP = {
    x: [120, 375, 629],
    y: [99, 299, 499, 699],
    w: 243,
    h: 153
  };

  /*
   * Geographic extent of each monthly map panel. Station positions are fixed
   * in this coordinate system and never depend on the selected month.
   */
  const BBOX = {
    west: 100,
    east: 160,
    north: -10,
    south: -50
  };

  const SITE_POS = {
    NRSMAI: { lat: -42.596667, lon: 148.233333 },
    NRSROT: { lat: -32.000000, lon: 115.416667 },
    NRSYON: { lat: -19.305000, lon: 147.622000 },
    NRSDAR: { lat: -12.417467, lon: 130.782700 },
    NRSKAI: { lat: -35.832000, lon: 136.447000 }
  };

  const SST_IMAGE =
    "https://www.bom.gov.au/climate/ocean/long-range-forecasts/" +
    "reynolds_climatology.png";

  let sstMonth = 8; // September
  let playTimer = null;
  let mapBuilt = false;
  let resizeObserver = null;

  const sprite = new Image();
  sprite.decoding = "async";
  sprite.src = SST_IMAGE;
  sprite.addEventListener("load", () => renderMonthMap());

  function injectStyles() {
    if (document.getElementById("od-sst-map-style")) return;

    const style = document.createElement("style");
    style.id = "od-sst-map-style";
    style.textContent = `
      .od-sst-toolbar{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px 16px;
        flex-wrap:wrap;
        margin:0 2px 10px;
      }
      .od-sst-month-title{
        font-family:"Fraunces","Iowan Old Style",Georgia,serif;
        font-size:20px;
        font-weight:600;
        color:var(--ink);
      }
      .od-sst-play{
        border:1.5px solid var(--chip-border);
        background:var(--chip-bg);
        color:var(--ink-soft);
        padding:6px 13px;
        border-radius:999px;
        font:600 12.5px "Karla",sans-serif;
        cursor:pointer;
      }
      .od-sst-play:focus-visible,
      .od-sst-month:focus-visible,
      .od-sst-pin:focus-visible{
        outline:3px solid var(--accent);
        outline-offset:2px;
      }
      .od-sst-months{
        display:grid;
        grid-template-columns:repeat(12,minmax(0,1fr));
        gap:5px;
        margin:0 0 9px;
      }
      .od-sst-month{
        min-width:0;
        border:1px solid var(--chip-border);
        background:var(--chip-bg);
        color:var(--ink-soft);
        border-radius:999px;
        padding:5px 1px;
        font:600 11.5px "Karla",sans-serif;
        cursor:pointer;
      }
      .od-sst-month.active{
        background:var(--ink);
        border-color:var(--ink);
        color:var(--bg);
      }
      .od-sst-range-row{
        display:flex;
        align-items:center;
        gap:10px;
        margin:0 2px 12px;
      }
      .od-sst-range{
        width:100%;
        accent-color:var(--accent);
      }
      .od-sst-season{
        min-width:62px;
        text-align:right;
        color:var(--ink-faint);
        font-size:12px;
        font-weight:700;
      }

      /*
       * A single, fixed Australia-wide viewport. Only the SST raster painted
       * into the canvas changes from month to month.
       */
      .od-sst-viewport{
        position:relative;
        width:100%;
        max-width:760px;
        aspect-ratio:243 / 153;
        margin:0 auto;
        overflow:hidden;
        border:1px solid var(--line-soft);
        border-radius:14px;
        background:#dcecf1;
      }
      .od-sst-canvas{
        position:absolute;
        inset:0;
        display:block;
        width:100%;
        height:100%;
        pointer-events:none;
        user-select:none;
      }
      .od-sst-pins{
        position:absolute;
        inset:0;
        z-index:3;
        pointer-events:none;
      }
      .od-sst-pin{
        position:absolute;
        transform:translate(-50%,-50%);
        border:0;
        padding:0;
        background:transparent;
        color:var(--ink);
        font-family:"Karla",sans-serif;
        cursor:pointer;
        pointer-events:auto;
      }
      .od-sst-pin-dot{
        display:block;
        width:13px;
        height:13px;
        border-radius:50%;
        background:#fff;
        border:4px solid var(--site-pin-color,#0a2436);
        box-shadow:0 0 0 2px rgba(255,255,255,.88);
      }
      .od-sst-pin.active .od-sst-pin-dot{
        width:18px;
        height:18px;
        border-color:var(--accent);
      }
      .od-sst-pin-label{
        position:absolute;
        left:50%;
        top:18px;
        transform:translateX(-50%);
        white-space:nowrap;
        background:rgba(255,255,255,.90);
        color:#0a2436;
        border-radius:5px;
        padding:2px 5px;
        font-size:10.5px;
        font-weight:700;
        line-height:1.15;
        box-shadow:0 1px 5px rgba(0,0,0,.12);
      }
      .od-sst-pin.south .od-sst-pin-label{
        top:auto;
        bottom:19px;
      }

      .od-sst-scale{
        max-width:650px;
        margin:10px auto 0;
      }
      .od-sst-scale-bar{
        height:11px;
        border-radius:999px;
        border:1px solid rgba(0,0,0,.16);
        background:linear-gradient(
          90deg,
          #2b1b9b 0%,
          #234be8 16%,
          #2b93ef 30%,
          #2fbea8 42%,
          #65c95c 51%,
          #d8df3e 62%,
          #ffd238 72%,
          #ff9b26 83%,
          #ef5120 92%,
          #a90817 100%
        );
      }
      .od-sst-scale-labels{
        display:flex;
        justify-content:space-between;
        margin-top:2px;
        color:var(--ink-faint);
        font-size:10.5px;
      }
      .od-sst-readout{
        max-width:760px;
        margin:10px auto 0;
        padding:9px 12px;
        border-radius:11px;
        background:var(--surface-2);
        color:var(--ink-soft);
        font-size:12.5px;
        line-height:1.45;
      }
      .od-sst-readout strong{ color:var(--ink); }
      .od-sst-note{
        max-width:760px;
        margin:8px auto 0;
        color:var(--ink-faint);
        font-size:11px;
        line-height:1.45;
      }

      @media(max-width:700px){
        .od-sst-months{
          grid-template-columns:repeat(6,minmax(0,1fr));
        }
        .od-sst-pin-label{ font-size:9.5px; }
      }
    `;
    document.head.appendChild(style);
  }

  function pctX(lon) {
    return ((lon - BBOX.west) / (BBOX.east - BBOX.west)) * 100;
  }

  function pctY(lat) {
    return ((BBOX.north - lat) / (BBOX.north - BBOX.south)) * 100;
  }

  function buildMapUI() {
    if (mapBuilt) return;

    injectStyles();

    const mapCard = document.querySelector(".map-card");
    if (!mapCard) {
      console.error("Ocean Detectives SST climatology: .map-card not found.");
      return;
    }

    mapCard.innerHTML = `
      <div class="od-sst-toolbar">
        <div class="od-sst-month-title" id="odSstMonthTitle"></div>
        <button type="button" class="od-sst-play" id="odSstPlay">▶ Play the year</button>
      </div>

      <div class="od-sst-months" id="odSstMonths"></div>

      <div class="od-sst-range-row">
        <input
          class="od-sst-range"
          id="odSstRange"
          type="range"
          min="0"
          max="11"
          step="1"
          value="8"
          aria-label="Month of typical sea-surface temperature"
        >
        <span class="od-sst-season" id="odSstSeason"></span>
      </div>

      <div
        class="od-sst-viewport"
        id="odSstViewport"
        role="group"
        aria-label="Monthly climatological sea-surface temperature around Australia"
      >
        <canvas class="od-sst-canvas" id="odSstCanvas" aria-hidden="true"></canvas>
        <div class="od-sst-pins" id="odSstPins"></div>
      </div>

      <div
        class="od-sst-scale"
        aria-label="Approximate SST colour scale, 5 to 35 degrees Celsius"
      >
        <div class="od-sst-scale-bar"></div>
        <div class="od-sst-scale-labels">
          <span>5°C</span>
          <span>15°C</span>
          <span>25°C</span>
          <span>35°C</span>
        </div>
      </div>

      <div class="od-sst-readout" id="odSstReadout"></div>

      <p class="od-sst-note">
        Map = typical <strong>sea-surface</strong> temperature.
        The graph below = an actual IMOS sensor that may be much deeper.
        Background: Bureau of Meteorology monthly observed SST climatology
        (Reynolds OISSTv2.1).
      </p>
    `;

    const range = document.getElementById("odSstRange");
    const play = document.getElementById("odSstPlay");
    const viewport = document.getElementById("odSstViewport");

    range.addEventListener("input", (event) => {
      stopPlaying();
      setMonth(Number(event.target.value));
    });

    play.addEventListener("click", () => {
      if (playTimer) {
        stopPlaying();
        return;
      }
      play.textContent = "■ Stop";
      playTimer = window.setInterval(() => setMonth(sstMonth + 1), 900);
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopPlaying();
    });

    if ("ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(() => renderMonthMap());
      resizeObserver.observe(viewport);
    } else {
      window.addEventListener("resize", renderMonthMap);
    }

    mapBuilt = true;
  }

  function stopPlaying() {
    if (playTimer) {
      window.clearInterval(playTimer);
      playTimer = null;
    }
    const play = document.getElementById("odSstPlay");
    if (play) play.textContent = "▶ Play the year";
  }

  function renderMonthButtons() {
    const holder = document.getElementById("odSstMonths");
    if (!holder) return;

    holder.innerHTML = MONTHS.map(
      (name, index) => `
        <button
          type="button"
          class="od-sst-month ${index === sstMonth ? "active" : ""}"
          data-month="${index}"
          aria-pressed="${index === sstMonth}"
        >${name.slice(0, 3)}</button>
      `
    ).join("");

    holder.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        stopPlaying();
        setMonth(Number(button.dataset.month));
      });
    });
  }

  function renderPins() {
    const holder = document.getElementById("odSstPins");
    if (!holder) return;

    holder.innerHTML = DATA.order.map((code) => {
      const site = DATA.sites[code];
      const pos = SITE_POS[code];
      if (!pos) return "";

      const active = code === state.code;
      const south = pos.lat < -39 ? " south" : "";
      const siteColour =
        typeof cssColor === "function" ? cssColor(site) : "#0a2436";

      return `
        <button
          type="button"
          class="od-sst-pin${active ? " active" : ""}${south}"
          data-code="${code}"
          style="
            left:${pctX(pos.lon).toFixed(3)}%;
            top:${pctY(pos.lat).toFixed(3)}%;
            --site-pin-color:${siteColour};
          "
          aria-label="${site.name}, ${site.state}${active ? " (selected)" : ""}"
        >
          <span class="od-sst-pin-dot"></span>
          <span class="od-sst-pin-label">${site.name}</span>
        </button>
      `;
    }).join("");

    holder.querySelectorAll(".od-sst-pin").forEach((button) => {
      button.addEventListener("click", () => {
        const code = button.dataset.code;
        if (!DATA.sites[code]) return;

        state.code = code;
        state.zoom = null;
        renderAll();
      });
    });
  }

  function renderReadout() {
    const box = document.getElementById("odSstReadout");
    if (!box) return;

    const site = DATA.sites[state.code];
    if (!site) return;

    box.innerHTML = `
      <strong>${site.name}</strong> · ${site.state}.
      Use the colour beneath the pin to estimate the typical
      <strong>${MONTHS[sstMonth]}</strong> surface temperature.
      Then compare it with the measured record below at
      <strong>${site.depth_m}&nbsp;m depth</strong>.
    `;
  }

  function renderMonthMap() {
    const canvas = document.getElementById("odSstCanvas");
    const viewport = document.getElementById("odSstViewport");
    if (!canvas || !viewport || !sprite.complete || !sprite.naturalWidth) return;

    const rect = viewport.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));

    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const col = sstMonth % 3;
    const row = Math.floor(sstMonth / 3);

    /*
     * Scale crop coordinates if the Bureau serves the same graphic at a
     * different pixel resolution. This preserves the geographic frame.
     */
    const sourceScaleX = sprite.naturalWidth / SOURCE.w;
    const sourceScaleY = sprite.naturalHeight / SOURCE.h;
    const sx = CROP.x[col] * sourceScaleX;
    const sy = CROP.y[row] * sourceScaleY;
    const sw = CROP.w * sourceScaleX;
    const sh = CROP.h * sourceScaleY;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(sprite, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  }

  function renderMonth() {
    renderMonthMap();

    const title = document.getElementById("odSstMonthTitle");
    const season = document.getElementById("odSstSeason");
    const range = document.getElementById("odSstRange");

    if (title) {
      title.textContent =
        `Typical sea-surface temperature — ${MONTHS[sstMonth]}`;
    }
    if (season) season.textContent = SEASONS[sstMonth];
    if (range) range.value = String(sstMonth);

    renderMonthButtons();
    renderReadout();
  }

  function setMonth(month) {
    sstMonth = ((month % 12) + 12) % 12;
    renderMonth();
  }

  /*
   * Replace only the existing map renderer. renderAll() continues to call
   * renderMap(), so station changes from either the cards or map pins remain
   * synchronised.
   */
  renderMap = function renderSSTClimatologyMap() {
    buildMapUI();
    renderPins();
    renderMonth();
  };

  renderMap();
})();
