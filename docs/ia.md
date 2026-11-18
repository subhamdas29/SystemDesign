# Information Architecture & Feature Map (R1 Proposal)

## Overview
This document inventories every existing feature from Phases 1 through 10 of "Life of a Request" that currently lacks a designated permanent frame in the initial Figma design. Per the R1 specification, **no existing features have been removed or hidden**. All features remain fully reachable via temporary access points (including the **"Legacy Panels"** menu) pending user review and approval of the proposed homes below.

---

## Feature Map & Proposed Homes

| Feature | Pre-Redesign Location | Temporary Access Point (R1) | Proposed Permanent Home (New Design) | Interaction & User Flow |
| :--- | :--- | :--- | :--- | :--- |
| **Full Metrics Dashboard & Charts** | Top-right overlay card & expanded modal | Health dropdown link `"Open full metrics dashboard →"` and Legacy Panels menu | **Bottom Drawer / Modal Sheet** triggered from the Health Telemetry indicator in canvas top-right. | Clicking the free-floating Health indicator (`● Healthy 100 RPS 0% err ▾`) displays a quick typographic popover with a link to slide up a clean dark-themed bottom metrics drawer. |
| **Event Log Panel** | Floating draggable window | Bottom Control Bar `"Log"` button and Legacy Panels menu | **Slide-up Bottom Drawer** docked beside the Control Bar. | Clicking `"Log"` in the bottom control bar slides up a virtualized, monochrome event log stream without obstructing central architecture nodes. |
| **Request Trace Drawer** | Triggered by inspecting individual events | Accessible from Event Log event click and Legacy Panels menu | **Right-side Inspector Sub-tab** (`"Trace"` view). | When an individual request event is selected in the event log or canvas packet, the trace waterfall renders inside the Inspector drawer alongside node config. |
| **Run Summary Modal** | Auto-modal on simulation complete / crash | Accessible via Simulation Error banner and Legacy Panels menu | **Post-Run Diagnostic Sheet / Modal**. | Renders a high-contrast post-run summary card after a completed benchmark or cascade disaster, with quick replay and download options. |
| **Chaos & Failure Injections Panel** | Header `"Chaos"` button | Second bar `"Chaos"` text button (with active count pill) and Legacy Panels menu | **Right-side Flyout Panel** anchored to Second Bar `"Chaos"`. | Clicking `"Chaos"` in the second bar slides open a dedicated failure injection panel from the right edge, allowing users to inject node outages, packet loss, or latency spikes. |
| **Attack Console & Campaign Editor** | Left sidebar in Attacker Mode | Second bar mode pill (`[ Builder \| Attacker ]`) toggle and 6-dot Inventory icon | **Left-side Attack Workspace Drawer** in Attacker Mode. | In Attacker Mode, the 6-dot menu toggles the Attack Console (launching DDoS, slowloris, credential stuffing campaigns) instead of the component inventory. |
| **Defenses Tab & Configuration** | Header Defenses modal | Legacy Panels menu and Inspector `"Defenses"` section | **Inspector Sub-tab & Node Shield Configuration**. | In R2, defense rules (rate limiter thresholds, WAF rules, circuit breaker policies) live inside each component's Inspector panel, with global presets accessible via toolbar. |
| **Traffic Configuration Modal** | Bottom bar RPS badge click | Bottom bar RPS button click (`"100 RPS (constant)"`) | **Bottom Popover Anchored to RPS Control**. | Clicking the RPS button in the bottom bar opens a clean, unboxed typographic popover right above the control bar to configure rate, pattern, and simulation mode. |
| **Simulation Settings** | User dropdown | Second bar `"Settings"` button, Profile dropdown, and Legacy Panels menu | **Centered Minimalist Settings Modal**. | Clicking `"Settings"` in the second bar or profile dropdown opens an unboxed modal for visual density, animation speed caps, and determinism seeds. |
| **Tutorials & Tour Runner** | Auto-launched on first visit | Profile dropdown `"Tutorials"` and Legacy Panels menu | **Top-level Tab / Profile Dropdown Menu**. | Accessible directly from the Profile dropdown (`"Tutorials"`); runs guided step-by-step walkthroughs highlighting relevant nodes and tools. |
| **Simulation Guide & Shortcuts** | Modal | Profile dropdown `"Guide"` and Keyboard Shortcuts (`?` key) | **Profile Dropdown & Modal**. | Kept in the top navigation profile dropdown and accessible anytime via the `?` hotkey. |
| **Project Library (Saved Designs)** | Header Folder icon | Top bar `"Folder"` icon and Legacy Panels menu | **Left Sliding Project Drawer**. | Clicking the Folder icon in the top cream bar slides open a drawer displaying saved local designs with one-click load and delete actions. |
| **Share Link Popover** | Header Share icon | Top bar `"Share"` icon and Legacy Panels menu | **Anchored Popover below Share Icon**. | Clicking the Share icon in the top cream bar opens a compact popover with a copyable URL and instant copy feedback. |
| **JSON / Media Export** | Header Download icon | Top bar `"Download"` icon and Legacy Panels menu | **Anchored Popover below Download Icon**. | Clicking Download opens a popover offering Architecture JSON export, with PNG and JPEG options marked as disabled ("Coming in next step"). |
| **Inspector Configuration Forms** | Right sidebar | Automatically revealed on node selection, Eye icon in second bar | **Right-side Inspector Sidebar (R2 Target)**. | Selecting any node on the canvas slides in the Inspector with component configuration, capacity metrics, and live telemetry. |
| **Failure Markers & Callouts** | Canvas node badges | Rendered directly on Canvas nodes as typographic badges (`FAIL`, `QUARANTINED`, `CB: OPEN`) | **Integrated Canvas Typography Callouts**. | Rendered directly adjacent to node icons without cards or borders, strictly adhering to the no-box, no-glow visual design rules. |

---

## Action Plan & Approval Gate
- **Status**: Temporary access points active in R1 via the **"Legacy Panels"** menu (accessible from Profile dropdown in top navigation) and secondary toolbar buttons.
- **Next Step**: Awaiting user approval of this Information Architecture map before applying permanent migrations in subsequent design phases.
