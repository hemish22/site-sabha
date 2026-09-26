"""Generate demo assets in data/.

  sample_permit.jpg      rendered permit-to-work (includes hot work + extinguisher = planted gap)
  sample_briefing.wav    ~40 s Hindi briefing via Bulbul (never mentions the extinguisher)
  noisy_briefing.wav     same briefing mixed with site-like noise
  answers/*.wav          worker answers: Tamil correct, Bengali vague, Odia wrong

Usage: python scripts/make_assets.py [--permit-only]
"""
import random
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from PIL import Image, ImageDraw, ImageFilter, ImageFont  # noqa: E402

from pipeline.client import DATA  # noqa: E402

FONT_DIR = Path("/System/Library/Fonts/Supplemental")


def font(name: str, size: int):
    try:
        return ImageFont.truetype(str(FONT_DIR / name), size)
    except OSError:
        return ImageFont.load_default()


PERMIT_ROWS = [
    ("Permit No.", "PTW-2026-0926-C3"),
    ("Date", "26 Sep 2026   Shift: 07:00 - 17:00"),
    ("Site / Location", "Block C, Level 3 slab"),
    ("Issued to", "Shuttering crew + Welding crew (contractor: Shree Infra)"),
    ("Issued by", "R. Mehta, Site Safety Officer"),
]
PERMIT_WORK = [
    ("Work at height", "Scaffold on Level 3 edge. Full-body harness clipped to lifeline at all times. Scaffold tag must be green."),
    ("Hot work", "Welding near scaffold, Level 3. Fire extinguisher (CO2 / DCP) within 5 m. Fire watch for 30 min after work. Remove combustibles."),
    ("Electrical isolation", "Lockout-tagout on DB-3 before cable pulling. Only licensed electrician to remove lock."),
    ("Lifting", "Tower crane lift of formwork panels. No one under suspended load. Tag lines used."),
]
PERMIT_PPE = "Helmet, safety shoes, full-body harness, gloves, welding face shield, reflective vest"
PERMIT_EMERGENCY = "Assembly point: Main gate.  Emergency: Site safety officer 98xxxxxx10.  First aid: Site office."


def make_permit(path: Path):
    W, H = 1240, 1400
    img = Image.new("RGB", (W, H), (250, 248, 240))
    d = ImageDraw.Draw(img)
    title, h2, body, bold = font("Arial Bold.ttf", 44), font("Arial Bold.ttf", 28), font("Arial.ttf", 25), font("Arial Bold.ttf", 25)
    d.rectangle([30, 30, W - 30, H - 30], outline=(40, 40, 40), width=4)
    d.text((60, 60), "PERMIT TO WORK", font=title, fill=(20, 20, 20))
    d.text((60, 115), "Shree Infra Projects Pvt Ltd  ·  Construction Safety", font=body, fill=(60, 60, 60))
    y = 180
    for k, v in PERMIT_ROWS:
        d.text((60, y), f"{k}:", font=bold, fill=(20, 20, 20))
        d.text((330, y), v, font=body, fill=(20, 20, 20))
        y += 42
    y += 20
    d.text((60, y), "HAZARDS AND REQUIRED CONTROLS", font=h2, fill=(150, 20, 20))
    y += 50

    def wrap(text, width_px, f):
        words, lines, cur = text.split(), [], ""
        for w in words:
            t = f"{cur} {w}".strip()
            if d.textlength(t, font=f) > width_px:
                lines.append(cur)
                cur = w
            else:
                cur = t
        return lines + [cur]

    for i, (k, v) in enumerate(PERMIT_WORK, 1):
        d.text((60, y), f"{i}. {k}", font=bold, fill=(20, 20, 20))
        y += 36
        for line in wrap(v, W - 420, body):
            d.text((100, y), line, font=body, fill=(20, 20, 20))
            y += 34
        d.text((W - 230, y - 34), "[x] Checked", font=body, fill=(20, 90, 20))
        y += 18
    y += 10
    d.text((60, y), "PPE REQUIRED", font=h2, fill=(150, 20, 20))
    y += 46
    for line in wrap(PERMIT_PPE, W - 160, body):
        d.text((60, y), line, font=body, fill=(20, 20, 20))
        y += 34
    y += 20
    d.text((60, y), "EMERGENCY", font=h2, fill=(150, 20, 20))
    y += 46
    for line in wrap(PERMIT_EMERGENCY, W - 160, body):
        d.text((60, y), line, font=body, fill=(20, 20, 20))
        y += 34
    y = H - 170
    d.text((60, y), "Issuer signature: ____R. Mehta____", font=body, fill=(20, 20, 20))
    d.text((680, y), "Receiver signature: ____S. Yadav____", font=body, fill=(20, 20, 20))
    # Make it look like a phone photo: slight rotation, background, blur, noise.
    img = img.rotate(1.3, expand=True, fillcolor=(120, 110, 95)).filter(ImageFilter.GaussianBlur(0.6))
    px = img.load()
    rnd = random.Random(7)
    for _ in range(40000):
        x, yy = rnd.randrange(img.width), rnd.randrange(img.height)
        r, g, b = px[x, yy]
        n = rnd.randint(-18, 18)
        px[x, yy] = (max(0, min(255, r + n)), max(0, min(255, g + n)), max(0, min(255, b + n)))
    img.save(path, quality=88)
    print("wrote", path)


