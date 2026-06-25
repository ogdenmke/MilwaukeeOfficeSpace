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
function initMap(buildings) {
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
    { tx: 0, ty: -50 },
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
    const w = 140;
    const h = 90;
    const cx = w / 2;
    const cy = h - 6;
    const lx = cx + off.tx;
    const ly = cy + off.ty;

    const tagIcon = L.divIcon({
      className: "map-tag-icon",
      html: `<svg class="map-tag-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
        <line x1="${cx}" y1="${cy}" x2="${lx}" y2="${ly + 13}" stroke="#131210" stroke-width="1.5"/>
        <circle cx="${cx}" cy="${cy}" r="3.5" fill="#CF152D"/>
        <rect x="${lx - 13}" y="${ly}" width="26" height="26" rx="4" fill="#131210"/>
        <text x="${lx}" y="${ly + 18}" text-anchor="middle" fill="white" font-size="12" font-weight="700" font-family="-apple-system,BlinkMacSystemFont,sans-serif">${pinNumber}</text>
      </svg>`,
      iconSize: [w, h],
      iconAnchor: [cx, cy],
      popupAnchor: [off.tx, off.ty - 5],
    });

    const marker = L.marker([pin.lat, pin.lng], { icon: tagIcon }).addTo(map);
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
    markers.push(marker);
  });

  if (markers.length > 0) {
    const group = L.featureGroup(markers);
    map.fitBounds(group.getBounds().pad(0.15));
  }

  const legendEl = document.getElementById("map-legend-grid");
  if (legendEl) {
    let num = 0;
    Object.values(groups).forEach((buildings) => {
      const first = buildings[0];
      if (isNaN(parseFloat(first.latitude))) return;
      num++;
      if (buildings.length === 1) {
        legendEl.innerHTML += `<a class="map-legend-item" href="building.html?id=${first.building_id}"><span class="map-legend-num">${num}</span><span class="map-legend-name">${escapeHtml(first.building_name)}</span><span class="map-legend-address">${escapeHtml(first.address)}, ${escapeHtml(first.city)}</span></a>`;
      } else {
        buildings.forEach((b, j) => {
          legendEl.innerHTML += `<a class="map-legend-item" href="building.html?id=${b.building_id}"><span class="map-legend-num" ${j > 0 ? 'style="visibility:hidden"' : ''}>${num}</span><span class="map-legend-name">${escapeHtml(b.building_name)}</span><span class="map-legend-address">${escapeHtml(b.address)}, ${escapeHtml(b.city)}</span></a>`;
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
          ${s.floor_plan_filename ? `<div class="suite-floor-plan"><a href="#" data-doc-src="${fileSrc(s.floor_plan_filename)}" onclick="openDocModal(this.dataset.docSrc);return false;">View Floor Plan</a></div>` : ""}
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

/* ── Document modal ── */
function openDocModal(src) {
  const overlay = document.getElementById("doc-modal-overlay");
  const iframe = document.getElementById("doc-modal-iframe");
  if (!overlay || !iframe) return;
  iframe.src = src;
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

    if (page === "home") {
      initMap(buildings);
      renderContacts(contacts, "contacts-grid");
    } else if (page === "building") {
      const building = buildings.find((b) => b.building_id === buildingId);
      if (!building) {
        document.getElementById("building-header").innerHTML =
          '<p>Building not found. <a href="index.html">Return to all buildings</a>.</p>';
        return;
      }
      renderBuildingPage(building, suites, contacts);
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
