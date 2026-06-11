export function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  url.pathname = "/plan/";

  return env.ASSETS.fetch(url);
}
