export default {
  fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        service: "hohohocch-site",
      });
    }

    if (url.pathname === "/tpm") {
      url.pathname = "/tpm/";
    }

    if (url.pathname === "/inprogress") {
      url.pathname = "/inprogress/";
    }

    if (url.pathname === "/plan") {
      url.pathname = "/plan/";
    }

    return env.ASSETS.fetch(new Request(url, request));
  },
};
