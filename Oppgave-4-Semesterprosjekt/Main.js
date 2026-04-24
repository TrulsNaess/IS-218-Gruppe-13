// =======================
// Sivil Beredskap – Evakueringsruter Agder
// IS-218 Gruppe 13
// =======================

const cfg = window.SUPABASE_CONFIG || {};
const SUPABASE_URL = cfg.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = cfg.SUPABASE_ANON_KEY || "";
const ORS_API_KEY = cfg.ORS_API_KEY || "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn("Supabase ikke konfigurert.");
} else {
  window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// =======================
// Kart
// =======================
const map = L.map("map").setView([58.2, 8.0], 10);
map.doubleClickZoom.disable();

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap contributors",
  maxZoom: 19,
}).addTo(map);

// =======================
// Globale variabler
// =======================
let kriseMarker = null;
let kriseCircle = null;
let destinasjonMarker = null;
let ruteLayer = null;
let luftlinjeLag = null;

let polygonDrawer = null;
let drawnPolygon = null;
let polygonMode = false;

// =======================
// Slider UI
// =======================
const slider = document.getElementById("radius-slider");
const radiusValue = document.getElementById("radius-value");

slider.addEventListener("input", () => {
  const newRadius = sliderToRadius(Number(slider.value));
  radiusValue.textContent = newRadius + " m";

  // Oppdater eksisterende sirkel live
  if (kriseCircle && !polygonMode) {
    kriseCircle.setRadius(newRadius);
  }
});

// =======================
// Hjelpefunksjoner
// =======================
function formatDistance(m) {
  if (m == null || isNaN(m)) return "Ukjent";
  if (m >= 1000) return (m / 1000).toFixed(1) + " km";
  return Math.round(m) + " m";
}

function formatDuration(seconds) {
  if (seconds == null || isNaN(seconds)) return "Ukjent";
  const min = Math.round(seconds / 60);
  if (min < 60) return min + " min";
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return `${h} t ${rest} min`;
}

function sliderToRadius(sliderValue) {
  const minR = 100;     // minste radius
  const maxR = 20000;   // største radius

  const fraction = sliderValue / 100;
  const radius = minR * Math.pow(maxR / minR, fraction);

  return Math.round(radius);
}

function showInfoPanel(html) {
  document.getElementById("info-content").innerHTML = html;
  document.getElementById("info-panel").classList.remove("hidden");
}

function hideInfoPanel() {
  document.getElementById("info-panel").classList.add("hidden");
}

// =======================
// Centroid av polygon
// =======================
function calculateCentroid(latlngs) {
  let x = 0, y = 0, z = 0;

  latlngs.forEach(latlng => {
    const lat = latlng.lat * Math.PI / 180;
    const lng = latlng.lng * Math.PI / 180;

    x += Math.cos(lat) * Math.cos(lng);
    y += Math.cos(lat) * Math.sin(lng);
    z += Math.sin(lat);
  });

  const total = latlngs.length;
  x /= total; y /= total; z /= total;

  const lng = Math.atan2(y, x);
  const hyp = Math.sqrt(x * x + y * y);
  const lat = Math.atan2(z, hyp);

  return {
    lat: lat * 180 / Math.PI,
    lng: lng * 180 / Math.PI
  };
}

