// add event listeners based on dom [data] attributes
// useful where the dom doesn't have access to module scope
export const domActions = (actionMap, dataAttr='action') => {
  const actionionable = document.querySelectorAll(`[data-${dataAttr}]`)
  for (const el of actionionable) {
    const actions = el.dataset[dataAttr].split(';')
    for (const action of actions) {
      const [fn, preferredType] = action.split(',');
      // allow an event type to be specified
      // or determine one based on the element
      const type = preferredType ||
        // tex inputs or text areas respond to input
        (el.type.startsWith('text') && 'input') ||
        // other types of input respond to change
        (el.tagName.toLowerCase() === 'input' && 'change') ||
        // everything else is a click
        'click';

      // add the event listener
      el.addEventListener(type, actionMap[fn]);
      // for elements that initialise with a state
      // we'll simulate an event on load
      if ((type === 'change' && el.checked)) {
        el.dispatchEvent(new Event(type));
      }
    }
  }
}

// pretty print an object as JSON
// simple but effective :)
export const objectToPrettyJson = o =>
  JSON.stringify(o, null, '  ')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^(\s*)"([^"]*)":/gm, '$1<span data-p>$2</span>:')
    .replace(/(: |[[,]\n\s*)("[^"]*")/gm, '$1<span data-s>$2</span>')
    .replace(/(: |[[,]\n\s*)([-.\d]*)/gm, '$1<span data-n>$2</span>');

export default { domActions, objectToPrettyJson }
