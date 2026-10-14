// Talks to the Node API (server/). Every failure becomes an Error with a readable message and the HTTP status.

async function request(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    const e = new Error("Can't reach the server. Check that it's running and you're connected.");
    e.status = 0;
    throw e;
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty or non-JSON reply */ }
  if (!res.ok) {
    const e = new Error((data && data.error) || (res.status >= 500 ? "Something went wrong on the server." : "That couldn't be saved."));
    e.status = res.status;
    e.setup = !!data?.setup;
    throw e;
  }
  return data;
}

export const api = {
  get: (url) => request("GET", url),
  post: (url, body) => request("POST", url, body ?? {}),
  put: (url, body) => request("PUT", url, body ?? {}),
  patch: (url, body) => request("PATCH", url, body ?? {}),
  del: (url) => request("DELETE", url),
};
