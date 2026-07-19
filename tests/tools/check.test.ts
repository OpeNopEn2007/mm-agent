import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  runPreflight,
  type CommandRunner,
  type ExecutableResolver,
} from "../../src/tools/check.js";

async function fixture(): Promise<{
  projectRoot: string;
  packageRoot: string;
  cacheRoot: string;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-agent-check-"));
  const projectRoot = path.join(root, "project");
  const packageRoot = path.join(root, "package");
  const cacheRoot = path.join(root, "cache");
  await mkdir(projectRoot, { recursive: true });
  await mkdir(cacheRoot, { recursive: true });
  await mkdir(path.join(packageRoot, "templates", "cumcmthesis"), {
    recursive: true,
  });
  await mkdir(path.join(packageRoot, "knowledge", "hmml"), {
    recursive: true,
  });
  await writeFile(
    path.join(packageRoot, "package.json"),
    `${JSON.stringify({ dependencies: { "@opencode-ai/plugin": "1.18.2" } })}\n`,
  );
  await writeFile(
    path.join(packageRoot, "templates", "cumcmthesis", "example.tex"),
    "\\documentclass{article}\\begin{document}probe\\end{document}\n",
  );
  for (const [name, content] of [
    ["hmml.json", "{}\n"],
    ["method-index.json", "{}\n"],
    ["hmml-embeddings.npy", "candidate-index\n"],
    ["embedding-meta.json", "{}\n"],
  ] as const)
    await writeFile(path.join(packageRoot, "knowledge", "hmml", name), content);
  return { projectRoot, packageRoot, cacheRoot };
}

const resolver: ExecutableResolver = async (name) => `/tools/${name}`;
const successfulRunner: CommandRunner = async (executable, args) => {
  if (executable.endsWith("opencode"))
    return {
      executable,
      args,
      exitCode: 0,
      stdout: "1.18.3\n",
      stderr: "",
      timedOut: false,
    };
  if (executable.endsWith("uv"))
    return {
      executable,
      args,
      exitCode: 0,
      stdout: args[0] === "--version" ? "uv 0.10.6\n" : "3.12.9\n",
      stderr: "",
      timedOut: false,
    };
  const output = args
    .find((arg) => arg.startsWith("-output-directory="))
    ?.slice("-output-directory=".length);
  assert.ok(output);
  await writeFile(path.join(output, "example.pdf"), "%PDF-real-command-fixture\n");
  return {
    executable,
    args,
    exitCode: 0,
    stdout: "Output written on example.pdf\n",
    stderr: "",
    timedOut: false,
  };
};

test("check returns direct structured evidence for every Step 3 category", async () => {
  const roots = await fixture();
  const result = await runPreflight({
    ...roots,
    caseId: "case-alpha",
    executableResolver: resolver,
    commandRunner: successfulRunner,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.checks.map((check) => check.id),
    [
      "node",
      "opencode",
      "uv",
      "python-3.12",
      "case-write",
      "hmml-index",
      "hmml-cache",
      "tex-template",
    ],
  );
  for (const check of result.checks) {
    assert.match(check.status, /^(?:pass|warn|fail)$/u);
    assert.match(check.repair, /^(?:automatic|user|none)$/u);
    assert.ok(check.evidence.length > 10, check.id);
  }
  const hmml = result.checks.find((check) => check.id === "hmml-index");
  assert.equal(hmml?.status, "warn");
  assert.equal(hmml?.repair, "automatic");
  assert.match(hmml?.evidence ?? "", /not finalized or inconsistent/u);
  const tex = result.checks.find((check) => check.id === "tex-template");
  assert.equal(tex?.status, "pass");
  assert.match(tex?.evidence ?? "", /pdf_bytes=[1-9]\d*/u);
  assert.match(tex?.evidence ?? "", /example\.tex/u);
});

test("check classifies missing tools without throwing or attempting Python", async () => {
  const roots = await fixture();
  const calls: string[] = [];
  const result = await runPreflight({
    ...roots,
    scope: "environment",
    executableResolver: async (name) => {
      calls.push(name);
      return undefined;
    },
    commandRunner: async () => {
      throw new Error("runner must not be called for missing executables");
    },
  });

  assert.equal(result.ok, false);
  assert.deepEqual(calls, ["opencode", "uv"]);
  assert.deepEqual(
    result.checks.map(({ id, status, repair }) => ({ id, status, repair })),
    [
      { id: "node", status: "pass", repair: "none" },
      { id: "opencode", status: "fail", repair: "user" },
      { id: "uv", status: "fail", repair: "automatic" },
      { id: "python-3.12", status: "fail", repair: "automatic" },
    ],
  );
});

test("check reports invalid Case IDs and unwritable Case roots as actionable failures", async () => {
  const roots = await fixture();
  const invalid = await runPreflight({
    ...roots,
    scope: "case",
    caseId: "../outside",
  });
  assert.deepEqual(invalid.checks[0], {
    id: "case-write",
    status: "fail",
    evidence: "invalid Case ID: ../outside",
    repair: "user",
  });

  await writeFile(path.join(roots.projectRoot, "runs"), "not a directory\n");
  const unavailable = await runPreflight({ ...roots, scope: "case" });
  assert.equal(unavailable.ok, false);
  assert.equal(unavailable.checks[0]?.status, "fail");
  assert.equal(unavailable.checks[0]?.repair, "user");
  assert.match(unavailable.checks[0]?.evidence ?? "", /write probe failed/u);
});

test("check strips project virtual-environment state before probing uv", async () => {
  const roots = await fixture();
  const observed: NodeJS.ProcessEnv[] = [];
  await runPreflight({
    ...roots,
    scope: "environment",
    env: {
      PATH: [path.join(roots.projectRoot, ".venv", "bin"), "/safe/bin"].join(
        path.delimiter,
      ),
      VIRTUAL_ENV: path.join(roots.projectRoot, ".venv"),
      PYTHONPATH: path.join(roots.projectRoot, ".venv", "site-packages"),
    },
    executableResolver: async (name, env) => {
      observed.push({ ...env });
      return `/tools/${name}`;
    },
    commandRunner: async (executable, args, options) => {
      observed.push({ ...options.env });
      return successfulRunner(executable, args, options);
    },
  });
  assert.ok(observed.length > 0);
  for (const env of observed) {
    assert.equal(env.VIRTUAL_ENV, undefined);
    assert.equal(env.PYTHONPATH, undefined);
    assert.equal((env.PATH ?? "").includes(".venv"), false);
    assert.equal(env.PYTHONNOUSERSITE, "1");
    assert.equal(env.UV_PYTHON_DOWNLOADS, "never");
    assert.equal(env.UV_PYTHON_INSTALL_DIR, path.join(roots.cacheRoot, "python-installations"));
    assert.equal(env.UV_CACHE_DIR, path.join(roots.cacheRoot, "uv"));
  }
});
