
# 🍳 Shelly X Smart Hood ֎
**Powered by Shelly X — Advanced Range Hood Automation**

Developed as part of **SPARK_LABS⚡️**  
*Shelly-powered automations and reliable Kontrol*

---

![Shelly X Smart Hood UI](https://github.com/user-attachments/assets/fa5b54aa-c6b1-417b-855c-05ef516fc65e)

---

## Overview

**Shelly X Smart Hood** is an advanced, **Shelly X Gen3–only** range hood automation
project designed to showcase **local Shelly automation using mJS scripting and the
Shelly X platform**.

This project demonstrates how **Shelly Virtual Components**, **RPC-based local
control**, and real-world sensor analysis can be combined into a reliable,
*set-and-forget* appliance automation.

It is a **specific, opinionated reference implementation**, inspired by real
installations and aligned with patterns used in **Shelly repositories** and
**Shelly Academy courses**.

---

## Design Goal

The goal of this project is simple:

**Set it and forget it.**

Once installed and tuned, Shelly X Smart Hood:
- Automatically detects cooking
- Adjusts fan speed based on cooking intensity
- Runs an intelligent cooldown cycle
- Requires no manual interaction during normal use 🍳💨

---

## Core Features

- 🤖 **Fully Automatic (Local Shelly Control)**  
  Cooking is detected by comparing **Shelly hood sensors** with **Shelly room
  sensors**, without relying on fixed timers or cloud services.

- 🧠 **Intelligent Detection Logic**  
  Uses both **difference (Δ)** and **rate-of-change (slope)** analysis to
  distinguish between:
  - sudden steam bursts
  - slow rising heat
  - residual heat from previous cooking

- 💧 **Multi-Stage Cooldown**  
  After cooking ends, the hood continues running at reduced speed to clear
  lingering steam and odors before shutting off automatically.

- 🔄 **Smart Cooldown Override**  
  If cooking resumes during a cooldown phase (e.g. draining pasta), the system
  cancels the cooldown and ramps extraction back up intelligently.

- 🔥 **Safety Detection**  
  Detects unusually high, dry heat (burning pan / forgotten pot) and forces
  **Turbo** speed.  
  A spare Shelly output can trigger scenes, notifications, or voice-assistant
  routines.

- 💡 **Remote Light Control**  
  Optional logic to control hood lighting via a secondary Shelly device.

- ⚙️ **Highly Tunable**  
  All thresholds and timings are exposed in a single `CONFIG` section for
  real-world tuning.

---

## Shelly Platform Requirements (Important)

This project is built **exclusively for the Shelly ecosystem**.

Required:
- **Shelly Xmod XMS**

Shelly X configuration is **not covered** in this repository.

Official Shelly resources:
- Shelly X Platform: https://www.shelly.com/pages/shelly-x
- Shelly Knowledge Base: https://kb.shelly.cloud/
- Shelly Academy: https://www.shelly.com/pages/academy

---
## Scope & Intended Audience

This project is a **deliberately advanced and opinionated implementation**.

It is intended for users who are already comfortable with:
- Shelly Gen3 local scripting (**mJS**)
- Shelly RPC / HTTP API calls
- Shelly X Virtual Components
- Basic electronics and low-voltage control wiring

This repository is **not** a generic ventilation controller and **not** a
beginner-friendly example.

The script is designed around:
- a specific hood control model
- real-world sensor behaviour
- explicit hardware assumptions

These constraints are intentional and are what make the automation reliable,
predictable, and suitable for long-term daily use.

If you are looking for a simple “if humidity > X then turn on” solution, this
project is likely **overkill**.

---

## Core Automation Logic (Shelly-Centric)

The automation operates entirely on **local Shelly logic** using relative change,
not absolute thresholds:

- **ΔT = Shelly hood temperature − Shelly room temperature**
- **ΔRH = Shelly hood humidity − Shelly room humidity**

Each control cycle:
1. Collects Shelly sensor data
2. Applies EMA smoothing
3. Evaluates **delta** and **slope**
4. Decides whether to start, ramp, cooldown, or stop

This approach avoids false triggers caused by:
- ambient humidity drift
- open windows
- seasonal climate changes
- background heat sources

---

## Automation States (Shelly X UI)

Using **Shelly X Virtual Components**, the controller exposes:

- **READY** – Monitoring only  
- **COOKING** – Active extraction  
- **HEATING** – Rapid thermal rise detected  
- **VENTING** – Cooldown / residual extraction  
- **MANUAL** – User override via Shelly X UI  
- **ALARM** – Abnormal thermal conditions detected  

State transitions are protected by:
- lockouts
- minimum run times
- cooldown hard limits

This prevents fan hunting and unstable behaviour.

---
## Script Feedback & Visual Indicators

The script exposes its internal logic through **Shelly X Virtual Components** to
make behaviour observable and debuggable without inspecting logs.

### Visual Indicator (Δ & Slope)

The visual UI element displays **delta values** and **trend direction**:

- **ΔT / ΔRH**  
  Current temperature and humidity difference between hood and room

- **Trend icons**  
  Indicate the **rate-of-change (slope)** calculated by the script:
  - 🔼 / ⏫ rising values (positive slope)
  - 🔽 / ⏬ falling values (negative slope)
  - ◀️ / ▶️ stable or near-zero change

These icons are driven directly by the same slope calculations used for
automation decisions, not by separate UI logic.

### Raw Diagnostic Output

A dedicated raw-text component exposes:
- delta values
- slope values
- smoothed sensor readings (EMA)

This allows:
- validation of sensor placement
- threshold tuning
- confirmation of why a speed or state transition occurred

### State Enum

The state enum reflects the **active logic path** inside the script:
- READY
- COOKING
- HEATING
- VENTING
- MANUAL
- ALARM

The enum is updated by the automation engine itself and should always reflect
the script’s current decision state.

> If the UI does not match expected behaviour, the raw diagnostics should be
> consulted before adjusting thresholds.

---

## Supported Hood Control Model (Very Specific)

This project targets a **specific class of range hood** when controlled via
Shelly relay outputs.

Supported behaviour:
- No dedicated Power button
- Speed buttons only (Speed 1 / Speed 2 / Speed 3 / Turbo)
- **Fan OFF is achieved by returning to Speed 1 and pressing Speed 1 again**

Shelly outputs are configured to **simulate physical button presses** using
momentary relay pulses.

> ⚠️ Range hoods with a separate Power button are **not supported** in v1.0  
> This is a deliberate and documented design choice.

---

## Wiring & Shelly Output Requirements

- Shelly relay outputs wired to the hood’s low-voltage button contacts
- Auto-Off **must** be enabled on all button outputs
- Typical pulse duration: **0.2–1.0 seconds** (hood dependent)

Incorrect configuration may result in:
- latched inputs
- missed button presses
- unpredictable hood behaviour

---

## Tuning Considerations (High Level)

Every kitchen behaves differently.

Key factors affecting tuning:
- sensor placement
- hood construction
- cooktop type (gas vs electric / induction)
- oven venting behaviour

Gas cooktops typically require higher thresholds due to heat and moisture output.
Electric and induction cooktops often require lower thresholds to remain responsive.

Detailed tuning workflows are intentionally kept outside the README.

---

## Future Direction

While this project focuses on a **specific range hood implementation**, the
underlying design patterns are intentionally reusable.

Planned or potential future adaptations include:
- bathroom ventilation
- pantry humidity control
- server / rack ventilation
- laundry and utility room extraction

These future variants will aim to provide **simpler, more targeted use cases**
while retaining the same Shelly-first, local-automation philosophy.

---

## Project Status

- **Version:** 1.0.0 (Stable)
- **Platform:** Shelly Gen3 + Shelly X
- **Category:** Advanced Shelly automation / reference implementation
- **Scope:** Single, specific device

This project prioritises:
- local Shelly control
- predictable behaviour
- long-term maintainability

---

## About SPARK_LABS

**SPARK_LABS⚡️** is a collection of advanced **Shelly-focused automation projects**
built to expand real-world use cases beyond basic rules and examples.

Projects are shared in good faith with clear assumptions, explicit behaviour, and aim for engineering-grade reliability.

---

## Disclaimer

This project interfaces with mains-powered appliances using Shelly devices.

You are responsible for:
- safe wiring
- proper isolation
- compliance with local electrical regulations

Use at your own risk.
