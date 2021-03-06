if (self.WorkerGlobalScope) {
  const swUrl = 'https://cdn.jsdelivr.net/npm/re.places.js@0.1.3/src/re.places.algolia.sw.js';
  self.importScripts(swUrl);
} else {

  // places isn't loaded .. worker not required
  if (!window.places || !window.places.version) {
    throw new Error('[Algolia Places.js must be imported before re:places.js]');
  }

  if(!('serviceWorker' in navigator)) {
    throw new Error('[error creating service worker]');
  }

  // include the name of the file you are currently looking at here
  // we will check if it has been correctly registered
  let locationOfThisFile;
  try {
    const [url] = new Error().stack.match(/https.*?\.js(?=:)/) || '';
    locationOfThisFile = new URL(url).pathname || 're.places.algolia.js';
  } catch (e) {
    locationOfThisFile = 're.places.algolia.js';
  }

  const initAlgoliaServiceWorker = () =>
    navigator.serviceWorker
    .register(locationOfThisFile)
    .then((registration) => {
      registration.update()
      registration.addEventListener('updatefound', () => {
        // testing purposes
        // registration.installing.onstatechange = (e) =>
        //   console.log('state change!', e.target.state);
      });
    });

  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      const scriptURL = registration.active && registration.active.scriptURL;
      if (scriptURL && !scriptURL.endsWith(locationOfThisFile)) {
        throw new Error('[could not install re:places service worker: worker already exists at this scope]');
      }
    }
    initAlgoliaServiceWorker();
    // we're not catching errors - we want them to throw
  });
}
