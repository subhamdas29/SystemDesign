"""
Generate labeled contact sheets (grid of up to 6 screenshots per sheet)
for convenient visual review without exceeding image upload limits.
"""

import os
from PIL import Image, ImageDraw, ImageFont

SCREENSHOT_DIR = os.path.abspath('qa/screenshots')
OUTPUT_DIR = os.path.abspath('qa/contact-sheets')
os.makedirs(OUTPUT_DIR, exist_ok=True)

GROUPS = [
    {
        'title': 'R1 Core Views (Builder, Attacker, Problems, Presets)',
        'output': 'contact-sheet-r1-core.png',
        'items': [
            ('r1-create-builder-1440x900.png', 'Builder Mode (1440x900)'),
            ('r1-create-builder-1920x1080.png', 'Builder Mode (1920x1080)'),
            ('r1-create-attacker-1440x900.png', 'Attacker Mode (1440x900)'),
            ('r1-create-attacker-1920x1080.png', 'Attacker Mode (1920x1080)'),
            ('r1-problems-1440x900.png', 'Problems ("Coming soon")'),
            ('r1-presets-1440x900.png', 'Presets Page'),
        ]
    },
    {
        'title': 'R1 App Shell & Popovers (Above Health, Flat Scrim, Unboxed)',
        'output': 'contact-sheet-r1-popovers.png',
        'items': [
            ('r1-health-dropdown-1440x900.png', 'Health Dropdown (Unboxed)'),
            ('r1-share-popover-1440x900.png', 'Share Popover (Above Health)'),
            ('r1-download-popover-1440x900.png', 'Download Popover'),
            ('r1-profile-dropdown-1440x900.png', 'Profile Dropdown (Guide/Tutorials)'),
            ('r1-folder-drawer-1440x900.png', 'Saved Designs Drawer (Flat Scrim)'),
            ('r1-eye-mode-1440x900.png', 'Eye Mode (Hidden Controls)'),
        ]
    },
    {
        'title': 'R2 Canvas Redesign & Drawers (Typographic Inspector, Inventory, Tablet)',
        'output': 'contact-sheet-r2-canvas-drawers.png',
        'items': [
            ('redesign-builder-1440x900.png', 'Icon-only Nodes & Dotted Edges'),
            ('redesign-attacker-1440x900.png', 'Threat Source Node & Entry Edge'),
            ('redesign-node-selected-1440x900.png', 'Node Inspector (No Cards, Plain Copy)'),
            ('redesign-edge-selected-1440x900.png', 'Edge Inspector (Plain Text Presets)'),
            ('redesign-inventory-drawer-1440x900.png', 'Inventory Drawer (Quiet Add & Line Art)'),
            ('redesign-tablet-768px.png', 'Tablet 768px Overlay Drawer & Scrim'),
        ]
    },
    {
        'title': 'R2 Simulation Runs & States (100 RPS, 100k Flow, Paused Freeze, Severity States)',
        'output': 'contact-sheet-r2-simulation.png',
        'items': [
            ('redesign-sim-100rps-1440x900.png', '100 RPS Running at ~5s ("Pause", Live Stats)'),
            ('redesign-sim-100krps-aggregate-1440x900.png', '100k RPS Aggregate Flow & Readout Badge'),
            ('redesign-sim-paused-freeze-1.png', 'Paused Run Frozen Mid-Edge (Shot 1)'),
            ('redesign-sim-paused-freeze-2.png', 'Paused Run Frozen Mid-Edge (Shot 2, 1s Later)'),
            ('redesign-severity-states-1440x900.png', 'Severity States (Degraded, Overloaded, Failed)'),
            ('redesign-full-architecture-1440x900.png', 'Full Architecture Canvas View'),
        ]
    }
]

SHEET_WIDTH = 1920
HEADER_HEIGHT = 70
COLS = 3
ROWS = 2
PADDING = 20
PANEL_WIDTH = (SHEET_WIDTH - (PADDING * (COLS + 1))) // COLS
PANEL_HEIGHT = int(PANEL_WIDTH * (9 / 16)) + 36
SHEET_HEIGHT = HEADER_HEIGHT + (PANEL_HEIGHT * ROWS) + (PADDING * (ROWS + 1))

# Colors
BG_COLOR = (11, 11, 13)
CARD_BG = (21, 24, 30)
CARD_BORDER = (42, 46, 57)
TEXT_CREAM = (243, 238, 227)
TEXT_GREY = (142, 142, 142)
ORANGE = (217, 84, 30)

def create_contact_sheet(group):
    sheet = Image.new('RGB', (SHEET_WIDTH, SHEET_HEIGHT), BG_COLOR)
    draw = ImageDraw.Draw(sheet)

    # Top title bar
    draw.rectangle([0, 0, SHEET_WIDTH, HEADER_HEIGHT], fill=(27, 30, 36))
    draw.line([0, HEADER_HEIGHT, SHEET_WIDTH, HEADER_HEIGHT], fill=CARD_BORDER, width=2)

    # Simple default font or fallback
    try:
        title_font = ImageFont.truetype("arial.ttf", 22)
        panel_font = ImageFont.truetype("arial.ttf", 14)
        sub_font = ImageFont.truetype("arial.ttf", 11)
    except:
        title_font = ImageFont.load_default()
        panel_font = ImageFont.load_default()
        sub_font = ImageFont.load_default()

    # Draw sheet title
    draw.text((PADDING + 5, 22), group['title'], fill=TEXT_CREAM, font=title_font)
    draw.text((SHEET_WIDTH - 240, 26), "Life of a Request · Visual QA", fill=TEXT_GREY, font=sub_font)

    items = group['items']
    for idx, (filename, label) in enumerate(items[:6]):
        col = idx % COLS
        row = idx // COLS
        x = PADDING + col * (PANEL_WIDTH + PADDING)
        y = HEADER_HEIGHT + PADDING + row * (PANEL_HEIGHT + PADDING)

        # Panel card background & border
        draw.rectangle([x, y, x + PANEL_WIDTH, y + PANEL_HEIGHT], fill=CARD_BG, outline=CARD_BORDER, width=1)

        # Header of panel
        draw.rectangle([x, y, x + PANEL_WIDTH, y + 30], fill=(27, 30, 36))
        draw.line([x, y + 30, x + PANEL_WIDTH, y + 30], fill=CARD_BORDER, width=1)
        draw.text((x + 10, y + 8), f"{idx + 1}. {label}", fill=TEXT_CREAM, font=panel_font)

        # Load screenshot if available
        src_path = os.path.join(SCREENSHOT_DIR, filename)
        img_area_w = PANEL_WIDTH - 8
        img_area_h = PANEL_HEIGHT - 38
        if os.path.exists(src_path):
            try:
                img = Image.open(src_path)
                img.thumbnail((img_area_w, img_area_h), Image.Resampling.LANCZOS)
                paste_x = x + 4 + (img_area_w - img.width) // 2
                paste_y = y + 34 + (img_area_h - img.height) // 2
                sheet.paste(img, (paste_x, paste_y))
            except Exception as e:
                draw.text((x + 20, y + 60), f"Error loading image: {e}", fill=ORANGE, font=panel_font)
        else:
            draw.text((x + 20, y + 60), f"Pending: {filename}", fill=TEXT_GREY, font=panel_font)

    out_path = os.path.join(OUTPUT_DIR, group['output'])
    sheet.save(out_path, quality=95)
    print(f"Generated contact sheet: {out_path}")

def main():
    for group in GROUPS:
        create_contact_sheet(group)
    print("All contact sheets created successfully.")

if __name__ == '__main__':
    main()
