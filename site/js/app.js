/* Ogden Office Space — Site JS */

/* ── Config ── */
const CONFIG = {
  SHOW_LEASED: true,

  // ── Google Sheets live data ──
  // Paste your Google Sheet ID or the full URL from your browser's address bar.
  // Example URL: https://docs.google.com/spreadsheets/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ/edit
  // Example ID:  1aBcDeFgHiJkLmNoPqRsTuVwXyZ
  // DO NOT use the "Publish to web" link (the one with /e/2PACX-...) — use the
  // normal URL from your browser bar when you have the sheet open.
  GOOGLE_SHEET_ID: "1pnKTusIbZuhHyzjUn5lHtUoLHR6kNnybQPc-RrqPqBU",
};

/* ── Data loading ── */
function parseCSV(text) {
  const rows = [];
  let current = "";
  let inQuotes = false;
  const lines = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      rows.push(current);
      current = "";
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      rows.push(current);
      current = "";
      lines.push(rows.splice(0));
    } else {
      current += ch;
    }
  }
  if (current || rows.length) {
    rows.push(current);
    lines.push(rows.splice(0));
  }

  if (lines.length < 2) return [];
  const headers = lines[0];
  return lines.slice(1)
    .filter((row) => row.some((cell) => cell.trim() !== ""))
    .map((row) => {
      const obj = {};
      headers.forEach((h, i) => {
        const val = (row[i] || "").trim();
        obj[h.trim()] = val === "" ? null : val;
      });
      return obj;
    });
}

