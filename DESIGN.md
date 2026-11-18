# Design System: Life of a Request (Redesign)

## 1. Visual World & Direction

- **Concept**: Precision technical schematic, architectural minimalism, high clarity.
- **Canvas**: Pure near-black `#0B0B0D`.
- **Top Navigation**: Solid Cream `#F3EEE3` with black navigation labels (`#111111`) and surgical Burnt Orange `#D9541E` active indicator.
- **Accents**: Burnt Orange `#D9541E` is strictly an accent for active states, selected modes, threat indicators, and malicious traffic. Never used for large fills.
- **Nodes**: Cardless schematic components. A 48px white line icon, full untruncated component name (wrapped to 2 lines max), and subtle utilization % (`#888888` / `#A1A1AA`).
- **Edges**: 2px dotted lines (`#FFFFFF` for legitimate, `#D9541E` for attack vectors) with open arrowheads indicating direction.
- **Packets**: Physical circular pulses traversing along dotted edges (white circles for legitimate, orange fill with thin outer ring for malicious).

---

## 2. Taste & Motion Settings

- **Taste Settings**:
  - `variance`: low
  - `motion`: medium
  - `density`: high
- **Motion Principles (Emil Kowalski)**:
  - Entering UI elements use `ease-out` (duration ~150ms to ~250ms).
  - No animations on high-frequency keyboard interactions.
  - Linear motion for physical packet transfer strictly driven by simulated clock time (never eased).
  - Respect `prefers-reduced-motion` across all UI layers.

---

## 3. Forbidden Patterns (Absolute Bans)

- ❌ Default fonts (Times, Arial, default sans-serif fallbacks).
- ❌ Purple / blue gradients, neon glows, or cyber-style glow overload.
- ❌ Purposeless glassmorphism, blur backdrops, or faux-acrylic panels.
- ❌ Nested cards, heavy container boxes, or bounding rectangles around nodes.
- ❌ Uniform radii everywhere (avoid mindless rounding).
- ❌ Generic filler copy or truncated ellipses (`App Serv...` is banned).
- ❌ Filler icons (all icons must come directly from `/src/assets/icons/`).
- ❌ Communicating state by color alone (always combine color with text, dash style, ring style, or stroke weight).

---

## 4. Typography Scale

- **Family**: `Roboto Mono`, monospace
- **Nav Bar**: `Roboto Mono`, Bold (700), 16px (letter-spacing: -0.01em)
- **Second Bar / Toolbar**: `Roboto Mono`, Medium (500), 11px
- **Canvas Node Name**: `Roboto Mono`, Regular (400), 12px (line-height: 1.25)
- **Canvas Utilization / Subtext**: `Roboto Mono`, Regular (400), 10px
- **Health Indicator & Telemetry**: `Roboto Mono`, Regular (400), 11px
- **Code & Metric Values**: `Roboto Mono`, Medium (500), 11px–13px

---

## 5. Color Tokens

| Token | Hex / Value | Role |
| :--- | :--- | :--- |
| `color.cream` | `#F3EEE3` | Top navigation bar background, active attacker pill background |
| `color.canvas` | `#0B0B0D` | Canvas background, subheader toolbar background |
| `color.accent.orange` | `#D9541E` | Burnt orange accent, active tab line, attacker node/vector |
| `color.text.dark` | `#111111` | Inactive tab text on cream top bar |
| `color.text.white` | `#FFFFFF` | Primary text on dark surfaces, node icons, action buttons |
| `color.text.secondary`| `#A1A1AA` | Secondary labels, node utilization, metric titles |
| `color.text.faint` | `#71717A` | Subordinate descriptions, inactive tool icons |
| `color.toolbar.pill` | `#2C2C2C` | Mode toggle container background, bottom bar background |
| `color.toolbar.active`| `#656565` | Active Builder toggle segment background |
| `color.status.green` | `#008604` | Canvas health indicator dot |
| `color.edge.legit` | `#FFFFFF` | 2px dotted legitimate flow edge |
| `color.edge.threat` | `#D9541E` | 2px dotted malicious/attack flow edge |

---

## 6. Layout & Sizing Tokens

- **Top Bar Height**: 80px
- **Subheader / Second Bar Height**: 54px (borderless, integrates seamlessly over canvas)
- **Bottom Bar Height**: 45px (background `#2C2C2C`)
- **Nav Icons**: 16px–20px (`currentColor`, stroke width 2)
- **Canvas Component Icons**: ~48px (white line SVG, stroke width 2)
- **Edge Stroke Weight**: 2px dotted (dasharray: 4, 4)
- **Node Bounds**: Cardless, intrinsic content width (~120px–180px), icon centered above label and utilization
- **Lanes & Layout**: 2-dimensional spread across architecture tiers (Client & DNS top tier; CDN, Ingress, Services, Cache, DB multi-row flow)
