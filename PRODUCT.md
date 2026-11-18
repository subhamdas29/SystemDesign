# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Software engineers, system architects, and technical interview candidates exploring, simulating, and designing high-scale distributed systems architectures.

## Product Purpose

An interactive, deterministic, educational system design simulator ("Life of a Request") that visualizes end-to-end request flow, component interactions, queuing, network latency, failure cascades, and security threats across client, edge, network, application, and database tiers.

## Positioning

Unlike static architecture diagramming tools (draw.io, Excalidraw) or opaque benchmarking scripts, Life of a Request offers a dual-engine (discrete event & aggregate flow) interactive simulation environment with physicalized request animation, multi-layer inspection, and real-time failure injection.

## Operating Context

Browser-based interactive canvas (1440x900 default, 1920x1080 expanded, 768px tablet) with guided builder mode, attacker scenario simulation, and free-form hand exploration.

## Capabilities and Constraints

- **Canvas Modes**: Builder (guided placement & simulation), Attacker (threat & malicious traffic simulation), Hand (free-form drawing).
- **Layers**: Main (default), Inside Server, DNS Resolution, TCP/TLS.
- **Compulsory Components**: Client, CDN, App Server (Main layer anchors).
- **Engine Rules**: Simulation engine remains deterministic, pure, and decoupled from UI/rendering.
- **Visual Design**: Strict visual hierarchy defined by reference comp (`Cream #F3EEE3` top bar, `#0B0B0D` near-black canvas, white line icons, cardless nodes, dotted edges, Burnt Orange `#D9541E` accent).

## Brand Commitments

- **Name**: Life of a Request
- **Identity Assets**: SVG line icons in `/src/assets/icons`, `LifeOfARequestLOGO.webp` in `/src/assets`
- **Palette**: Cream `#F3EEE3`, Canvas `#0B0B0D`, Accent `#D9541E`, Crisp White `#FFFFFF`, Neutral Greys (`#2C2C2C`, `#656565`, `#A1A1AA`)
- **Typography**: Roboto Mono for navigation, toolbars, labels, and telemetry

## Product Principles

1. **Physicalized Truth**: Every packet, edge traversal, and bottleneck reflects deterministic simulation math, not decorative animations.
2. **Restraint Over Decoration**: Zero purposeless glassmorphism, glows, or gradients. Crisp lines, monochrome focus, and surgical orange accents.
3. **Legibility & Density**: High information density with zero truncation on architecture nodes. Full component labels wrapped cleanly.
4. **State Multi-Coding**: Never convey state by color alone; always pair color with text, shape, dash style, or stroke weight.
