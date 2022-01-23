Re:**Places**.js
===================

> Ok, so still not quite on par with the amazing `<Algolia-Places>` ...

**re:places** is a serverless database of 41,000 global cities for your browser. Designed as a light-weight polyfill for ‘cities’ from Algolia's Places API, ahead of the service’s sunset [in May 2022](https://www.algolia.com/blog/product/sunsetting-our-places-feature/). It also runs standalone.

### Try it out: [Search a city [demo]](https://theprojectsomething.github.io/re.places/)
**Install**
1. [Standalone install](#standalone) [[demo](https://theprojectsomething.github.io/re.places/demo/standalone.html)]
2. [Polyfill Algolia Places API](#algolia) [[demo](https://theprojectsomething.github.io/re.places/demo/algolia.html)]
3. [Self hosted](#self-hosted)

Some basic features
--------------------

*   Blazingly fast, a round-trip query averages **20-30ms**[^1]
*   Lazy-load the global cities database in **under 400kB**[^2] over the wire
*   Filter by country to optimise file size: France weighs in at **20kB**[^2] and Australia comes in under **5kB**[^2]
*   Filter results based on a user's `IP`, proximity to a `lat,lng`, or the area inside a `polygon` or `bounding box`
*   Standalone, or as a zero-config proxy to extend the life of [Algolia's Places.js](https://github.com/algolia/places/) (beyond their API shutdown)
*   Entirely static, nothing required beyond your favourite CDN or storage bucket
*   Entirely free and open source (code is **[MIT licensed](https://github.com/theprojectsomething/re.places/blob/master/LICENSE)**, database is **[CC BY 4.0](https://simplemaps.com/data/world-cities "Our database is derived from the World Cities Database basic edition (CC BY 4.0) available from SimpleMaps.com")**)[^3]
*   Contributions celebrated 🎉

Installation & Use
--------------------

re:**places**.js is currently intended to be installed from a CDN, with the exception of the polyfill (service worker) script. While modules are in use, they rely on remote imports. This is primarily because the library was coded by hand, without a package manager, and so doesn't have any build steps that might facilitate different versions (UMD, local es6 modules, etc.) Future versions should resolve this shortcoming and provide for a straightforward `npm i` process. That said, porting the library to run locally [is trivial](#self-hosted).

<h3 name="standalone">Standalone install [<a href="https://github.com/theprojectsomething/re.places/blob/master/demo/standalone.html">example</a>]</h3>

1. Import [re.places.js](https://github.com/theprojectsomething/re.places/blob/master/re.places.js) into your script or document
```js
import replaces from 'https://cdn.jsdelivr.net/npm/re.places.js@0.1.2/re.places.js'
```
```html
<script async src="https://cdn.jsdelivr.net/npm/re.places.js@0.1.2/re.places.js"></script>
```
2. Search a city:
```js
// this downloads the Australia database (5kb) and runs a search
replaces.search({
  query: 'Cairns',
  countries: ['au'],
})
.then(e => console.log(e));
```
#### Advanced setup
```js
// you can provide default options that apply to every search
// refer to the algolia documentation for more info:
// community.algolia.com/places/documentation.html#reconfigurable-options
replaces.init({
  // preload the database
  preload: true,
  // limit it to France and Australia ~= 26Kb download
  countries: ['au', 'fr'],
  // by default we weight results by proximity to an IP location
  // (or at least Algolia do - this library limits it to country)
  // you can turn that off here .. but it's not great for user experience
  aroundLatLngViaIP: false,
  // specify a geo location and distance (in meters), instead of using the IP 
  aroundLatLng: '-16, 145',
  aroundRadius: 3000000, // =300km
  // any results outside this bounding box are excluded
  insideBoundingBox: '-10,154,-29,138',
  // any results outside this polygon are excluded
  insidePolygon: '-10,138,-10,154,-29,154,-34,152,-34,141,-29,138',
})

// any options you provide to a search are merged with your default options
const result = await replaces.search({
  query: 'ca',
  // for this search we do want to weight by IP location
  aroundLatLngViaIP: true,
});

```

<h3 name="algolia">Polyfill Algolia Places API [<a href="https://github.com/theprojectsomething/re.places/blob/master/demo/algolia.html">example</a>]</h3>

1. Download [re.places.algolia.js](re.places.algolia.js) and place the file at the root of your app
2. Import the library directly after Algolia Places.js, this will install a service worker to intercept any API calls
```js
import 'https://cdn.jsdelivr.net/npm/places.js@1.19.0'
// import directly after places.js
import '/re.places.algolia.js'
```
3. That's it. Test the \<input> your previously set up for places.js

#### Polyfill with a service worker already in place

The above install will throw an error where a service worker is already installed on a domain. To resolve, import [re.places.algolia.sw.js](https://github.com/theprojectsomething/re.places/blob/master/src/re.places.algolia.sw.js) _at the top_ of the existing script. Re.Places only intercepts calls to the Algolia API and does not use any caching strategy. Imported at the top of your script it will work in tandem with any logic already in place.

1. Edit your main service worker to add the following line to the top of the file
```js
self.importScripts('https://cdn.jsdelivr.net/npm/re.places.js@0.1.2/src/re.places.algolia.sw.js')
// YOUR SERVICE WORKER LOGIC GOES HERE
```

### Self hosted

To self-host the library, you can simply switch out the CDN hosted libraries for local versions. This involves ensuring you have a local copy of each script required for your setup, and replacing any remote urls with your local path. The library was originally built for local use, but later adapted to use a CDN due to the nature of the beast. Future iterations will allow for either approach.

1. Download the repository or create a local fork
2. `npm install`
3. build the database `npm run build-db`
4. search and replace all the remote imports with local paths (we use `cdn.jsdelivr.net` and all files should be in `/`, `/src` and `/demo`)
5. test the demo pages `npm run demo` (you'll need HTTPS on localhost)

## Further reading

Check out the source of the demo pages for more detailed explanations of each setup. The scripts themselves are also commented, but there's no guarantees as to coherence. Please feel free to submit an issue or PR to resolve any confusion. Thanks for reading!

---

<sub>**re:places © 2022 [theprojectsomething](https://theprojectsomething.com) | [MIT license](https://github.com/theprojectsomething/re.places/blob/master/LICENSE) | [Github](https://github.com/theprojectsomething/re.places) | [Support the project](https://github.com/sponsors/theprojectsomething)**</sub><br>
<sup>Hand made with 🖤 in Cairns, Australia</sup>

[^1]: The initial query tends to run significantly slower due to lazy-loading the database and an actual network connection being required ¯\\_(ツ)_/¯ ... pre-loading the database is possible but is disabled by default (and isn't recommended unless restricting by country)
[^2]: The included build script generates a brotli compressed global database weighing in at 396kB, useful for self hosting. CDN compression varies, e.g. ~**480kB** gzip from JSDelivr / **508kB** br from unpkg
[^3]: **re:places** depends on [@lucaong/MiniSearch](https://github.com/lucaong/minisearch "MiniSearch: Tiny and powerful JavaScript full-text search engine for browser and Node") and [@rowanwins/point-in-polygon-hao](https://github.com/rowanwins/point-in-polygon-hao "A point in polygon library based on the paper 'Optimal Reliable Point-in-Polygon Test and Differential Coding Boolean Operations on Polygons' by Hao") (both MIT / 0 dependencies).  
The database is derived from the basic World Cities Database available from [SimpleMaps.com](https://simplemaps.com/data/world-cities) (CC BY 4.0).  
Ideas mixed in from [@turfjs](https://github.com/Turfjs/turf/tree/master/packages/turf-distance "@turf/distance: haversine distance (MIT)") and [this stackoverflow answer](https://stackoverflow.com/a/37511463/720204 "Unicode property escapes"). Cloudflare's 1.1.1.1 supplies [location hints](https://1.1.1.1/cdn-cgi/trace).  
Informing everything, of course, is the masterwork that is [Algolia Places](https://community.algolia.com/places/).  
_All amazing efforts. Thank you so much._
