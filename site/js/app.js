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

  const page = document.body.dataset.page;
  const quickLinks = document.createElement("div");
  quickLinks.className = "sidebar-quick-links";
  const contactLink = page === "home" ? "#contacts-section" : page === "building" ? "#inquiry-section" : "index.html#contacts-section";
  quickLinks.innerHTML = `
    <a href="find-space.html">Find Your Space</a>
    <a href="index.html#suite-search-section">Browse All Suites</a>
    <a href="${contactLink}">Contact</a>
  `;
  nav.appendChild(quickLinks);

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

  function isBuildingSaleCheck(b) {
    return (b.listing_type && b.listing_type.toLowerCase() === "sale") || b.asking_price || (b.building_name && b.building_name.toLowerCase().includes("for sale"));
  }

  const pinData = [];
  Object.values(groups).forEach((buildings) => {
    const first = buildings[0];
    const lat = parseFloat(first.latitude);
    const lng = parseFloat(first.longitude);
    if (isNaN(lat) || isNaN(lng)) return;
    const hasSale = buildings.some(isBuildingSaleCheck);
    const hasLease = buildings.some((b) => !isBuildingSaleCheck(b));
    const pinType = hasSale && hasLease ? "mixed" : hasSale ? "sale" : "lease";
    pinData.push({ lat, lng, buildings, pinType });
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
    const leaseColor = "#CF152D";
    const saleColor = "#1e40af";
    let dotSvg, tagBg;
    if (pin.pinType === "mixed") {
      dotSvg = `<clipPath id="dot-left-${idx}"><rect x="${cx-4}" y="${cy-4}" width="4" height="8"/></clipPath>
        <clipPath id="dot-right-${idx}"><rect x="${cx}" y="${cy-4}" width="4" height="8"/></clipPath>
        <circle cx="${cx}" cy="${cy}" r="3.5" fill="#131210" clip-path="url(#dot-left-${idx})"/>
        <circle cx="${cx}" cy="${cy}" r="3.5" fill="${saleColor}" clip-path="url(#dot-right-${idx})"/>`;
      tagBg = `<clipPath id="tag-left-${idx}"><rect x="${lx-13}" y="${ly}" width="13" height="26"/></clipPath>
        <clipPath id="tag-right-${idx}"><rect x="${lx}" y="${ly}" width="13" height="26"/></clipPath>
        <rect x="${lx-13}" y="${ly}" width="26" height="26" rx="4" fill="#131210" clip-path="url(#tag-left-${idx})"/>
        <rect x="${lx-13}" y="${ly}" width="26" height="26" rx="4" fill="${saleColor}" clip-path="url(#tag-right-${idx})"/>`;
    } else {
      const color = pin.pinType === "sale" ? saleColor : leaseColor;
      const bgColor = pin.pinType === "sale" ? saleColor : "#131210";
      dotSvg = `<circle cx="${cx}" cy="${cy}" r="3.5" fill="${color}"/>`;
      tagBg = `<rect x="${lx-13}" y="${ly}" width="26" height="26" rx="4" fill="${bgColor}"/>`;
    }
    const tagIcon = L.divIcon({
      className: "map-tag-icon",
      html: `<svg class="map-tag-svg" width="${s}" height="${s}" viewBox="${-s/2} ${-s/2} ${s} ${s}" style="overflow:visible;animation-delay:${animDelay}s">
        <defs></defs>
        <line x1="${cx}" y1="${cy}" x2="${lx}" y2="${ly + 13}" stroke="#131210" stroke-width="1.5"/>
        ${dotSvg}
        ${tagBg}
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

  const leaseEl = document.getElementById("map-legend-lease");
  const saleEl = document.getElementById("map-legend-sale");
  if (leaseEl && saleEl) {
    let num = 0;
    const allSuites = suites || [];

    function isBuildingSale(b) {
      return (b.listing_type && b.listing_type.toLowerCase() === "sale") || b.asking_price || (b.building_name && b.building_name.toLowerCase().includes("for sale"));
    }

    function legendCard(b, num, showNum) {
      const isSale = isBuildingSale(b);
      const bSuites = allSuites.filter((s) => s.building_id === b.building_id);
      const availCount = bSuites.filter((s) => s.status === "Available").length;
      const availText = isSale
        ? (b.asking_price ? `Asking: $${Number(String(b.asking_price).replace(/[^0-9.]/g, "")).toLocaleString()}` : "For Sale")
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
        const target = isBuildingSale(first) ? saleEl : leaseEl;
        target.innerHTML += legendCard(first, num, true);
      } else {
        buildings.forEach((b, j) => {
          const target = isBuildingSale(b) ? saleEl : leaseEl;
          target.innerHTML += legendCard(b, num, true);
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
          <a href="tel:${c.phone.replace(/[^+\d]/g, "")}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>${escapeHtml(c.phone)}</a>
          <a href="mailto:${escapeHtml(c.email)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>${escapeHtml(c.email)}</a>
        </div>
      </div>
    </div>
  `
    )
    .join("");
}

function renderFooterContacts(contacts) {
  const footer = document.querySelector(".site-footer");
  if (!footer || !contacts.length) return;

  const html = `
    <div class="footer-brokers">
      ${contacts.map((c) => `
        <div class="footer-broker">
          ${c.photo_filename
            ? `<img class="footer-broker-photo" src="${imgSrc(c.photo_filename)}" alt="${escapeHtml(c.name)}" onerror="this.outerHTML='<span class=\\'footer-broker-initial\\'>${escapeHtml(c.name[0])}</span>'">`
            : `<span class="footer-broker-initial">${escapeHtml(c.name[0])}</span>`
          }
          <div class="footer-broker-info">
            <strong>${escapeHtml(c.name)}</strong>
            <span>${escapeHtml(c.title)}</span>
            <div class="footer-broker-links">
              <a href="tel:${c.phone.replace(/[^+\d]/g, "")}">${escapeHtml(c.phone)}</a>
              <a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a>
            </div>
          </div>
        </div>
      `).join("")}
    </div>
  `;
  footer.insertAdjacentHTML("afterbegin", html);
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
  const isSale = (building.listing_type && building.listing_type.toLowerCase() === "sale") || building.asking_price || (building.building_name && building.building_name.toLowerCase().includes("for sale"));
  const buildingSuites = suites.filter((s) => s.building_id === building.building_id);
  const availCount = buildingSuites.filter((s) => s.status === "Available").length;

  document.title = `${building.building_name} — ${isSale ? "For Sale" : "Office Space for Lease"} | Ogden & Company`;

  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) {
    let desc = `${building.address}, ${building.city}. `;
    if (isSale && building.asking_price) {
      desc += `For sale — asking $${Number(String(building.asking_price).replace(/[^0-9.]/g, "")).toLocaleString()}. `;
    } else if (availCount > 0) {
      desc += `${availCount} suite${availCount !== 1 ? "s" : ""} available. `;
    }
    if (building.description) desc += building.description;
    metaDesc.setAttribute("content", desc.substring(0, 160));
  }

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
          ${building.asking_price ? `<div class="building-price">Asking Price: $${Number(String(building.asking_price).replace(/[^0-9.]/g, "")).toLocaleString()}</div>` : ""}
          <p class="building-description">${escapeHtml(building.description || "")}</p>
        </div>
      </div>
    `;
  }

  const suitesEl = document.getElementById("suites-list");
  if (!suitesEl) return;

  const suitesHeading = document.getElementById("suites-heading");
  if (suitesHeading) {
    suitesHeading.textContent = isSale ? "Building Details" : "Available Suites";
  }

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
          <div class="suite-card-header">
            <div class="suite-name">${escapeHtml(s.suite_number)}</div>
            ${favBtnHtml(s.suite_id)}
          </div>
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
            <label class="compare-label-btn"><input type="checkbox" class="compare-cb" data-suite="${s.suite_id}"> Compare</label>
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
    cb.checked = false;
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
          ${s.notes ? `<div class="search-suite-notes">${escapeHtml(s.notes)}</div>` : ""}
        </div>
        <div class="search-suite-actions">
          <span class="suite-badge ${badgeClass}">${escapeHtml(s.status)}</span>
          <label class="compare-label-btn"><input type="checkbox" class="compare-cb" data-suite="${s.suite_id}"> Compare</label>
        </div>
      </div>`;
    }).join("");
    syncCompareCheckboxes();
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

