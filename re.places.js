// #TODO
// - implement non-CDN option, e.g. by specifying a local path

const workerUrl = 'https://cdn.jsdelivr.net/npm/re.places.js@0.0.9-a/src/re.places.dw.js';
let placesWorker;
let activePost;

const initPlacesWorker = () => {
  return fetch(workerUrl)
  .then(e => e.text())
  .then((txt) => {
    const workerBlob = new Blob([txt], {type: 'application/javascript'})
    placesWorker = new Worker(URL.createObjectURL(workerBlob));
    placesWorker.onmessage = ({ data }) => {
      if (data.id === activePost.data.id) {
        activePost.resolve(data.search || null);
      }
    }
  });
}

const postMessage = async (msg={}) => {
  activePost = {
    data: {
      ...msg,
      id: performance.now(),
    },
  };

  if (!placesWorker) {
    await initPlacesWorker();
  }
  placesWorker.postMessage(activePost.data);
}

export const init = (params) => {
  postMessage({ init: params, baseUrl });
}

export const search = async (params) => {
  if (activePost) {
    activePost.resolve();
  }

  return new Promise((resolve) => {
    postMessage({ search: params });
    activePost.resolve = resolve;
  });
}

export default { init, search };