/**
 * ⚡ SPARK_LABS: Shelly X Smart Hood ֎
 * Script A — The Controller
 * =============================================================
 * VERSION: v1.0.0 (Stable Release)
 * TARGET:  Shelly Gen3 + Shelly X (mJS)
 *
 * DESCRIPTION:
 * The main automation engine. Transforms a standard range hood into a 
 * smart, differential-climate exhaust system using local sensors.
 *
 * CORE FUNCTIONS:
 * 1. Differential Sensing (Hood vs Room)
 * 2. Slope/Rate-of-Change Detection
 * 3. Intelligent State Machine (Cooking, Venting, Alarm)
 * 4. Hardware Abstraction & Safety Logic
 */

const CONFIG = {
    // ========================================================
    // HARDWARE MAPPING
    // ========================================================
    devices: {
        outputs: { s1: 0, s2: 1, s3: 2, s4: 3 },
        sensors_hood: { temperature: 100, humidity: 100 },
        sensors_room_ble: { temperature: 202, humidity: 201 },
        remote_uni: { ip: "192.168.4.235", spare_switch: 0, light_switch: 1 }
    },

    // =============================================================
    // VIRTUAL INTERFACE (Shelly App Components)
    // ========================================================
    ui: {
        status_id: 200, // Enum: Status display
        visual_id: 200, // Text: Visual icons
        raw_id: 201,    // Text: Debug data
        slider_id: 202  // Number: Manual speed slider
    },

    // ========================================================
    // CONTROL PARAMETERS
    // ========================================================
    manual: {
        timeout_min: 5
    },

    speeds: { off: 0, low: 1, med: 2, high: 3, turbo: 4, start_on: 1 },

    timing: {
        win: { sample_s: 30, short_s: 120, long_s: 300 },
        ema_alpha: 0.35,
        double_press_ms: 1500,
    },

    // ========================================================
    // AUTOMATION LOGIC
    // ========================================================
    thresholds: {
        on_low: {
            temp_slope_Cpm: 0.7,
            temp_diff_C: 3.8,
            rh_slope_PCTpm: 1.5,
            rh_diff_PCT: 12.0
        },

        up_1_to_2: { temp_slope_Cpm: 0.7, temp_diff_C: 4.5, rh_slope_PCTpm: 1.5, rh_diff_PCT: 12.0 },

        up_2_to_3: { temp_slope_Cpm: 0.9, temp_diff_C: 4.0, long_temp_increase_C: 3.0 },

        down: {
            stable_s: 150,
            from3: { temp_slope_max_Cpm: 0.2, temp_diff_max_C: 3.5 },
            from2: { temp_slope_max_Cpm: 0.1, temp_diff_max_C: 5.0, rh_diff_max_PCT: 2.0 }
        },

        lockout_s: 90,

        cooldown: {
            override_trigger: { temp_slope_Cpm: 0.8, rh_slope_PCTpm: 1.8 },
            heavy_entry_criteria: { temp_diff_C: 4.0, rh_diff_PCT: 3.0 },
            med_hold_s: 180,
            low_exit: {
                temp_diff_max_C: 2.2,
                rh_diff_max_PCT: 4.0,
                early_sec: 180,
                early_temp_slope_max_Cpm: -0.5,
                early_rh_abs_slope_max_PCTpm: 0.5
            },
            hard_cap_min: 20
        }
    },

    // ========================================================
    // SAFETY ALARMS
    // ========================================================
    alarm: {
        forgotten_boil: { temp_diff_C: 8.0, temp_slope_long_Cpm: 0.5, rh_slope_long_max_PCTpm: -0.3 },
        burning_sauce: { temp_diff_C: 12.0, rh_diff_max_PCT: 1.5, temp_slope_long_Cpm: 0.25 },
        arm_after_s: 120,
        rearm_delay_s: 600,
    }
};

// ========================== UTILITY FUNCTIONS ==========================
function nowS() { return Shelly.getComponentStatus("sys").unixtime; }
function log(msg) { console.log(msg); }
function tf(x, n) { return (typeof x === "number") ? x.toFixed(n) : "na"; }

