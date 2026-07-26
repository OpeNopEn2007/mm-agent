import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runCompile } from "../../src/tools/compile.js";

async function fixture(): Promise<{ projectRoot: string; workDir: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-agent-compile-"));
  const projectRoot = path.join(root, "project");
  const workDir = "attempts/reporting/001";
  await mkdir(path.join(projectRoot, "runs", "case-alpha", ...workDir.split("/")), { recursive: true });
  await writeFile(path.join(projectRoot, "runs", "case-alpha", ...workDir.split("/"), "main.tex"), "\\documentclass{article}\\begin{document}ok\\end{document}\n");
  return { projectRoot, workDir };
}

test("compile prefers latexmk and records a non-empty PDF", async (t) => {
  const roots = await fixture();
  t.after(() => rm(path.dirname(roots.projectRoot), { recursive: true, force: true }));
  const result = await runCompile({
    ...roots,
    caseId: "case-alpha",
    now: () => "2026-07-23T00:00:00.000Z",
    executableResolver: async (name) => name === "latexmk" ? "/tools/latexmk" : undefined,
    commandRunner: async (executable, args, options) => {
      await writeFile(path.join(options.cwd, "main.pdf"), "%PDF-fixture\n");
      return { executable, args, exitCode: 0, stdout: "Output written on main.pdf\n", stderr: "", timedOut: false };
    },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.manifest.engine, "latexmk");
  assert.equal(result.manifest.exit_code, 0);
  assert.equal(result.manifest.pdf?.path, `${roots.workDir}/report.pdf`);
  assert.match(result.evidence.path, /compile-001-manifest\.json$/u);
  const reference = JSON.parse(await readFile(path.join(roots.projectRoot, "runs", "case-alpha", "attempts", "reporting", "001", "evidence", "compile-001.json"), "utf8"));
  assert.deepEqual(reference, result.evidence);
  assert.equal(reference.exit_code, 0);
});

test("compile falls back to three xelatex passes", async (t) => {
  const roots = await fixture();
  t.after(() => rm(path.dirname(roots.projectRoot), { recursive: true, force: true }));
  let calls = 0;
  const result = await runCompile({
    ...roots,
    caseId: "case-alpha",
    executableResolver: async (name) => name === "xelatex" ? "/tools/xelatex" : undefined,
    commandRunner: async (executable, args, options) => {
      calls += 1;
      if (calls === 3) await writeFile(path.join(options.cwd, "main.pdf"), "%PDF-fixture\n");
      return { executable, args, exitCode: 0, stdout: `pass ${calls}\n`, stderr: "", timedOut: false };
    },
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.manifest.engine, "xelatex");
  assert.equal(calls, 3);
});

test("compile falls back when latexmk starts but fails", async (t) => {
  const roots = await fixture();
  t.after(() => rm(path.dirname(roots.projectRoot), { recursive: true, force: true }));
  let xelatexCalls = 0;
  const result = await runCompile({
    ...roots,
    caseId: "case-alpha",
    executableResolver: async (name) => `/tools/${name}`,
    commandRunner: async (executable, args, options) => {
      if (executable.endsWith("latexmk"))
        return { executable, args, exitCode: 127, stdout: "", stderr: "runscript.tlu failed\n", timedOut: false };
      xelatexCalls += 1;
      if (xelatexCalls === 3) await writeFile(path.join(options.cwd, "main.pdf"), "%PDF-fixture\n");
      return { executable, args, exitCode: 0, stdout: `xelatex ${xelatexCalls}\n`, stderr: "", timedOut: false };
    },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.manifest.engine, "xelatex");
  assert.equal(result.manifest.commands.length, 4);
  assert.equal(result.manifest.commands[0]?.exit_code, 127);
  assert.equal(xelatexCalls, 3);
  assert.match(result.manifest.commands[0]?.stderr ?? "", /runscript\.tlu failed/u);
  assert.match(result.manifest.commands[3]?.stdout ?? "", /xelatex 3/u);
});

test("compile keeps failure, no-PDF, and unavailable-TeX evidence actionable", async (t) => {
  const roots = await fixture();
  t.after(() => rm(path.dirname(roots.projectRoot), { recursive: true, force: true }));
  for (const run of [
    { exitCode: 1, stdout: "", stderr: "! Undefined control sequence.\nl.1 \\bad\n", timedOut: false },
    { exitCode: 0, stdout: "no pdf\n", stderr: "", timedOut: false },
  ] as const) {
    const result = await runCompile({
      ...roots,
      caseId: "case-alpha",
      executableResolver: async (name) => name === "latexmk" ? "/tools/latexmk" : undefined,
      commandRunner: async (executable, args) => ({ executable, args, ...run }),
    });
    assert.equal(result.ok, false);
    assert.ok(result.evidence);
    assert.equal(result.manifest?.status, "failed");
  }
  const unavailable = await runCompile({ ...roots, caseId: "case-alpha", executableResolver: async () => undefined });
  assert.equal(unavailable.ok, false);
  if (!unavailable.ok) assert.equal(unavailable.error.repair, "user");
  assert.ok(unavailable.evidence);
});
