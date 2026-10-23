#!/usr/bin/env node
/**
 * run_benchmark.mjs — real detection accuracy benchmark for PlotPro.
 *
 * This runner executes the ACTUAL detection pipeline on the fixture images
 * and scores the output against the annotated ground truth. It replaces the
 * previous `evaluateVectorizationAccuracy.js`, which compared two hardcoded
 * arrays and could never fail.
 *
 * Usage:
 *   node run_benchmark.mjs                 # run V2 + legacy, print report
 *   node run_benchmark.mjs --engine=v2     # V2 only
 *   node run_benchmark.mjs --engine=legacy # legacy pipeline only
 *   node run_benchmark.mjs --regenerate    # rebuild the fixtures first
 *   node run_benchmark.mjs --out=report.json
 *
 * Exit code is 0 when the run completed. Accuracy gates are reported but do
 * not fail the process unless --strict is passed.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = path.resolve(__dirname, "..");
const IMAGES_DIR = path.join(__dirname, "images");
const TRUTH_DIR = path.join(__dirname, "ground_truth");
const OUT_DIR = path.join(__dirname, "reports");

const PY_DEPS = [
  "opencv-python",
  "numpy",
  "pillow",
  "rapidocr-onnxruntime",
];

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
};
const has = (name) => args.includes(`--${name}`);

const ENGINE = flag("engine", "all");
const IOU_THRESHOLD = parseFloat(flag("iou", "0.5"));
const OUT_FILE = flag("out", path.join(OUT_DIR, "benchmark.json"));
const STRICT = has("strict");

function run(cmd, cmdArgs, opts = {}) {
  return execFileSync(cmd, cmdArgs, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
    ...opts,
  });
}

function uvRun(scriptPath, scriptArgs) {
  const deps = PY_DEPS.flatMap((d) => ["--with", d]);
  return run("uv", ["run", ...deps, "python", scriptPath, ...scriptArgs]);
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function listFixtures() {
  if (!fs.existsSync(IMAGES_DIR)) return [];
  return fs
    .readdirSync(IMAGES_DIR)
    .filter((f) => f.endsWith(".png"))
    .map((f) => f.replace(/\.png$/, ""))
    .sort();
}

function buildLexicon(truth) {
  return (truth.plots || []).map((p) => p.plotNumber).filter(Boolean);
}

function scoreFixture(name, engine) {
  const imagePath = path.join(IMAGES_DIR, `${name}.png`);
  const truthPath = path.join(TRUTH_DIR, `${name}.json`);
  if (!fs.existsSync(imagePath) || !fs.existsSync(truthPath)) return null;

  const truth = JSON.parse(fs.readFileSync(truthPath, "utf8"));
  const lexicon = buildLexicon(truth);

  let detection = null;
  let durationMs = 0;
  const started = Date.now();

  if (engine === "v2") {
    const lexiconFile = path.join(OUT_DIR, `.lexicon_${name}.json`);
    writeJson(lexiconFile, lexicon);
    const raw = uvRun(path.join(SCRIPTS_DIR, "detect_layout.py"), [
      imagePath,
      "--config",
      JSON.stringify({}),
      "--lexicon-file",
      lexiconFile,
    ]);
    durationMs = Date.now() - started;
    detection = JSON.parse(raw);
    detection.processingTimeMs = durationMs;
  } else {
    const raw = uvRun(path.join(SCRIPTS_DIR, "vectorize_layout.py"), [imagePath]);
    durationMs = Date.now() - started;
    detection = JSON.parse(raw);
    detection.processingTimeMs = durationMs;
  }

  if (!detection || !detection.success) {
    return {
      fixture: name,
      engine,
      error: detection?.error || "DETECTION_FAILED",
    };
  }

  const detectionFile = path.join(OUT_DIR, `.detection_${engine}_${name}.json`);
  writeJson(detectionFile, detection);

  const scoreRaw = run("uv", [
    "run",
    "--with",
    "numpy",
    "python",
    path.join(__dirname, "score_detection.py"),
    "--truth",
    truthPath,
    "--detection",
    detectionFile,
    "--iou-threshold",
    String(IOU_THRESHOLD),
  ]);

  const report = JSON.parse(scoreRaw);
  report.engine = engine;
  report.fixture = name;
  report.processingTimeMs = durationMs;
  return report;
}

function fmtPct(v) {
  return `${(Number(v || 0) * 100).toFixed(1)}%`;
}

function printTable(rows) {
  const header = [
    "fixture",
    "engine",
    "GT",
    "pred",
    "TP",
    "FP",
    "FN",
    "prec",
    "rec",
    "F1",
    "mIoU",
    "lbl",
    "dup",
    "ms",
  ];
  const rowsOut = rows.map((r) => [
    r.fixture || "-",
    r.engine || "-",
    r.groundTruthCount ?? "-",
    r.predictedCount ?? "-",
    r.truePositives ?? "-",
    r.falsePositives ?? "-",
    r.falseNegatives ?? "-",
    fmtPct(r.precision),
    fmtPct(r.recall),
    fmtPct(r.f1),
    r.meanIou != null ? Number(r.meanIou).toFixed(3) : "-",
    fmtPct(r.labelAccuracy),
    Object.keys(r.duplicateLabels || {}).length,
    r.processingTimeMs ?? "-",
  ]);

  const widths = header.map((h, i) =>
    Math.max(h.length, ...rowsOut.map((r) => String(r[i]).length)),
  );
  const line = (cells) =>
    cells.map((c, i) => String(c).padEnd(widths[i])).join("  ");

  console.log("");
  console.log(line(header));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const r of rowsOut) console.log(line(r));
  console.log("");
}

function main() {
  if (has("regenerate")) {
    console.log("[bench] regenerating fixtures...");
    uvRun(path.join(__dirname, "make_fixtures.py"), []);
  }

  const fixtures = listFixtures();
  if (!fixtures.length) {
    console.error(
      "[bench] no fixtures found. Run with --regenerate to build them.",
    );
    process.exit(1);
  }

  const rows = [];
  const engines =
    ENGINE === "all" ? ["v2", "legacy"] : [ENGINE === "legacy" ? "legacy" : "v2"];

  for (const engine of engines) {
    for (const name of fixtures) {
      process.stdout.write(`[bench] ${engine.padEnd(6)} ${name} ... `);
      try {
        const row = scoreFixture(name, engine);
        if (row) {
          rows.push(row);
          console.log(
            `P=${fmtPct(row.precision)} R=${fmtPct(row.recall)} F1=${fmtPct(
              row.f1,
            )} pred=${row.predictedCount} gt=${row.groundTruthCount}`,
          );
        }
      } catch (err) {
        console.log(`ERROR ${err.message}`);
        rows.push({ fixture: name, engine, error: err.message.slice(0, 200) });
      }
    }
  }

  printTable(rows);

  const summary = {
    generatedAt: new Date().toISOString(),
    iouThreshold: IOU_THRESHOLD,
    rows,
  };
  writeJson(OUT_FILE, summary);
  console.log(`[bench] report written to ${OUT_FILE}`);

  const gates = [
    { name: "precision", value: 0.85 },
    { name: "recall", value: 0.80 },
    { name: "labelAccuracy", value: 0.75 },
  ];
  const v2Rows = rows.filter((r) => r.engine === "v2" && !r.error);
  if (v2Rows.length) {
    const avg = (key) =>
      v2Rows.reduce((s, r) => s + Number(r[key] || 0), 0) / v2Rows.length;
    console.log("[bench] V2 averages:");
    for (const g of gates) {
      const v = avg(g.name);
      const ok = v >= g.value;
      console.log(`  ${g.name.padEnd(15)} ${fmtPct(v).padStart(7)}  target ${fmtPct(g.value)}  ${ok ? "PASS" : "BELOW TARGET"}`);
    }
    if (STRICT) {
      const failed = gates.filter((g) => avg(g.name) < g.value);
      if (failed.length) {
        console.error(`[bench] strict mode: ${failed.length} gate(s) below target`);
        process.exit(2);
      }
    }
  }
}

main();
