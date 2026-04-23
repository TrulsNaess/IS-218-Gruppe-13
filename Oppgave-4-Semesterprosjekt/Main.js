// =======================
// Sivil Beredskap – Evakueringsruter Agder
// IS-218 Gruppe 13
// =======================
 
const cfg = window.SUPABASE_CONFIG || {};
const SUPABASE_URL = cfg.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = cfg.SUPABASE_ANON_KEY || "";
 
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn("Supabase ikke konfigurert. Sjekk supabase-config.js");
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
// Hjelpefunksjoner
// =======================
function formatDistance(m) {
  if (m == null || isNaN(m)) return "Ukjent";
  if (m >= 1000) return (m / 1000).toFixed(1) + " km";
  return Math.round(m) + " m";
}
 
function showInfoPanel(html) {
  document.getElementById("info-content").innerHTML = html;
  document.getElementById("info-panel").classList.remove("hidden");
}
 
function hideInfoPanel() {
  document.getElementById("info-panel").classList.add("hidden");
}
 
// =======================
// Lag: Tilfluktsrom
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
    const adresse = p.adresse || "Ukjent adresse";
    const romnr = p.romnr || "";
    layer.bindPopup(`
      <strong>🛡️ Tilfluktsrom</strong><br>
      <b>Adresse:</b> ${adresse}<br>
      ${romnr ? `<b>Rom nr:</b> ${romnr}` : ""}
    `);
  }
}).addTo(map);
 
async function lastAlleTilfluktsrom() {
  if (!window.supabaseClient) return;
  try {
    const { data, error } = await window.supabaseClient.rpc("get_shelters_within", {
      lat_in: 58.3,
      lon_in: 7.8,
      radius_m_in: 200000
    });
    if (error) { console.error("Tilfluktsrom feil:", error); return; }
    let fc = Array.isArray(data)
      ? (Object.values(data[0] || {}).find(v => typeof v === "object") || data[0])
      : data;
    if (fc && fc.type === "FeatureCollection") {
      tilfluktsromLayer.addData(fc);
      console.log("Tilfluktsrom lastet:", fc.features?.length);
    }
  } catch (e) {
    console.error("Klarte ikke laste tilfluktsrom:", e);
  }
}
 
lastAlleTilfluktsrom();
 
