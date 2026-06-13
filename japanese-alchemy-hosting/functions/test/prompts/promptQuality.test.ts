/**
 * Tier 2 prompt quality runner (U7) — REAL LLM calls, opt-in.
 *
 * Excluded from the default `npm test` (see jest.config.js testPathIgnorePatterns).
 * Run via:  npm run test:prompt-quality
 *           PROMPT_PROVIDER=zai PROMPT_VERSION=v1 npm run test:prompt-quality
 *           npm run test:prompt-quality -- --provider=zai --prompt-version=v1
 *
 * Requires functions/secrets.json (the JAPANESE_ALCHEMY_CONFIG payload). The config
 * module is mocked so createLlmService() reads local secrets + honors --provider
 * (KTD5: calls the service layer directly, not the HTTP handlers). Each fixture is
 * run against every prompt version it targets; all checks from checks.ts run with
 * partial-match tolerance (R28). Output is a per-example report + overall score and
 * a v1/v2 comparison.
 */
import * as fs from "fs";
import * as path from "path";
import { describe, it, beforeAll, expect } from "@jest/globals";

const SECRETS_PATH = path.resolve(__dirname, "../../secrets.json");
const HAS_SECRETS = fs.existsSync(SECRETS_PATH);

if (process.env.PROMPT_QUALITY_TEST && !HAS_SECRETS) {
  // eslint-disable-next-line no-console
  console.warn(`[Tier 2] PROMPT_QUALITY_TEST set but ${SECRETS_PATH} not found — skipping.`);
}

// Mock config so createLlmService() resolves real credentials from local secrets.json
// and the active provider follows --provider / PROMPT_PROVIDER.
jest.mock("../../src/config", () => {
  const fsp = require("fs");
  const pathp = require("path");
  const secretsPath = pathp.resolve(__dirname, "../../secrets.json");
  const config = fsp.existsSync(secretsPath) ? JSON.parse(fsp.readFileSync(secretsPath, "utf8")) : {};
  const provider = process.env.PROMPT_PROVIDER || "gemini";
  return {
    configSecret: { name: "JAPANESE_ALCHEMY_CONFIG", value: () => config },
    LLM_PROVIDER: provider,
    getConfig: () => config,
  };
});

import { createLlmService } from "../../src/services/llmService";
import { SYSTEM_PROMPT_V1 } from "../../src/models/systemPromptV1";
import { SYSTEM_PROMPT_V2 } from "../../src/models/systemPromptV2";
import {
  loadFixtures,
  runChecks,
  parseAnalysis,
  requiredPassRate,
  PromptVersion,
  CheckOutcome,
} from "./checks";

// --- flag resolution: --flag=value argv, then env, then default ---
function resolveFlag(flag: string, env: string, fallback: string): string {
  const fromArgv = process.argv.find((a) => a.startsWith(`--${flag}=`));
  if (fromArgv) return fromArgv.slice(`--${flag}=`.length);
  return process.env[env] || fallback;
}
const PROVIDER = resolveFlag("provider", "PROMPT_PROVIDER", "gemini");
const VERSION_ARG = resolveFlag("prompt-version", "PROMPT_VERSION", "both");
const VERSIONS: PromptVersion[] =
  VERSION_ARG === "v1" ? ["v1"] : VERSION_ARG === "v2" ? ["v2"] : ["v1", "v2"];

const ENABLED = !!process.env.PROMPT_QUALITY_TEST && HAS_SECRETS;
const describeMaybe = ENABLED ? describe : (describe.skip as typeof describe);

const fixtures = loadFixtures();

interface RunResult {
  fixture: string;
  version: PromptVersion;
  outcomes: CheckOutcome[];
  rate: number;
  error?: string;
}
const results: RunResult[] = [];

describeMaybe(`Tier 2 prompt quality (provider=${PROVIDER}, versions=${VERSIONS.join(",")})`, () => {
  beforeAll(() => {
    // eslint-disable-next-line no-console
    console.log(
      `\n[Tier 2] provider=${PROVIDER} versions=${VERSIONS.join(",")} fixtures=${fixtures.length} secrets=${HAS_SECRETS}\n`
    );
  });

  for (const fixture of fixtures) {
    for (const version of VERSIONS) {
      if (!fixture.targetVersions.includes(version)) continue;

      it(`${fixture.id} [${version}]`, async () => {
        const systemPrompt = version === "v1" ? SYSTEM_PROMPT_V1 : SYSTEM_PROMPT_V2;
        try {
          const llm = createLlmService();
          const res = await llm.chatCompletion(systemPrompt, fixture.input);
          const response = (res.data as string) ?? "";
          const parsed = parseAnalysis(response);

          const outcomes = runChecks(response, fixture, version);
          const rate = requiredPassRate(outcomes);
          results.push({ fixture: fixture.id, version, outcomes, rate });

          // eslint-disable-next-line no-console
          console.log(`[${fixture.id} ${version}] required pass: ${(rate * 100).toFixed(0)}% | words=${parsed.words.length} grammars=${parsed.grammars.length}`);
          for (const o of outcomes) {
            // eslint-disable-next-line no-console
            console.log(`   ${o.pass ? "PASS" : "FAIL"} ${o.required ? "(req)" : "(opt)"} ${o.name} — ${o.detail}`);
          }
          // Minimal sanity gate: the model responded in the expected shape.
          expect(response.trim().length).toBeGreaterThan(0);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          results.push({ fixture: fixture.id, version, outcomes: [], rate: 0, error: message });
          // eslint-disable-next-line no-console
          console.log(`[${fixture.id} ${version}] ERROR: ${message}`);
        }
      }, 120000);
    }
  }

  it("summary report", () => {
    const completed = results.filter((r) => !r.error);
    const errored = results.filter((r) => r.error);
    const avg = completed.length ? completed.reduce((s, r) => s + r.rate, 0) / completed.length : 0;

    const lines: string[] = ["", "=== Tier 2 summary ==="];
    lines.push(`Runs: ${results.length} (completed ${completed.length}, errored ${errored.length})`);
    lines.push(`Overall required pass rate: ${(avg * 100).toFixed(0)}%`);
    for (const v of VERSIONS) {
      const rs = completed.filter((r) => r.version === v);
      const a = rs.length ? rs.reduce((s, r) => s + r.rate, 0) / rs.length : 0;
      lines.push(`  ${v}: ${(a * 100).toFixed(0)}% over ${rs.length} fixtures`);
    }
    if (errored.length) lines.push(`Errored: ${errored.map((r) => `${r.fixture}[${r.version}]`).join(", ")}`);
    // eslint-disable-next-line no-console
    console.log(lines.join("\n") + "\n");

    // Sanity gate: at least one run produced a parseable, check-passing response.
    expect(completed.some((r) => r.rate > 0)).toBe(true);
  }, 30000);
});
