"""Loopback browser regressions. Run with Python Playwright and local Google Chrome installed."""
import copy
import json
import os
import shutil
import subprocess
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[4]
SOURCE = ROOT / ".github/extensions/pixel-agents-canvas/src"


def fixture():
    sessions = [dict(id=f"session-{i}", provider="Codex", sourceId=f"thread-{i}",
                     title="Review frontend accessibility", parentSessionId=None,
                     archived=False, closed=False, endedAt=None) for i in range(2)]
    agents = [dict(id=f"agent-{i}", sessionId=session["id"], provider="Codex",
                   sourceId=f"source-{i}", name='Provider <img src=x onerror="alert(1)">',
                   role="Reported role", parentAgentId=None, state="idle", waitingReason=None,
                   connected=True, freshness="fresh", observedAt=1000, lastActivityAt=1000,
                   ended=False, endedAt=None, lastTurnOutcome=None)
              for i, session in enumerate(sessions)]
    return dict(snapshot=dict(now=1000, providers=[], sessions=sessions, agents=agents,
                              feed=[dict(id=1, provider="Codex", agentId="agent-0",
                                         sessionId="session-0", label="Observed idle", at=1000)]),
                preferences=dict(hideTitles=False, hiddenSessionTitles={}, showEnded=False,
                                 vignettes=True, dialogue=True, appearances={
                                     "agent-0": dict(nickname="Local alias", palette="#aabbcc",
                                                     outfit="vest", accessory="glasses", deskProp="plant")}))


def render_state(state):
    return subprocess.run([
        "node", "--input-type=module", "-e",
        "import {renderHtml} from './.github/extensions/pixel-agents-canvas/src/renderer.js';"
        "let text='';for await (const chunk of process.stdin) text+=chunk;"
        "console.log(renderHtml({instanceId:'browser-regression',state:JSON.parse(text)}));",
    ], input=json.dumps(state), capture_output=True, text=True, cwd=ROOT, check=True).stdout


class OfficeBrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.state = fixture()
        rendered = render_state(cls.state)

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                path = self.path.split("?", 1)[0]
                if path == "/":
                    body, mime = rendered.encode(), "text/html"
                elif path in {"/office-client.js", "/office-world.js", "/office.css"}:
                    body = (SOURCE / path[1:]).read_bytes()
                    mime = "text/css" if path.endswith(".css") else "text/javascript"
                else:
                    self.send_error(404)
                    return
                self.send_response(200)
                self.send_header("Content-Type", mime)
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *_args):
                pass

        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever)
        cls.thread.start()
        cls.scratch = ROOT / f".office-ui-browser-{os.getpid()}"
        cls.scratch.mkdir()
        tempfile.tempdir = str(cls.scratch)
        cls.playwright = sync_playwright().start()
        try:
            cls.browser = cls.playwright.chromium.launch(channel="chrome", headless=True,
                                                        env={**os.environ, "TMPDIR": str(cls.scratch)})
        except Exception:
            cls.playwright.stop()
            cls.server.shutdown()
            cls.server.server_close()
            cls.thread.join()
            shutil.rmtree(cls.scratch)
            raise

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        shutil.rmtree(cls.scratch)

    def setUp(self):
        self.saved = copy.deepcopy(self.state)
        self.posts = []
        self.page = self.browser.new_page(reduced_motion="reduce", viewport={"width": 1440, "height": 1100})
        self.page.add_init_script("""
            window.officeIntervals = new Map();
            window.officeIntervalStarts = 0;
            window.setInterval = (callback, delay) => {
                window.officeIntervalStarts++;
                window.officeIntervals.set(delay, callback);
                return delay;
            };
            window.clearInterval = delay => window.officeIntervals.delete(delay);
        """)
        self.page.route("**/state", lambda route: route.fulfill(json=self.saved))

        def preferences(route):
            patch = route.request.post_data_json
            self.posts.append(patch)
            # The real preference store merges appearance entries; omission is not deletion.
            old = self.saved["preferences"]
            self.saved["preferences"] = {**old, **patch, "appearances": {**old["appearances"], **patch.get("appearances", {})}}
            route.fulfill(json=self.saved["preferences"])

        self.page.route("**/preferences", preferences)
        self.page.goto(f"http://127.0.0.1:{self.server.server_port}/")
        self.page.wait_for_selector("button.character")
        self.page.evaluate("""async state => {
            const {drawOffice} = await import('/office-client.js');
            const {createOfficeWorld, deterministicAppearance} = await import('/office-world.js');
            const world = createOfficeWorld({clock: () => 1000});
            world.update(state.snapshot, state.preferences);
            window.uiTest = {state, view: world.view(), drawOffice, deterministicAppearance};
        }""", self.state)

    def tearDown(self):
        self.page.close()

    def test_preference_patches_preserve_other_hosts_appearances(self):
        cached_b = dict(nickname="Cached B", palette="#112233", outfit="shirt", accessory="none", deskProp="book")
        self.saved["preferences"]["appearances"]["agent-1"] = cached_b
        url = f"http://127.0.0.1:{self.server.server_port}/"
        self.page.route(url, lambda route: route.fulfill(body=render_state(self.saved), content_type="text/html"))
        self.page.reload()
        self.page.wait_for_selector("button.character")
        concurrent_b = {**cached_b, "nickname": "Another host's B"}
        self.saved["preferences"]["appearances"]["agent-1"] = concurrent_b
        with self.page.expect_response("**/preferences"):
            self.page.locator("#hide-titles").check()
        self.assertEqual(self.posts[-1], {"hideTitles": True})
        self.assertEqual(self.saved["preferences"]["appearances"]["agent-1"], concurrent_b)
        self.page.wait_for_function("document.querySelector('#preference-status').textContent === 'Preferences saved locally.'")
        concurrent_b = {**concurrent_b, "palette": "#445566"}
        self.saved["preferences"]["appearances"]["agent-1"] = concurrent_b
        self.saved["preferences"]["hideTitles"] = False
        self.page.locator('button.character[data-agent="agent-0"]').click()
        self.page.locator(".customization summary").click()
        self.page.locator('[name="nickname"]').fill("Edited A")
        expected_a = {**self.saved["preferences"]["appearances"]["agent-0"], "nickname": "Edited A"}
        with self.page.expect_response("**/preferences"):
            self.page.locator('#appearance-form button[type="submit"]').click()
        self.assertEqual(self.posts[-1], {"appearances": {"agent-0": expected_a}})
        self.assertEqual(self.saved["preferences"]["appearances"]["agent-1"], concurrent_b)
        self.assertFalse(self.saved["preferences"]["hideTitles"])
        self.page.wait_for_function("!document.querySelector('#hide-titles').checked")
        with self.page.expect_response("**/preferences"):
            self.page.locator('button[data-title="session-0"]').click()
        self.assertEqual(self.posts[-1], {"hiddenSessionTitles": {"session-0": True}})
        self.assertEqual(self.saved["preferences"]["appearances"]["agent-1"], concurrent_b)
        self.page.wait_for_function("document.querySelector('button[data-title=\"session-0\"]').getAttribute('aria-pressed') === 'true'")
        expected_default = self.page.evaluate("async () => (await import('/office-world.js')).deterministicAppearance('agent-0')")
        for attempt in range(2):
            if attempt:
                self.saved["preferences"]["appearances"]["agent-0"] = {**expected_default, "nickname": "Concurrent A"}
            self.page.locator(".customization summary").click()
            with self.page.expect_response("**/preferences"):
                self.page.locator("#reset-appearance").click()
            self.assertEqual(self.posts[-1], {"appearances": {"agent-0": expected_default}})
            self.assertEqual(self.saved["preferences"]["appearances"]["agent-0"], expected_default)
            self.assertEqual(self.saved["preferences"]["appearances"]["agent-1"], concurrent_b)
            self.page.wait_for_function("document.querySelector('[name=nickname]').value === ''")

    def hold_state_response(self):
        stale = copy.deepcopy(self.saved)
        self.page.evaluate("""() => {
            const originalFetch = window.fetch;
            window.originalOfficeFetch = originalFetch;
            window.fetch = (path, options) => {
                if (path !== '/state') return originalFetch(path, options);
                window.pendingStateSignal = options.signal;
                return new Promise(resolve => window.releaseState = state => resolve(new Response(JSON.stringify(state))));
            };
            officeIntervals.get(2000)();
        }""")
        return stale

    def test_inflight_poll_does_not_override_saved_preferences(self):
        stale = self.hold_state_response()
        with self.page.expect_response("**/preferences"):
            self.page.locator("#hide-titles").check()
        self.page.wait_for_function("document.querySelector('#preference-status').textContent === 'Preferences saved locally.'")
        stale["snapshot"]["agents"][0]["state"] = "working"
        self.page.evaluate("state => releaseState(state)", stale)
        self.page.wait_for_function("document.querySelector('button.character[data-agent=agent-0]').textContent.includes('Working')")
        self.assertTrue(self.page.locator("#hide-titles").is_checked())
        self.assertIn("Session title hidden", self.page.locator(".session-cluster").first.inner_text())

    def test_pagehide_pageshow_restarts_timers_and_ignores_old_requests(self):
        stale = self.hold_state_response()
        self.page.evaluate("dispatchEvent(new PageTransitionEvent('pagehide', {persisted:true}))")
        self.assertEqual(self.page.evaluate("officeIntervals.size"), 0)
        self.assertTrue(self.page.evaluate("pendingStateSignal.aborted"))
        self.saved["snapshot"]["agents"][0]["state"] = "working"
        # Only the suspended request is held; the reopened page must fetch current state.
        self.page.evaluate("""() => {
            window.fetch = (path, options) => globalThis.originalOfficeFetch(path, options);
        }""")
        with self.page.expect_response("**/state"):
            self.page.evaluate("dispatchEvent(new PageTransitionEvent('pageshow', {persisted:true}))")
        self.page.wait_for_function("document.querySelector('button.character[data-agent=agent-0]').textContent.includes('Working')")
        self.assertEqual(self.page.evaluate("[...officeIntervals.keys()].sort()"), [1000, 2000])
        self.page.evaluate("state => releaseState(state)", stale)
        self.page.wait_for_timeout(50)
        self.assertIn("Working", self.page.locator('button.character[data-agent="agent-0"]').inner_text())
        self.page.evaluate("dispatchEvent(new PageTransitionEvent('pageshow', {persisted:true}))")
        self.assertEqual(self.page.evaluate("officeIntervals.size"), 2)
        self.assertEqual(self.page.evaluate("officeIntervalStarts"), 4)
        self.page.evaluate("dispatchEvent(new PageTransitionEvent('pagehide', {persisted:true}))")
        self.assertEqual(self.page.evaluate("officeIntervals.size"), 0)
        with self.page.expect_response("**/state"):
            self.page.evaluate("dispatchEvent(new PageTransitionEvent('pageshow', {persisted:true}))")
        self.assertEqual(self.page.evaluate("officeIntervals.size"), 2)

    def test_authoritative_props_survive_reload_without_local_scenes(self):
        self.saved["world"] = self.page.evaluate("""() => {
            const view = uiTest.view; const character = view.characters[0];
            view.props = [{id:'server-paper', spaceId:character.spaceId, deskIndex:character.deskIndex,
                kind:'paper', position:{...character.deskPosition}, createdAt:900,
                cleanupSceneId:null, fictional:true}];
            return view;
        }""")
        url = f"http://127.0.0.1:{self.server.server_port}/"
        self.page.route(url, lambda route: route.fulfill(body=render_state(self.saved), content_type="text/html"))
        self.page.reload()
        self.page.wait_for_selector('[data-prop="server-paper"]')
        self.assertEqual(self.page.locator(".scene-badge").count(), 0)
        self.page.evaluate("""() => {
            window.preservedProp = document.querySelector('[data-prop="server-paper"]');
            for (let i=0; i<40; i++) officeIntervals.get(1000)();
        }""")
        self.assertTrue(self.page.evaluate("preservedProp === document.querySelector('[data-prop=server-paper]')"))
        self.assertEqual(self.page.locator(".scene-badge").count(), 0)
        self.page.reload()
        self.page.wait_for_selector('[data-prop="server-paper"]')
        self.assertTrue(self.page.locator('[data-prop="server-paper"]').is_visible())
        view = self.saved["world"]
        host = view["clusters"][0]
        view["scenes"] = [dict(id="server-social", templateId="chat", kind="vignette", label="Server-authored chat",
                               participants=[c["agentId"] for c in view["characters"]],
                               startedAt=1000, endsAt=5000, fictional=True)]
        for index, character in enumerate(view["characters"]):
            character["sceneId"] = "server-social"
            character["position"] = dict(x=host["position"]["x"] + 160 + index * 30,
                                         y=host["position"]["y"] + 40)
            character["pose"] = "vignette"
        with self.page.expect_response("**/state"):
            self.page.evaluate("officeIntervals.get(2000)()")
        self.page.wait_for_function("document.querySelector('.scene-badge')?.textContent.includes('Server-authored chat')")
        self.page.evaluate("officeIntervals.get(1000)()")
        self.assertEqual(self.page.locator(".scene-badge").count(), 2)
        self.assertTrue(self.page.locator('[data-prop="server-paper"]').is_visible())
        view["scenes"] = []
        view["props"] = []
        for character in view["characters"]:
            character["sceneId"] = None
            character["position"] = copy.deepcopy(character["deskPosition"])
            character["pose"] = "rest"
        with self.page.expect_response("**/state"):
            self.page.evaluate("officeIntervals.get(2000)()")
        self.page.wait_for_function("!document.querySelector('[data-prop=server-paper]')")
        self.assertEqual(self.page.locator(".scene-badge").count(), 0)

    def test_reset_upserts_deterministic_appearance(self):
        self.page.locator('button.character[data-agent="agent-0"]').click()
        self.page.locator(".customization summary").click()
        self.assertEqual(self.page.locator('[name="nickname"]').get_attribute("maxlength"), "64")
        truncated = self.page.evaluate("""async () => {
            const {parsePreferences} = await import('/office-client.js');
            return parsePreferences({appearances:{agent:{nickname:'n'.repeat(80)}}}).appearances.agent.nickname;
        }""")
        self.assertEqual(len(truncated), 64)
        with self.page.expect_response("**/preferences"):
            self.page.locator("#reset-appearance").click()
        expected = self.page.evaluate("uiTest.deterministicAppearance('agent-0')")
        self.assertEqual(self.posts[-1]["appearances"].get("agent-0"), expected)
        self.assertEqual(self.saved["preferences"]["appearances"]["agent-0"], expected)
        self.page.wait_for_function("document.querySelector('[name=nickname]').value === ''")
        self.assertTrue(self.page.locator(".customization summary").evaluate("node => node === document.activeElement"))

    def test_poll_never_detaches_focused_editor(self):
        self.page.locator('button.character[data-agent="agent-0"]').click()
        self.page.locator(".customization summary").click()
        self.page.locator('[name="nickname"]').fill("Unsubmitted draft")
        self.page.evaluate("""() => {
            window.editingForm = document.querySelector('#appearance-form');
            window.editedInput = document.activeElement;
            editedInput.setSelectionRange(2, 7);
            window.editorDetached = false;
            new MutationObserver(records => {
                for (const record of records) for (const node of record.removedNodes)
                    if (node === editingForm || node.contains?.(editingForm)) window.editorDetached = true;
            }).observe(document.querySelector('#details'), {childList: true, subtree: true});
        }""")
        self.saved["snapshot"]["agents"][0]["state"] = "working"
        with self.page.expect_response("**/state"):
            self.page.evaluate("officeIntervals.get(2000)()")
        self.page.wait_for_function("document.querySelector('.detail-status').textContent.includes('Working')")
        self.assertFalse(self.page.evaluate("editorDetached"))
        self.assertTrue(self.page.evaluate("editedInput === document.activeElement && editingForm.isConnected"))
        self.assertEqual(self.page.locator('[name="nickname"]').input_value(), "Unsubmitted draft")
        self.assertEqual(self.page.evaluate("[editedInput.selectionStart, editedInput.selectionEnd]"), [2, 7])
        self.page.keyboard.press("Escape")
        self.assertTrue(self.page.locator('button.character[data-agent="agent-0"]').evaluate("node => node === document.activeElement"))

    def test_active_first_order_is_deterministic_without_inferred_terminal_states(self):
        base = self.saved["snapshot"]["agents"][0]
        entries = [
            ("z-ended", "a-ended", "working", "fresh", True),
            ("y-stale", "b-stale", "working", "stale", False),
            ("x-unknown", "c-unknown", "unknown", "unknown", False),
            ("w-completed", "d-completed", "completed", "fresh", False),
            ("v-idle", "e-idle", "idle", "fresh", False),
            ("a-working", "z-active", "working", "fresh", False),
            ("b-waiting", "z-active", "waiting", "fresh", False),
            ("c-failed", "y-attention", "failed", "fresh", False),
        ]
        self.saved["snapshot"]["agents"] = [
            {**base, "id": identity, "sessionId": session, "state": status, "freshness": freshness,
             "ended": ended, "endedAt": 1000 if ended else None, "lastTurnOutcome": "completed"}
            for identity, session, status, freshness, ended in entries]
        session = self.saved["snapshot"]["sessions"][0]
        self.saved["snapshot"]["sessions"] = [
            {**session, "id": identity, "archived": True} for identity in dict.fromkeys(row[1] for row in entries)]
        self.saved["preferences"]["showEnded"] = True
        original = copy.deepcopy(self.saved)
        with self.page.expect_response("**/state"):
            self.page.evaluate("officeIntervals.get(2000)()")
        expected = ["a-working", "b-waiting", "c-failed", "v-idle", "w-completed", "x-unknown", "y-stale", "z-ended"]
        self.page.wait_for_function("document.querySelector('.roster-entry')?.dataset.agent === 'a-working'")
        self.assertEqual(self.page.locator(".roster-entry").evaluate_all("nodes => nodes.map(node => node.dataset.agent)"), expected)
        self.assertEqual(self.page.locator(".session-cluster[data-session]").evaluate_all("nodes => nodes.map(node => node.dataset.session)"),
                         ["y-attention", "z-active", "e-idle", "b-stale", "c-unknown", "d-completed", "a-ended"])
        self.assertEqual(self.page.locator('[data-session="z-active"] button.character').evaluate_all("nodes => nodes.map(node => node.dataset.agent)"),
                         ["a-working", "b-waiting"])
        self.assertEqual(self.saved, original)
        self.assertTrue(self.page.evaluate("""state => {
            state.snapshot.agents.reverse(); state.snapshot.sessions.reverse();
            const original = JSON.stringify(state);
            uiTest.drawOffice(document, state);
            return JSON.stringify(state) === original;
        }""", self.saved))
        with self.page.expect_response("**/state"):
            self.page.evaluate("officeIntervals.get(2000)()")
        self.page.wait_for_function("document.querySelector('.roster-entry')?.dataset.agent === 'a-working'")
        self.page.locator('.roster-entry[data-agent="v-idle"]').click()
        self.page.locator('.roster-entry[data-agent="v-idle"]').focus()
        self.saved["snapshot"]["agents"].reverse()
        self.saved["snapshot"]["sessions"].reverse()
        with self.page.expect_response("**/state"):
            self.page.evaluate("officeIntervals.get(2000)()")
        self.page.wait_for_function("document.activeElement?.dataset.agent === 'v-idle'")
        self.assertEqual(self.page.locator(".roster-entry").evaluate_all("nodes => nodes.map(node => node.dataset.agent)"), expected)
        self.assertEqual(self.page.locator('#appearance-form').get_attribute("data-appearance"), "v-idle")
        self.assertEqual(self.page.locator('.roster-entry[data-agent="v-idle"]').get_attribute("aria-pressed"), "true")
        with self.page.expect_response("**/preferences"):
            self.page.locator("#show-ended").uncheck()
        self.page.wait_for_function("document.querySelectorAll('.roster-entry').length === 7")
        self.assertEqual(self.page.locator(".roster-entry").evaluate_all("nodes => nodes.map(node => node.dataset.agent)"), expected[:-1])

    def test_active_orphan_group_precedes_idle_and_ended_clusters(self):
        self.saved["snapshot"]["agents"][0]["state"] = "working"
        self.saved["snapshot"]["agents"][0]["sessionId"] = "metadata-unavailable"
        self.saved["snapshot"]["agents"].append({**self.saved["snapshot"]["agents"][1],
            "id": "ended", "sessionId": "ended-session", "ended": True, "endedAt": 1000})
        self.saved["snapshot"]["sessions"].append({**self.saved["snapshot"]["sessions"][1],
            "id": "ended-session", "closed": True, "endedAt": 1000})
        self.saved["preferences"]["showEnded"] = True
        with self.page.expect_response("**/state"):
            self.page.evaluate("officeIntervals.get(2000)()")
        self.page.wait_for_function("document.querySelectorAll('.roster-entry').length === 3")
        self.assertIn("Session metadata unavailable", self.page.locator(".session-cluster").first.inner_text())
        self.assertEqual(self.page.locator(".session-cluster").last.get_attribute("data-session"), "ended-session")
        self.assertEqual(self.page.locator(".session-cluster").first.locator("button.character").get_attribute("data-agent"), "agent-0")

    def test_feed_shows_escaped_local_or_provider_identity_with_generic_fallback(self):
        nickname = '<img src=x onerror="alert(1)"> Local'
        self.saved["preferences"]["appearances"]["agent-0"]["nickname"] = nickname
        entry = self.saved["snapshot"]["feed"][0]
        self.saved["snapshot"]["feed"] = [
            {**entry, "id": index + 1, "agentId": identity, "at": 1000 + index}
            for index, identity in enumerate(["agent-0", "agent-1", "not-observed", None])]
        with self.page.expect_response("**/state"):
            self.page.evaluate("officeIntervals.get(2000)()")
        self.page.wait_for_function("document.querySelectorAll('#feed li').length === 4")
        rows = self.page.locator("#feed li").all_inner_texts()
        self.assertIn("Agent identity unavailable", rows[0])
        self.assertIn("Agent identity unavailable", rows[1])
        self.assertIn(self.saved["snapshot"]["agents"][1]["name"], rows[2])
        self.assertIn(nickname, rows[3])
        self.assertEqual(self.page.locator("#feed img, #feed [onerror]").count(), 0)
        self.assertEqual(self.page.locator("#feed time").count(), 4)
        for row in rows:
            self.assertIn("Codex", row)
            self.assertIn("Observed idle", row)

    def test_feed_identity_wraps_in_narrow_layout(self):
        self.saved["preferences"]["appearances"]["agent-0"]["nickname"] = "N" * 64
        with self.page.expect_response("**/state"):
            self.page.evaluate("officeIntervals.get(2000)()")
        self.page.wait_for_function("document.querySelector('#feed').textContent.includes('N'.repeat(64))")
        for width in (1440, 390):
            with self.subTest(width=width):
                self.page.set_viewport_size({"width": width, "height": 1100})
                self.assertTrue(self.page.locator("#feed").evaluate("node => node.scrollWidth <= node.clientWidth"))

    def stage_scene(self):
        self.page.evaluate("""() => {
            const {view} = uiTest;
            const host = view.clusters[0];
            view.scenes = [{id:'social', templateId:'chat', kind:'vignette', label:'Friendly chat',
                participants:view.characters.map(c => c.agentId), startedAt:1000, endsAt:5000, fictional:true}];
            view.characters.forEach((c, i) => {
                c.position = {x:host.position.x + 160 + i * 30, y:host.position.y + 40};
                c.sceneId = 'social'; c.pose = 'vignette';
            });
            uiTest.drawOffice(document, uiTest.state, null, view);
        }""")

    def test_cross_cluster_gathering_cleanup_and_return(self):
        for width in (1440, 390):
            with self.subTest(width=width):
                self.page.set_viewport_size({"width": width, "height": 1100})
                self.page.wait_for_timeout(50)
                self.page.evaluate("""() => {
                    uiTest.view.scenes = []; uiTest.view.props = [];
                    uiTest.view.characters.forEach(c => {c.sceneId=null; c.position={...c.deskPosition};});
                    uiTest.drawOffice(document, uiTest.state, null, uiTest.view);
                }""")
                actor = self.page.locator('button.character[data-agent="agent-1"] > .pixel-person')
                status = self.page.locator('button.character[data-agent="agent-1"] > .status-chip')
                desk = actor.bounding_box()
                factual = status.bounding_box()
                feed = self.page.locator("#feed").inner_text()
                self.stage_scene()
                moved = actor.bounding_box()
                host = self.page.locator('[data-session="session-0"]').bounding_box()
                self.assertGreater(abs(moved["x"] - desk["x"]) + abs(moved["y"] - desk["y"]), 100)
                self.assertTrue(host["x"] <= moved["x"] <= host["x"] + host["width"])
                self.assertTrue(host["y"] <= moved["y"] <= host["y"] + host["height"])
                self.assertEqual(status.bounding_box()["x"], factual["x"])
                self.assertTrue(status.is_visible())
                self.assertIn("Idle", status.inner_text())
                provider = self.page.locator('button.character[data-agent="agent-1"] > .character-provider')
                self.assertTrue(provider.is_visible())
                self.assertEqual(provider.inner_text(), "Codex")
                self.assertTrue(self.page.locator('button.character[data-agent="agent-1"] > .freshness').is_visible())
                self.assertEqual(self.page.locator("#feed").inner_text(), feed)
                self.assertEqual(self.page.locator("#agent-layer img").count(), 0)
                self.assertEqual(actor.evaluate("el => getComputedStyle(el).transitionDuration"), "0s")
                self.assertEqual(actor.evaluate("el => getComputedStyle(el).animationName"), "none")
                self.page.evaluate("""() => {
                    const {view} = uiTest; const target = view.characters[1];
                    view.props = [{id:'paper', spaceId:target.spaceId, deskIndex:target.deskIndex,
                        kind:'paper', position:{...target.deskPosition}, createdAt:1000,
                        cleanupSceneId:null, fictional:true}];
                    uiTest.drawOffice(document, uiTest.state, null, view);
                    window.persistentProp = document.querySelector('[data-prop="paper"]');
                    view.props[0].cleanupSceneId='social';
                    view.scenes[0].kind='cleanup'; view.scenes[0].label='Tidying';
                    view.characters.forEach(c => {c.position={...target.deskPosition}; c.pose='cleanup';});
                    uiTest.drawOffice(document, uiTest.state, null, view);
                }""")
                prop = self.page.locator('[data-prop="paper"]')
                self.assertTrue(prop.is_visible())
                self.assertTrue(self.page.evaluate("persistentProp === document.querySelector('[data-prop=paper]')"))
                self.assertIn("picking up", prop.inner_text())
                cleaner = self.page.locator('button.character[data-agent="agent-0"] > .pixel-person')
                self.assertLess(abs(cleaner.bounding_box()["y"] - prop.bounding_box()["y"]), 65)
                self.page.evaluate("""() => {
                    uiTest.view.props=[]; uiTest.view.scenes=[];
                    uiTest.view.characters.forEach(c => {c.sceneId=null; c.position={...c.deskPosition};});
                    uiTest.drawOffice(document, uiTest.state, null, uiTest.view);
                }""")
                self.assertEqual(self.page.locator('[data-prop="paper"]').count(), 0)
                self.assertEqual(actor.bounding_box(), desk)
                self.assertLessEqual(self.page.evaluate("document.documentElement.scrollWidth"), width)

    def test_motion_returns_and_provider_interruption_is_immediate(self):
        self.page.emulate_media(reduced_motion="no-preference")
        actor = self.page.locator('button.character[data-agent="agent-1"] > .pixel-person')
        desk = actor.bounding_box()
        self.stage_scene()
        self.page.wait_for_timeout(850)
        self.assertNotEqual(actor.bounding_box(), desk)
        self.page.evaluate("""() => {
            uiTest.view.scenes=[];
            uiTest.view.characters.forEach(c => {c.sceneId=null; c.position={...c.deskPosition};});
            uiTest.drawOffice(document, uiTest.state, null, uiTest.view);
        }""")
        self.page.wait_for_timeout(850)
        self.assertEqual(actor.bounding_box(), desk)
        self.stage_scene()
        self.page.evaluate("""() => {
            uiTest.state.snapshot.agents[1].state='working';
            uiTest.view.scenes=[];
            uiTest.view.characters.forEach(c => {c.sceneId=null; c.position={...c.deskPosition};});
            uiTest.drawOffice(document, uiTest.state, null, uiTest.view);
        }""")
        self.assertIn("Working", self.page.locator('button.character[data-agent="agent-1"] > .status-chip').inner_text())
        self.assertEqual(self.page.locator(".scene-badge").count(), 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
