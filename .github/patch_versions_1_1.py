from pathlib import Path
for name in ('public/settings-center.js','public/settings-nav-complete.js'):
    p=Path(name)
    s=p.read_text()
    if '1.0.8' not in s:
        raise SystemExit(f'1.0.8 anchor missing in {name}')
    p.write_text(s.replace('1.0.8','1.1.0'))
