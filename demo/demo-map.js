import {
  map as Map,
  tileLayer as TileLayer,
  circleMarker as CircleMarker
} from 'https://unpkg.com/leaflet@1.7.1/dist/leaflet-src.esm.js';
document.head.innerHTML += `<link type="text/css" rel="stylesheet" href="https://unpkg.com/leaflet@1.7.1/dist/leaflet.css">`;

const store = {
  markers: [],
};

export const init = async (id='map') => {
  if (store.map) return;
  store.map = Map(id, {
    minZoom: 1,
    scrollWheelZoom: false,
  });

  TileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  })
  .addTo(store.map);

  // resolves safari bug :(
  store.map.addEventListener('load', () => setTimeout(() => store.map.invalidateSize(), 0));
  store.map.setView([0, 0], 1);
}

export const fitBounds = bounds => setTimeout(() =>
  bounds ? store.map.fitBounds(bounds) : store.map.setView([0, 0], 1), 100);

export const update = (places=[]) => {
  const markers = store.markers;
  for (const item of [...markers]) {
    if (places.findIndex(p => p.id === item.id) === item.index) {
      markers.push(item);
    } else {
      item.marker.remove();
    }
    markers.shift();
  }

  for (const [i, place] of Object.entries(places)) {
    const existingMarker = markers.find(m => m.id === place.id); 
    const marker = existingMarker && existingMarker.marker ||
     CircleMarker([place.lat, place.lng], {
      radius: 5,
      color: markers.length ? `rgb(255, ${250 - +i * 50}, 35)` : '#3388ff',
    })
    .bindPopup(`<small><strong>#${+i + 1} Hit</strong></small><br>${place.city}, ${place.country}`, { closeButton: false })
    .addTo(store.map);

    if (!+i) marker.openPopup();
    if (!existingMarker) {
      markers.push({
        id: place.id,
        index: +i,
        marker,
      });
    }
  }
}

export default { init, update, fitBounds };