// ========================== GLOBAL STATE MANAGEMENT ==========================
let st = {
    speed: 0, lastChange: 0, lastOn: 0,
    cooldown: false, cdStart: 0, cdType: "light",
    T_in: null, RH_in: null, T_room: null, RH_room: null,
    T_inE: null, RH_inE: null, T_roomE: null, RH_roomE: null,
    hist: [], lastRoomTs: 0,
    manual_override: false, manual_start_ts: 0,
    lastPollStart: 0
};

let alarm = { active: false, kind: "", since: 0, lastNotify: 0, lastCleared: 0 };
let lightIsOn = false;
let isBusy = false;
let logCounter = 0;

let TIMERS = {
    save_state: null,
    turn_off_sequence: null,
    ui_delay: null,
    light_delay: null
};

// ========================== DATA PERSISTENCE ==========================
function saveState() {
    if (TIMERS.save_state) { Timer.clear(TIMERS.save_state); }
    TIMERS.save_state = Timer.set(2000, false, function () {
        TIMERS.save_state = null;
        let data = { ovr: st.manual_override, mts: st.manual_start_ts, cd: st.cooldown, cts: st.cdStart, typ: st.cdType };
        Script.storage.setItem("spark_state", JSON.stringify(data));
    });
}

function loadState() {
    let data = Script.storage.getItem("spark_state");
    if (data) {
        try {
            let o = JSON.parse(data);
            if (nowS() - o.mts < 3600) {
                st.manual_override = o.ovr; st.manual_start_ts = o.mts; st.cooldown = o.cd; st.cdStart = o.cts; st.cdType = o.typ;
                log("[SYSTEM] State restored from local storage.");
            }
        } catch (e) { log("[WARN] Corrupt state data found."); }
    }
}

// ========================== HARDWARE CONTROL LAYER ==========================
function speedLabel(v) { return ["Off", "Low", "Med", "High", "Turbo"][v] || "Unknown"; }

function pulseOut(id) {
    Shelly.call("Switch.Set", { id: id, on: true });
}

function pressSpeedLine(sp) {
    const O = CONFIG.devices.outputs; const S = CONFIG.speeds;
    if (sp === S.low) pulseOut(O.s1);
    else if (sp === S.med) pulseOut(O.s2);
    else if (sp === S.high) pulseOut(O.s3);
    else if (sp === S.turbo) pulseOut(O.s4);
}

function uniSet(id, on) {
    if (id == null) return;
    let url = "http://" + CONFIG.devices.remote_uni.ip + "/rpc/Switch.Set?id=" + id + "&on=" + on;
    Shelly.call("HTTP.GET", { url: url }, function (res, err, msg) {
        if (err) log("[WARN] Remote command failed: " + err);
    });
}

function lightEnsure(shouldBeOn) {
    if (shouldBeOn === lightIsOn) return;
    lightIsOn = shouldBeOn;
    let url = "http://" + CONFIG.devices.remote_uni.ip + "/rpc/Switch.Set?id=" + CONFIG.devices.remote_uni.light_switch + "&on=true";
    Shelly.call("HTTP.GET", { url: url }, function (res, err, msg) {
        if (!err) log("Light Toggled -> " + (shouldBeOn ? "ON" : "OFF"));
    });
}

// ========================== STATUS & MANUAL OVERRIDE ==========================
Shelly.addStatusHandler(function (status) {
    if (!status) return;
    if (status.component === "number:" + CONFIG.ui.slider_id) {
        if (typeof status.delta === 'undefined' || typeof status.delta.value === 'undefined') return;
        let newSpeed = status.delta.value;
        if (newSpeed === st.speed) return;

        st.cooldown = false;

        if (newSpeed === 0) {
            log("[MANUAL] User initiated Stop.");
            st.manual_override = false;
            setSpeed(0, "manual_stop");
        } else {
            log("[MANUAL] User selected Speed: " + newSpeed);
            st.manual_override = true;
            st.manual_start_ts = nowS();
            setSpeed(newSpeed, "manual_slider");
        }
        saveState();
    }
});

// ========================== DASHBOARD RENDERING ==========================
function getIcon(val, lowT, highT, stableChar) {
    if (val > highT) return "⏫";
    if (valal > lowT) return "🔼";
    if (val < -highT) return "⏬";
    if (val < -lowT) return "🔽";
    return stableChar;
}