async function loadSheetCSV(sheetId, tabName) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to load sheet "${tabName}"`);
  return parseCSV(await resp.text());
}

async function loadJSON(path) {
  const resp = await fetch(path);
  if (!resp.ok) throw new Error(`Failed to load ${path}`);
  return resp.json();
}

function extractSheetId(input) {
  if (!input) return "";
  const match = input.match(/\/spreadsheets\/d\/([^/]+)/);
  if (match && !match[1].startsWith("e")) return match[1];
  if (!input.includes("/")) return input;
  return "";
}

async function loadAllData() {
  const id = extractSheetId(CONFIG.GOOGLE_SHEET_ID);
  if (id) {
    const [buildings, suites, contacts] = await Promise.all([
      loadSheetCSV(id, "Buildings"),
      loadSheetCSV(id, "Suites"),
      loadSheetCSV(id, "Contacts"),
    ]);
    return { buildings, suites, contacts };
  } else if (CONFIG.GOOGLE_SHEET_ID) {
    console.error("Invalid Google Sheet ID. Use the URL from your browser bar (not the Publish to web link). It should look like: https://docs.google.com/spreadsheets/d/YOUR_ID/edit");
  }
  const [buildings, suites, contacts] = await Promise.all([
    loadJSON("data/buildings.json"),
    loadJSON("data/suites.json"),
    loadJSON("data/contacts.json"),
  ]);
  return { buildings, suites, contacts };
}

/* ── Sidebar ── */
function buildSidebar(buildings, activeBuildingId) {
  const nav = document.getElementById("sidebar-nav");
  if (!nav) return;
  nav.innerHTML = "";
  buildings.forEach((b) => {
    const a = document.createElement("a");
    a.href = `building.html?id=${b.building_id}`;
    a.textContent = b.building_name;
    if (b.building_id === activeBuildingId) a.classList.add("active");
    nav.appendChild(a);
  });
}

function setupMobileMenu() {
  const hamburger = document.getElementById("hamburger");
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  if (!hamburger) return;

  function toggle() {
    hamburger.classList.toggle("active");
    sidebar.classList.toggle("open");
    overlay.classList.toggle("open");
  }

  function close() {
    hamburger.classList.remove("active");
    sidebar.classList.remove("open");
    overlay.classList.remove("open");
  }

  hamburger.addEventListener("click", toggle);
  overlay.addEventListener("click", close);
}

/* ── Map (home page) ── */
function initMap(buildings, suites) {
  const mapEl = document.getElementById("map");
  if (!mapEl || typeof L === "undefined") return;

  const validBuildings = buildings.filter((b) => b.latitude && b.longitude);
  if (validBuildings.length === 0) return;

  const map = L.map("map", { scrollWheelZoom: false, attributionControl: false });

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 19,
    subdomains: "abcd",
  }).addTo(map);

  let pinNumber = 0;

  const tagOffsets = [
    { tx: 55, ty: -35 },
    { tx: -40, ty: -40 },
    { tx: 40, ty: -40 },
    { tx: -55, ty: -25 },
    { tx: 55, ty: -25 },
    { tx: 0, ty: -65 },
    { tx: -35, ty: -55 },
    { tx: 35, ty: -55 },
    { tx: -60, ty: -45 },
    { tx: 60, ty: -45 },
  ];

  const groups = {};
  validBuildings.forEach((b) => {
    const key = b.map_group || b.building_id;
    if (!groups[key]) groups[key] = [];
    groups[key].push(b);
  });

  const pinData = [];
  Object.values(groups).forEach((buildings) => {
    const first = buildings[0];
    const lat = parseFloat(first.latitude);
    const lng = parseFloat(first.longitude);
    if (isNaN(lat) || isNaN(lng)) return;
    pinData.push({ lat, lng, buildings });
  });

  const markers = [];
  pinData.forEach((pin, idx) => {
    pinNumber++;
    const off = tagOffsets[idx % tagOffsets.length];
    const s = 10;
    const cx = 0;
    const cy = 0;
    const lx = off.tx;
    const ly = off.ty;

    const animDelay = idx * 0.12;
    const tagIcon = L.divIcon({
      className: "map-tag-icon",
      html: `<svg class="map-tag-svg" width="${s}" height="${s}" viewBox="${-s/2} ${-s/2} ${s} ${s}" style="overflow:visible;animation-delay:${animDelay}s">
        <line x1="${cx}" y1="${cy}" x2="${lx}" y2="${ly + 13}" stroke="#131210" stroke-width="1.5"/>
        <circle cx="${cx}" cy="${cy}" r="3.5" fill="#CF152D"/>
        <rect x="${lx - 13}" y="${ly}" width="26" height="26" rx="4" fill="#131210"/>
        <text x="${lx}" y="${ly + 18}" text-anchor="middle" fill="white" font-size="12" font-weight="700" font-family="-apple-system,BlinkMacSystemFont,sans-serif">${pinNumber}</text>
      </svg>`,
      iconSize: [s, s],
      iconAnchor: [s / 2, s / 2],
      popupAnchor: [off.tx, off.ty - 5],
    });

    const marker = L.marker([pin.lat, pin.lng], { icon: tagIcon, zIndexOffset: (pinData.length - idx) * 1000 }).addTo(map);
    const buildings = pin.buildings;
    const first = buildings[0];
    if (buildings.length === 1) {
      marker.bindPopup(`
        <div class="popup-title">${escapeHtml(first.building_name)}</div>
        <div class="popup-address">${escapeHtml(first.address)}, ${escapeHtml(first.city)}</div>
        <a class="popup-link" href="building.html?id=${first.building_id}">View Suites</a>
      `);
    } else {
      marker.bindPopup(`
        <div class="popup-title">${escapeHtml(first.map_group)}</div>
        <div class="popup-address">${escapeHtml(first.address)}, ${escapeHtml(first.city)}</div>
        ${buildings.map((b) => `<a class="popup-link" style="margin:4px 4px 0 0;" href="building.html?id=${b.building_id}">${escapeHtml(b.building_name)}</a>`).join("")}
      `);
    }
    marker.on("click", () => {
      const legendItem = document.getElementById("legend-" + first.building_id);
      if (legendItem) {
        setTimeout(() => {
          legendItem.scrollIntoView({ behavior: "smooth", block: "center" });
          legendItem.classList.add("highlight");
          setTimeout(() => legendItem.classList.remove("highlight"), 1500);
        }, 300);
      }
    });
    markers.push(marker);
  });

  if (markers.length > 0) {
    const group = L.featureGroup(markers);
    map.fitBounds(group.getBounds().pad(0.15));
  }

  const legendEl = document.getElementById("map-legend-grid");
  if (legendEl) {
    let num = 0;
    const allSuites = suites || [];

    function legendCard(b, num, showNum) {
      const isSale = (b.listing_type && b.listing_type.toLowerCase() === "sale") || b.asking_price || (b.building_name && b.building_name.toLowerCase().includes("for sale"));
      const bSuites = allSuites.filter((s) => s.building_id === b.building_id);
      const availCount = bSuites.filter((s) => s.status === "Available").length;
      const availText = isSale
        ? "For Sale"
        : availCount > 0
          ? `${availCount} suite${availCount !== 1 ? "s" : ""} available`
          : bSuites.length > 0 ? "No suites available" : "";
      const thumb = b.photo_filename
        ? `<img class="map-legend-thumb" src="${imgSrc(b.photo_filename)}" alt="" onerror="this.outerHTML='<div class=\\'map-legend-thumb-placeholder\\'>&#128247;</div>'">`
        : `<div class="map-legend-thumb-placeholder">&#128247;</div>`;
      return `<a class="map-legend-item" id="legend-${b.building_id}" href="building.html?id=${b.building_id}"><span class="map-legend-num" ${showNum ? "" : 'style="visibility:hidden"'}>${num}</span>${thumb}<div class="map-legend-text"><span class="map-legend-name">${escapeHtml(b.building_name)}</span><span class="map-legend-address">${escapeHtml(b.address)}, ${escapeHtml(b.city)}</span>${availText ? `<span class="map-legend-avail${isSale ? " for-sale" : ""}">${availText}</span>` : ""}</div></a>`;
    }

    Object.values(groups).forEach((buildings) => {
      const first = buildings[0];
      if (isNaN(parseFloat(first.latitude))) return;
      num++;
      if (buildings.length === 1) {
        legendEl.innerHTML += legendCard(first, num, true);
      } else {
        buildings.forEach((b, j) => {
          legendEl.innerHTML += legendCard(b, num, j === 0);
        });
      }
    });
  }
}

