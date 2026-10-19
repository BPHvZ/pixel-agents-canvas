"""Capture named local demo frames. Requires Python Playwright and local Chrome or Chromium."""
import argparse
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlencode, urlsplit
from urllib.request import urlopen

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
SERVER = ROOT / "dev/office-demo/server.js"


def assert_frame_target(state, expected, scenario_id, frame_id):
    world = state["world"]
    scenes = world["scenes"]
    scene_templates = {scene["templateId"] for scene in scenes}
    scene_kinds = {scene["kind"] for scene in scenes}
    effects = {f"quiet:{effect['kind']}" for effect in world["quietEffects"]}
    effects.update(f"abandoned:{effect['kind']}" for effect in world["abandonedEffects"])
    characters = world["characters"]
    snapshot = state["snapshot"]
    agents = snapshot["agents"]
    expected_providers = expected.get("providers", [])
    for provider in expected_providers:
        actual = next((item for item in snapshot["providers"] if item["id"] == provider["id"]), None)
        if actual is None or actual["availability"] != provider["availability"]:
            raise RuntimeError(f"Frame {scenario_id}:{frame_id} provider mismatch: {provider}")
    for key, actual_count in (("sessionCount", len(snapshot["sessions"])), ("agentCount", len(agents)), ("feedCount", len(snapshot["feed"]))):
        if key in expected and expected[key] != actual_count:
            raise RuntimeError(f"Frame {scenario_id}:{frame_id} expected {expected[key]} {key}, got {actual_count}")
    for preference, expected_value in expected.get("preferences", {}).items():
        actual_value = state["preferences"].get(preference)
        if preference == "hiddenSessionTitles" and isinstance(expected_value, list):
            actual_hidden = {key for key, hidden in actual_value.items() if hidden is True} if isinstance(actual_value, dict) else set()
            if actual_hidden != set(expected_value):
                raise RuntimeError(f"Frame {scenario_id}:{frame_id} hidden-title preferences mismatch")
        elif actual_value != expected_value:
            raise RuntimeError(f"Frame {scenario_id}:{frame_id} preference mismatch for {preference}")
    for key, expected_values, actual_values in (
        ("sceneTemplateIds", expected.get("sceneTemplateIds", []), scene_templates),
        ("sceneKinds", expected.get("sceneKinds", []), scene_kinds),
        ("effectKinds", expected.get("effectKinds", []), effects),
    ):
        missing = set(expected_values) - actual_values
        if missing:
            raise RuntimeError(f"Frame {scenario_id}:{frame_id} missed {key}: {sorted(missing)}")
    for template_id, count in expected.get("sceneParticipantCounts", {}).items():
        actual = [len(scene["participants"]) for scene in scenes if scene["templateId"] == template_id]
        if count not in actual:
            raise RuntimeError(f"Frame {scenario_id}:{frame_id} expected {count} participants in {template_id}, got {actual}")
    for route in expected.get("sceneRoutes", []):
        actual = next((scene for scene in scenes if scene["templateId"] == route["templateId"]), None)
        if actual is None or actual["route"] != route["route"] or route.get("phase", actual["phase"]) != actual["phase"]:
            raise RuntimeError(f"Frame {scenario_id}:{frame_id} scene route mismatch: {route}")
    for location in expected.get("propLocations", []):
        if not any(prop["kind"] == location["kind"] and prop["location"] == location["location"] for prop in world["props"]):
            raise RuntimeError(f"Frame {scenario_id}:{frame_id} missed prop location: {location}")
    actor_kinds = {actor["kind"] for actor in world["actors"]}
    if not set(expected.get("actorKinds", [])).issubset(actor_kinds):
        raise RuntimeError(f"Frame {scenario_id}:{frame_id} missed actor kinds: {expected.get('actorKinds')}")
    for route in expected.get("actorRoutes", []):
        if not any(actor["kind"] == route["kind"] and actor["route"] == route["route"] for actor in world["actors"]):
            raise RuntimeError(f"Frame {scenario_id}:{frame_id} missed actor route: {route}")
    for character in expected.get("poses", []):
        if not any((not character.get("agentId") or agent["agentId"] == character["agentId"]) and agent["pose"] == character["pose"] for agent in characters):
            raise RuntimeError(f"Frame {scenario_id}:{frame_id} missed expected pose {character}")
    for character in expected.get("agentStates", []):
        if not any(
            (not character.get("agentId") or agent["id"] == character["agentId"])
            and agent["state"] == character["state"]
            and ("lastTurnOutcome" not in character or agent["lastTurnOutcome"] == character["lastTurnOutcome"])
            and ("ended" not in character or agent["ended"] == character["ended"])
            for agent in agents
        ):
            raise RuntimeError(f"Frame {scenario_id}:{frame_id} missed expected agent state {character}")
    if "dialogue" in expected and bool(world["dialogue"]) != expected["dialogue"]:
        raise RuntimeError(f"Frame {scenario_id}:{frame_id} dialogue state mismatch")


