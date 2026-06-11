export function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  url.pathname = "/inprogress/";

  return env.ASSETS.fetch(url);
}