/* ── Contacts ── */
function renderContacts(contacts, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;

  el.innerHTML = contacts
    .map(
      (c) => `
    <div class="contact-card">
      ${
        c.photo_filename
          ? `<img class="contact-photo" src="${imgSrc(c.photo_filename)}" alt="${escapeHtml(c.name)}" onerror="this.outerHTML='<div class=\\'contact-photo-placeholder\\'>${escapeHtml(c.name[0])}</div>'">`
          : `<div class="contact-photo-placeholder">${escapeHtml(c.name[0])}</div>`
      }
      <div class="contact-info">
        <h3>${escapeHtml(c.name)}</h3>
        <div class="contact-title">${escapeHtml(c.title)}</div>
        <div class="contact-links">
          <a href="tel:${c.phone.replace(/[^+\d]/g, "")}">${escapeHtml(c.phone)}</a>
          <a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a>
        </div>
      </div>
    </div>
  `
    )
    .join("");
}

function renderBuildingCTA(contacts, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;

  el.innerHTML = `
    <div class="cta-box">
      <h3>Interested in this space?</h3>
      <div class="cta-contacts">
        ${contacts
          .map(
            (c) => `
          <div class="cta-contact">
            <strong>${escapeHtml(c.name)}</strong>
            <span>${escapeHtml(c.title)}</span>
            <div class="cta-links">
              <a href="tel:${c.phone.replace(/[^+\d]/g, "")}">Call</a>
              <a href="mailto:${escapeHtml(c.email)}">Email</a>
            </div>
          </div>
        `
          )
          .join("")}
      </div>
    </div>
  `;
}

