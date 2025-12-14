/**
 * ⚡ SPARK_LABS: Shelly X Smart Hood ֎
 * Script B — The Installer (UI Generator)
 * =============================================================
 * VERSION: v1.0.2 (mJS-safe)
 * TARGET:  Shelly Gen3 + Shelly X (mJS)
 *
 * DESCRIPTION:
 * Creates the Virtual Components + Group used by the Smart Hood automation.
 * Links them via Group.Set AFTER creation (separate operation).
 *
 * INSTRUCTIONS:
 * 1) RUN this script ONCE.
 * 2) Wait for "✅ INSTALLATION COMPLETE" in the console.
 * 3) STOP and DELETE this script (no longer needed).
 * 4) Refresh Shelly App/WebUI to see the new UI.
 *
 * ⚠️ WARNING:
 * Running twice may create duplicates. Pre-flight check will abort if keys exist.
 */

// ========================================================================
// 🎨 UI CONFIGURATION (MATCHES YOUR CURRENT CONFIG)
// ========================================================================
const CONFIG = {
    GROUP_ID: 201,
    GROUP_NAME: "cooker hood",

    FIXED_KEYS: [
        "text:200",    // Visual    // Visual Data
        "text:201",    // Raw Data
        "number:200",  // Hood temperature (virtual display)
        "number:201",  // Hood humidity (virtual display)
        "number:202",  // Fan speed (virtual slider)
        "enum:200"     // Status
    ],

    OPTIONAL_KEYS: [
        "bthomesensor:201", // Room humidity (paired)
        "bthomesensor:202"  // Room temp (paired)
    ],

    STATUS_ENUM: {
        id: 200,
        name: "Status",
        options: ["READY", "HEATING", "COOKING", "VENTING", "MANUAL", "ALARM"],
        meta: {
            ui: {
                view: "label",
                titles: {
                    "READY": "🛡️",
                    "HEATING": "🔥",
                    "COOKING": "♨️",
                    "VENTING": "🌀",
                    "MANUAL": "🖐️",
                    "ALARM": "🚨"
                },
                icon: null,
                images: {
                    "READY": null,
                    "HEATING": null,
                    "COOKING": null,
                    "VENTING": null,
                    "MANUAL": null,
                    "ALARM": null
                }
            }
        },
        persisted: false,
        default_value: null,
        owner: "", ll,
        owner: "",
        access: "*"
    },

    VISUAL_TEXT: {
        id: 200,
        name: "Visual Data",
        max_len: 255,
        meta: { ui: { view: "label" }, group_id: 201 },
        persisted: false,
        default_value: "---",
        owner: "",
        access: "*"
    },

    RAW_TEXT: {
        id: 201,
        name: "Raw Data",
        max_len: 255,
        meta: { ui: { view: "label" }, group_id: 201 },
        persisted: false,
        default_value: "Debug",
        owner: "",
        access: "*"
    },

    HOOD_TEMP_NUM: {
        id: 200,
        name: "Hood temperature ",
        min: 0,
        max: 100,
        meta: {
            cloud: ["measurement"],
            ui: { icon: "", view: "label", step: 1, unit: "C" }
        },
        persisted: false,
        default_value: 0,
        owner: "",
        access: "*"
    },

    HOOD_RH_NUM: {
        id: 201,
        name: "Hood humidity",
        min: 0,
        max: 100,
        meta: {
            cloud: ["measurement"],
            ui: { icon: "", view: "label", step: 1, unit: "%" }
        },
        persisted: false,
        default_value: 0,
        owner: "",
        access: "*"
    },

    FAN_SPEED_NUM: {
        id: 202,
        name: "Fan speed",
        min: 0,
        max: 4,
        meta: {
            cloud: ["log"],
            ui: { icon: null, view: "slider", step: 1, unit: "֎", webIcon: 0 }
        },
        persisted: false,
        default_value: 0,
        owner: "",
        access: "*"
    }
};

// ========================================================================
// 🧩 mJS-SAFE HELPERS
// ========================================================================
function log(s) { console.log(s); }

function stopScript() {
    Shelly.call("Script.Stop", { id: Shelly.getCurrentScriptId() });
}

function isErr(err) {
    if (err === 0 || err === null || typeof err === "undefined") return false;
    return true;
}

function cloneArr(a) {
    let out = [];
    for (let i = 0; i < a.length; i++) out.push(a[i]);
    return out;
}

function arrToStr(a) {
    let s = "[";
    for (let i = 0; i < a.length; i++) {
        s += (i ? ", " : "") + a[i];
    }
    s += "]";
    return s;
}

// ========================================================================
// ⚙️ QUEUE� QUEUE ENGINE (Sentinel-style)
// ========================================================================
let queue = [];
let groupKeysFinal = cloneArr(CONFIG.FIXED_KEYS);

function add(method, params, logMsg, tag) {
    queue.push({ m: method, p: params, l: logMsg, t: tag || "" });
}

function processQueue() {
    if (queue.length === 0) {
        return discoverOptionalThenLink();
    }

    let task = queue.splice(0, 1)[0];
    if (task.l) log(">> " + task.l);

    Shelly.call(task.m, task.p, function (res, err, msg) {
        if (isErr(err)) {
            let errMsg = (typeof err === "object") ? JSON.stringify(err) : (msg || err);
            log("⚠️ " + task.m + " error: " + errMsg);
        }
        Timer.set(700, false, processQueue);
    });
}