def verify_preference_isolation(page, base_url, scenario):
    frame = scenario["frames"][0]
    query = urlencode({"scenario": scenario["id"], "frame": frame["id"]})
    page.goto(f"{base_url}?{query}", wait_until="networkidle")
    preview_url = page.locator("#office-preview").get_attribute("src")
    if not preview_url:
        raise RuntimeError("Missing preview for preference-store check")
    production_frame = next((candidate for candidate in page.frames if urlsplit(candidate.url).netloc == urlsplit(preview_url).netloc), None)
    if production_frame is None:
        raise RuntimeError("Production preference frame did not load")
    initial = page.request.get(f"{preview_url}state").json()["preferences"]["hideTitles"]
    page.frame_locator("#office-preview").locator("#hide-titles").set_checked(not initial)
    production_frame.wait_for_function("() => document.querySelector('#preference-status')?.textContent === 'Preferences saved locally.'")
    saved = page.request.get(f"{preview_url}state").json()["preferences"]["hideTitles"]
    if saved is not (not initial):
        raise RuntimeError("Production preference store did not persist the fixture setting")
    production_frame.goto(preview_url, wait_until="networkidle")
    if page.frame_locator("#office-preview").locator("#hide-titles").is_checked() is not saved:
        raise RuntimeError("Production preference store did not survive page reload")
    page.locator("#reset").click()
    page.wait_for_function('(old) => document.querySelector("#office-preview").src !== old', arg=preview_url)
    reset_url = page.locator("#office-preview").get_attribute("src")
    reset_value = page.request.get(f"{reset_url}state").json()["preferences"]["hideTitles"]
    if reset_value is not initial:
        raise RuntimeError("Scenario reset did not isolate its temporary preference store")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(tempfile.gettempdir()) / "pixel-agents-office-demo-captures")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    process = subprocess.Popen(["node", str(SERVER)], cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    scratch = None
    try:
        if process.stdout is None:
            raise RuntimeError("Demo server output is unavailable")
        base_url = process.stdout.readline().strip()
        if not base_url.startswith("http://127.0.0.1:"):
            raise RuntimeError("Demo server did not provide a loopback URL")
        with urlopen(f"{base_url}api/scenarios", timeout=5) as response:
            scenarios = json.load(response)
        scratch = Path(tempfile.mkdtemp(prefix="office-demo-chrome-"))
        with sync_playwright() as playwright:
            browser_path = shutil.which("google-chrome") or shutil.which("chromium") or shutil.which("chromium-browser")
            launch_options = {"headless": True, "env": {**os.environ, "TMPDIR": str(scratch)}}
            if browser_path:
                launch_options["executable_path"] = browser_path
            browser = playwright.chromium.launch(**launch_options)
            page = browser.new_page(viewport={"width": 1500, "height": 1100}, device_scale_factor=1)
            external_requests = []
            page_errors = []
            page.on("request", lambda request: external_requests.append(request.url) if request.url.startswith(("http://", "https://")) and urlsplit(request.url).hostname != "127.0.0.1" else None)
            page.on("pageerror", lambda error: page_errors.append(str(error)))
            captured = []
            covered_situations = set()
            for scenario in scenarios:
                frames = scenario["frames"] or [{
                    "id": "default",
                    "scenarioId": scenario["id"],
                    "atMs": scenario["defaultAtMs"],
                    "covers": scenario["covers"],
                    "expected": {"viewport": scenario["viewport"], "reducedMotion": scenario["reducedMotion"]},
                }]
                for named_frame in frames:
                    if named_frame["scenarioId"] != scenario["id"] or not named_frame["covers"]:
                        raise RuntimeError(f"Invalid frame ownership or missing coverage labels: {named_frame['id']}")
                    covered_situations.update(named_frame["covers"])
                    expected = named_frame["expected"]
                    reduce_motion = expected.get("reducedMotion", scenario.get("reducedMotion", False))
                    page.emulate_media(reduced_motion="reduce" if reduce_motion else "no-preference")
                    query_values = {"scenario": scenario["id"]}
                    if scenario["frames"]:
                        query_values["frame"] = named_frame["id"]
                    query = urlencode(query_values)
                    page.goto(f"{base_url}?{query}", wait_until="networkidle")
                    selected_scenario = page.locator("#scenario-select").input_value()
                    selected_frame = page.locator("#frame-select").input_value()
                    expected_frame = named_frame["id"] if scenario["frames"] else ""
                    if selected_scenario != scenario["id"] or selected_frame != expected_frame:
                        raise RuntimeError(f"Stable scenario URL selected {selected_scenario}:{selected_frame}, expected {scenario['id']}:{expected_frame}")
                    frame_buttons = page.locator("#frame-list button[data-frame]")
                    if frame_buttons.count() != len(scenario["frames"]):
                        raise RuntimeError(f"Frame index mismatch for {scenario['id']}: {frame_buttons.count()} of {len(scenario['frames'])} frames")
                    if scenario["frames"]:
                        current_frame = page.locator("#frame-list button[aria-current='step']").get_attribute("data-frame")
                        if current_frame != named_frame["id"]:
                            raise RuntimeError(f"Frame index did not highlight {scenario['id']}:{named_frame['id']}")
                        frame_index = next(index for index, item in enumerate(scenario["frames"]) if item["id"] == named_frame["id"])
                        if page.locator("#frame-previous").is_disabled() != (frame_index == 0):
                            raise RuntimeError(f"Previous-frame boundary mismatch for {scenario['id']}:{named_frame['id']}")
                        if page.locator("#frame-next").is_disabled() != (frame_index == len(scenario['frames']) - 1):
                            raise RuntimeError(f"Next-frame boundary mismatch for {scenario['id']}:{named_frame['id']}")
                    page.wait_for_function("document.querySelector('#office-preview').src.startsWith('http://127.0.0.1:')")
                    preview_url = page.locator("#office-preview").get_attribute("src")
                    if not preview_url:
                        raise RuntimeError(f"Missing production preview for {scenario['id']}:{named_frame['id']}")
                    production_frame = next((candidate for candidate in page.frames if urlsplit(candidate.url).netloc == urlsplit(preview_url).netloc), None)
                    if production_frame is None:
                        raise RuntimeError(f"Production iframe did not load for {scenario['id']}:{named_frame['id']}")
                    production_frame.wait_for_function("() => document.querySelector('#occupancy')?.textContent !== 'Loading agents'")
                    state_response = page.request.get(f"{preview_url}state")
                    if not state_response.ok:
                        raise RuntimeError(f"Production state route failed for {scenario['id']}:{named_frame['id']}")
                    state = state_response.json()
                    if state.get("world", {}).get("fictionLabel") != "Office fiction — not provider activity or collaboration":
                        raise RuntimeError(f"Production state did not load for {scenario['id']}:{named_frame['id']}")
                    assert_frame_target(state, expected, scenario["id"], named_frame["id"])
                    reduced = page.frame_locator("#office-preview").locator("html").evaluate("() => window.matchMedia('(prefers-reduced-motion: reduce)').matches")
                    if reduced != bool(reduce_motion):
                        raise RuntimeError(f"Reduced-motion preference mismatch for {scenario['id']}:{named_frame['id']}")
                    if reduce_motion:
                        motion_style = page.frame_locator("#office-preview").locator("html").evaluate("el => [getComputedStyle(el).animationDuration, getComputedStyle(el).transitionDuration]")
                        if motion_style != ["0s", "0s"]:
                            raise RuntimeError(f"Production reduced-motion styles were not applied for {scenario['id']}:{named_frame['id']}")
                    target_viewport = expected.get("viewport", scenario.get("viewport", "wide"))
                    width = page.frame_locator("#office-preview").locator("html").evaluate("() => window.innerWidth")
                    valid_width = width <= 400 if target_viewport == "narrow" else 400 < width <= 830 if target_viewport == "tablet" else width > 830
                    if not valid_width:
                        raise RuntimeError(f"Viewport mismatch for {scenario['id']}:{named_frame['id']}: {width}px ({target_viewport})")
                    if not page.get_by_text("DEVELOPMENT PREVIEW · SYNTHETIC DATA").is_visible():
                        raise RuntimeError("Screenshot is missing its development-context label")
                    providers = state["snapshot"]["providers"]
                    preview_origin = f"{urlsplit(preview_url).scheme}://{urlsplit(preview_url).netloc}"
                    for action in ("enable", "refresh", "disable"):
                        response = page.request.post(
                            f"{preview_url}codex/{action}",
                            data="{}",
                            headers={"content-type": "application/json", "origin": preview_origin},
                        )
                        if not response.ok or response.json().get("providers") != providers:
                            raise RuntimeError(f"Demo provider action was not inert: {action}")
                    stem = re.sub(r"[^A-Za-z0-9._-]", "_", f"{scenario['id']}--{named_frame['id']}")
                    page.screenshot(path=str(args.output / f"{stem}.png"), full_page=True)
                    captured.append(stem)
            preference_scenario = next(scenario for scenario in scenarios if scenario["id"] == "no-observation")
            verify_preference_isolation(page, base_url, preference_scenario)
            action_scenario = next(scenario for scenario in scenarios if scenario["id"] == "office-actions")
            if len(action_scenario["frames"]) < 2:
                raise RuntimeError("Office action scenario needs multiple named frames")
            last_frames = action_scenario["frames"][-2:]
            page.goto(f"{base_url}?{urlencode({'scenario': action_scenario['id'], 'frame': last_frames[0]['id']})}", wait_until="networkidle")
            page.locator("#frame-next").click()
            if page.locator("#frame-select").input_value() != last_frames[1]["id"]:
                raise RuntimeError("Scenario frame navigation did not advance to the next named frame")
            page.locator("#frame-previous").click()
            if page.locator("#frame-select").input_value() != last_frames[0]["id"]:
                raise RuntimeError("Scenario frame navigation did not return to the previous named frame")
            page.locator("#play-frames").click()
            page.wait_for_function(
                "frameId => document.querySelector('#frame-select').value === frameId && document.querySelector('#play-frames').getAttribute('aria-pressed') === 'false'",
                arg=last_frames[1]["id"], timeout=8000,
            )
            if page.locator("#play-frames").text_content() != "Play frames":
                raise RuntimeError("Scenario frame playback did not stop at the final selected frame")
            browser.close()
            if external_requests:
                raise RuntimeError(f"Unexpected non-loopback browser requests: {external_requests}")
            if page_errors:
                raise RuntimeError(f"Browser page errors: {page_errors}")
        print(f"Captured {len(captured)} named production-renderer frames covering {len(covered_situations)} catalog situations in {args.output}")
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
        if scratch is not None:
            shutil.rmtree(scratch, ignore_errors=True)
        leaked_preferences = list(Path(tempfile.gettempdir()).glob(f"pixel-agents-office-demo-{process.pid}-*"))
        if leaked_preferences:
            raise RuntimeError(f"Temporary production preferences were not removed: {leaked_preferences}")


if __name__ == "__main__":
    main()