function updateDash(tempD, rhD, tSlope, rSlope) {
    let tIcon = getIcon(tSlope, 0.3, 2.0, "◀️");
    let rIcon = getIcon(rSlope, 1.0, 5.0, "▶️");
    let visualStr = "🌡️" + tempD.toFixed(1) + tIcon + "|💧" + rhD.toFixed(1) + rIcon;
    Shelly.call("Text.Set", { id: CONFIG.ui.visual_id, value: visualStr });

    if (TIMERS.ui_delay) Timer.clear(TIMERS.ui_delay);
    TIMERS.ui_delay = Timer.set(50, false, function () {
        TIMERS.ui_delay = null;
        let rawStr = "T:" + tempD.toFixed(1) + "/" + tSlope.toFixed(1) + " H:" + rhD.toFixed(1) + "/" + rSlope.toFixed(1);
        Shelly.call("Text.Set", { id: CONFIG.ui.raw_id, value: rawStr });
    });
}

function updateStatus() {
    let val = "READY";
    if (st.speed > 0) {
        if (alarm.active) val = "ALARM";
        else if (st.manual_override) val = "MANUAL";
        else if (st.cooldown) val = "VENTING";
        else if (st.speed === 4) val = "HEATING";
        val = "HEATING"; 
    else if (slope("Tin", 60) > 0.5) val = "HEATING";
        else val = "COOKING";
    }
    Shelly.call("Enum.Set", { id: CONFIG.ui.status_id, value: val });
}

function syncControls(currentSpeed) {
    Shelly.call("Number.Set", { id: CONFIG.ui.slider_id, value: currentSpeed });
}

// ========================== ENGINE: SPEED CONTROL ==========================
function setSpeed(target, reason, value) {
    target = Math.max(0, Math.min(4, target));

    if (TIMERS.turn_off_sequence) {
        Timer.clear(TIMERS.turn_off_sequence);
        TIMERS.turn_off_sequence = null;
    }

    if (target === st.speed && reason !== "manual_stop") return;

    let oldSpeed = st.speed;
    let reason_text = (reason || "unknown") + (value ? " (" + value.toFixed(2) + ")" : "");
    log("[SPEED] -> " + speedLabel(target) + " (" + reason_text + ")");

    st.speed = target;
    st.lastChange = nowS();
    if (target > 0) st.lastOn = st.lastChange;

    if (target > 0) {
        pressSpeedLine(target);
        if (TIMERS.light_delay) Timer.clear(TIMERS.light_delay);
        TIMERS.light_delay = Timer.set(600, false, function () {
            TIMERS.light_delay = null;
            lightEnsure(true);
        });
    } else {
        if (oldSpeed === CONFIG.speeds.low) {
            log("[SPEED] Low -> Off (Single Pulse)");
            pressSpeedLine(1);
            lightEnsure(false);
        } else {
            log("[SPEED] " + speedLabel(oldSpeed) + " -> Off (Double Pulse)");
            pressSpeedLine(1);
            TIMERS.turn_off_sequence = Timer.set(CONFIG.timing.double_press_ms, false, function () {
                TIMERS.turn_off_sequence = null;
                log("[SPEED] Pulse 2 (-> Off)");
                pressSpeedLine(1);
                lightEnsure(false);
            });
        }
    }

    if (TIMERS.ui_delay) Timer.clear(TIMERS.ui_delay);
    TIMERS.ui_delay = Timer.set(800, false, function () {
        TIMERS.ui_delay = null;
        updateStatus();
        if (reason !== "manual_slider") {
            syncControls(target);
        }
    });
}

function ema(prev, x) { return (prev == null) ? x : (CONFIG.timing.ema_alpha * x + (1 - CONFIG.timing.ema_alpha) * prev); }

function pushSample() {
    var ts = nowS(); st.T_inE = ema(st.T_inE, st.T_in); st.RH_inE = ema(st.RH_inE, st.RH_in);
    st.T_roomE = ema(st.T_roomE, st.T_room); st.RH_roomE = ema(st.RH_roomE, st.RH_room);
    st.hist.push({ ts: ts, Tin: st.T_inE, Rin: st.RH_inE, Tr: st.T_roomE, Rr: st.RH_roomE });
    while (st.hist.length > 20) { st.hist = st.hist.slice(1); }
}

