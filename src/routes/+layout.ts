// Every page renders in the browser, never on a server, because the app is plain static files
// with its data in the browser. This makes the build a single-page app: one fallback page that
// starts the app, whatever the URL.
export const ssr = false;
