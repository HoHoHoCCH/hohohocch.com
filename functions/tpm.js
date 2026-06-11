export function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  url.pathname = "/tpm/";

  return env.ASSETS.fetch(url);
}
