import os, re, shutil

for name in ['worker.svg', 'database-replica.svg', 'firewall.svg']:
    src = os.path.join('resources', name)
    dst = os.path.join('src', 'assets', 'icons', name)
    if os.path.exists(src):
        content = open(src, 'r', encoding='utf-8').read()
        new_content = re.sub(r'fill="(?!none)[^"]+"', 'fill="currentColor"', content)
        new_content = re.sub(r'stroke="(?!none)[^"]+"', 'stroke="currentColor"', new_content)
        open(dst, 'w', encoding='utf-8').write(new_content)
        print(f"Copied and normalized {name}")
