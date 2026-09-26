"""Site Sabha: one safety briefing, every worker's language, proof of understanding."""
import os

import pandas as pd
import streamlit as st

from pipeline import db
from pipeline.client import DATA, CacheMiss
from pipeline.localise import LANG_NAMES
from pipeline.run import check_answer, run_briefing

st.set_page_config(page_title="Site Sabha", page_icon="🦺", layout="wide")

VERDICT_UI = {
    "understood": ("✅", "Understood", "success"),
    "partial": ("⚠️", "Partial — re-brief this worker", "warning"),
    "not_understood": ("❌", "Not understood — re-brief", "error"),
}
STATUS_ICON = {"understood": "✅ understood", "partial": "⚠️ partial", "re-brief": "❌ re-brief",
               "heard": "🎧 heard", "absent": "⬜ absent"}
SAMPLE_ANSWERS = {
    "Tamil, correct": "ta_correct.wav",
    "Bengali, vague": "bn_vague.wav",
    "Odia, wrong": "od_wrong.wav",
}


def sample(rel):
    path = DATA / rel
    if not path.exists():
        st.warning(f"Missing data/{rel}. Run: python scripts/make_assets.py")
        return None
    return path.read_bytes()


def lang_name(code):
    return LANG_NAMES.get(code, code)


def sidebar():
    with st.sidebar:
        demo = st.toggle("Demo mode (cached only)", value=os.environ.get("DEMO_MODE") == "1",
                         help="Serve every Sarvam call from data/cache. No network.")
        os.environ["DEMO_MODE"] = "1" if demo else "0"
        st.caption("Saaras · Sarvam Vision · Sarvam-105B · Sarvam Translate · Bulbul")


def show_error(e: Exception):
    if isinstance(e, CacheMiss):
        st.error(f"{e}. Turn demo mode off, or run the pipeline once online to warm the cache.")
    else:
        st.exception(e)


# ---------------------------------------------------------------- Supervisor
def supervisor_page():
    st.title("🦺 Site Sabha — Supervisor")
    st.caption("Speak the briefing once. Photograph the permit. Every worker hears it in their language.")

    c1, c2 = st.columns(2)
    with c1:
        st.subheader("1 · Briefing audio")
        src = st.radio("Source", ["Sample (clean)", "Sample (noisy site)", "Record", "Upload"],
                       horizontal=True, label_visibility="collapsed")
        audio = None
        if src == "Sample (clean)":
            audio = sample("sample_briefing.wav")
            if audio:
                st.audio(audio, format="audio/wav")
        elif src == "Sample (noisy site)":
            audio = sample("noisy_briefing.wav")
            if audio:
                st.audio(audio, format="audio/wav")
        elif src == "Record":
            rec = st.audio_input("Record briefing")
            audio = rec.getvalue() if rec else None
        else:
            up = st.file_uploader("Briefing audio", type=["wav", "mp3", "m4a", "ogg", "webm"])
            audio = up.getvalue() if up else None
    with c2:
        st.subheader("2 · Permit-to-work photo")
        psrc = st.radio("Permit", ["Sample permit", "Upload photo", "No permit"], horizontal=True,
                        label_visibility="collapsed")
        permit, pname = None, "permit.jpg"
        if psrc == "Sample permit":
            permit = sample("sample_permit.jpg")
        elif psrc == "Upload photo":
            up = st.file_uploader("Permit", type=["jpg", "jpeg", "png", "pdf"])
            if up:
                permit, pname = up.getvalue(), up.name
        if permit and not pname.endswith(".pdf"):
            st.image(permit, width=260)

    if st.button("▶ Run Site Sabha", type="primary", disabled=audio is None):
        with st.status("Running pipeline…", expanded=True) as status:
            try:
                run_briefing(audio, permit, pname, log=st.write)
                status.update(label="Briefing ready", state="complete", expanded=False)
            except Exception as e:
                status.update(label="Pipeline failed", state="error")
                show_error(e)
                return

    b = db.latest_briefing()
    if not b:
        st.info("No briefing yet. Run the pipeline above.")
        return
    render_briefing(b)


def render_briefing(b):
    br = b["briefing"]
    st.divider()
    st.subheader(f"Today's briefing · {br.get('site') or 'Site'} · {b['date']}")

    if b["gaps"]:
        st.markdown("#### 🚩 Permit gaps — mentioned in permit, missing from briefing")
        for g in b["gaps"]:
            msg = f"**{g['missing']}**  \nPermit: _{g['permit_line']}_"
            {"high": st.error, "med": st.warning}.get(g.get("severity"), st.info)(
                f"[{g.get('severity', '').upper()}] {msg}")
    elif b["permit_text"]:
        st.success("No permit gaps: every permit hazard was covered in the briefing.")

    c1, c2 = st.columns([3, 2])
    with c1:
        st.markdown("#### Hazards and controls")
        rows = [{"Hazard": h["item"], "Control": h["control"],
                 "Source": "🗣 briefing" if h["source"] == "briefing" else "📄 permit"} for h in br["hazards"]]
        st.dataframe(pd.DataFrame(rows), hide_index=True, use_container_width=True)
        if br.get("tasks"):
            st.markdown("#### Crew tasks")
            st.dataframe(pd.DataFrame(br["tasks"]), hide_index=True, use_container_width=True)
    with c2:
        st.markdown("#### PPE")
        st.write(" · ".join(f"`{p}`" for p in br.get("ppe", [])) or "—")
        em = br.get("emergency", {})
        st.markdown("#### Emergency")
        st.write(f"Assembly point: **{em.get('assembly_point') or '—'}**  \nContact: **{em.get('contact') or '—'}**")
        st.markdown("#### Comprehension check")
        for q in br.get("quiz", []):
            st.write(f"❓ {q['q']}  \n↳ _{q['expected_answer']}_")

    st.markdown("#### 🔊 Briefing in each worker language")
    langs = list(b["localised"].items())
    cols = st.columns(max(1, len(langs)))
    for col, (lang, loc) in zip(cols, langs):
        with col:
            st.markdown(f"**{lang_name(lang)}**")
            st.audio(loc["audio"], format="audio/wav")
            with st.expander("Text"):
                st.write("\n\n".join(loc["lines"]))

    with st.expander("Raw transcript and permit text"):
        st.markdown("**Saaras transcript**")
        st.write(b["transcript"])
        st.markdown("**Sarvam Vision permit text**")
        st.text(b["permit_text"] or "(none)")
    with st.expander("briefing.json"):
        st.json(br)


