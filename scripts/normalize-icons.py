import glob, os, re

for f in glob.glob('src/assets/icons/*.svg'):
    content = open(f, 'r', encoding='utf-8').read()
    
    # Replace non-none fills with currentColor (except in threat.svg if desired, but we can set color in parent)
    # Actually, if currentColor is used, parent can set text-white or text-[#d9541e]!
    # Let's inspect dns.svg specifically:
    if 'dns.svg' in f:
        # In builder.png, the globe is simple white line globe
        # Let's ensure paths have stroke="currentColor" or fill="currentColor"
        pass
    
    # Generic replacement: replace #1E1E1E, #1D1B20, white, #FFFFFF, #D9541E with currentColor
    # Keep fill="none" intact
    new_content = re.sub(r'fill="(?!none)[^"]+"', 'fill="currentColor"', content)
    new_content = re.sub(r'stroke="(?!none)[^"]+"', 'stroke="currentColor"', new_content)
    
    open(f, 'w', encoding='utf-8').write(new_content)
    print(f"Updated {os.path.basename(f)}")