/* ── Favorites ── */
function getFavorites() {
  try { return JSON.parse(localStorage.getItem("ogden_favorites") || "[]"); }
  catch { return []; }
}

function saveFavorites(favs) {
  localStorage.setItem("ogden_favorites", JSON.stringify(favs));
}

function isFavorite(suiteId) {
  return getFavorites().some((f) => f.suite_id === suiteId);
}

function toggleFavorite(suite, building) {
  let favs = getFavorites();
  const idx = favs.findIndex((f) => f.suite_id === suite.suite_id);
  if (idx >= 0) {
    favs.splice(idx, 1);
  } else {
    favs.push({
      suite_id: suite.suite_id,
      suite_number: suite.suite_number,
      building_id: suite.building_id,
      building_name: building.building_name,
      square_feet: suite.square_feet,
      lease_rate: suite.lease_rate,
      rate_unit: suite.rate_unit,
      status: suite.status,
    });
    if (typeof gtag === "function") gtag("event", "save_favorite", { suite_id: suite.suite_id, building: building.building_name });
  }
  saveFavorites(favs);
  document.querySelectorAll(`.fav-btn[data-suite="${suite.suite_id}"]`).forEach((btn) => {
    btn.classList.toggle("active", isFavorite(suite.suite_id));
    btn.querySelector("svg").setAttribute("fill", isFavorite(suite.suite_id) ? "currentColor" : "none");
  });
  renderFavorites();
}

