const coreUrl = 'https://cdn.jsdelivr.net/npm/re.places.js@0.1.0/src/re.places.core.js';
self.importScripts(coreUrl);

const errorResponse = message =>
  JSON.stringify({
    message,
    status: 403,
  });

self.addEventListener('activate', (event) => {
  self.clients.claim()
});

self.addEventListener('fetch', async (e) => {
  const is_algolia_places_request = e.request.url.includes('algolia')
    && (e.request.url.includes('places/query') || e.request.url.includes('indexes/places'));
  
  if (!is_algolia_places_request) {
    return e.respondWith(fetch(e.request));
  }

  const response = e.request.json().then(({ params }) => {
    const queryParams = Object.fromEntries(new URLSearchParams(params));

    const paramsKeys = [
      'countries',
      'aroundLatLngViaIP',
      'aroundLatLng',
      'aroundRadius',
      'insideBoundingBox',
      'insidePolygon',
      'hitsPerPage',
    ];

    for (const key of paramsKeys) {
      // only let truthy values through
      if (queryParams[key]) {
        let val = queryParams[key];

        if (key === 'countries') {
          val = JSON.parse(val);
        } else if (key === 'aroundLatLngViaIP') {
          val = val === 'true';
        } else if (!isNaN(val)) {
          val = +val;
        }

        queryParams[key] = val;
      }
    }

    // run the search
    // second parameter advises not to return null responses
    return replaces.search(queryParams, true);
  })
  .then((response) => {
    // remove non-algolia fields
    delete response.fetchTimeMS;
    delete response.paramsData;

    // add missing fields
    response.degradedQuery = false;

    for (const hit of response.hits) {
      Object.assign(hit, {
        objectID: hit.id,
        _tags: [
          'city',
          `country/${hit.iso2}`,
          'place/city',
          'source/simplemaps.com',
        ],
        country_code: hit.iso2,
        is_city: true,
        administrative: [hit.admin],
        locale_names: [hit.city],
        _geoloc: {
          lat: hit.lat,
          lng: hit.lng,
        },
        _highlightResult: {
          country: hit._highlightResult.country,
          administrative: hit._highlightResult.admin,
          locale_names: hit._highlightResult.city,
        },
      });

      // remove non-algolia fields
      delete hit.admin;
      delete hit.city;
      delete hit.lat;
      delete hit.lng;
      delete hit.score;
      delete hit.match;
      delete hit.iso2;
      delete hit.boost;
      delete hit.terms;
      delete hit.id;
    }
    
    return new Response(JSON.stringify(response));
  })
  .catch(error => new Response(errorResponse(error.message)));
  
  e.respondWith(response);
});
