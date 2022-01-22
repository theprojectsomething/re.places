/***

MIT License
Copyright (c) 2022 theprojectsomething

Generate a number of CSV files encompassing the SimpleMaps.com
World Cities basic database. The database is licensed CC BY 4.0.

Files:

1. The full database of 40,000+ cities for global searching (1.7MB / 396kB brotli)
2. A map of country names by iso2 country code (1-315kB / 1-65kB brotli)
3. A CSV of cities for each iso2 country code (4kB / 2kB brotli)

***/

import { readdir, readFile, writeFile } from 'fs/promises';
import https from 'https';
import AdmZip from 'adm-zip';
import zlib from 'zlib';

// name the db file and directory
const dbName = 'simplemaps_worldcities';
const dbDir = 'db';

// get db info from a local db cache
let dbInfo = await readdir(dbDir).then((files) => {
  let path, version = '';

  // look for a file that matches the database name
  // if found extract the version suffix
  for (const file of files) {
    if (file.startsWith(dbName)) {
      const v = file.slice(0, -4).replace(/.*(v\d.*)|.*/, '$1');

      // multiple legacy caches may exist
      // we want the latest version!
      if (!v || v > version) {
        path = `${dbDir}/${file}`;
        version = v;
      }
    }
  }
  return path ? { path, version } : null;
})
.catch(e => console.log(e));

// these are the properties we want in our final db
// set value to a string to transform the {key}
// set value to a function to transform the {value}
// set value to an array and [0] = {key} && [1] = fn() => {value}
const dbTransform = {
  city: ({ city }) => `"${city}"`,
  // transform the key and value
  admin_name: [
    'admin', // changes the key to 'admin'
    ({ city, admin_name }) => // only include 'admin' where it differs from 'city'
      city.slice(1, -1) === admin_name ? '' : `"${admin_name}"`,
  ],
  country: ({ country }) => `"${country}"`,
  // lowercase the country code
  iso2: ({ iso2 }) => iso2.toLowerCase(),
  // scale lat,lng to 2 decimal places (~1.1km)
  lat: ({ lat }) => (+lat).toFixed(2),
  lng: ({ lng }) => (+lng).toFixed(2),
};

// props included in each db
// - "places" includes all cities
// - "countries" is a map for iso2 country codes
const dbProps = {
  places: ['iso2', 'city', 'admin', 'lng', 'lat'],
  countries: ['iso2', 'country'],
};