/* ── Building page ── */
function renderBuildingPage(building, suites, contacts) {
  document.title = `${building.building_name} — Ogden Office Space`;

  const header = document.getElementById("building-header");
  if (header) {
    header.innerHTML = `
      <a class="back-link" href="index.html">&#8592; All Buildings</a>
      <div class="building-hero">
        <div>
          ${
            building.photo_filename
              ? `<img class="building-photo" src="${imgSrc(building.photo_filename)}" alt="${escapeHtml(building.building_name)}" onerror="this.outerHTML='<div class=\\'building-photo-placeholder\\'>Photo coming soon</div>'">`
              : `<div class="building-photo-placeholder">Photo coming soon</div>`
          }
        </div>
        <div class="building-details">
          <h1>${escapeHtml(building.building_name)}</h1>
          ${building.listing_type && building.listing_type.toLowerCase() === "sale" ? '<span class="suite-badge badge-sale">For Sale</span>' : ""}
          <div class="building-address">${escapeHtml(building.address)}, ${escapeHtml(building.city)}, ${escapeHtml(building.state)} ${escapeHtml(building.zip)}</div>
          ${building.asking_price ? `<div class="building-price">Asking Price: $${escapeHtml(building.asking_price)}</div>` : ""}
          <p class="building-description">${escapeHtml(building.description || "")}</p>
        </div>
      </div>
    `;
  }

  const suitesEl = document.getElementById("suites-list");
  if (!suitesEl) return;

  const isSale = building.listing_type && building.listing_type.toLowerCase() === "sale";
  const suitesHeading = document.getElementById("suites-heading");
  if (suitesHeading) {
    suitesHeading.textContent = isSale ? "Building Details" : "Available Suites";
  }

  const buildingSuites = suites.filter((s) => s.building_id === building.building_id);

  let filtered = buildingSuites;
  if (!CONFIG.SHOW_LEASED) {
    filtered = filtered.filter((s) => s.status !== "Leased");
  }

  filtered.sort((a, b) => {
    const order = { Available: 0, Pending: 1, Leased: 2 };
    return (order[a.status] ?? 1) - (order[b.status] ?? 1);
  });

  if (filtered.length === 0 && buildingSuites.length === 0) {
    suitesEl.innerHTML = `
      <div class="no-suites">
        <p>Suite details coming soon.</p>
        <p>Contact us for availability.</p>
      </div>
    `;
    return;
  }

  if (filtered.length === 0) {
    suitesEl.innerHTML = `
      <div class="no-suites">
        <p>No available suites at this time.</p>
        <p>Contact us for future availability.</p>
      </div>
    `;
    return;
  }

  suitesEl.innerHTML = filtered
    .map((s) => {
      const statusClass = (s.status || "Available").toLowerCase();
      const badgeClass =
        statusClass === "available"
          ? "badge-available"
          : statusClass === "leased"
            ? "badge-leased"
            : "badge-pending";

      return `
      <div class="suite-card ${statusClass}">
        <div>
          <div class="suite-name">${escapeHtml(s.suite_number)}</div>
          <div class="suite-meta">
            ${s.floor ? `<span>Floor ${escapeHtml(s.floor)}</span>` : ""}
            ${s.square_feet ? `<span>${Number(s.square_feet).toLocaleString()} SF</span>` : ""}
            ${s.lease_rate ? `<span>$${escapeHtml(s.lease_rate)}${escapeHtml(s.rate_unit || "")}</span>` : ""}
            ${s.lease_type ? `<span>${escapeHtml(s.lease_type)}</span>` : ""}
            ${s.available_date && s.status === "Available" ? `<span>Available ${escapeHtml(s.available_date)}</span>` : ""}
          </div>
          ${s.notes ? `<div class="suite-notes">${escapeHtml(s.notes)}</div>` : ""}
          <div class="suite-links">
            ${s.floor_plan_filename ? `<a href="#" data-doc-src="${fileSrc(s.floor_plan_filename)}" onclick="openDocModal(this.dataset.docSrc);return false;">View Floor Plan</a>` : ""}
            ${s.brochure_filename ? `<a href="#" data-doc-src="${fileSrc(s.brochure_filename)}" onclick="openDocModal(this.dataset.docSrc);return false;">View Brochure</a>` : ""}
            ${s.photos ? `<a href="#" data-doc-src="${fileSrc(s.photos)}" onclick="openDocModal(this.dataset.docSrc);return false;">View Photos</a>` : ""}
            <a href="#" class="suite-share-link" onclick="shareSuite('${escapeHtml(building.building_name)}','${escapeHtml(s.suite_number)}',this);return false;">Share</a>
          </div>
        </div>
        <span class="suite-badge ${badgeClass}">${escapeHtml(s.status)}</span>
      </div>
    `;
    })
    .join("");
}

/* ── Utilities ── */
function fileSrc(filename) {
  if (!filename) return "";
  if (filename.startsWith("http://") || filename.startsWith("https://")) {
    const driveMatch = filename.match(/(?:\/d\/|[?&]id=)([a-zA-Z0-9_-]+)/);
    if (driveMatch) {
      return `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
    }
    return filename;
  }
  return `images/${filename}`;
}

function imgSrc(filename) {
  if (!filename) return "";
  if (filename.startsWith("http://") || filename.startsWith("https://")) {
    const driveMatch = filename.match(/(?:\/d\/|[?&]id=)([a-zA-Z0-9_-]+)/);
    if (driveMatch) {
      return `https://drive.google.com/thumbnail?id=${driveMatch[1]}&sz=w2000`;
    }
    return filename;
  }
  return `images/${filename}`;
}

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML;
}