# ---------------------------------------------------------------- Worker
def worker_page():
    b = db.latest_briefing()
    roster = db.load_roster()
    names = [w["name"] for w in roster]
    qp = st.query_params.get("worker")
    idx = names.index(qp) if qp in names else 0
    name = st.selectbox("Worker", names, index=idx)
    worker = next(w for w in roster if w["name"] == name)
    lang = worker["language_code"]
    st.title(f"👷 {name} · {lang_name(lang)}")
    if not b:
        st.info("No briefing yet today.")
        return
    loc = b["localised"].get(lang)
    if not loc:
        st.warning(f"This briefing has no {lang_name(lang)} version.")
        return

    st.subheader("1 · Listen")
    st.audio(loc["audio"], format="audio/wav")
    with st.expander("Read the briefing", expanded=False):
        st.write("\n\n".join(loc["lines"]))
    if st.button("🎧 I have listened"):
        db.record_play(name, lang, b["id"])
        st.toast("Marked as heard")

    if not loc["quiz"]:
        return
    st.subheader("2 · Answer one question")
    q = loc["quiz"][0]
    st.markdown(f"### {q['q_local']}")
    st.caption(q["q"])
    if loc.get("quiz_audio"):
        st.audio(loc["quiz_audio"][0], format="audio/wav")

    ans = st.audio_input("Speak your answer", key=f"ans_{name}")
    answer_audio = ans.getvalue() if ans else None
    with st.expander("Demo: use a pre-recorded answer"):
        pick = st.selectbox("Sample answer", ["—"] + list(SAMPLE_ANSWERS))
        if pick != "—":
            answer_audio = sample(f"answers/{SAMPLE_ANSWERS[pick]}")
            if answer_audio:
                st.audio(answer_audio, format="audio/wav")

    if st.button("Submit answer", type="primary", disabled=answer_audio is None):
        with st.spinner("Saaras is listening, Sarvam-105B is checking…"):
            try:
                res = check_answer(b["briefing"], worker, answer_audio)
            except Exception as e:
                show_error(e)
                return
        db.record_answer(name, lang, b["id"], res["question"], res["transcript"], res["verdict"], res["reason"])
        icon, label, kind = VERDICT_UI[res["verdict"]]
        getattr(st, kind)(f"## {icon} {label}\n\nHeard: “{res['transcript']}”\n\n{res['reason']}")


# ---------------------------------------------------------------- Dashboard
def dashboard_page():
    st.title("📋 Dashboard")
    b = db.latest_briefing()
    if not b:
        st.info("No briefing yet.")
        return
    st.caption(f"Briefing {b['id']} · {b['briefing'].get('site', '')}")
    live_grid(b["id"])
    st.download_button("⬇ Export audit CSV", db.export_csv(b["id"]), file_name=f"site_sabha_audit_{b['id']}.csv",
                       mime="text/csv")


@st.fragment(run_every=3)
def live_grid(bid):
    grid = db.status_grid(bid)
    counts = {s: sum(g["status"] == s for g in grid) for s in STATUS_ICON}
    cols = st.columns(5)
    for col, s in zip(cols, ["understood", "partial", "re-brief", "heard", "absent"]):
        col.metric(STATUS_ICON[s], f"{counts[s]}/{len(grid)}")
    df = pd.DataFrame([{"Worker": g["worker"], "Language": lang_name(g["language"]),
                        "Status": STATUS_ICON[g["status"]], "Answer": g["answer"] or "",
                        "Reason": g["reason"] or "", "Updated": g["updated"] or ""} for g in grid])
    st.dataframe(df, hide_index=True, use_container_width=True)
    needs = [g for g in grid if g["status"] in ("partial", "re-brief")]
    if needs:
        st.markdown("**Needs re-brief**")
        cols = st.columns(min(4, len(needs)))
        for col, g in zip(cols, needs):
            if col.button(f"🔁 Re-brief {g['worker']}", key=f"rb_{g['worker']}"):
                db.rebrief(g["worker"], bid)
                st.rerun()


sidebar()
nav = st.navigation([
    st.Page(supervisor_page, title="Supervisor", icon="🦺", default=True),
    st.Page(worker_page, title="Worker", icon="👷", url_path="worker"),
    st.Page(dashboard_page, title="Dashboard", icon="📋", url_path="dashboard"),
])
nav.run()