// =======================
// Finn nærmeste tilfluktsrom fra Supabase
// =======================
async function finnNærmesteTilfluktsrom(lat, lng) {
  const { data, error } = await window.supabaseClient.rpc("get_shelters_within", {
    lat_in: lat,
    lon_in: lng,
    radius_m_in: 50000
  });
  if (error) throw new Error("Supabase feil: " + error.message);
 
  let fc = Array.isArray(data)
    ? (Object.values(data[0] || {}).find(v => typeof v === "object") || data[0])
    : data;
 
  if (!fc || !fc.features?.length) return null;
 
  const sorted = fc.features
    .filter(f => f.properties?.distance_m != null)
    .sort((a, b) => a.properties.distance_m - b.properties.distance_m);
 
  if (!sorted.length) return null;
 
  const nærmeste = sorted[0];
  const rawCoords = nærmeste.geometry.coordinates;
  const p = nærmeste.properties;
 
  // MultiPoint har et ekstra nivå: coordinates[0] = [lng, lat]
  const coords = Array.isArray(rawCoords[0]) ? rawCoords[0] : rawCoords;
 
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
// Sjekk om punkt er nær vegnett (innenfor ~300m)
// =======================
async function erNærVeg(lat, lng) {
  // 0.003 grader ≈ 300m
  const { data, error } = await window.supabaseClient
    .from("vegnett_krs")
    .select("fid")
    .filter("geom", "not.is", null)
    .limit(1)
    .rpc ? null : null; // ikke bruk rpc her
 
  // Enklere: prøv alltid routing, returner true
  // Fallback håndteres av get_route som returnerer null
  return true;
}
 
// =======================
// Hent rute fra Supabase pgRouting
// =======================
async function hentRute(fraLat, fraLng, tilLat, tilLng) {
  const { data, error } = await window.supabaseClient.rpc("get_route", {
    fra_lat: Number(fraLat),
    fra_lng: Number(fraLng),
    til_lat: Number(tilLat),
    til_lng: Number(tilLng),
  });
 
  if (error) {
    console.warn("Rute-feil:", error.message);
    return null;
  }
  if (!data) {
    console.warn("Ingen vegnett-rute funnet, bruker luftlinje.");
    return null;
  }
 
  console.log("Vegnett-rute hentet!");
  return data;
}
 
// =======================
// Klikk på kart
// =======================
let kriseMarker = null;
let kriseCircle = null;
let destinasjonMarker = null;
let ruteLayer = null;
 
map.on("click", async (e) => {
  const { lat, lng } = e.latlng;
 
  if (kriseMarker)       map.removeLayer(kriseMarker);
  if (kriseCircle)       map.removeLayer(kriseCircle);
  if (destinasjonMarker) map.removeLayer(destinasjonMarker);
  if (ruteLayer)         map.removeLayer(ruteLayer);
 
  kriseCircle = L.circle(e.latlng, {
    radius: 1500,
    color: "#e74c3c",
    fillColor: "#e74c3c",
    fillOpacity: 0.15,
    weight: 2,
  }).addTo(map);
 
  kriseMarker = L.circleMarker(e.latlng, {
    radius: 6,
    color: "#e74c3c",
    fillColor: "#e74c3c",
    fillOpacity: 1,
    weight: 2,
  }).addTo(map);
 
  showInfoPanel(`<b>🔍 Søker etter nærmeste tilfluktsrom...</b>`);
 
  if (!window.supabaseClient) {
    showInfoPanel("⚠️ Supabase ikke konfigurert.");
    return;
  }
 
  try {
    // 1) Finn nærmeste tilfluktsrom
    const shelter = await finnNærmesteTilfluktsrom(lat, lng);
 
    if (!shelter) {
      showInfoPanel(`
        <b>🚨 Kriseområde markert</b><br><br>
        ⚠️ Ingen tilfluktsrom funnet innenfor 50 km.
      `);
      return;
    }
 
    showInfoPanel(`<b>🗺️ Beregner rute via vegnett...</b>`);
 
    // 2) Hent rute fra pgRouting
    let ruteGeojson = null;
    try {
      ruteGeojson = await hentRute(lat, lng, shelter.lat, shelter.lng);
    } catch (ruteErr) {
      console.warn("Ruting feilet:", ruteErr.message);
    }
 
    // 3) Tegn ruten hvis vi fikk en
    if (ruteGeojson) {
      ruteLayer = L.geoJSON(ruteGeojson, {
        style: {
          color: "#e74c3c",
          weight: 5,
          opacity: 0.85,
        }
      }).addTo(map);
    } else {
      // Fallback: tegn rett linje
      ruteLayer = L.polyline([[lat, lng], [shelter.lat, shelter.lng]], {
        color: "#e74c3c",
        weight: 4,
        opacity: 0.7,
        dashArray: "8, 8",
      }).addTo(map);
    }
 
    // 4) Marker tilfluktsrommet
    destinasjonMarker = L.marker([shelter.lat, shelter.lng], {
      icon: L.divIcon({
        className: "",
        html: `<div style="
          background:#1a73e8;
          border:3px solid white;
          border-radius:3px;
          width:18px;
          height:18px;
          box-shadow:0 2px 8px rgba(0,0,0,0.6);
        "></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      })
    }).addTo(map)
      .bindPopup(`
        <strong>🛡️ Nærmeste tilfluktsrom</strong><br>
        <b>Adresse:</b> ${shelter.adresse}<br>
        ${shelter.romnr ? `<b>Rom nr:</b> ${shelter.romnr}<br>` : ""}
        ${shelter.plasser ? `<b>Plasser:</b> ${shelter.plasser}` : ""}
      `)
      .openPopup();
 
    // 5) Infopanel
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
        <b>Rute:</b><br>
        ${ruteGeojson ? "🛣️ Via vegnett (Geonorge)" : "📏 Rett linje (fallback)"}
      </div>
    `);
 
    // 6) Zoom til ruten
    if (ruteLayer) {
      const bounds = ruteLayer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [80, 80], maxZoom: 14 });
    }
 
  } catch (err) {
    console.error(err);
    showInfoPanel("❌ Feil: " + err.message);
  }
});
 
// =======================
// Nullstill-knapp
// =======================
document.getElementById("reset-btn").addEventListener("click", () => {
  if (kriseMarker)       { map.removeLayer(kriseMarker);       kriseMarker = null; }
  if (kriseCircle)       { map.removeLayer(kriseCircle);       kriseCircle = null; }
  if (destinasjonMarker) { map.removeLayer(destinasjonMarker); destinasjonMarker = null; }
  if (ruteLayer)         { map.removeLayer(ruteLayer);         ruteLayer = null; }
  hideInfoPanel();
  map.setView([58.2, 8.0], 10);
});