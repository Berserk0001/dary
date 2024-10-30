/*
 * proxy.js
 * The bandwidth hero proxy handler.
 * proxy(httpRequest, httpResponse);
 */
import got from 'got';
import { pick } from 'lodash';
import shouldCompress from './shouldCompress.js';
import redirect from './redirect.js';
import compress from './compress.js';
import copyHeaders from './copyHeaders.js';

export default async function proxy(req, res) {
  /*
   * Avoid loopback that could cause server hang.
   */
  
  const url = req.params.url;
  const options = {
    headers: {
      ...pick(req.headers, ["cookie", "dnt", "referer", "range"]),
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.3",
    },
    timeout: { request: 10000 },
    retry: { limit: 2 },
    https: { rejectUnauthorized: false },
    decompress: true  // Automatically decompress upstream compressed responses
  };

  try {
    const origin = got.stream(url, options);

    origin.on('response', (response) => {
      // Clean-up Cloudflare headers from the response
      console.log("[CLEAN] Cleaning up CF headers for " + req.path);
      const cfHeaders = [
        'cf-cache-status', 'cf-ray', 'cf-request-id', 'date', 'server', 
        'report-to', 'nel', 'report-policy', 'cf-polished', 'cf-bgj', 
        'age', 'expires', 'strict-transport-security', 'etag', 
        'last-modified', 'transfer-encoding'
      ];

      cfHeaders.forEach(header => {
        if (response.headers[header]) {
          delete response.headers[header];
        }
      });

      if (response.statusCode >= 400 || (response.statusCode >= 300 && response.headers.location)) {
        // Redirect if status is 4xx or redirect location is present
        return redirect(req, res);
      }

      // Copy cleaned headers to the response
      copyHeaders(response, res);
      res.setHeader("content-encoding", "identity");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
      req.params.originType = response.headers["content-type"] || "";
      req.params.originSize = response.headers["content-length"] || "0";

      if (shouldCompress(req)) {
        // Compress the already decompressed response, if required
        return compress(req, res, origin);
      } else {
        res.setHeader("x-proxy-bypass", 1);
        for (const headerName of ["accept-ranges", "content-type", "content-length", "content-range"]) {
          if (headerName in response.headers) res.setHeader(headerName, response.headers[headerName]);
        }
        return origin.pipe(res);
      }
    });

    origin.on('error', () => req.socket.destroy());

  } catch (err) {
    // Handle error directly
    if (err.code === "ERR_INVALID_URL") {
      return res.status(400).send("Invalid URL");
    }

    // Redirect on other errors
    redirect(req, res);
    console.error(err);
  }
}