function slope(field, sec) {
    if (st.hist.length < 2) return 0;
    var end = st.hist[st.hist.length - 1], start = end;
    for (var i = st.hist.length - 2; i >= 0; i--) {
        if (end.ts - st.hist[i].ts >= sec) { start = st.hist[i]; break; } start = st.hist[i];
    }
    var dtm = (end.ts - start.ts) / 60; if (dtm <= 0) return 0;
    var vEnd = end[field], vStart = start[field]; if (vEnd == null || vStart == null) return 0;
    return (vEnd - vStart) / dtm;
}

// ========================== ENGINE: ALARMS ==========================
function alarmRaise(kind) {
    const A = CONFIG.alarm; const S = CONFIG.speeds;
    if (alarm.active || (nowS() - alarm.lastCleared < A.rearm_delay_s)) return;
    alarm.active = true; alarm.kind = kind; alarm.since = nowS();
    log("[ALARM] TRIGGERED: " + kind);

    setSpeed(S.turbo, "alarm_" + kind);
    Timer.set(1500, false, function () {
        uniSet(CONFIG.devices.remote_uni.spare_switch, true);
    });
}

function alarmClear(reason) {
    if (!alarm.active) return;
    alarm.active = false; alarm.kind = ""; alarm.lastCleared = nowS(); log("[ALARM] CLEARED");

    setSpeed(CONFIG.speeds.high, "alarm_cleared");
    Timer.set(1500, false, function () {
        uniSet(CONFIG.devices.remote_uni.spare_switch, false);
    });
}

// ========================== ENGINE: COOLDOWN STATE ==========================
function beginCooldown(Tdiff, RHdiff) {
    if (st.cooldown) return;
    st.cooldown = true; st.cdStart = nowS();
    const C = CONFIG.thresholds.cooldown; const S = CONFIG.speeds;
    var heavy = (Tdiff >= C.heavy_entry_criteria.temp_diff_C) || (RHdiff >= C.heavy_entry_criteria.rh_diff_PCT);
    log("[STATE] Cooldown Mode (" + (heavy ? "Heavy" : "Light") + ")");
    if (heavy) { st.cdType = "heavy"; setSpeed(S.med, "cooldown_heavy"); }
    else { st.cdType = "light"; setSpeed(S.low, "cooldown_light"); }
}

function handleCooldown(Tdiff, RHdiff) {
    var elapsed = nowS() - st.cdStart; const C = CONFIG.thresholds.cooldown; const S = CONFIG.speeds;

    if (st.speed === S.med && elapsed >= C.med_hold_s) {
        setSpeed(S.low, "cooldown_drop_low");
        return;
    }

    if (st.speed === S.low) {
        var temp_ok = (Math.abs(Tdiff) <= C.low_exit.temp_diff_max_C);
        var rh_ok = (Math.abs(RHdiff) <= C.low_exit.rh_diff_max_PCT);
        var early_t = slope("Tin", C.low_exit.early_sec); var early_r = slope("Rin", C.low_exit.early_sec);
        var early_ok = (early_t <= C.low_exit.early_temp_slope_max_Cpm) && (Math.abs(early_r) <= C.low_exit.early_rh_abs_slope_max_PCTpm);
        var hardcap = (elapsed >= C.hard_cap_min * 60);

        if ((temp_ok && rh_ok && (nowS() - st.lastChange) >= CONFIG.thresholds.down.stable_s) || early_ok || hardcap) {
            setSpeed(S.off, hardcap ? "hardcap" : (early_ok ? "early" : "exit"));
            st.cooldown = false;
        }
    }
}