// ========================================================================
// ✅ PRE-FLIGHT CHECK (ABORT IF KEYS EXIST)
// ========================================================================
function preflight(okCb) {
    Shelly.call("Shelly.GetComponents", {}, function (res, err) {
        if    if (isErr(err) || !res || !res.components) {
            log("❌ Pre-flight failed: cannot read components list.");
            stopScript();
            return;
        }

        let has = {};
        for (let i = 0; i < res.components.length; i++) has[res.components[i].key] = true;

        let mustCheck = [];
        for (let i2 = 0; i2 < CONFIG.FIXED_KEYS.length; i2++) mustCheck.push(CONFIG.FIXED_KEYS[i2]);
        mustCheck.push("group:" + CONFIG.GROUP_ID);
        mustCheck.push("enum:200");

        let collisions = [];
        for (let j = 0; j < mustCheck.length; j++) {
            if (has[mustCheck[j]]) collisions.push(mustCheck[j]);
        }

        if (collisions.length > 0) {
            log("------------------------------------------------");
            log("⚠️ ABORTING: Existing components detected (duplicate install risk)");
            log("Found:");
            for (let k = 0; k < collisions.length; k++) log(" - " + collisions[k]);
            log("Delete these first if you want to reinstall.");
            log("------------------------------------------------");
            stopScript()ript();
            return;
        }

        okCb();
    });
}

// ========================================================================
// 🔎 DISCOVER OPTIONAL KEYS → GROUP.SET (SEPARATE OP) → VERIFY
// ========================================================================
function discoverOptionalThenLink() {
    Shelly.call("Shelly.GetComponents", {}, function (res, err) {
        groupKeysFinal = cloneArr(CONFIG.FIXED_KEYS);

        if (!isErr(err) && res && res.components) {
            let has = {};
            for (let i = 0; i < res.components.length; i++) has[res.components[i].key] = true;

            for (let j = 0; j < CONFIG.OPTIONAL_KEYS.length; j++) {
                if (has[CONFIG.OPTIONAL_KEYS[j]]) groupKeysFinal.push(CONFIG.OPTIONAL_KEYS[j]);
            }
        }

        log("🔎 Group keys: " + arrToStr(groupKeysFinal));

        Shelly.call("Group.Set", { id: CONFIG.GROUP_ID, value: groupKeysFinal }, function (res2, err2, msg2) {
            if (isErr(err2)) {
                log("⚠️ Group.Set error: " + (msg2 || JSON.stringify(err2)));
            } else      } else {
                log("✅ Group linked: group:" + CONFIG.GROUP_ID);
    }
      verifyAndFinish();
});
  });
}

function verifyAndFinish() {
    log("------------------------------------------------");
    log("✅ INSTALLATION COMPLETE");
    log("⏳ Verifying configuration in 2 seconds...");

    Timer.set(2000, false, function () {
        Shelly.call("Shelly.GetComponents", {}, function (res, err) {
            if (isErr(err) || !res || !res.components) {
                log("❌ Verify Failed");
                stopScript();
                return;
            }

            let keys = {};
            for (let i = 0; i < res.components.length; i++) keys[res.components[i].key] = true;

            log("📋 CHECKING...");
            log(keys["group:" + CONFIG.GROUP_ID] ? "✅ group:" + CONFIG.GROUP_ID : "⚠️ group missing");
            log(keys["enum:200"] ? "✅ enum:200" : "⚠️ enum:200 missing");
            log(keys["text:200"] ? "✅ text:200" : "⚠️ text:200 missing");
            log(keys["text:201"] ? "✅ text:201" : "⚠️ text:201 missing");
            log(keys["xt:201 missing");
            log(keys["number:200"] ? "✅ number:200" : "⚠️ number:200 missing");
            log(keys["number:201"] ? "✅ number:201" : "⚠️ number:201 missing");
            log(keys["number:202"] ? "✅ number:202" : "⚠️ number:202 missing");

            log("------------------------------------------------");
            log("SUMMARY (fixed IDs used by main script):");
            log('status_id: "enum:200"');
            log('visual_id: "text:200"');
            log('raw_id: "text:201"');
            log('hood_temp_id: "number:200"');
            log('hood_rh_id: "number:201"');
            log('slider_id: "number:202"');
            log('group_id: "group:' + CONFIG.GROUP_ID + '"');
            log("------------------------------------------------");
            log("👉 ACTION: STOP + DELETE this installer script.");
            log("👉 ACTION: Refresh Shelly App/WebUI.");

            stopScript();
        });
    });
}

// ========================================================================
// 🚀 INSTALL SEQUENCE
// ================================================================================================
function install() {
    log("--- ⚡ SPARK_LABS: Smart Hood UI Installer ---");

    add("Virtual.Add", { type: "enum", id: 200, config: CONFIG.STATUS_ENUM }, "Creating Enum:200 (Status)");
    add("Virtual.Add", { type: "text", id: 200, config: CONFIG.VISUAL_TEXT }, "Creating Text:200 (Visual Data)");
    add("Virtual.Add", { type: "text", id: 201, config: CONFIG.RAW_TEXT }, "Creating Text:201 (Raw Data)");
    add("Virtual.Add", { type: "number", id: 200, config: CONFIG.HOOD_TEMP_NUM }, "Creating Number:200 (Hood temperature)");
    add("Virtual.Add", { type: "number", id: 201, config: CONFIG.HOOD_RH_NUM }, "Creating Number:201 (Hood humidity)");
    add("Virtual.Add", { type: "number", id: 202, config: CONFIG.FAN_SPEED_NUM }, "Creating Number:202 (Fan speed)");

    add("Virtual.Add", {
        type: "group",
        id: CONFIG.GROUP_ID,
        config: { name: CONFIG.GROUP_NAME, owner: "", access: "*", meta: { ui: { icon: null } } }
    }, "Creating Group:" + CONFIG.GROUP_ID + " (" + + CONFIG.GROUP_NAME + ")");

    processQueue();
}

preflight(install);
