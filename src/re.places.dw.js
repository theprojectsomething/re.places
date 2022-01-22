const coreUrl = 'https://cdn.jsdelivr.net/npm/re.places.js@0.0.9-a/src/re.places.core.js';
importScripts(coreUrl);

onmessage = ({ data }) => {
  if (data.search) {
    replaces.search(data.search)
      .then(results => postMessage({ id: data.id, search: results }));
  } else if (data.init) {
    replaces.init(data.init);
  }
};