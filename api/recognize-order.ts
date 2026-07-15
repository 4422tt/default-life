import lifeRuleFunction from "../vercel-api/api/recognize-order";

type VercelRequest = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type VercelResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): VercelResponse;
  send(body: string): void;
};

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

// Vercel's root /api runtime expects a Node-style handler. The shared life-rule
// implementation uses Web Request/Response, so this bridge keeps both paths
// working without duplicating the DeepSeek and validation logic.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    const header = firstHeader(value);
    if (header) headers.set(name, header);
  }

  const method = req.method ?? "GET";
  const host = firstHeader(req.headers.host) ?? "default-life.vercel.app";
  const body = method === "GET" || method === "HEAD" || req.body == null
    ? undefined
    : typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  const request = new Request(`https://${host}${req.url ?? "/api/recognize-order"}`, {
    method,
    headers,
    body,
  });
  const response = await lifeRuleFunction.fetch(request);
  response.headers.forEach((value, name) => res.setHeader(name, value));
  res.status(response.status).send(await response.text());
}