function favBtnHtml(suiteId) {
  const active = isFavorite(suiteId);
  return `<button class="fav-btn${active ? " active" : ""}" data-suite="${suiteId}" aria-label="Save suite"><svg viewBox="0 0 24 24" fill="${active ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></button>`;
}

function renderFavorites() {
  const section = document.getElementById("favorites-section");
  const grid = document.getElementById("favorites-grid");
  if (!section || !grid) return;

  const favs = getFavorites();
  if (favs.length === 0) {
    section.style.display = "none";
    return;
  }

  section.style.display = "";
  grid.innerHTML = favs.map((f) => `
    <div class="fav-card">
      <div>
        <div class="fav-card-building"><a href="building.html?id=${f.building_id}">${escapeHtml(f.building_name)}</a></div>
        <div class="fav-card-name">${escapeHtml(f.suite_number)}</div>
        <div class="fav-card-meta">
          ${f.square_feet ? `<span>${Number(f.square_feet).toLocaleString()} SF</span>` : ""}
          ${f.lease_rate ? `<span>$${escapeHtml(f.lease_rate)}${escapeHtml(f.rate_unit || "")}</span>` : ""}
        </div>
      </div>
      <span class="suite-badge ${f.status === "Available" ? "badge-available" : f.status === "Leased" ? "badge-leased" : "badge-pending"}">${escapeHtml(f.status)}</span>
      <button class="fav-remove" onclick="removeFavorite('${f.suite_id}')" aria-label="Remove">&times;</button>
    </div>
  `).join("");
}

function removeFavorite(suiteId) {
  let favs = getFavorites();
  favs = favs.filter((f) => f.suite_id !== suiteId);
  saveFavorites(favs);
  renderFavorites();
  document.querySelectorAll(`.fav-btn[data-suite="${suiteId}"]`).forEach((btn) => {
    btn.classList.remove("active");
    btn.querySelector("svg").setAttribute("fill", "none");
  });
}

/* ── Inquiry form ── */
function initInquiryForm(buildingName) {
  const form = document.getElementById("inquiry-form");
  const buildingInput = document.getElementById("inquiry-building");
  const successEl = document.getElementById("inquiry-success");
  if (!form) return;

  if (buildingInput && buildingName) buildingInput.value = buildingName;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));

    if (typeof gtag === "function") {
      gtag("event", "inquiry_submit", {
        building: data.building,
        name: data.name,
        company: data.company,
      });
    }

    const subject = encodeURIComponent(`Space Inquiry — ${data.building || "Ogden Office Space"}`);
    const body = encodeURIComponent(
      `Name: ${data.name}\nCompany: ${data.company}\nEmail: ${data.email}\nPhone: ${data.phone || "N/A"}\n\nBuilding: ${data.building || "N/A"}\n\nMessage:\n${data.message || "N/A"}`
    );
    window.location.href = `mailto:rreinders@ogdenre.com,lfehrenbach@ogdenre.com?subject=${subject}&body=${body}`;

    form.style.display = "none";
    successEl.style.display = "flex";
  });
}

