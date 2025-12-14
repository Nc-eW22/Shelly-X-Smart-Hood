# 🍳 Shelly X Smart Hood ֎
**Powered by Shelly X — Advanced Range Hood Automation**

Developed as part of **SPARK_LABS⚡️**  
*Shelly-powered automations and reliable Kontrol*

---

![Shelly X Smart Hood UI](https://github.com/user-attachments/assets/fa5b54aa-c6b1-417b-855c-05ef516fc65e)

---

## Overview

**Shelly X Smart Hood** is an advanced, **Shelly X Gen3–only** range hood automation project designed to showcase **local Shelly automation using mJS scripting and the Shelly X platform**.

This project demonstrates how **Shelly Virtual Components**, **RPC-based local control**, and real-world sensor analysis can be combined into a reliable, *set-and-forget* appliance automation.

It is a **specific, opinionated reference implementation**, inspired by real installations and is built on examples from **Shelly repositories** and **Shelly Academy courses**.

---

## Design Goal

**Set it and forget it.**

Once installed and tuned, Shelly X Smart Hood:

- Automatically detects cooking activity
- Adjusts fan speed based on cooking intensity
- Executes an intelligent cooldown / venting cycle
- Requires minimal manual interaction during normal use 🍳💨

---

## Repository Contents (3 Scripts)

This repository is intentionally split into **three scripts**, each with a clear role:

1) **Shelly X Smart Hood**  
   *Main Controller*  
   - The actual automation engine  
   - Handles sensors → logic → hood outputs  
   - Runs continuously

2) **Shelly X Smart Hood Installer**  
   *UI Generator (One-Time Use)*  
   - Creates all required **Virtual Components + Group**
   - Must be run **once**
   - Stop and delete after installation

3) **Shelly X Smart Hood UI Demo**  
   *UI Tester / Mock Generator*  
   - Optional testing script  
   - Cycles demo scenarios to validate UI behaviour  
   - **Does not control real outputs**

---

## Core Features

- 🤖 **Fully Automatic (Local Shelly Control)**  
  Cooking is detected by comparing **hood sensors** with **room reference sensors**, without cloud services or fixed timers.

- 🧠 **Intelligent Detection Logic (Δ + Slope)**  
  Uses both **difference (Δ)** and **rate-of-change (slope)** analysis to distinguish between:
  - sudden steam bursts
  - slow rising heat
  - residual heat from previous cooking

- 💧 **Multi-Stage Cooldown / Venting**  
  After cooking ends, the hood continues running at reduced speed to clear lingering steam and odors before shutting off automatically.

- 🔄 **Smart Cooldown Override**  
  If cooking resumes during cooldown (e.g. draining pasta), the system cancels cooldown and ramps extraction back up intelligently.

- 🔥 **Safety Detection**  
  Detects unusually high, dry heat (burning pan / forgotten pot) and forces **Turbo** speed.  
  A spare Shelly output can trigger scenes, notifications, or voice-assistant routines.

- 💡 **Remote Light Control**  
  Optional logic to control hood lighting via a secondary Shelly device.

- ⚙️ **Highly Tunable**  
  All thresholds and timings are exposed in a single `CONFIG` section for real-world tuning.

---

## Scope & Intended Audience

This project is a **deliberately advanced and opinionated implementation**.

It is intended for users already comfortable with:

- Shelly Gen3 local scripting (**mJS**)
- Shelly RPC / HTTP API calls
- Shelly X Virtual Components and Groups
- Basic electronics and low-voltage control wiring

This repository is **not** a generic ventilation controller and **not** beginner-friendly.

The script is designed around:

- a specific hood control model
- real-world sensor behaviour
- explicit hardware assumptions

These constraints are intentional and are what make the automation reliable, predictable, and suitable for long-term daily use.

If you are looking for a simple *“if humidity > X then turn on”* solution, this project is likely **overkill**.

---

## Shelly Platform Requirements (Important)

This project is built **exclusively for the Shelly ecosystem**.

Required hardware:

- **Shelly Xmod / XMS** (as used in this project)
- Shelly Gen3 device capable of local scripting

