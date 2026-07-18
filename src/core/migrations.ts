import { readJson, resolveInsideCase } from "./paths.js";
import {
  CaseFileSchema,
  CaseProtocolError,
  CaseStateSchema,
  InputManifestSchema,
} from "./schema.js";

export async function migrateCase(
  caseRoot: string,
  fromVersion: number,
  toVersion: number,
): Promise<void> {
  if (fromVersion === 1 && toVersion === 1) {
    await Promise.all([
      resolveInsideCase(caseRoot, "case.json", "existing").then((target) =>
        readJson(target, CaseFileSchema),
      ),
      resolveInsideCase(caseRoot, "state.json", "existing").then((target) =>
        readJson(target, CaseStateSchema),
      ),
      resolveInsideCase(caseRoot, "input/manifest.json", "existing").then(
        (target) => readJson(target, InputManifestSchema),
      ),
    ]);
    return;
  }
  throw new CaseProtocolError(
    "MIGRATION_UNSUPPORTED",
    `no migration ${fromVersion} -> ${toVersion}`,
  );
}