/* ── GA event helpers ── */
function trackBuildingView(buildingName) {
  if (typeof gtag === "function") gtag("event", "view_building", { building: buildingName });
}

function trackSuiteClick(suiteId, buildingName) {
  if (typeof gtag === "function") gtag("event", "view_suite", { suite_id: suiteId, building: buildingName });
}

/* ── Compare suites ── */
let compareList = [];

function loadCompareList() {
  try { compareList = JSON.parse(sessionStorage.getItem("ogden_compare") || "[]"); }
  catch { compareList = []; }
}

function saveCompareList() {
  sessionStorage.setItem("ogden_compare", JSON.stringify(compareList));
}

function syncCompareCheckboxes() {
  document.querySelectorAll(".compare-cb").forEach((cb) => {
    cb.checked = compareList.some((c) => c.suite_id === cb.dataset.suite);
  });
}

function initCompare(buildingMap, allSuites) {
  loadCompareList();
  syncCompareCheckboxes();
  if (compareList.length > 0) updateCompareBar();

  document.addEventListener("change", (e) => {
    if (!e.target.classList.contains("compare-cb")) return;
    const cb = e.target;
    const sid = cb.dataset.suite;
    const s = allSuites.find((x) => x.suite_id === sid);
    if (!s) return;
    const b = buildingMap[s.building_id];
    if (cb.checked) {
      if (compareList.length >= 3) {
        cb.checked = false;
        return;
      }
      compareList.push({ ...s, building_name: b ? b.building_name : "" });
    } else {
      compareList = compareList.filter((c) => c.suite_id !== sid);
    }
    saveCompareList();
    updateCompareBar();
  });
}

function updateCompareBar() {
  let bar = document.getElementById("compare-bar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "compare-bar";
    bar.className = "compare-bar";
    document.body.appendChild(bar);
  }

  if (compareList.length === 0) {
    bar.classList.remove("visible");
    return;
  }

  bar.classList.add("visible");
  bar.innerHTML = `
    <div class="compare-bar-inner">
      <div class="compare-bar-items">
        ${compareList.map((s) => `
          <span class="compare-bar-chip">
            ${escapeHtml(s.suite_number)}${s.building_name ? ` <span class="compare-chip-bldg">— ${escapeHtml(s.building_name)}</span>` : ""}
            <button onclick="removeCompare('${s.suite_id}')" class="compare-chip-x">&times;</button>
          </span>
        `).join("")}
        ${compareList.length < 3 ? `<span class="compare-bar-hint">${3 - compareList.length} more</span>` : ""}
      </div>
      <button class="compare-bar-btn" onclick="showCompareModal()" ${compareList.length < 2 ? "disabled" : ""}>Compare ${compareList.length} Suite${compareList.length !== 1 ? "s" : ""}</button>
    </div>
  `;
}

function removeCompare(suiteId) {
  compareList = compareList.filter((c) => c.suite_id !== suiteId);
  saveCompareList();
  const cb = document.querySelector(`.compare-cb[data-suite="${suiteId}"]`);
  if (cb) cb.checked = false;
  updateCompareBar();
}

