(() => {
// Dependancies:
// (1) Scripts will only import if they don't exist in the current scope
// (2) If this script is run from a service worker imports will be cached
//     as part of the service worker installation
const importScripts = {
  MiniSearch: 'https://cdn.jsdelivr.net/npm/minisearch@3.2.0/dist/umd/index.min.js',
  pointInPolygon: 'https://cdn.jsdelivr.net/npm/point-in-polygon-hao@1.1.0/dist/pointInPolygon.min.js',
};

// a simple state storage system
const store = {
  // dataPath: '/db',
  dataPath: 'https://cdn.jsdelivr.net/npm/re.places.js@0.1.2/db',
  fetch: {},
  defaultParams: {
    aroundLatLngViaIP: true,
  },
};

// we'll ensure this has run before allowing any searches
const dbInit = (async () => {
  // iterate over any scripts that require loading
  for (const [ns, url] of Object.entries(importScripts)) {
    // check they don't already exist on the global scope
    if (!self[ns]) {
      if (self.WorkerGlobalScope) {
        self.importScripts(url);
      } else {
        await import(url);
      }
    }
  }

  // our snappy DB infrastructure - thanks MiniSearch!
  store.DB = new MiniSearch({
    fields: ['city_norm', 'city', 'admin_norm', 'country'], // fields to index for full-text search
    storeFields: ['city', 'country', 'admin', 'iso2', 'lat', 'lng'], // fields to return with search results
    searchOptions: {
      boost: { country: 0.1, admin_norm: 0.1 },
      fuzzy: 0.3,
      prefix: true,
    },
  });

  // we use the tokenizr to highlight our results, let's store it
  store.tokenizer = MiniSearch.getDefault('tokenize');
})();

// a function that uses our stored tokenizer from the MiniSearch library
const tokenize = str =>
  store.tokenizer(str);

// highlight result fields with the search query and availabe terms
// this is a complex beast with a lot of gotchas ... see what you make of it
const highlightResult = (query, result) => {
  const highlight = {
    country: {
      value: result.country,
      matchLevel: 'none',
      matchedWords: [],
    },
    admin: [{
      value: result.admin,
      matchLevel: 'none',
      matchedWords: [],
    }],
    city: [{
      value: result.city,
      matchLevel: 'none',
      matchedWords: [],
    }]
  };

  // This is the final term in the search query .. we assume live input
  // 'left to right' so this is the only term we want to partially highlight
  const finalTerm = tokenize(query.toLowerCase()).pop();
  // we'll store the term length and normalised first character for later
  const finalTermLength = finalTerm.length;
  const finalTermFirstCharNorm = replaces.normalise(finalTerm[0]);

  // we have an issue in that the search doesn't report which query terms
  // matched with which results, so we'll need to have an educated guess ...
  // we only partially highlight the last term, everything else that matches
  // gets fully highlighted .. this should make things a lot easier

  // 1. get the last query term
  // 2. find result terms starting with same letter as the query term
  // 3. ignore result terms where query term is longer or equal
  // 4. assume a match
  // 5. highlight the result term[1] in the result field[2] to the length of the query term[3]
  //    e.g [1]territory [2]northern territory [3]terr === northern [terr]itory
  // ... everything else is fully highlighted

  // matchLevel: 'full' (starts with same letter) 'partial' (matches) 'none'
  // fullyHighlighted: true == matchLevel='partial' or 'full' and same length

  // we use this to update 
  const matchTerm = (termNorm, highlightItem) => {
    const match = Array.isArray(highlightItem) ? highlightItem[0] : highlightItem;

    // matchLevel=full where the first letter in the query and term match
    const fullMatch = termNorm[0] === finalTermFirstCharNorm;
    const matchLevel = fullMatch ? 'full' : 'partial';
    // whole term is highlighted if first letters don't match
    // or if query term is equal or longer than result term
    const fullyHighlighted = !fullMatch || finalTermLength >= termNorm.length;

    // we'll use normalised terms and text to update original text via indexes
    // first we'll get the indexes to open the highlight
    // the match value needs to be reprocessed every time, as it may have
    // changed since the previous iteration
    const iOpen = replaces.normalise(match.value).toLowerCase().indexOf(termNorm);

    // was the term found
    if (iOpen >= 0) {
      // perfect, time to get the closing index
      // this depends on if the word is fully highlighted or not
      const iClose = iOpen + (fullyHighlighted ? termNorm.length : finalTermLength);
      // we'll store the value for legibility in the big string
      const val = match.value;
      match.value = `${val.slice(0, iOpen)}<em>${val.slice(iOpen, iClose)}</em>${val.slice(iClose)}`;
    } else {
    }

    // only allow to be upgraded from 'none' 
    match.matchLevel = match.matchLevel === 'none'
      ? matchLevel
      // otherwise it can only be downgraded
      : match.matchLevel === 'full' && matchLevel || match.matchLevel;

    // consider fullyHighlighted=true if true for all terms to date
    // there's surely a smarter way to do this but it's not critical
    match.fullyHighlighted = (!match.hasOwnProperty('fullyHighlighted') || match.fullyHighlighted)
      && fullyHighlighted;

    // for partially highlighted words this will be correct
    // ... otherwise it needs to be based on terms :(
    match.matchedWords.push(fullyHighlighted ? termNorm : finalTerm);
  }

  // iterate over each term and listing matching fields
  for (const [term, fields] of Object.entries(result.match)) {
    // normalise the term here for potnetial use multiple times in the term matcher
    const termNorm = replaces.normalise(term);
    // keep record of which fields have been completed for this term
    // note that we only process one of either the normal or norm field
    // it doesn't matter which one
    const fieldsComplete = {};

    // iterate over the fields
    for (const field of fields) {
      // norm or not, doesn't matter
      const fieldKey = field.replace('_norm', '');
      if (!fieldsComplete[fieldKey]) {
        fieldsComplete[fieldKey] = true;
        // match term is where the magic happens .. this will update the highlight in place
        matchTerm(termNorm, highlight[fieldKey]);
      }
    }
  }

  Object.assign(result, { _highlightResult: highlight });
}

// generate a [r]elatively [u]nique [id]entifier
// we'll assume this to be unique to this session
// for absolute we might prefix scope and switch [performance] for [Date]
function ruid(scope='') {
  return scope + performance.now().toString(36) + Math.random().toString(36).substring(2);
}

// haversine distance in meters
// github.com/Turfjs/turf/tree/master/packages/turf-distance
const deg2Rad = deg => (deg % 360) * Math.PI / 180;
function distanceBetween(item1, item2, roundValue=true) {
  const dLat = deg2Rad(item2.lat - item1.lat);
  const dLng = deg2Rad(item2.lng - item1.lng);
  const lat1 = deg2Rad(item1.lat);
  const lat2 = deg2Rad(item2.lat);

  const a = Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  const dr = 6371008.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return roundValue ? Math.floor(dr) : dr;
}

// Fit for purpose CSV column matching, e.g: "column A",column B,"column, C"
// [improved lookbehind version - not currently compatible with safari]
// const reCsvColumnMatch = /(?<="|,")(|[^,"\n][^"\n]*)(?="|"$)|(?<=^|,)(|[^"][^,]*)(?=,|$)/g
// let's use matchAll instead
const reCsvColumnMatchAll = /(?:"|,")(|[^,"\n][^"\n]*)(?="|"$)|(?:^|,)(|[^"][^,]*)(?=,|$)/g

// get a list of columns from a CSV formatted row
const getCols = row => {
  // this line would do if it were campatible with safari :(
  // return row.match(reCsvColumnMatch);
  const matches = row.matchAll(reCsvColumnMatchAll);
  const cols = [];
  for (const match of matches) {
    cols.push(match[1] ?? match[2]);
  }
  return cols;
}

// parse a CSV as a list of objects
const parseCSVList = (csv) => {
  const rows = csv.split('\n');
  const header = getCols(rows.shift());
  const list = [];
  for (const row of rows) {
    const item = {};
    const cols = getCols(row);
    for (const i in header) {
      item[header[i]] = cols[i];
    }
    list.push(item)
  }
  return list;
}

// parse a CSV as an object with the first column as the key
// if there are only two columns, the second one becomes the value
// otherwise subsequent columns are included in an object
const parseCSVMap = (csv) => {
  const map = {};
  const rows = csv.split('\n');
  const header = getCols(rows.shift()).slice(1);
  for (const row of rows) {
    const cols = getCols(row);
    const key = cols.shift();
    if (cols.length > 1) {
      const item = {};
      for (const i in header) {
        item[header[i]] = cols[i];
      }
      map[key] = item;
    } else {
      map[key] = cols[0];
    }
  }
  return map;
}

const fetchAndParse = (url, parser) =>
  fetch(url.startsWith('http') ? url : `${store.dataPath}/${url}`)
  .then(e => e.text())
  .then(txt => parser(txt));

const formatResponse = (params, startTime=0, hits=[]) => {
  const response = {
    query: params.query,
    fetchTimeMS: params.fetchTimeMS,
    processingTimeMS: startTime ? performance.now() - startTime : 0,
    params: `hitsPerPage=${params.hitsPerPage}&language=en&query=${params.query}`,
    paramsData: {},
  };

  const paramsKeys = [
    'countries',
    'aroundLatLngViaIP',
    'aroundLatLng',
    'aroundRadius',
    'insideBoundingBox',
    'insidePolygon',
  ];

  for (const key of paramsKeys) {
    // only let truthy values through
    // or aroundLatLngViaIP=false (we want to know this)
    let val = params[key];
    if (val || key === 'aroundLatLngViaIP') {

      // we want everything in our data map
      response.paramsData[key] = val;

      // no need to report this as truthy ... it's the default
      if (key === 'aroundLatLngViaIP' && val) {
        continue;
      }

      if (key === 'countries') {
        val = JSON.stringify(val);
      } else if (key === 'aroundLatLngViaIP') {
        val = 'false';
      }

      // then encode and add to our params string
      response.params += `&${key}=${encodeURIComponent(val)}`;
    }
  }

  return {
    ...response,
    nbHits: hits.length,
    hits,
  };
};

// updates and boosts a search item in place
const boostScore = (id, item, boost, multiplier, boostReason={}) => {
  if (boost) {
    // initiate the bost object if it doesn't exist
    if (!item.boost || item.boost.id !== id) {
      item.boost = { id };
    }
    // update the boost with the new reason
    // include a 'scoreFrom' value if it doesn't already exist
    item.boost = { scoreFrom: item.score, ...item.boost, ...boostReason };
    item.score *= multiplier;
  } else if (item.boost && item.boost.id !== id) {
    delete item.boost;
  }
  // let them know the outcome
  return { boost: item.boost };
}

const replaces = {
  // https://stackoverflow.com/a/37511463/720204
  normalise(name) {
    return name && name.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  },
  // fetches a user's iso2 country code
  usertrace() {
    if (store.trace) {
      return store.trace;
    }

    // thanks Cloudflare for your infinite utility
    // ... to turn this off (and not make any more requests to random servers)
    // just should include `aroundLatLngViaIP: false` in your search options 
    return store.trace = fetchAndParse('https://1.1.1.1/cdn-cgi/trace', txt => {
      const trace = Object.fromEntries(new URLSearchParams(txt.replace(/\n/g, '&')));
      if (trace.loc) {
        trace.iso2 = (trace.loc || '').toLowerCase();
      }
      return trace;
    })
    .catch(() => ({}));
  },
  async getDB(params) {
    await dbInit;

    // we've already fetched the full database
    if (store.fetch.all) {
      return store.db;
    }

    // we'll add anything we need to fetch to a list
    const fetchList = [];
    
    // are we targeting specific countries?
    if (params.countries) {
      for (const iso2 of [].concat(params.countries)) {
        // ensure we haven't downloaded the country already
        if (!store.fetch[iso2]) {
          store.fetch[iso2] = true;
          fetchList.push(fetchAndParse(`places-${iso2}.txt`, parseCSVList));
        }
      }
    // if not we'll download the full database
    } else {
      store.fetch.all = true;
      fetchList[0] = fetchAndParse(`places.txt`, parseCSVList);
    }

    // there's nothing new to fetch
    if (!fetchList.length) {
      return store.db;
    }

    // let's get the countries map if we don't have it already
    if (!store.fetch.countries) {
      // we'll add it to the start of our fetch list
      fetchList.unshift(fetchAndParse(`countries.txt`, parseCSVMap));

      // if we're targeting a specific country we'll store the promise
      // (just in case we target another country or the whole database)
      // if we're fetching the whole database we don't need to store it
      store.fetch.countries = store.fetch.all || fetchList[0];
    } else {
      // if we do have it we must be fetchung something new
      // let's add the stored version to the start of our list
      fetchList.unshift(store.fetch.countries);
    }

    // lets wait for our data to load then add it to our search
    // the placesList wraps up any number of promised countries
    return store.db = Promise.all(fetchList)
    .then(([countries, ...placesList]) => {
      // if by some bizarre twist of fate we've hit a race condition
      // and we've fetched a country then the full database in quick succession
      // we'll wait for the big guy to come through instead
      if (params.countries && store.fetch.all) {
        // this will resolve to the full database fetch
        return store.db;
      }

      // if we've fetched the full database we can safely remove
      // any previous places that might have been indexed
      if (store.fetch.all) {
        store.DB.removeAll();
      }

      // flatten our list of places before processing
      const places = placesList.flat();
      for (const place of places) {
        // we'll assign UUID (this could be simplified)
        if (!place.id) place.id = ruid();
        // let's create a normalised version of each city and admin name
        place.city_norm = this.normalise(place.city);
        place.admin_norm = this.normalise(place.admin);
        // we'll get the country from our countries map
        place.country = countries[place.iso2];
        // and we can turn our numbers into numbers
        place.lat = +place.lat;
        place.lng = +place.lng;
      }

      // wrapping the add call in a timeout free the thread for a sec
      return new Promise(resolve => setTimeout(() => {
        // we'll index everything and we're done!
        store.DB.addAll(places);
        // let everyone in the call stack know we've been wire-delayed 
        store.dbRemoteLoad = true;
        // and then un-let them know after the fact
        setTimeout(() => delete store.dbRemoteLoad, 0);
        // let's return the database for searching
        resolve(store.DB);
      }, 10));
    });
  },
  // set some default parameters for all searches, e.g country codes or no ip lookup
  // or pass true to force the database to download immediately rather than on search
  init(params={}) {
    Object.assign(store.defaultParams, params);
    if (params === true || params.preload) {
      this.getDB(store.defaultParams);
    }
  },
  async search(queryParams, noEmptyResponse=false) {
    let startTime = performance.now();
    // construct our search params
    const params = {
      ...store.defaultParams,
      ...(typeof queryParams === 'string' ? { query: queryParams } : queryParams),
    };

    // no query? let's skip the drama
    if (!params.query) {
      return formatResponse(params, startTime);
    }

    // store the latest search params for later
    store.search = params;

    // this will return a database matching our requirements
    // either the full database or a subset of specified countries
    const db = await this.getDB(params);

    // database loaded from remote?
    // let people know how that affected process time
    if (store.dbRemoteLoad) {
      params.fetchTimeMS = performance.now() - startTime;
      startTime = performance.now();
    } else {
      params.fetchTimeMS = 0;
    }

    const options = {};
    const boostId = ruid();
    const filters = [];
    // if we're limiting to specific countries let's filter our results
    // note that while countries takes precedence, this filter can
    // run together with [aroundLatLng, insideBoundingBox, insidePolygon]
    if (params.countries) {
      // exclusive
      filters.push(result => params.countries.includes(result.iso2));
    }

    // if we're limiting to a proximity around a latlng let's filter again
    if (params.aroundLatLng) {
      const [lat, lng] = params.aroundLatLng.split(',');
      aroundLatLng = { lng: +lng.trim(), lat: +lat.trim() };
      params.aroundLatLng = [aroundLatLng.lat, aroundLatLng.lng];
      // our default proximity will be 500km (cities not addresses!)
      params.aroundRadius = params.aroundRadius || 500000;
      filters.push((result) => {
        // find the distance
        const distance = distanceBetween(aroundLatLng, result);
        const isBoosted = distance <= params.aroundRadius;
        // reward closer targets 0-1 bonus multiplier by distance away from point
        const boostBonus = 1 - distance / params.aroundRadius;
        // inclusive: let them know the distance if there was a boost
        return boostScore(boostId, result, isBoosted, 4 + boostBonus, {
          aroundLatLng: true,
          distanceFromLatLng: distance,
        });
      });
    // if a countries list isn't provided we can use Cloudflare's nifty
    // tracing tool to boost results based on the user's country
    // Note that this doesn't exclude other results and, if you really don't
    // want another request to a random offsite server, can be turned off
    } else if ((!params.countries || params.countries.length > 1) && params.aroundLatLngViaIP)  {
      // get the country code
      const usertrace = await this.usertrace();
      if (usertrace.iso2) {
        // let the user know how we're boosting their results
        // both in the main object and each individual result
        params.aroundLatLngViaIP = {
          iso2: usertrace.iso2,
        };
        filters.push((result) => {
          // boost the result if country code matches
          const isBoosted = result.iso2 === usertrace.iso2;
          // inclusive: set the boost on the record and add boost metadata
          return boostScore(boostId, result, isBoosted, 3, {
            aroundLatLngViaIP: params.aroundLatLngViaIP,
          });
        });
      }
    }

    // filtering by bounding box is pretty much the same as filtering by polygon
    if (params.insideBoundingBox) {
      const [trLat, trLng, blLat, blLng] = params.insideBoundingBox.split(',');
      const poly = [
        [+blLng, +trLat],
        [+trLng, +trLat],
        [+trLng, +blLat],
        [+blLng, +blLat],
        [+blLng, +trLat], // first point repeats per geojson spec
      ];
      // could be smart but this is straightforward
      params.insideBoundingBox = [+trLat, +trLng, +blLat, +blLng];
      // exclusive
      filters.push(result => pointInPolygon([result.lng, result.lat], [poly]));
    } else if (params.insidePolygon) {
      const lngLatList = params.insidePolygon.split(',');
      const poly = [];

      // iterate over each point pair and convert to numbers
      for (let i=lngLatList.length / 2;i>0;i--) {
        const iLng = i * 2 - 1;
        const iLat = i * 2 - 2;
        const lng = +lngLatList[iLng];
        const lat = +lngLatList[iLat];
        
        // we've started from the end
        // so let's add each pair to the start of the list
        poly.unshift([lng, lat]);

        // reassign numbers to report back
        lngLatList[iLng] = lng;
        lngLatList[iLat] = lat;
      }

      // first point repeats per geojson spec
      if (poly[poly.length - 1][0] !== poly[0][0]
        || poly[poly.length - 1][1] !== poly[0][1]) {
        poly.push(poly[0]);
      }

      params.insidePolygon = lngLatList;
      // exclusive
      filters.push(result => pointInPolygon([result.lng, result.lat], [poly]));
    }

    // apply any search filters
    if (filters.length) {
      options.filter = (result) => {
        // iterate over each filter
        // we'll remove the result if any evaluate to false
        for (const filterFn of filters) {
          if (!filterFn(result)) {
            return;
          }
        }
        return true;
      }
    }

    // let's clear the callstack
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // now check if the stored params have been overidden by a newer search
    // if so we should safely drop out here
    if (store.search !== params) {
      // if the client is always expecting a response give it to them, otherwise nullllll
      return noEmptyResponse ? formatResponse(params, startTime) : null;
    }

    params.hitsPerPage = Math.min(20, params.hitsPerPage) || 5;

    // run the search!
    const results = db.search(params.query, options)
    // we'll limit the results 5, or a user defined number to a max of 20
    .slice(0, params.hitsPerPage);

    // we'll remove any boost ids (because we don't need them)
    for (const result of results) {
      if (result.boost) {
        delete result.boost.id;
      }

      // this will highlight the matched terms in our result and update in place
      // it's a complex beast with a few gotchas .. lots of reading above
      highlightResult(params.query, result);
    }

    return formatResponse(params, startTime, results);
  },
};

// assign to the global scope
self.replaces = replaces;
})();