Shelly X configuration itself is **not covered** in this repository.

Official Shelly resources:

- Shelly X Platform: https://www.shelly.com/pages/shelly-x  
- Shelly Knowledge Base: https://kb.shelly.cloud/  
- Shelly Academy: https://www.shelly.com/pages/academy  

---

## Virtual Components (UI Contract)

The UI is **not cosmetic** — it is part of the system contract.

The main controller script **expects these Virtual Components to exist**, created by the Installer script:

- `enum:200` → **Status**  
  (`READY / HEATING / COOKING / VENTING / MANUAL / ALARM`)

- `text:200` → **Visual Data**  
  (icons showing Δ and slope direction)

- `text:201` → **Raw Data**  
  (debug-style numeric output)

- `number:202` → **Fan Speed**  
  (manual override slider)

> ⚠️ **Important**  
> In this project, **`number:200` and `number:201` are crucial** because they are populated by **Shelly X Actions** to display *internal hood temperature and humidity*.  
> These values are **not calculated by the controller script**.  
> **Do not change these IDs.**

A **Group** is created first and then linked using `Group.Set`, so the UI appears as one cohesive panel in the Shelly app.  
For best results, extract the Group as a **Virtual Device** *(Shelly Premium feature)*.

### Recommended Device Card Layout

**Big parameter**
- Fan Speed

**Small parameters**
- Status
- Visual Data

---

## Script Feedback & Visual Indicators

The UI is designed to make the logic observable **without reading logs**.

### Visual Data (`text:200`)
Shows:
- **ΔT / ΔRH** (hood minus room)
- trend icons driven by the **same slope calculations** used internally:
  - 🔼 / ⏫ rising values
  - 🔽 / ⏬ falling values
  - ◀️ / ▶️ stable or near-zero change

### Raw Data (`text:201`)
Exposes:
- delta values
- slope values
- smoothed readings (EMA influence)

If hood behaviour looks wrong, **check Raw Data before changing thresholds**.

---

## Installation (High Level)

### 1) Run the UI Installer (One-Time)
- Upload and run **Shelly X Smart Hood Installer**
- Wait for **✅ INSTALLATION COMPLETE**
- Stop and delete the installer script
- Refresh Shelly App / Web UI

### 2) (Optional) Run the UI Demo
- Upload and run **Shelly X Smart Hood UI Demo**
- Confirm Status, Visual Data, Raw Data and slider behaviour
- Stop and delete when finished

### 3) Run the Main Controller
- Upload and run **Shelly X Smart Hood**
- Confirm sensors and outputs are mapped correctly before real use

---

## Supported Hood Control Model (Very Specific)

This project targets a **specific class of range hood** controlled via relay “button press” simulation.

Supported behaviour:
- No dedicated Power button
- Speed buttons only (Speed 1 / Speed 2 / Speed 3 / Turbo)
- **Fan OFF is achieved by returning to Speed 1 and pressing Speed 1 again**

> ⚠️ Range hoods with a separate Power button are **not supported in v1.0**  
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

Factors affecting tuning:
- sensor placement
- hood construction
- cooktop type (gas vs electric / induction)
- oven venting behaviour

Gas cooktops typically require higher thresholds.  
Electric and induction cooktops usually require lower thresholds.

Detailed tuning workflows are intentionally kept outside this README.

---

## Future Direction

While this project focuses on a **single specific hood**, the underlying design patterns are reusable.

Potential future adaptations:
- bathroom ventilation
- pantry humidity control
- server / rack ventilation
- laundry / utility extraction

These variants will aim to provide **simpler, more targeted use cases** while retaining the same Shelly-first, local-automation philosophy.

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

**SPARK_LABS⚡️** is a collection of advanced **Shelly-focused automation projects** built to push real-world use cases beyond basic rules and examples.

Projects are shared with:
- explicit assumptions
- documented behaviour
- engineering-grade reliability

---

## Disclaimer

This project interfaces with mains-powered appliances using Shelly devices.

You are responsible for:
- safe wiring
- proper isolation
- compliance with local electrical regulations

Use at your own risk.
