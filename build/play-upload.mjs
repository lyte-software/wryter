// Uploads an .aab to Google Play through the Android Publisher API. No dependencies:
// it signs the service account JWT itself and uses fetch.
//
//   node build/play-upload.mjs --key play.json --package co.roguewolf.wryter \
//     --track internal --status draft path/to/app.aab
//
// status "draft" leaves the release for you to roll out from Play Console. Apps that
// have never been published can only take draft releases.

import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    key: { type: "string" },
    package: { type: "string" },
    track: { type: "string", default: "internal" },
    status: { type: "string", default: "draft" },
  },
});

const bundlePath = positionals[0];
if (!opts.key || !opts.package || !bundlePath) {
  console.error("usage: play-upload.mjs --key <service-account.json> --package <id> [--track t] [--status s] <file.aab>");
  process.exit(1);
}

const API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${opts.package}`;
const UPLOAD = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${opts.package}`;

const b64url = (v) => Buffer.from(v).toString("base64url");

async function accessToken(account) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: account.token_uri,
    iat: now,
    exp: now + 3600,
  }));
  const signature = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(account.private_key, "base64url");

  const res = await fetch(account.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    }),
  });
  return (await check(res, "authenticating")).access_token;
}

async function check(res, what) {
  if (!res.ok) {
    console.error(`Play API failed while ${what}: ${res.status}\n${await res.text()}`);
    process.exit(1);
  }
  return res.json();
}

const account = JSON.parse(readFileSync(opts.key, "utf8"));
const token = await accessToken(account);
const auth = { Authorization: `Bearer ${token}` };
const json = { ...auth, "Content-Type": "application/json" };

console.log(`Uploading ${bundlePath} to ${opts.package} (${opts.track}, ${opts.status})`);

const edit = await check(await fetch(`${API}/edits`, { method: "POST", headers: json, body: "{}" }), "opening an edit");

const bundle = await check(await fetch(`${UPLOAD}/edits/${edit.id}/bundles?uploadType=media`, {
  method: "POST",
  headers: { ...auth, "Content-Type": "application/octet-stream" },
  body: readFileSync(bundlePath),
}), "uploading the bundle");

await check(await fetch(`${API}/edits/${edit.id}/tracks/${opts.track}`, {
  method: "PUT",
  headers: json,
  body: JSON.stringify({
    track: opts.track,
    releases: [{ versionCodes: [String(bundle.versionCode)], status: opts.status }],
  }),
}), `assigning to the ${opts.track} track`);

await check(await fetch(`${API}/edits/${edit.id}:commit`, { method: "POST", headers: auth }), "committing");

console.log(`Done. versionCode ${bundle.versionCode} is on the ${opts.track} track as ${opts.status}.`);
