import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { after, before, test } from "node:test";

let server;
let origin;
let serverOutput = "";

before(async () => {
  const port = 32000 + (process.pid % 10000);
  origin = `http://127.0.0.1:${port}`;
  server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "-p", String(port)],
    {
      cwd: new URL("..", import.meta.url),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (chunk) => { serverOutput += chunk; });
  server.stderr.on("data", (chunk) => { serverOutput += chunk; });

  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) throw new Error(serverOutput);
    try {
      const response = await fetch(origin);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Next.js server did not start\n${serverOutput}`);
});

after(() => server?.kill("SIGTERM"));

test("renders the waste engineer study app", async () => {
  const response = await fetch(origin);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /폐기물처리기사/);
  assert.match(html, /지금 필요한 학습을 고르세요/);
  assert.match(html, /과목별 (?:<!-- -->)?20(?:<!-- -->)?문제/);
  assert.match(html, /2022년 2회/);
});

test("renders the Vercel login page", async () => {
  const response = await fetch(`${origin}/auth/sign-in`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /로그인|Sign in/i);
});

test("protects progress for anonymous visitors", async () => {
  const response = await fetch(`${origin}/api/progress`);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
});