// ========================== ENGINE: MAIN DECISION LOOP ==========================
function maybeControl() {
    pushSample();
    const C = CONFIG.thresholds; const S = CONFIG.speeds; const A = CONFIG.alarm;
    let tempSlope = slope("Tin", CONFIG.timing.win.short_s);
    let rhSlope = slope("Rin", CONFIG.timing.win.short_s);
    let tempDiff = st.T_inE - st.T_roomE;
    let rhDiff = st.RH_inE - st.RH_roomE;

    log("[POLL] T_Delta: " + tf(tempDiff, 2) + " Slope: " + tf(tempSlope, 2) + " | RH_Delta: " + tf(rhDiff, 2) + " Slope: " + tf(rhSlope, 2));

    if (TIMERS.ui_delay) Timer.clear(TIMERS.ui_delay);
    TIMERS.ui_delay = Timer.set(100, false, function () {
        TIMERS.ui_delay = null;
        updateDash(tempDiff, rhDiff, tempSlope, rhSlope);
    });

    if (st.manual_override) {
        let elapsed_min = (nowS() - st.manual_start_ts) / 60;
        if (elapsed_min >= CONFIG.manual.timeout_min) {
            log("[MANUAL] Timer expired. Resuming Auto.");
            st.manual_override = false;
            saveState();
            updateStatus();
        } else { return; }
    }

    if (nowS() - st.lastChange < C.lockout_s) return;

    if (st.cooldown && (tempSlope > C.cooldown.override_trigger.temp_slope_Cpm || rhSlope > C.cooldown.override_trigger.rh_slope_PCTpm)) {
        log("[STATE] Cooldown interrupted (New activity detected).");
        st.cooldown = false;
        updateStatus();
    }

    let heatOn = (tempDiff > C.on_low.temp_diff_C || tempSlope > 0.05);
    if (!heatOn && st.speed > 0 && !st.cooldown) { beginCooldown(tempDiff, rhDiff); }

    let armed = (st.lastOn > 0) && (nowS() - st.lastOn >= A.arm_after_s);
    if (!alarm.active && armed) {
        let tempSlopeLong = slope("Tin", CONFIG.timing.win.long_s);
        let rhSlopeLong = slope("Rin", CONFIG.timing.win.long_s);
        if ((tempDiff >= A.forgotten_boil.temp_diff_C) && (tempSlopeLong >= A.forgotten_boil.temp_slope_long_Cpm) && (rhSlopeLong <= A.forgotten_boil.rh_slope_long_max_PCTpm)) { alarmRaise("forgotten_boil"); }
        else if ((tempDiff >= A.burning_sauce.temp_diff_C) && (Math.abs(rhDiff) <= A.burning_sauce.rh_diff_max_PCT) && (tempSlopeLong >= A.burning_sauce.temp_slope_long_Cpm)) { alarmRaise("burning_sauce"); }
    }
    if (alarm.active) {
        let tempSlopeLong = slope("Tin", CONFIG.timing.win.long_s);
        let rhDiffNow = st.RH_inE - st.RH_roomE;
        let cooling = (tempSlopeLong <= -0.1), rhRecover = (rhSlope >= 0.0) || (Math.abs(rhDiffNow) <= 0.5);
        if (cooling || rhRecover) alarmClear(cooling ? "cooling" : "rh_recover");
    }
    if (st.cooldown) { handleCooldown(tempDiff, rhDiff); return; }

    if (st.speed === S.off) {
        if (tempSlope >= C.on_low.temp_slope_Cpm) { setSpeed(S.start_on, "on_temp_slope", tempSlope); return; }
        if (rhSlope >= C.on_low.rh_slope_PCTpm) { setSpeed(S.start_on, "on_rh_slope", rhSlope); return; }
        if (st.hist.length > 1) {
            if (tempDiff >= C.on_low.temp_diff_C && tempSlope > 0.15) { setSpeed(S.start_on, "on_temp_diff_and_slope", tempDiff); return; }
            if (rhDiff >= C.on_low.rh_diff_PCT && rhSlope > 0.15) { setSpeed(S.start_on, "on_rh_diff_and_slope", rhDiff); return; }
        }
    } else {
        let stable = (nowS() - st.lastChange) >= C.down.stable_s;
        if (stable) {
            if (st.speed === S.high && (tempSlope <= C.down.from3.temp_slope_max_Cpm || tempDiff <= C.down.from3.temp_diff_max_C)) { setSpeed(S.med, "down_3_to_2", tempSlope); return; }
            if (st.speed === S.med && (tempSlope <= C.down.from2.temp_slope_max_Cpm && tempDiff <= C.down.from2.temp_diff_max_C && rhDiff <= C.down.from2.rh_diff_max_PCT)) { setSpeed(S.low, "down_2_to_1", tempSlope); return; }
        }
        let lidLikely = (tempSlope >= 0.2) && (rhSlope <= -0.8);
        if (st.speed === S.low && (tempSlope >= C.up_1_to_2.temp_slope_Cpm || tempDiff >= C.up_1_to_2.temp_diff_C || rhSlope >= C.up_1_to_2.rh_slope_PCTpm || rhDiff >= C.up_1_to_2.rh_diff_PCT)) { setSpeed(S.med, "up_1_to_2", tempSlope); return; }
        if (st.speed === S.med && !lidLikely) {
            let tempSlopeLong = slope("Tin", CONFIG.timing.win.long_s);
            if (((tempSlope >= C.up_2_to_3.temp_slope_Cpm && tempDiff >= C.up_2_to_3.temp_diff_C) || ((tempSlopeLong * 5) >= C.up_2_to_3.long_temp_increase_C))) {
                setSpeed(S.high, "up_2_to_3", tempSlope); return;
            }
        }
    }
}

