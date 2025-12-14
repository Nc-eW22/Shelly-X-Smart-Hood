/**
 * ⚡ SPARK_LABS: Shelly X Smart Hood ֎
 * Script C — UI Demo / Mockup Generator
 * =============================================================
 * VERSION: v1.0.2 (mJS-safe)
 * TARGET:  Shelly Gen3 + Shelly X (mJS)
 *
 * DESCRIPTION:
 * Demonstrates the UI contract by cycling through all automation states.
 * - Virtual Components only (no physical outputs)
 * - Avoids "Too many calls in progress" by chaining RPC calls.
 */

// ========================== UTILITY FUNCTIONS ==========================
function log(s) { console.log(s); }

const CONFIG = {
  ui: {
    state_id: 200,   // enum:200
    speed_id: 202,   // number:202  <-- IMPORTANT (Fan speed slider)
    visual_id: 200,  // text:200
    raw_id: 201      // text:201
  },
  interval_ms: 2000
};

function getIcon(val, lowT, highT, stableChar) {
  if (val > highT) return "⏫";
  if (val > lowT) return "🔼";
  if (val < -highT) return "⏬";
  if (val < -lowT) return "🔽";
  return stableChar;
}

function buildVisual(tD, tS, rD, rS) {
  let  rS) {
  let tIcon = getIcon(tS, 0.3, 2.0, "◀️");
  let rIcon = getIcon(rS, 1.0, 5.0, "▶️");
  return "🌡️" + tD.toFixed(1) + tIcon + "|💧" + rD.toFixed(1) + rIcon;
}

function buildRaw(tD, tS, rD, rS) {
  return "T:" + tD.toFixed(1) + "/" + tS.toFixed(1) + " H:" + rD.toFixed(1) + "/" + rS.toFixed(1);
}

// --- SCENARIOS (Enum keys must match enum:200 options exactly) ---
let scenarios = [
  { state: "READY",    spd: 0, tD: 0.5,  tS: 0.0,  rD: -1.2, rS: 0.1,  desc: "Idle" },
  { state: "HEATING",  spd: 1, tD: 2.1,  tS: 0.8,  rD: 4.5,  rS: 1.5,  desc: "Heating Starts" },
  { state: "HEATING",  spd: 3, tD: 6.5,  tS: 2.5,  rD: 12.0, rS: 6.0,  desc: "Fast Rise" },
  { state: "COOKING",  spd: 3, tD: 8.2,  tS: 0.1,  rD: 14.5, rS: 0.2,  desc: "Steady High" },
  { state: "COOKING",  spd: 2, tD: 4.5,  tS: -0.2, rD: 8.0,  rS: -0.5, desc: "Simmer" },
  { state: "COOKING",  spd: 2, tD: 3.8,  tS: -1.2, rD: 4.0,  rS: -2.0, desc: "Burner Off" },
  { state: "VENTING",  spd: 1, tD: 2.5,  tS: -0.8, rD: 1.5,  rS: rD: 1.5,  rS: -1.5, desc: "Venting Active" },
  { state: "VENTING",  spd: 1, tD: 1.2,  tS: -0.1, rD: -0.5, rS: -0.2, desc: "Venting Finish" },
  { state: "MANUAL",   spd: 4, tD: 5.0,  tS: 1.2,  rD: 2.0,  rS: 0.0,  desc: "User Override" },
  { state: "ALARM",    spd: 4, tD: 12.5, tS: 3.0,  rD: -5.0, rS: -8.0, desc: "ALARM Surge" }
];

let currentStep = 0;
let busy = false;

function runMockCycle() {
  if (busy) {
    log("⏳ Skip cycle (previous RPC chain still running)");
    return;
  }
  busy = true;

  let s = scenarios[currentStep];
  log("Step " + (currentStep + 1) + ": " + s.desc + " -> " + s.state);

  // Chain the 4 calls to avoid "Too many calls in progress"
  Shelly.call("Enum.Set", { id: CONFIG.ui.state_id, value: s.state }, function () {

    Shelly.call("Number.Set", { id: CONFIG.ui.speed_id, value: s.spd }, function () {

      Shelly.call("Text.Set", { id: CONFIG.ui.visual_id, value: buildVisual(s.tD, s.tS, s.rD, s.rS) }, function () {

        Shelly.call("Text.Set", { id: CONFIG.ui.raw_id, v value: buildRaw(s.tD, s.tS, s.rD, s.rS) }, function () {
          // done
          currentStep++;
          if (currentStep >= scenarios.length) currentStep = 0;
            busy = false;
        });

      });

    });

  });
}

log("--- ⚡ SPARK_LABS: Smart Hood UI Demo Started ---");
runMockCycle();
Timer.set(CONFIG.interval_ms, true, runMockCycle);