# Hindi briefing, ~40 s. Covers harness, helmet, crane, lockout, assembly point.
# Deliberately silent on the hot-work fire extinguisher that the permit requires.
BRIEFING_HI = [
    "सुप्रभात सब लोग। आज Block C, Level 3 पर काम है।",
    "Shuttering crew आज Level 3 slab का formwork करेगी।",
    "Scaffold पर काम करते समय full-body harness पहनना है, और harness हर समय lifeline से clip रहना चाहिए। एक सेकंड के लिए भी unclip नहीं करना।",
    "Scaffold का tag green होना चाहिए, red tag वाले scaffold पर मत चढ़ना।",
    "आज welding crew भी scaffold के पास welding करेगी, ध्यान रखना।",
    "Crane से panel उठेंगे, suspended load के नीचे कोई खड़ा नहीं होगा।",
    "DB-3 पर lockout है, electrician के अलावा कोई lock नहीं खोलेगा।",
    "Helmet, safety shoes, gloves सबको पहनने हैं।",
    "कोई emergency हो तो main gate पर assembly point पर मिलना, और safety officer मेहता जी को बुलाना। ठीक है? चलो काम शुरू करो।",
]

# English source for worker answers; translated to the worker language by Sarvam Translate.
ANSWERS = {
    "ta_correct": ("ta-IN", "The harness must stay clipped to the lifeline all the time when we work on the scaffold."),
    "bn_vague": ("bn-IN", "Yes, we should wear the harness, I think."),
    "od_wrong": ("od-IN", "I don't know, maybe after lunch."),
}


def make_audio():
    from pipeline.localise import speak, translate

    wav = speak(BRIEFING_HI, "hi-IN", speaker="rahul", pace=1.0)
    (DATA / "sample_briefing.wav").write_bytes(wav)
    print("wrote sample_briefing.wav", len(wav), "bytes")
    subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error", "-i", str(DATA / "sample_briefing.wav"),
        "-filter_complex",
        "anoisesrc=color=brown:amplitude=0.08:sample_rate=24000[n];[0:a][n]amix=inputs=2:duration=first:weights=1 0.6",
        str(DATA / "noisy_briefing.wav"),
    ], check=True)
    print("wrote noisy_briefing.wav")
    (DATA / "answers").mkdir(exist_ok=True)
    for name, (lang, en) in ANSWERS.items():
        local = translate(en, lang)
        (DATA / "answers" / f"{name}.wav").write_bytes(speak([local], lang, speaker="aditya"))
        print(f"wrote answers/{name}.wav  [{lang}] {local}")


if __name__ == "__main__":
    make_permit(DATA / "sample_permit.jpg")
    if "--permit-only" not in sys.argv:
        make_audio()