// ========================== DATA ACQUISITION ==========================
function getSensorData() {
    if (isBusy) {
        if (nowS() - st.lastPollStart > 45) {
            log("[WARN] Watchdog: Poll stuck. Resetting.");
            isBusy = false;
        } else {
            return;
        }
    }

    isBusy = true;
    st.lastPollStart = nowS();

    Shelly.call("Temperature.GetStatus", { id: CONFIG.devices.sensors_hood.temperature }, function (res, err) {
        if (err) { isBusy = false; return; }
        st.T_in = (res && typeof res.tC === "number") ? res.tC : null;

        Shelly.call("Humidity.GetStatus", { id: CONFIG.devices.sensors_hood.humidity }, function (res, err) {
            if (err) { isBusy = false; return; }
            st.RH_in = (res && typeof res.rh === "number") ? res.rh : null;

            Shelly.call("BTHomeSensor.GetStatus", { id: CONFIG.devices.sensors_room_ble.temperature }, function (res, err) {
                if (err) { isBusy = false; return; }
                st.T_room = (res && typeof res.value === "number") ? res.value : null;

                Shelly.call("BTHomeSensor.GetStatus", { id: CONFIG.devices.sensors_room_ble.humidity }, function (res, err) {
                    if (err) { isBusy = false; return; }
                    st.RH_room = (res && typeof res.value === "number") ? res.value : null;

                    if (typeof st.T_room === "number") st.lastRoomTs = nowS();

                    logCounter++;
                    if (logCounter >= 2) {
                        logCurrentState();
                        logCounter = 0;
                    }

                    if (st.T_in !== null && st.RH_in !== null && st.T_room !== null && st.RH_room !== null) {
                        maybeControl();
                    } else { log("[WARN] Sensor data incomplete."); }
                    isBusy = false;
                });
            });
        });
    });
}

function logCurrentState() {
    if (st.speed === 0 && !st.cooldown) {
        log("[STATE] Standby. Monitoring...");
    } else {
        let line = "[STATE] Spd: " + speedLabel(st.speed);
        if (st.cooldown) {
            let total = (st.cdType === "heavy" ? CONFIG.thresholds.cooldown.med_hold_s : 0) + CONFIG.thresholds.down.stable_s + 60;
            let rem = Math.round(total - (nowS() - st.cdStart));
            line += " | CD: " + st.cdType + (rem > 0 ? " (~" + rem + "s)" : "");
        }
        if (st.manual_override) line += " | MANUAL";
        log(line);
    }
}

// ========================== BOOTSTRAP ==========================
(function boot() {
    st.speed = 0;
    log("--- SPARK Hood Automator v1.0.0 (Stable) Started ---");
    loadState();
    updateStatus();
    syncControls(0);

    log("[BOOT] SYNC: Pulse Med");
    pressSpeedLine(CONFIG.speeds.med);

    Timer.set(CONFIG.timing.double_press_ms + 200, false, function () {
        log("[BOOT] SYNC: Pulse Low");
        pressSpeedLine(CONFIG.speeds.low);

        Timer.set(CONFIG.timing.double_press_ms + 200, false, function () {
            log("[BOOT] SYNC: Pulse Off (Final)");
            pressSpeedLine(CONFIG.speeds.low);
            lightEnsure(false);
            log("[BOOT] Sync Complete. Starting Polling...");

            Timer.set(CONFIG.timing.win.sample_s * 1000, true, getSensorData);
        });
    });
})();
