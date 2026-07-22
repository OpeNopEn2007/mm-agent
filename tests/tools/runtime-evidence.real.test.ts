import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runCompile } from "../../src/tools/compile.js";
import { runCompute } from "../../src/tools/compute.js";

const enabled = process.env.MM_AGENT_REAL_RUNTIME === "1";

async function root(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "mm-agent-real-runtime-"));
  await mkdir(path.join(directory, "runs", "case-alpha", "attempts", "solving", "task-01", "001", "code"), { recursive: true });
  await mkdir(path.join(directory, "runs", "case-alpha", "attempts", "reporting", "001"), { recursive: true });
  return directory;
}

test("real runtime: dedicated Python records success failure and timeout evidence", { skip: !enabled, timeout: 120_000 }, async (t) => {
  const projectRoot = await root();
  t.after(() => rm(projectRoot, { recursive: true, force: true }));
  const code = path.join(projectRoot, "runs", "case-alpha", "attempts", "solving", "task-01", "001", "code");
  await writeFile(path.join(code, "success.py"), "from pathlib import Path\nPath('answer.txt').write_text('42\\n')\nprint('42')\n");
  await writeFile(path.join(code, "failure.py"), "raise RuntimeError('fixture failure')\n");
  await writeFile(path.join(code, "timeout.py"), "import time\ntime.sleep(2)\n");
  const workDir = "attempts/solving/task-01/001/code";
  const success = await runCompute({ projectRoot, caseId: "case-alpha", workDir, entryScript: "success.py", outputPaths: [`${workDir}/answer.txt`] });
  assert.equal(success.ok, true);
  const failed = await runCompute({ projectRoot, caseId: "case-alpha", workDir, entryScript: "failure.py" });
  assert.equal(failed.ok, false);
  assert.equal(failed.manifest?.exit_code, 1);
  const timedOut = await runCompute({ projectRoot, caseId: "case-alpha", workDir, entryScript: "timeout.py", timeoutMs: 25 });
  assert.equal(timedOut.ok, false);
  assert.equal(timedOut.manifest?.timed_out, true);
});

test("real runtime: latexmk records successful and failed XeLaTeX evidence", { skip: !enabled, timeout: 120_000 }, async (t) => {
  const projectRoot = await root();
  t.after(() => rm(projectRoot, { recursive: true, force: true }));
  const report = path.join(projectRoot, "runs", "case-alpha", "attempts", "reporting", "001");
  await writeFile(path.join(report, "main.tex"), "\\documentclass{article}\n\\begin{document}runtime\\end{document}\n");
  const success = await runCompile({ projectRoot, caseId: "case-alpha", workDir: "attempts/reporting/001" });
  assert.equal(success.ok, true);
  if (success.ok) assert.equal(success.manifest.engine, "latexmk");
  await writeFile(path.join(report, "main.tex"), "\\documentclass{article}\n\\begin{document}\\unknowncommand\\end{document}\n");
  const failed = await runCompile({ projectRoot, caseId: "case-alpha", workDir: "attempts/reporting/001" });
  assert.equal(failed.ok, false);
  assert.equal(failed.manifest?.status, "failed");
  assert.ok((failed.manifest?.errors.length ?? 0) > 0);
});