function getQueryParam(key) {
  return new URLSearchParams(window.location.search).get(key);
}

/* ── Suite search/filter (home page) ── */
function initSuiteSearch(buildings, suites) {
  const resultsEl = document.getElementById("suite-search-results");
  const buildingSelect = document.getElementById("filter-building");
  const statusSelect = document.getElementById("filter-status");
  const sizeMin = document.getElementById("filter-size-min");
  const sizeMax = document.getElementById("filter-size-max");
  if (!resultsEl || !buildingSelect) return;

  const buildingMap = {};
  buildings.forEach((b) => { buildingMap[b.building_id] = b; });

  // Populate building dropdown with checkboxes
  const wrapper = document.createElement("div");
  wrapper.className = "multi-select-wrapper";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "multi-select-btn filter-select";
  btn.textContent = "All Buildings";
  const dropdown = document.createElement("div");
  dropdown.className = "multi-select-dropdown";
  buildings.forEach((b) => {
    const label = document.createElement("label");
    label.className = "multi-select-option";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = b.building_id;
    cb.checked = true;
    cb.addEventListener("change", () => { updateBtnLabel(); render(); });
    label.appendChild(cb);
    label.appendChild(document.createTextNode(" " + b.building_name));
    dropdown.appendChild(label);
  });
  function updateBtnLabel() {
    const checked = dropdown.querySelectorAll("input:checked");
    const total = dropdown.querySelectorAll("input");
    if (checked.length === 0 || checked.length === total.length) {
      btn.textContent = "All Buildings";
    } else if (checked.length === 1) {
      btn.textContent = buildingMap[checked[0].value].building_name;
    } else {
      btn.textContent = checked.length + " Buildings";
    }
  }
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    wrapper.classList.toggle("open");
  });
  document.addEventListener("click", () => wrapper.classList.remove("open"));
  dropdown.addEventListener("click", (e) => e.stopPropagation());
  wrapper.appendChild(btn);
  wrapper.appendChild(dropdown);
  buildingSelect.replaceWith(wrapper);

  function getSelectedBuildings() {
    const checked = dropdown.querySelectorAll("input:checked");
    if (checked.length === 0) return null;
    return new Set(Array.from(checked).map((cb) => cb.value));
  }

  function render() {
    const selectedBuildings = getSelectedBuildings();
    const status = statusSelect.value;
    const minSF = parseInt(sizeMin.value) || 0;
    const maxSF = parseInt(sizeMax.value) || 0;

    let filtered = suites.filter((s) => {
      const b = buildingMap[s.building_id];
      if (!b) return false;
      if (selectedBuildings && !selectedBuildings.has(s.building_id)) return false;
      if (status && s.status !== status) return false;
      if (minSF || maxSF) {
        const sf = parseInt(s.square_feet) || 0;
        if (minSF && sf < minSF) return false;
        if (maxSF && sf > maxSF) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      resultsEl.innerHTML = '<div class="suite-search-empty">No suites match your filters.</div>';
      return;
    }

    resultsEl.innerHTML = filtered.map((s) => {
      const b = buildingMap[s.building_id];
      const statusClass = (s.status || "Available").toLowerCase();
      const badgeClass = statusClass === "available" ? "badge-available" : statusClass === "leased" ? "badge-leased" : "badge-pending";
      return `<div class="search-suite-card">
        <div>
          <div class="search-suite-building"><a href="building.html?id=${b.building_id}">${escapeHtml(b.building_name)}</a></div>
          <div class="search-suite-name">${escapeHtml(s.suite_number)}</div>
          <div class="search-suite-meta">
            ${s.square_feet ? `<span>${Number(s.square_feet).toLocaleString()} SF</span>` : ""}
            ${s.lease_rate ? `<span>$${escapeHtml(s.lease_rate)}${escapeHtml(s.rate_unit || "")}</span>` : ""}
            ${s.lease_type ? `<span>${escapeHtml(s.lease_type)}</span>` : ""}
          </div>
        </div>
        <span class="suite-badge ${badgeClass}">${escapeHtml(s.status)}</span>
      </div>`;
    }).join("");
  }

  statusSelect.addEventListener("change", render);
  sizeMin.addEventListener("input", render);
  sizeMax.addEventListener("input", render);
  render();
}

/* ── Share button ── */
function addShareButton() {
  const details = document.querySelector(".building-details");
  if (!details) return;
  const btn = document.createElement("button");
  btn.className = "share-btn";
  btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg> Share';
  btn.addEventListener("click", async () => {
    const url = window.location.href;
    const title = document.title;
    if (navigator.share) {
      try { await navigator.share({ title, url }); } catch (e) {}
    } else {
      await navigator.clipboard.writeText(url);
      btn.classList.add("copied");
      btn.innerHTML = "Link copied!";
      setTimeout(() => {
        btn.classList.remove("copied");
        btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg> Share';
      }, 2000);
    }
  });
  details.appendChild(btn);
}

/* ── Suite share ── */
function shareSuite(buildingName, suiteNumber, el) {
  const url = window.location.href;
  const text = `${suiteNumber} at ${buildingName} — Ogden & Company`;
  if (navigator.share) {
    navigator.share({ title: text, text: text, url: url }).catch(() => {});
  } else {
    navigator.clipboard.writeText(`${text}\n${url}`).then(() => {
      if (el) {
        el.textContent = "Copied!";
        setTimeout(() => { el.textContent = "Share"; }, 2000);
      }
    });
  }
}

/* ── Back to top ── */
function initBackToTop() {
  const btn = document.getElementById("back-to-top");
  if (!btn) return;
  window.addEventListener("scroll", () => {
    btn.classList.toggle("visible", window.scrollY > 400);
  });
  btn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

/* ── Document modal ── */
function openDocModal(src) {
  const overlay = document.getElementById("doc-modal-overlay");
  const iframe = document.getElementById("doc-modal-iframe");
  const fallback = document.getElementById("doc-modal-fallback");
  if (!overlay || !iframe) return;
  iframe.src = src;
  if (fallback) {
    if (src.includes("drive.google.com")) {
      const viewUrl = src.replace("/preview", "/view");
      fallback.href = viewUrl;
      fallback.style.display = "inline-flex";
    } else {
      fallback.style.display = "none";
    }
  }
  overlay.classList.add("open");
}

function closeDocModal() {
  const overlay = document.getElementById("doc-modal-overlay");
  const iframe = document.getElementById("doc-modal-iframe");
  if (!overlay || !iframe) return;
  overlay.classList.remove("open");
  iframe.src = "about:blank";
}

(function () {
  const overlay = document.getElementById("doc-modal-overlay");
  const closeBtn = document.getElementById("doc-modal-close");
  if (closeBtn) closeBtn.addEventListener("click", closeDocModal);
  if (overlay) overlay.addEventListener("click", function (e) {
    if (e.target === overlay) closeDocModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeDocModal();
  });
})();

/* ── Page init ── */
document.addEventListener("DOMContentLoaded", async () => {
  setupMobileMenu();

  try {
    const { buildings, suites, contacts } = await loadAllData();
    const page = document.body.dataset.page;
    const buildingId = getQueryParam("id");

    buildSidebar(buildings, buildingId);

    initBackToTop();

    if (page === "home") {
      initMap(buildings, suites);
      initSuiteSearch(buildings, suites);
      renderContacts(contacts, "contacts-grid");
    } else if (page === "building") {
      const building = buildings.find((b) => b.building_id === buildingId);
      if (!building) {
        document.getElementById("building-header").innerHTML =
          '<p>Building not found. <a href="index.html">Return to all buildings</a>.</p>';
        return;
      }
      renderBuildingPage(building, suites, contacts);
      addShareButton();
      let buildingContacts = contacts;
      if (building.broker) {
        const names = building.broker.split(",").map((n) => n.trim().toLowerCase());
        const matched = contacts.filter((c) => names.some((n) => c.name.toLowerCase().includes(n)));
        if (matched.length > 0) buildingContacts = matched;
      }
      renderBuildingCTA(buildingContacts, "building-cta");
    }
  } catch (err) {
    console.error("Failed to load site data:", err);
  }
});