// Fit for purpose CSV column matching, e.g: "column A",column B,"column, C"
const reCsvColumnMatch = /(?<="|,")(|[^,"\n][^"\n]*)(?="|"$)|(?<=^|,)(|[^"][^,]*)(?=,|$)/g

// fetch a url as a promised buffer
const fetch = url => new Promise((resolve, reject) => {
  try {
    https.get(url, (res) => {
      const data = [];
      res.on('data', (chunk) => {
        data.push(chunk);
      }).on('end', () => {
        resolve(Buffer.concat(data));
      });
    }).on('error', e => reject(e));
  } catch (e) {
    reject(e);
  }
});

// get the cached database if available
// or download and save from the source
const getDatabase = async () => {
  console.log('[checking remote database at simplemaps.com]')
  const remoteInfo = await getRemoteInfo();

  // check the local database if it exists and is current
  // or if there were problems with the remote
  if (!remoteInfo || (dbInfo && dbInfo.version === remoteInfo.version)) {
    console.log('[checking local database]')
    return readFile(dbInfo.path, 'utf8')
    .catch(() => {
      // no local database, but we've got the remote so all good
      if (remoteInfo) {
        return getRemoteDatabase(remoteInfo);
      } else {
        console.log('[no database available ... please try again later or submit an issue]')
      }
    });
  }

  // notify where the remote database version is ahead of the local version
  if (dbInfo && dbInfo.version !== remoteInfo.version) {
    console.log(`[new database available: ${dbInfo.version} ==> ${remoteInfo.version}]`)
  }
  return getRemoteDatabase(remoteInfo);
}

// the database source is the simplemaps.com website
// let's find the latest database url and version
const getRemoteInfo = () => {
  const dbRemoteOrigin = 'https://simplemaps.com';
  return fetch(`${dbRemoteOrigin}/data/world-cities`)
  .then(htmlBuffer => {
    // regex the download url to the basic database
    const zipUrl = htmlBuffer.toString().match(/\/static\/data\/world-cities\/basic\/.*\.zip/);
    if (!zipUrl) throw new Error('[remote db not available]');

    // return the download url and current db version
    return {
      url: zipUrl[0].replace(/^\//, `${dbRemoteOrigin}/`),
      version: zipUrl[0].slice(0, -4).replace(/.*(?=v\d.*)/, ''),
    };
  }).catch(e => console.log(e.message));
}

// we've got the latest remote database url and version
// let's download and parse it!
const getRemoteDatabase = (remoteInfo) => {
  console.log('[downloading database from simplemaps.com]')
  return fetch(remoteInfo.url)
  // unzip the db zip and extract the csv
  .then(zipBuffer => new Promise((resolve, reject) =>
    AdmZip(zipBuffer).readFileAsync('worldcities.csv', dbBuffer =>
      dbBuffer ? resolve(dbBuffer) : reject())))
  // save the extracted csv then return as a string
  .then((dbBuffer) => {
    dbInfo = {
      path: `${dbDir}/${dbName}_${remoteInfo.version}.csv`,
      version: remoteInfo.version,
    };
    return writeFile(dbInfo.path, dbBuffer)
    .then(() => {
      console.log('[database downloaded]');
      return dbBuffer.toString();
    })
  });
}

// let's do this ... 
// first download the db (throws on error)
const db = await getDatabase();

// great, let's parse and process the csv
console.log(`[processing db ${dbInfo.version}]`)
let progress = 0;
const keys = [];
const dbMap = {
  places: [], // a list of all places
  countries: [], // a list of all countries and codes
  placesByCountry: {}, // a map places for each iso2 country code
};
// flatten all our possible db headers into a list
const dbPropsInUse = Object.values(dbProps).flat();
const rows = db.split('\n');
// iterate over each row in the csv
// we'll convert these to objects for searching
for (const [i, row] of Object.entries(rows)) {
  // compute heavy ... let's log some progress
  const p = Math.floor(10 * i / rows.length);
  if (p !== progress) {
    progress = p;
    console.log(`..${p * 10}%`);
  }
  // pull each column value out as a property
  const cols = row.match(reCsvColumnMatch);

  // first row is the header, store it as-is
  if (!keys.length) {
    keys.push(...cols);
    continue;
  }

  // invalid row, for example an empty line in the csv
  if (cols.length !== keys.length) {
    continue;
  }

  const place = {};
  // the rest of the rows are data, we'll convert them to objects
  // this ensures our preferred order without too much complexity
  // we'll iterate over the keys we retrieved from the first column
  // then assign each property, transforms happen next
  for (const [ii, key] of Object.entries(keys)) {
    place[key] = cols[ii];
  }

  // now let's do it again accounting for any {key} or {value} transforms
  // we iterate again so that these can self-reference
  for (const [key, val] of Object.entries(place)) {
    // transform the prop name if required
    const prop = typeof dbTransform[key] === 'string'
    ? dbTransform[key]
    : (Array.isArray(dbTransform[key]) ? dbTransform[key][0] : key);


    // transform the prop value if required
    // .. we use the original key in the transform
    place[prop] = typeof dbTransform[key] === 'function'
    ? dbTransform[key](place)
    : (Array.isArray(dbTransform[key]) ? dbTransform[key][1](place) : val);
  }

  // now we can use our place object to create our various outputs
  // this is more process-intensive but easier to follow and troubleshoot
  // ... first we'll initiate another list for the current country
  if (!dbMap.placesByCountry[place.iso2]) {
    dbMap.placesByCountry[place.iso2] = [];

    // this is a new country code so we can use this opportunity
    // to also add details for mapping the iso2 to a country
    const item = [];
    for (const prop of dbProps.countries) {
      item.push(place[prop]);
    }
    // dbMap.countries.push(`"${item.join('","')}"`);
    dbMap.countries.push(item.join(','));
  }

  // then we'll add the places props in order
  const item = [];
  for (const prop of dbProps.places) {
    item.push(place[prop]);
  }
  // const itemString = `"${item.join('","')}"`;
  const itemString = item.join(',');
  dbMap.places.push(itemString);
  dbMap.placesByCountry[place.iso2].push(itemString);
}
console.log('..100%');

// write out the places file
console.log('[saving places json db]')
const placesJSON = JSON.stringify([
  dbProps.places,
  dbMap.places,
  dbProps.countries,
  dbMap.countries,
], null, '  ');


// generate and save a places csv, sorted for better compression
// txt extension provided to ensure brotli compression where available
console.log('[saving places db]')
const placesCSV = [dbProps.places.join(',')].concat(dbMap.places.sort()).join('\n');
await writeFile(`${dbDir}/places.txt`, placesCSV);
await new Promise(resolve => zlib.brotliCompress(Buffer.from(placesCSV), (err, compressed) =>
  resolve(writeFile(`${dbDir}/places.csv.br`, compressed))));

// iterate over the places by country map and save each file out
// txt extension provided to ensure brotli compression where available
console.log('[saving places by country dbs]')
for (const [iso2, places] of Object.entries(dbMap.placesByCountry)) {
  const countryCSV = [dbProps.places.join(',')].concat(places.sort()).join('\n');
  await writeFile(`${dbDir}/places-${iso2}.txt`,  countryCSV);
  await new Promise(resolve => zlib.brotliCompress(Buffer.from(countryCSV), (err, compressed) =>
    resolve(writeFile(`${dbDir}/places.${iso2}.csv.br`, compressed))));
}

console.log('[saving countries map db]')
// generate a countries csv, sorted for better compression
// txt extension provided to ensure brotli compression where available
const countriesCSV = [dbProps.countries.join(',')].concat(dbMap.countries.sort()).join('\n');
await writeFile(`${dbDir}/countries.txt`, countriesCSV);
await new Promise(resolve => zlib.brotliCompress(Buffer.from(countriesCSV), (err, compressed) =>
  resolve(writeFile(`${dbDir}/countries.csv.br`, compressed))));