// =======================
// Tilfluktsrom-lag
// =======================
const tilfluktsromLayer = L.geoJSON(null, {
  pointToLayer: (feature, latlng) => {
    return L.marker(latlng, {
      icon: L.divIcon({
        className: "",
        html: `<div style="
          background:#1a73e8;
          border:2px solid white;
          border-radius:3px;
          width:14px;
          height:14px;
          box-shadow:0 2px 6px rgba(0,0,0,0.5);
        "></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      })
    });
  },
  onEachFeature: (feature, layer) => {
    const p = feature.properties || {};
    layer.bindPopup(`
      <strong>🛡️ Tilfluktsrom</strong><br>
      <b>Adresse:</b> ${p.adresse || "Ukjent adresse"}<br>
      ${p.romnr ? `<b>Rom nr:</b> ${p.romnr}` : ""}
    `);
  }
}).addTo(map);

async function lastAlleTilfluktsrom() {
  if (!window.supabaseClient) return;
  try {
    const { data, error } = await window.supabaseClient.rpc("get_shelters_within", {
      lat_in: 58.3, lon_in: 7.8, radius_m_in: 200000
    });
    if (error) { console.error("Tilfluktsrom feil:", error); return; }
    const fc = Array.isArray(data)
      ? (Object.values(data[0] || {}).find(v => typeof v === "object") || data[0])
      : data;
    if (fc && fc.type === "FeatureCollection") {
      tilfluktsromLayer.addData(fc);
    }
  } catch (e) {
    console.error("Klarte ikke laste tilfluktsrom:", e);
  }
}

lastAlleTilfluktsrom();

// =======================
// Finn nærmeste tilfluktsrom
// =======================
async function finnNærmesteTilfluktsrom(lat, lng) {
  const { data, error } = await window.supabaseClient.rpc("get_shelters_within", {
    lat_in: lat, lon_in: lng, radius_m_in: 50000
  });
  if (error) throw new Error("Supabase feil: " + error.message);

  const fc = Array.isArray(data)
    ? (Object.values(data[0] || {}).find(v => typeof v === "object") || data[0])
    : data;

  if (!fc || !fc.features?.length) return null;

  const sorted = fc.features
    .filter(f => f.properties?.distance_m != null)
    .sort((a, b) => a.properties.distance_m - b.properties.distance_m);

  if (!sorted.length) return null;

  const nærmeste = sorted[0];
  const rawCoords = nærmeste.geometry.coordinates;
  const coords = Array.isArray(rawCoords[0]) ? rawCoords[0] : rawCoords;
  const p = nærmeste.properties;

  return {
    lat: Number(coords[1]),
    lng: Number(coords[0]),
    adresse: p.adresse || "Ukjent adresse",
    plasser: p.plasser || null,
    romnr: p.romnr || null,
    distance_m: p.distance_m,
  };
}

// =======================
// ORS vegbasert rute
// =======================
async function hentOrsRute(fraLat, fraLng, tilLat, tilLng) {
  const fLat = parseFloat(Number(fraLat).toFixed(6));
  const fLng = parseFloat(Number(fraLng).toFixed(6));
  const tLat = parseFloat(Number(tilLat).toFixed(6));
  const tLng = parseFloat(Number(tilLng).toFixed(6));

  const res = await fetch("https://api.openrouteservice.org/v2/directions/driving-car/geojson", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": ORS_API_KEY,
    },
    body: JSON.stringify({
      coordinates: [[fLng, fLat], [tLng, tLat]]
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error("ORS feil: " + err);
  }

  const json = await res.json();
  const feature = json.features?.[0];
  if (!feature) throw new Error("Ingen rute fra ORS.");

  return {
    geojson: feature.geometry,
    distance: feature.properties.summary.distance,
    duration: feature.properties.summary.duration,
  };
}

// =======================
// Hovedfunksjon: håndter kriseområde
// =======================
async function handleCrisisPoint(lat, lng, options = {}) {
  const usePolygon = options.usePolygon || false;
  const radius = sliderToRadius(Number(slider.value));

  // Fjern gamle lag
  if (kriseMarker) map.removeLayer(kriseMarker);
  if (kriseCircle) map.removeLayer(kriseCircle);
  if (destinasjonMarker) map.removeLayer(destinasjonMarker);
  if (ruteLayer) map.removeLayer(ruteLayer);
  if (luftlinjeLag) map.removeLayer(luftlinjeLag);

  // Tegn sirkel KUN hvis polygon IKKE brukes
  if (!usePolygon) {
    kriseCircle = L.circle([lat, lng], {
      radius: radius,
      color: "#e74c3c",
      fillColor: "#e74c3c",
      fillOpacity: 0.15,
      weight: 2,
    }).addTo(map);
  }

  // Marker sentrum
  kriseMarker = L.circleMarker([lat, lng], {
    radius: 6,
    color: "#e74c3c",
    fillColor: "#e74c3c",
    fillOpacity: 1,
    weight: 2,
  }).addTo(map);

  showInfoPanel(`<b>🔍 Søker etter nærmeste tilfluktsrom...</b>`);

  try {
    const shelter = await finnNærmesteTilfluktsrom(lat, lng);

    if (!shelter) {
      showInfoPanel(`<b>🚨 Kriseområde markert</b><br><br>⚠️ Ingen tilfluktsrom funnet innenfor 50 km.`);
      return;
    }

    showInfoPanel(`<b>🗺️ Beregner rute...</b>`);

    // Luftlinje
    luftlinjeLag = L.polyline([[lat, lng], [shelter.lat, shelter.lng]], {
      color: "#e74c3c",
      weight: 2,
      opacity: 0.5,
      dashArray: "6, 8",
    }).addTo(map);

    // ORS rute
    let ruteInfo = null;
    try {
      const rute = await hentOrsRute(lat, lng, shelter.lat, shelter.lng);
      ruteLayer = L.geoJSON(rute.geojson, {
        style: { color: "#e74c3c", weight: 5, opacity: 0.85 }
      }).addTo(map);
      ruteInfo = { distance: rute.distance, duration: rute.duration, type: "vegbasert" };
    } catch {
      ruteInfo = { type: "luftlinje" };
    }

    // Marker tilfluktsrom
    destinasjonMarker = L.marker([shelter.lat, shelter.lng], {
      icon: L.divIcon({
        className: "",
        html: `<div style="
          background:#1a73e8;border:3px solid white;border-radius:3px;
          width:18px;height:18px;box-shadow:0 2px 8px rgba(0,0,0,0.6);
        "></div>`,
        iconSize: [18, 18], iconAnchor: [9, 9],
      })
    }).addTo(map)
      .bindPopup(`
        <strong>🛡️ Nærmeste tilfluktsrom</strong><br>
        <b>Adresse:</b> ${shelter.adresse}<br>
        ${shelter.romnr ? `<b>Rom nr:</b> ${shelter.romnr}<br>` : ""}
        ${shelter.plasser ? `<b>Plasser:</b> ${shelter.plasser}` : ""}
      `)
      .openPopup();

    const ruteHtml = ruteInfo.type === "vegbasert"
      ? `<b>Kjørerute:</b><br>
         📏 ${formatDistance(ruteInfo.distance)}<br>
         ⏱️ ${formatDuration(ruteInfo.duration)}`
      : `⚠️ Vegbasert rute ikke tilgjengelig<br><small style="color:#aaa">Viser luftlinje</small>`;

    showInfoPanel(`
      <b>🚨 Kriseområde markert</b><br>
      <small style="color:#aaa">${lat.toFixed(4)}, ${lng.toFixed(4)}</small><br><br>
      <div class="shelter-item">
        <b>Nærmeste tilfluktsrom:</b><br>
        🏠 ${shelter.adresse}<br>
        ${shelter.plasser ? `👥 ${shelter.plasser} plasser<br>` : ""}
        📍 ${formatDistance(shelter.distance_m)} luftlinje
      </div>
      <div class="route-item">
        ${ruteHtml}
      </div>
    `);

    const bounds = ruteLayer
      ? ruteLayer.getBounds()
      : luftlinjeLag.getBounds();

    if (bounds.isValid()) map.fitBounds(bounds, { padding: [80, 80], maxZoom: 14 });

  } catch (err) {
    console.error(err);
    showInfoPanel("❌ Feil: " + err.message);
  }
}

// =======================
// Klikk på kartet (sirkelmodus)
// =======================
map.on("click", (e) => {
  if (polygonMode) return; // ikke tegn sirkel mens polygon tegnes
  handleCrisisPoint(e.latlng.lat, e.latlng.lng);
});

// =======================
// Polygon-tegning
// =======================
document.getElementById("draw-polygon-btn").addEventListener("click", () => {
  polygonMode = true;
  polygonDrawer = new L.Draw.Polygon(map);
  polygonDrawer.enable();
});

map.on(L.Draw.Event.CREATED, function (e) {
  polygonMode = false;

  if (drawnPolygon) map.removeLayer(drawnPolygon);

  drawnPolygon = e.layer;
  map.addLayer(drawnPolygon);

  const latlngs = drawnPolygon.getLatLngs()[0];
  const centroid = calculateCentroid(latlngs);

  handleCrisisPoint(centroid.lat, centroid.lng, { usePolygon: true });
});

// =======================
// Nullstill
// =======================
document.getElementById("reset-btn").addEventListener("click", () => {
  if (kriseMarker) { map.removeLayer(kriseMarker); kriseMarker = null; }
  if (kriseCircle) { map.removeLayer(kriseCircle); kriseCircle = null; }
  if (destinasjonMarker) { map.removeLayer(destinasjonMarker); destinasjonMarker = null; }
  if (ruteLayer) { map.removeLayer(ruteLayer); ruteLayer = null; }
  if (luftlinjeLag) { map.removeLayer(luftlinjeLag); luftlinjeLag = null; }
  if (drawnPolygon) { map.removeLayer(drawnPolygon); drawnPolygon = null; }

  hideInfoPanel();
  map.setView([58.2, 8.0], 10);
});