function showCompareModal() {
  if (compareList.length < 2) return;

  const fields = [
    { label: "Building", key: "building_name", format: (v) => v || "—" },
    { label: "Status", key: "status", format: (v) => v || "—" },
    { label: "Floor", key: "floor", format: (v) => v ? `Floor ${v}` : "—" },
    { label: "Size", key: "square_feet", format: (v) => v ? `${Number(v).toLocaleString()} SF` : "—" },
    { label: "Rate", key: "lease_rate", format: (v, s) => v ? `$${v}${s.rate_unit || ""}` : "—" },
    { label: "Lease Type", key: "lease_type", format: (v) => v || "—" },
    { label: "Available", key: "available_date", format: (v) => v || "—" },
    { label: "Notes", key: "notes", format: (v) => v || "—" },
  ];

  let overlay = document.getElementById("compare-modal-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "compare-modal-overlay";
    overlay.className = "compare-modal-overlay";
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeCompareModal();
    });
  }

  overlay.innerHTML = `
    <div class="compare-modal">
      <button class="doc-modal-close" onclick="closeCompareModal()">&times;</button>
      <h3 class="compare-modal-title">Suite Comparison</h3>
      <div class="compare-modal-header">
        <button class="compare-print-btn" onclick="printComparison()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          Print / Save
        </button>
      </div>
      <div class="compare-table-wrap">
        <table class="compare-table">
          <thead>
            <tr>
              <th></th>
              ${compareList.map((s) => `<th>${escapeHtml(s.suite_number)}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${fields.map((f) => `
              <tr>
                <td class="compare-label">${f.label}</td>
                ${compareList.map((s) => `<td>${escapeHtml(f.format(s[f.key], s))}</td>`).join("")}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
  overlay.classList.add("open");

  if (typeof gtag === "function") gtag("event", "compare_suites", { count: compareList.length });
}

function printComparison() {
  window.print();
}

function closeCompareModal() {
  const overlay = document.getElementById("compare-modal-overlay");
  if (overlay) overlay.classList.remove("open");
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
    if (e.key === "Escape") { closeDocModal(); closeCompareModal(); }
  });
})();

/* ── Find Your Space ── */
function initFindSpace(buildings, suites) {
  const form = document.getElementById("find-space-form");
  if (!form) return;

  const buildingMap = {};
  buildings.forEach((b) => { buildingMap[b.building_id] = b; });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const people = parseInt(document.getElementById("fs-people").value) || 0;
    const sqft = parseInt(document.getElementById("fs-sqft").value) || 0;
    const budget = parseFloat(document.getElementById("fs-budget").value) || 0;

    const minSF = sqft || (people ? people * 150 : 0);
    const maxSF = sqft || (people ? people * 250 : 0);

    let matched = suites.filter((s) => {
      if (s.status !== "Available") return false;
      const sf = parseInt(s.square_feet) || 0;
      if (minSF && sf < minSF) return false;
      if (maxSF && sf > maxSF) return false;
      if (budget) {
        const rate = parseFloat(s.lease_rate) || 0;
        if (rate > 0 && rate > budget) return false;
      }
      return true;
    });

    const resultsEl = document.getElementById("find-space-results");
    const headingEl = document.getElementById("find-space-results-heading");
    const listEl = document.getElementById("find-space-results-list");
    resultsEl.style.display = "";

    if (matched.length === 0) {
      headingEl.textContent = "";
      listEl.innerHTML = `
        <div class="find-space-no-match">
          <p>No suites match your criteria right now, but our brokers can help you find the right space.</p>
          <a href="index.html#contacts-section">Talk to a Broker</a>
        </div>`;
      resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    headingEl.textContent = `${matched.length} suite${matched.length !== 1 ? "s" : ""} match your needs`;
    listEl.innerHTML = matched.map((s) => {
      const b = buildingMap[s.building_id];
      return `<div class="find-space-card">
        <div class="find-space-card-building"><a href="building.html?id=${b.building_id}">${escapeHtml(b.building_name)}</a></div>
        <div class="find-space-card-suite">${escapeHtml(s.suite_number)}</div>
        <div class="find-space-card-meta">
          ${s.square_feet ? `<span>${Number(s.square_feet).toLocaleString()} SF</span>` : ""}
          ${s.lease_rate ? `<span>$${escapeHtml(s.lease_rate)}${escapeHtml(s.rate_unit || "")}</span>` : ""}
          ${s.lease_type ? `<span>${escapeHtml(s.lease_type)}</span>` : ""}
          ${s.floor ? `<span>Floor ${escapeHtml(s.floor)}</span>` : ""}
        </div>
        ${s.notes ? `<div class="find-space-card-notes">${escapeHtml(s.notes)}</div>` : ""}
        <div class="find-space-card-actions">
          <a class="view-btn" href="building.html?id=${b.building_id}">View Building</a>
          <label class="compare-label-btn"><input type="checkbox" class="compare-cb" data-suite="${s.suite_id}"> Compare</label>
        </div>
      </div>`;
    }).join("");
    syncCompareCheckboxes();
    resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });

    if (typeof gtag === "function") gtag("event", "find_space", { people, sqft: minSF, budget, results: matched.length });
  });
}

/* ── Loading helpers ── */
function showSkeletons(page) {
  if (page === "home") {
    const legendLease = document.getElementById("map-legend-lease");
    const legendSale = document.getElementById("map-legend-sale");
    if (legendLease) {
      legendLease.innerHTML = `
        <div class="skeleton-card skeleton-pulse"></div>
        <div class="skeleton-card skeleton-pulse"></div>
        <div class="skeleton-card skeleton-pulse"></div>`;
      legendLease.dataset.skeleton = "1";
    }
    if (legendSale) {
      legendSale.innerHTML = `
        <div class="skeleton-card skeleton-pulse"></div>`;
      legendSale.dataset.skeleton = "1";
    }
    const suites = document.getElementById("suite-search-results");
    if (suites) {
      suites.innerHTML = `
        <div class="skeleton-card skeleton-pulse"></div>
        <div class="skeleton-card skeleton-pulse"></div>`;
      suites.dataset.skeleton = "1";
    }
  } else if (page === "building") {
    const header = document.getElementById("building-header");
    if (header) {
      header.innerHTML = `
        <div class="skeleton-hero skeleton-pulse" style="margin-bottom:1rem"></div>
        <div class="skeleton-line wide skeleton-pulse"></div>
        <div class="skeleton-line skeleton-pulse"></div>
        <div class="skeleton-line short skeleton-pulse"></div>`;
      header.dataset.skeleton = "1";
    }
    const suitesList = document.getElementById("suites-list");
    if (suitesList) {
      suitesList.innerHTML = `
        <div class="skeleton-card skeleton-pulse"></div>
        <div class="skeleton-card skeleton-pulse"></div>
        <div class="skeleton-card skeleton-pulse"></div>`;
      suitesList.dataset.skeleton = "1";
    }
  }
}

function hideSkeletons() {
  document.querySelectorAll("[data-skeleton]").forEach((el) => {
    el.innerHTML = "";
    el.removeAttribute("data-skeleton");
  });
}

function hideSplash() {
  const splash = document.getElementById("loading-splash");
  if (splash) splash.classList.add("hidden");
}

/* ── Page init ── */
document.addEventListener("DOMContentLoaded", async () => {
  setupMobileMenu();

  const page = document.body.dataset.page;
  document.querySelectorAll(".header-nav a, .sidebar-quick-links a").forEach((a) => {
    if (page === "find-space" && a.href.includes("find-space")) a.classList.add("nav-active");
    else if (page === "home" && a.href.includes("#suite-search")) a.classList.add("nav-active");
  });

  showSkeletons(page);

  try {
    const { buildings, suites, contacts } = await loadAllData();
    hideSkeletons();
    hideSplash();
    const page = document.body.dataset.page;
    const buildingId = getQueryParam("id");

    buildSidebar(buildings, buildingId);

    initBackToTop();
    renderFooterContacts(contacts);

    const buildingMap = {};
    buildings.forEach((b) => { buildingMap[b.building_id] = b; });

    if (page === "home") {
      initMap(buildings, suites);
      renderFavorites();
      initSuiteSearch(buildings, suites);
      initCompare(buildingMap, suites);
      renderContacts(contacts, "contacts-grid");
    } else if (page === "find-space") {
      initFindSpace(buildings, suites);
      initCompare(buildingMap, suites);
    } else if (page === "building") {
      const building = buildings.find((b) => b.building_id === buildingId);
      if (!building) {
        document.getElementById("building-header").innerHTML =
          '<p>Building not found. <a href="index.html">Return to all buildings</a>.</p>';
        return;
      }
      renderBuildingPage(building, suites, contacts);
      trackBuildingView(building.building_name);
      addShareButton();
      initInquiryForm(building.building_name);

      initCompare(buildingMap, suites);

      const buildingSuites = suites.filter((s) => s.building_id === building.building_id);
      document.querySelectorAll(".fav-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const sid = btn.dataset.suite;
          const s = buildingSuites.find((x) => x.suite_id === sid);
          if (s) toggleFavorite(s, building);
        });
      });

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
    hideSkeletons();
    hideSplash();
  }
});
