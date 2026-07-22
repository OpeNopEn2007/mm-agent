import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runCompute } from "../../src/tools/compute.js";

async function fixture(): Promise<{ projectRoot: string; cacheRoot: string; workDir: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-agent-compute-"));
  const projectRoot = path.join(root, "project");
  const cacheRoot = path.join(root, "cache");
  const workDir = "attempts/solving/task-01/001/code";
  await mkdir(path.join(projectRoot, "runs", "case-alpha", ...workDir.split("/")), { recursive: true });
  await mkdir(path.dirname(process.platform === "win32"
    ? path.join(cacheRoot, "python", "Scripts", "python.exe")
    : path.join(cacheRoot, "python", "bin", "python")), { recursive: true });
  await writeFile(process.platform === "win32"
    ? path.join(cacheRoot, "python", "Scripts", "python.exe")
    : path.join(cacheRoot, "python", "bin", "python"), "fixture", "utf8");
  await writeFile(path.join(projectRoot, "runs", "case-alpha", ...workDir.split("/"), "solve.py"), "print('fixture')\n", "utf8");
  return { projectRoot, cacheRoot, workDir };
}

test("compute writes hash-addressed success evidence and execution-result", async (t) => {
  const roots = await fixture();
  t.after(() => rm(path.dirname(roots.projectRoot), { recursive: true, force: true }));
  const output = `${roots.workDir}/result.txt`;
  const result = await runCompute({
    ...roots,
    caseId: "case-alpha",
    entryScript: "solve.py",
    inputPaths: [`${roots.workDir}/solve.py`],
    outputPaths: [output],
    now: () => "2026-07-23T00:00:00.000Z",
    commandRunner: async (_executable, _args, options) => {
      await writeFile(path.join(options.cwd, "result.txt"), "42\n", "utf8");
      return { executable: "python", args: [], exitCode: 0, stdout: "42\n", stderr: "", timedOut: false };
    },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.manifest.status, "succeeded");
  assert.equal(result.manifest.stdout, "42\n");
  assert.equal(result.manifest.outputs[0]?.path, output);
  assert.match(result.evidence.path, /evidence\/compute-001-manifest\.json$/u);
  const execution = JSON.parse(await readFile(path.join(roots.projectRoot, "runs", "case-alpha", "attempts", "solving", "task-01", "001", "execution-result.json"), "utf8"));
  assert.deepEqual(execution, result.evidence);
  assert.equal(result.manifest.environment.PYTHONNOUSERSITE, "1");
});

test("compute preserves failure and timeout evidence", async (t) => {
  const roots = await fixture();
  t.after(() => rm(path.dirname(roots.projectRoot), { recursive: true, force: true }));
  for (const [label, run] of [
    ["failure", { exitCode: 7, stdout: "", stderr: "boom\n", timedOut: false }],
    ["timeout", { exitCode: null, stdout: "", stderr: "", timedOut: true }],
  ] as const) {
    const workDir = label === "failure" ? roots.workDir : "attempts/solving/task-01/002/code";
    if (label === "timeout") {
      await mkdir(path.join(roots.projectRoot, "runs", "case-alpha", ...workDir.split("/")), { recursive: true });
      await writeFile(path.join(roots.projectRoot, "runs", "case-alpha", ...workDir.split("/"), "solve.py"), "pass\n");
    }
    const result = await runCompute({
      ...roots,
      caseId: "case-alpha",
      workDir,
      entryScript: "solve.py",
      commandRunner: async (_executable, _args, options) => {
        return { executable: "python", args: [], ...run };
      },
    });
    assert.equal(result.ok, false, label);
    assert.ok(result.evidence, label);
    assert.equal(result.manifest?.status, "failed", label);
    assert.equal(result.manifest?.timed_out, label === "timeout", label);
  }
});

test("compute rejects Case escapes and linked entry scripts before execution", async (t) => {
  const roots = await fixture();
  t.after(() => rm(path.dirname(roots.projectRoot), { recursive: true, force: true }));
  const escaped = await runCompute({ ...roots, caseId: "case-alpha", entryScript: "../solve.py" });
  assert.equal(escaped.ok, false);
  if (!escaped.ok) assert.equal(escaped.error.code, "PATH_ESCAPE");

  const outside = path.join(path.dirname(roots.projectRoot), "outside.py");
  await writeFile(outside, "print('outside')\n");
  try {
    await symlink(outside, path.join(roots.projectRoot, "runs", "case-alpha", ...roots.workDir.split("/"), "linked.py"), "file");
  } catch {
    t.skip("symlink creation is unavailable");
    return;
  }
  const linked = await runCompute({ ...roots, caseId: "case-alpha", entryScript: "linked.py" });
  assert.equal(linked.ok, false);
  if (!linked.ok) assert.equal(linked.error.code, "PATH_ESCAPE");
});
