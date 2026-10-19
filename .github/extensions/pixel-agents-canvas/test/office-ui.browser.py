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
                elif path.startswith("/assets/") and path.endswith(".svg"):
                    body = (SOURCE.parent / "assets" / Path(path).name).read_bytes()
                    mime = "image/svg+xml"
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
            window.uiTest = {state, view: world.view(), drawOffice, deterministicAppearance, createOfficeWorld};
        }""", self.state)

    def tearDown(self):
        self.page.close()

    def test_semantic_scene_routes_use_shared_zone_anchors_and_keep_one_character_node(self):
        self.page.emulate_media(reduced_motion="no-preference")
        self.page.set_viewport_size({"width": 390, "height": 1100})
        self.page.evaluate("window.scrollTo(0, 0)")
        self.page.wait_for_timeout(50)
        original = self.page.locator("button.character[data-agent='agent-0']")
        original.evaluate("element => window.originalCharacterNode = element")
        desk = original.locator(".pixel-person").bounding_box()
        desk_scroll = self.page.evaluate("window.scrollY")
        self.page.evaluate("""() => {
            const {view} = uiTest;
            const character = view.characters.find(item => item.agentId === 'agent-0');
            view.scenes = [{id:'travel', templateId:'coffee', kind:'vignette', label:'Office fiction: Coffee',
                participants:['agent-0'], route:[{kind:'zone', zoneId:'coffee-station'}], phase:'walking',
                startedAt:view.now, endsAt:view.now + 10000, fictional:true}];
            character.sceneId = 'travel';
            uiTest.drawOffice(document, uiTest.state, null, view);
        }""")
        path = json.loads(original.get_attribute("data-walk-path"))
        self.assertGreater(len(path), 6)
        cluster = self.page.locator("[data-session=session-0]").bounding_box()
        aisle = self.page.locator("#office-aisle").bounding_box()
        exits = [
            {"x": cluster["x"] + cluster["width"] / 2, "y": cluster["y"] + cluster["height"] + 40},
            {"x": cluster["x"] - 40, "y": cluster["y"] + cluster["height"] / 2},
            {"x": cluster["x"] + cluster["width"] + 40, "y": cluster["y"] + cluster["height"] / 2},
        ]
        self.assertTrue(any(min(abs(point["x"] - exit["x"]) + abs(point["y"] - exit["y"]) for exit in exits) < 3 for point in path))
        self.assertTrue(any(abs(point["y"] - (aisle["y"] + aisle["height"] / 2)) < 16 for point in path))
        obstacles = [self.page.locator(".office-wall").bounding_box()]
        obstacles.extend(node.bounding_box() for node in self.page.locator(".session-cluster[data-session]").all() if node.get_attribute("data-session") != "session-0")
        obstacles.extend(node.bounding_box() for node in self.page.locator(".pixel-desk").all() if node.evaluate("element => !element.closest('[data-station]')?.dataset.station.includes('agent-0')"))
        for index, point in enumerate(path[2:], start=2):
            for obstacle in obstacles:
                self.assertFalse(self.path_point_overlaps(point, obstacle), f"walk route point {index} intersects an obstacle: {point}, {obstacle}")
        self.page.evaluate("""() => {
            uiTest.view.scenes[0].phase='acting';
            uiTest.drawOffice(document, uiTest.state, null, uiTest.view);
        }""")
        last = path[-1]
        person = original.locator(".pixel-person").bounding_box()
        self.assertLess(abs(person["x"] + person["width"] / 2 - last["x"]), 3, f"person={person}, last={last}, first={path[0]}, desk={desk}")
        self.assertLess(abs(person["y"] + person["height"] / 2 - last["y"]), 3, f"person={person}, last={last}, first={path[0]}, desk={desk}")
        for zone in ("common-table", "plant-corner", "bookshelf", "window"):
            self.page.evaluate("""zone => {
                uiTest.view.scenes[0].route[0].zoneId = zone;
                uiTest.view.scenes[0].phase='acting';
                uiTest.drawOffice(document, uiTest.state, null, uiTest.view);
            }""", zone)
            route_text = original.get_attribute("data-walk-path")
            self.assertTrue(route_text, f"zone={zone} error={original.get_attribute('data-walk-error')} candidates={original.get_attribute('data-walk-candidates')} debug={self.page.locator('#office-floor').get_attribute('data-walk-debug')}")
            approach = json.loads(route_text)[-1]
            station = self.page.locator(f"[data-zone={zone}]").bounding_box()
            self.assertTrue(station["x"] - 50 <= approach["x"] <= station["x"] + station["width"] + 50, zone)
        self.assertTrue(original.evaluate("element => window.originalCharacterNode === element"))
        self.page.evaluate("""() => {
            uiTest.view.scenes[0].templateId='paper-hat';
            uiTest.drawOffice(document, uiTest.state, null, uiTest.view);
        }""")
        self.assertEqual(self.page.locator("button.character[data-agent='agent-0'] > .scene-hat").count(), 1)
        self.assertIn("paper hat", self.page.locator(".scene-hat").get_attribute("aria-label").casefold())
        self.page.evaluate("""() => {
            uiTest.view.now = uiTest.view.scenes[0].endsAt;
            uiTest.view.scenes[0].phase='returning';
            uiTest.drawOffice(document, uiTest.state, null, uiTest.view);
        }""")
        self.page.wait_for_timeout(750)
        person_node = original.locator(".pixel-person")
        returned = person_node.bounding_box()
        route_state = person_node.evaluate("element => ({translate:getComputedStyle(element).translate, animation:element.getAnimations().map(item => ({currentTime:item.currentTime,playState:item.playState,timing:item.effect?.getComputedTiming(),id:item.id})), path:element.closest('button').dataset.walkPath})")
        scroll = self.page.evaluate("window.scrollY")
        self.assertAlmostEqual(returned["x"], desk["x"], delta=1, msg=f"returned={returned}, desk={desk}, route={route_state}")
        self.assertAlmostEqual(returned["y"] + scroll, desk["y"] + desk_scroll, delta=1)
        self.page.evaluate("""() => {
            uiTest.view.scenes=[];
            uiTest.view.characters[0].sceneId=null;
            uiTest.drawOffice(document, uiTest.state, null, uiTest.view);
        }""")
        self.assertEqual(self.page.locator(".scene-hat").count(), 0)
        self.assertEqual(self.page.locator("button.character[data-agent='agent-0']").count(), 1)

    def test_walkable_routes_use_room_exit_and_avoid_walls_rooms_and_furniture(self):
        self.page.emulate_media(reduced_motion="no-preference")
        for width in (1440, 820, 390):
            with self.subTest(width=width):
                self.page.set_viewport_size({"width": width, "height": 1200})
                self.page.wait_for_timeout(50)
                self.page.evaluate("""() => {
                    const {view} = uiTest;
                    view.scenes = [{id:'walk-test',templateId:'coffee',kind:'vignette',label:'Office fiction: Coffee',
                        participants:['agent-0'],route:[{kind:'zone',zoneId:'coffee-station'}],phase:'walking',
                        startedAt:view.now,endsAt:view.now+6000,fictional:true}];
                    view.now += 1000;
                    view.characters[0].sceneId='walk-test';
                    uiTest.drawOffice(document,uiTest.state,null,view);
                }""")
                character = self.page.locator("button.character[data-agent='agent-0']")
                route_text = character.get_attribute("data-walk-path")
                self.assertTrue(route_text, f"no safe walk path at {width}px")
                points = json.loads(route_text)
                self.assertGreater(len(points), 6)
                room = self.page.locator(".session-cluster[data-session='session-0']").bounding_box()
                exits = [
                    {"x": room["x"] + room["width"] / 2, "y": room["y"] + room["height"] + 40},
                    {"x": room["x"] - 40, "y": room["y"] + room["height"] / 2},
                    {"x": room["x"] + room["width"] + 40, "y": room["y"] + room["height"] / 2},
                ]
                room_exit = min(range(len(points)), key=lambda index: min(abs(points[index]["x"] - exit["x"]) + abs(points[index]["y"] - exit["y"]) for exit in exits))
                self.assertLess(min(abs(points[room_exit]["x"] - exit["x"]) + abs(points[room_exit]["y"] - exit["y"]) for exit in exits), 3)
                aisle = self.page.locator("#office-aisle").bounding_box()
                self.assertTrue(any(abs(point["y"] - aisle["y"] - aisle["height"] / 2) < 16 for point in points))
                blocked = [("wall", self.page.locator(".office-wall").bounding_box())]
                blocked += [("other room", self.page.locator(".session-cluster[data-session]").nth(index).bounding_box()) for index in range(self.page.locator(".session-cluster[data-session]").count()) if self.page.locator(".session-cluster[data-session]").nth(index).get_attribute("data-session") != "session-0"]
                blocked += [(node.get_attribute("class") or node.get_attribute("id") or node.evaluate("el=>el.tagName"), node.bounding_box()) for node in self.page.locator(".pixel-desk,.desk-chair,.cluster-decor .decor-divider,.cluster-decor .decor-art,.common-table-art,.coffee-station-art,.table-chair,#zone-waste-bin,.floor-plant-art").all()]
                for index in range(room_exit, len(points) - 1):
                    start, end = points[index], points[index + 1]
                    distance = max(abs(end["x"] - start["x"]), abs(end["y"] - start["y"]))
                    samples = max(1, int(distance / 8))
                    for sample in range(samples + 1):
                        fraction = sample / samples
                        point = {"x": start["x"] + (end["x"] - start["x"]) * fraction, "y": start["y"] + (end["y"] - start["y"]) * fraction}
                        sprite_box = {"x": point["x"] - 17, "y": point["y"] - 26, "width": 34, "height": 52}
                        self.assertTrue(all(not self.boxes_overlap(sprite_box, obstacle) for _, obstacle in blocked), f"route clips obstacle at {width}px: {point}; hits={[name for name, obstacle in blocked if self.boxes_overlap(sprite_box, obstacle)]}")

    def test_furniture_uses_anchored_nonoverlapping_slots(self):
        for width in (1440, 820, 390):
            with self.subTest(width=width):
                self.page.set_viewport_size({"width": width, "height": 1200})
                seats = self.page.locator(".table-chair")
                desks = self.page.locator(".desk-station")
                chairs = self.page.locator(".desk-chair")
                self.assertEqual(seats.count(), 4)
                self.assertEqual(chairs.count(), desks.count())
                self.assertEqual(self.page.locator("#zone-waste-bin").count(), 1)
                self.assertEqual(self.page.locator(".cluster-decor .decor-plant, .cluster-decor .decor-chair, .cluster-decor .decor-bin").count(), 0)
                tabletop = self.page.locator("#zone-common-table").bounding_box()
                for index in range(seats.count()):
                    seat = seats.nth(index).bounding_box()
                    self.assertFalse(self.boxes_overlap(tabletop, seat), f"table seat {index} overlaps tabletop at {width}px")
                for cluster in self.page.locator(".session-cluster[data-session]").all():
                    station_boxes = [station.bounding_box() for station in cluster.locator(".desk-station").all()]
                    for prop in cluster.locator(".cluster-decor .decor-divider, .cluster-decor .decor-art").all():
                        prop_box = prop.bounding_box()
                        self.assertTrue(all(not self.boxes_overlap(prop_box, station_box) for station_box in station_boxes), f"cluster rail overlaps a desk at {width}px")

    @staticmethod
    def boxes_overlap(left, right):
        return left["x"] < right["x"] + right["width"] and left["x"] + left["width"] > right["x"] and left["y"] < right["y"] + right["height"] and left["y"] + left["height"] > right["y"]

    @staticmethod
    def path_point_overlaps(point, obstacle):
        return obstacle["x"] <= point["x"] <= obstacle["x"] + obstacle["width"] and obstacle["y"] <= point["y"] <= obstacle["y"] + obstacle["height"]

    def test_original_pixel_assets_load_and_global_zones_have_stable_anchors(self):
        self.assertEqual(self.page.locator("[data-zone=common-table]").count(), 1)
        self.assertEqual(self.page.locator("[data-zone=coffee-station]").count(), 1)
        self.assertEqual(self.page.locator("[data-zone=desk-west]").count(), 1)
        self.assertEqual(self.page.locator("[data-zone=desk-east]").count(), 1)
        clusters = self.page.locator(".session-cluster[data-session]")
        self.assertNotEqual(clusters.nth(0).get_attribute("class"), clusters.nth(1).get_attribute("class"))
        self.assertEqual(clusters.nth(0).locator(".cluster-decor img").count(), 2)
        styles = [next(token for token in clusters.nth(index).get_attribute("class").split() if token.startswith("workstation-style-")) for index in range(clusters.count())]
        self.assertGreaterEqual(len(set(styles)), 2)
        before = [clusters.nth(index).get_attribute("class") for index in range(clusters.count())]
        self.page.evaluate("uiTest.drawOffice(document, uiTest.state, null, uiTest.view)")
        self.assertEqual(before, [self.page.locator(".session-cluster[data-session]").nth(index).get_attribute("class") for index in range(clusters.count())])
        self.page.evaluate("""() => {
            uiTest.state.snapshot.sessions.forEach((session, index) => {
                session.provider = index % 2 ? 'Copilot' : 'Codex';
                session.title = `different title ${index}`;
            });
            uiTest.drawOffice(document, uiTest.state, null, uiTest.view);
        }""")
        self.assertEqual(styles, [next(token for token in self.page.locator(".session-cluster[data-session]").nth(index).get_attribute("class").split() if token.startswith("workstation-style-")) for index in range(clusters.count())])
        for zone in ("plant-corner", "bookshelf", "window"):
            self.assertEqual(self.page.locator(f"[data-zone={zone}]").count(), 1)
        self.assertTrue(self.page.evaluate("Array.from(document.querySelectorAll('.office-wall img, .floor-decor img, .common-area img')).every(image => image.complete && image.naturalWidth > 0)"))
        self.assertEqual(self.page.locator(".common-area .coffee-table, .common-area .coffee-bar").count(), 0)

    def test_reading_coffee_action_cues_and_scene_cleanup_are_visual_only(self):
        self.page.evaluate("""() => {
            const {view} = uiTest;
            const character = view.characters.find(item => item.agentId === 'agent-0');
            view.scenes = [{id:'reading-scene', templateId:'reading', kind:'vignette', label:'Office fiction: Reading',
                participants:['agent-0'], route:[{kind:'zone', zoneId:'common-table'}], phase:'acting',
                startedAt:view.now, endsAt:view.now+10000, fictional:true}];
            character.sceneId='reading-scene';
            uiTest.drawOffice(document, uiTest.state, null, view);
        }""")
        reading_prop = self.page.locator("#zone-props [data-scene-visual=reading-scene]")
        self.assertEqual(reading_prop.locator("img").get_attribute("src").split("/")[-1], "book.svg")
        self.assertTrue(self.page.locator("button.character[data-agent='agent-0']").evaluate("element => element.classList.contains('reading-at-table')"))
        self.assertEqual(self.page.locator(".scene-badge").count(), 0)
        self.page.evaluate("""() => {
            const {view} = uiTest;
            view.scenes = [{id:'coffee-scene', templateId:'coffee', kind:'vignette', label:'Office fiction: Coffee',
                participants:['agent-0'], route:[{kind:'zone', zoneId:'coffee-station'}], phase:'acting',
                startedAt:view.now, endsAt:view.now+10000, fictional:true}];
            view.characters[0].sceneId='coffee-scene';
            uiTest.drawOffice(document, uiTest.state, null, view);
        }""")
        steam = self.page.locator("#zone-props [data-scene-visual=coffee-scene]")
        self.assertEqual(steam.locator("img").get_attribute("src").split("/")[-1], "coffee-steam.svg")
        self.page.evaluate("""() => {
            uiTest.view.scenes[0].phase='returning';
            uiTest.drawOffice(document, uiTest.state, null, uiTest.view);
        }""")
        self.assertEqual(self.page.locator("#zone-props [data-scene-visual=coffee-scene]").count(), 0)
        self.assertEqual(self.page.locator("button.character[data-agent='agent-0'] > .scene-carrying img").get_attribute("src").split("/")[-1], "mug.svg")
        self.page.evaluate("""() => {
            uiTest.view.scenes=[];
            uiTest.view.characters[0].sceneId=null;
            uiTest.drawOffice(document, uiTest.state, null, uiTest.view);
        }""")
        self.assertEqual(self.page.locator(".scene-action-prop, .scene-carrying").count(), 0)
        self.assertFalse(self.page.locator("button.character[data-agent='agent-0']").evaluate("element => element.classList.contains('reading-at-table')"))
        self.page.emulate_media(reduced_motion="reduce")
        self.page.evaluate("""() => {
            const {view} = uiTest;
            const cluster = view.clusters[0];
            view.actors = [{id:'static-spider', kind:'spider', spaceId:cluster.spaceId, position:{x:52,y:62},
                route:[{x:60,y:62},{x:100,y:62}], startedAt:view.now, endsAt:view.now+10000, fictional:true}];
            view.scenes = [{id:'still-scene', templateId:'coffee', kind:'vignette', label:'Office fiction: Coffee',
                participants:['agent-0'], route:[{kind:'zone', zoneId:'coffee-station'}], phase:'walking',
                startedAt:view.now, endsAt:view.now+10000, fictional:true}];
            view.characters[0].sceneId='still-scene';
            uiTest.drawOffice(document, uiTest.state, null, view);
        }""")
        person = self.page.locator("button.character[data-agent='agent-0'] > .pixel-person")
        spider = self.page.locator(".office-actor")
        first_person = person.bounding_box()
        first_spider = spider.bounding_box()
        self.page.evaluate("""() => {
            uiTest.view.now += 5000;
            uiTest.drawOffice(document, uiTest.state, null, uiTest.view);
        }""")
        self.assertEqual(person.bounding_box(), first_person)
        self.assertEqual(spider.bounding_box(), first_spider)
        self.page.emulate_media(reduced_motion="no-preference")

    def test_global_props_and_spider_actors_render_once_without_legacy_spider_duplication(self):
        self.page.evaluate("""() => {
            const {view} = uiTest;
            const cluster = view.clusters[0];
            view.props.push({id:'shared-mug', kind:'mug', location:{kind:'zone', zoneId:'common-table', slot:0},
                createdAt:view.now, cleanupSceneId:null, fictional:true});
            view.actors = [
                {id:'crossing-spider', kind:'spider', spaceId:cluster.spaceId,
                    position:{x:40,y:70}, route:[{x:80,y:70}], startedAt:view.now, endsAt:view.now+10000, fictional:true},
                {id:'room-ghost', kind:'ghost', clusterId:cluster.id, spaceId:cluster.spaceId,
                    position:{x:cluster.position.x+180,y:cluster.position.y+240}, route:[{x:cluster.position.x+180,y:cluster.position.y+240},{x:cluster.position.x+250,y:cluster.position.y+240}],
                    startedAt:view.now, endsAt:view.now+10000, fictional:true},
            ];
            view.quietEffects = [{id:'legacy-spider', clusterId:cluster.id, spaceId:cluster.spaceId, kind:'spider',
                label:'Old effect compatibility', position:{x:40,y:70}, startedAt:view.now, endsAt:view.now+10000, fictional:true}];
            uiTest.drawOffice(document, uiTest.state, null, view);
        }""")
        self.assertEqual(self.page.locator("#zone-props [data-prop=shared-mug]").count(), 1)
        self.assertEqual(self.page.locator(".session-cluster .office-actor img[src='/assets/spider.svg']").count(), 1)
        self.assertEqual(self.page.locator(".session-cluster .office-actor img[src='/assets/ghost.svg']").count(), 1)
        ghost = self.page.locator(".session-cluster .office-actor img[src='/assets/ghost.svg']").bounding_box()
        room = self.page.locator(".session-cluster[data-session=session-0]").bounding_box()
        self.assertTrue(room["x"] <= ghost["x"] <= room["x"] + room["width"] - ghost["width"])
        self.assertTrue(room["y"] <= ghost["y"] <= room["y"] + room["height"] - ghost["height"])
        self.assertEqual(self.page.locator(".session-cluster .quiet-effect").count(), 0)
        prop = self.page.locator("#zone-props [data-prop=shared-mug]").bounding_box()
        table = self.page.locator("[data-zone=common-table]").bounding_box()
        self.assertLess(abs(prop["x"] + prop["width"] / 2 - table["x"] - table["width"] / 2), 25)
        self.assertEqual(self.page.locator("button.character[data-agent=agent-0]").count(), 1)

    def test_screen_flicker_uses_existing_monitor_and_ghost_roams_room(self):
        self.page.emulate_media(reduced_motion="no-preference")
        self.page.evaluate("""() => {
            uiTest.state.snapshot.agents.push({...uiTest.state.snapshot.agents[0],id:'extra-monitor',name:'Extra monitor fixture'});
            const {view} = uiTest;
            const room = view.clusters[0];
            const ghost = {id:'roaming-ghost',kind:'ghost',clusterId:room.id,spaceId:room.spaceId,
                position:{x:room.position.x+80,y:room.position.y+230},
                route:[{x:room.position.x+80,y:room.position.y+230},{x:room.position.x+280,y:room.position.y+260}],
                startedAt:view.now,endsAt:view.now+10000,fictional:true};
            view.actors=[ghost];
            view.quietEffects=[{id:'screen',kind:'screen-flicker',clusterId:room.id,spaceId:room.spaceId,
                label:'A sleeping screen glows',position:{x:0,y:0},startedAt:view.now,endsAt:view.now+10000,fictional:true},
                {id:'ghost-label',kind:'ghost',clusterId:room.id,spaceId:room.spaceId,label:'Ghost ambience',
                    position:ghost.position,startedAt:view.now,endsAt:view.now+10000,fictional:true}];
            uiTest.drawOffice(document,uiTest.state,null,view);
        }""")
        cluster = self.page.locator(".session-cluster[data-session='session-0']")
        monitors = cluster.locator(".monitor")
        self.assertEqual(monitors.count(), 2)
        self.assertEqual(cluster.locator(".monitor.screen-flicker").count(), 1)
        self.assertEqual(cluster.locator(".quiet-effect,.abandoned-note").count(), 0)
        self.assertEqual(self.page.locator("img[src='/assets/screen-glow.svg']").count(), 0)
        ghost = cluster.locator("[data-world-actor=roaming-ghost]")
        self.assertEqual(ghost.count(), 1)
        start = ghost.bounding_box()
        self.page.evaluate("""() => {
            uiTest.view.actors[0].position = uiTest.view.actors[0].route[1];
            uiTest.view.now += 3000;
            uiTest.drawOffice(document,uiTest.state,null,uiTest.view);
        }""")
        self.page.wait_for_timeout(1700)
        end = ghost.bounding_box()
        self.assertGreater(abs(end["x"]-start["x"]) + abs(end["y"]-start["y"]), 40)
        bounds = cluster.bounding_box()
        self.assertTrue(bounds["x"] <= end["x"] <= bounds["x"]+bounds["width"]-end["width"])
        self.assertTrue(bounds["y"] <= end["y"] <= bounds["y"]+bounds["height"]-end["height"])
        self.page.emulate_media(reduced_motion="reduce")
        self.page.evaluate("uiTest.drawOffice(document,uiTest.state,null,uiTest.view)")
        static = ghost.bounding_box()
        self.page.evaluate("""() => {
            uiTest.view.actors[0].position={x:240,y:260};
            uiTest.view.now += 1000;
            uiTest.drawOffice(document,uiTest.state,null,uiTest.view);
        }""")
        self.assertEqual(ghost.bounding_box(), static)
        self.page.evaluate("uiTest.view.quietEffects=[];uiTest.drawOffice(document,uiTest.state,null,uiTest.view)")
        self.assertEqual(cluster.locator(".monitor.screen-flicker").count(), 0)

    def test_agent_badges_are_state_only_and_meet_wcag_aa_contrast(self):
        self.assertEqual(self.page.locator(".character-provider, button.character > .freshness").count(), 0)
        self.assertEqual(self.page.locator(".roster-identity > span:not(.roster-session), .roster-state .freshness").count(), 0)
        ratios = self.page.evaluate("""() => {
            const parse = value => value.match(/[\\d.]+/g).slice(0, 3).map(Number).map(channel => {
                const normalized = channel / 255;
                return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
            }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
            const ratio = (foreground, background) => {
                const values = [parse(foreground), parse(background)].sort((a, b) => b - a);
                return (values[0] + 0.05) / (values[1] + 0.05);
            };
            const chip = document.querySelector('.status-chip');
            return ['idle','working','waiting','failed','unknown','completed'].map(state => {
                chip.className = `status-chip ${state}`;
                const style = getComputedStyle(chip);
                return ratio(style.color, style.backgroundColor);
            });
        }""")
        self.assertTrue(all(value >= 4.5 for value in ratios), ratios)
        self.page.locator("button.character[data-agent='agent-0']").click()
        self.assertTrue(self.page.locator("#details .provider-tag").is_visible())
        self.assertIn("fresh · connected", self.page.locator("#details").inner_text())

    def test_visible_copy_is_factual_and_keeps_controls_available(self):
        visible = self.page.locator("body").inner_text().casefold()
        for phrase in ("read-only dashboard", "office decor & scenes are fiction", "fictional little office",
                       "office fiction", "fictional idle scenes", "persona flavor", "not reported thoughts"):
            self.assertNotIn(phrase, visible)
        self.assertIn("local alias", visible)
        self.assertIn("codex", visible)
        self.assertIn("idle", visible)
        self.assertNotIn("fresh · connected", visible)
        self.assertNotIn("observed agent", visible)
        self.assertTrue(self.page.locator("#show-ended").is_visible())
        self.assertTrue(self.page.locator("#vignettes").is_visible())
        self.assertTrue(self.page.locator("#dialogue").is_visible())
        self.assertTrue(self.page.locator("#coverage").evaluate("element => !element.open"))

    def test_quiet_scene_hides_title_and_motifs_without_hiding_provider_facts(self):
        before = copy.deepcopy(self.state)
        feed_before = self.page.locator("#feed").inner_text()
        self.page.evaluate("""() => {
            uiTest.view.clusters[0] = {...uiTest.view.clusters[0], dimmed:true, titleHidden:true, title:null, motifs:[]};
            uiTest.view.quietEffects = [{id:'quiet-effect', clusterId:'cluster:session-0', spaceId:'space:0', kind:'ghost',
                label:'Office fiction: A soft shadow', position:{x:20,y:30}, startedAt:1000, endsAt:5000, fictional:true}];
            uiTest.view.actors = [{id:'quiet-ghost', kind:'ghost', clusterId:'cluster:session-0', spaceId:'space:0',
                position:{x:80,y:240}, route:[{x:80,y:240},{x:240,y:240}], startedAt:1000, endsAt:5000, fictional:true}];
            uiTest.drawOffice(document, uiTest.state, 'agent-0', uiTest.view);
        }""")
        cluster = self.page.locator(".session-cluster[data-session='session-0']")
        self.assertEqual(cluster.locator("h3").inner_text(), "")
        self.assertTrue(cluster.evaluate("element => element.classList.contains('quiet-cluster')"))
        self.assertIn("codex session 01", cluster.get_attribute("aria-label").casefold())
        self.assertNotIn("quiet scene", cluster.get_attribute("aria-label").casefold())
        self.assertNotIn("Review frontend accessibility", cluster.get_attribute("aria-label"))
        self.assertEqual(self.page.locator(".roster-session").first.inner_text(), "")
        self.assertEqual(self.page.locator(".detail-session").inner_text(), "")
        self.assertNotIn("Review frontend accessibility", cluster.inner_text())
        self.assertEqual(cluster.locator(".motifs").inner_text(), "")
        effect = cluster.locator(".office-actor")
        self.assertEqual(effect.count(), 1)
        self.assertEqual(cluster.locator(".quiet-effect,.abandoned-note").count(), 0)
        self.assertIn("fictional", effect.get_attribute("aria-label").casefold())
        self.assertNotIn("Session ended", cluster.inner_text())
        self.assertIn("Codex", cluster.inner_text())
        self.assertIn("Idle", cluster.inner_text())
        self.assertIn("fresh · connected", self.page.locator("#details").inner_text().casefold())
        self.assertEqual(self.page.locator("button.character[data-agent='agent-0'] > .status-chip").inner_text(), "Idle")
        self.assertEqual(self.state, before)
        self.assertEqual(self.page.locator("#feed").inner_text(), feed_before)

    def test_projected_unknown_agent_renders_as_quiet_fiction_without_session_end(self):
        self.page.evaluate("""() => {
            const state = structuredClone(uiTest.state);
            state.snapshot.agents[0].state = 'unknown';
            state.snapshot.feed = [];
            let now = 0;
            const world = uiTest.createOfficeWorld({clock: () => now, random: () => 0});
            world.update(state.snapshot, state.preferences);
            now = 10000;
            world.tick();
            uiTest.state = state;
            uiTest.view = world.view();
            uiTest.drawOffice(document, state, 'agent-0', uiTest.view);
        }""")
        cluster = self.page.locator(".session-cluster[data-session='session-0']")
        character = self.page.locator("button.character[data-agent='agent-0']")
        self.assertTrue(cluster.evaluate("element => element.classList.contains('quiet-cluster')"))
        self.assertNotIn("Review frontend accessibility", cluster.inner_text())
        self.assertEqual(cluster.locator(".motifs").inner_text(), "")
        self.assertIn("Unknown", character.locator(".status-chip").inner_text())
        self.assertNotIn("Session ended", cluster.inner_text())
        self.assertNotIn("quiet scene", cluster.get_attribute("aria-label").casefold())
        self.assertEqual(cluster.locator(".quiet-effect,.abandoned-note").count(), 0)
        for actor in cluster.locator(".office-actor").all():
            self.assertIn("fictional", actor.get_attribute("aria-label").casefold())
        self.assertEqual(self.page.locator("#feed").inner_text(), "No observed activity yet.")

    def test_parent_ended_visibility_preference_is_rendered_and_toggleable(self):
        self.saved["snapshot"]["agents"].append({**self.saved["snapshot"]["agents"][0],
            "id": "ended-agent", "name": "Ended", "ended": True, "endedAt": 1000})
        self.saved["preferences"]["showEnded"] = True
        with self.page.expect_response("**/state"):
            self.page.evaluate("officeIntervals.get(2000)()")
        self.page.wait_for_function("document.querySelector('button.character[data-agent=ended-agent]') !== null")
        self.assertTrue(self.page.locator("#show-ended").is_checked())
        with self.page.expect_response("**/preferences"):
            self.page.locator("#show-ended").uncheck()
        self.page.wait_for_function("document.querySelector('button.character[data-agent=ended-agent]') === null")

    def test_dialogue_is_a_single_attached_accessible_read_time_bubble(self):
        self.page.emulate_media(reduced_motion="no-preference")
        self.page.evaluate("""() => {
            const character = uiTest.view.characters[0];
            uiTest.view.dialogue = [{id:'line-1', agentId:character.agentId, flavor:'calm',
                label:'Line', text:'Taking a quiet moment.', startedAt:1000, endsAt:6500,
                placement:'secondary', fictional:true}];
            uiTest.drawOffice(document, uiTest.state, null, uiTest.view);
            window.firstDialogueBubble = document.querySelector('.dialogue-bubble');
        }""")
        bubble = self.page.locator(".dialogue-bubble")
        self.assertEqual(bubble.count(), 1)
        self.assertEqual(bubble.inner_text(), "Taking a quiet moment.")
        self.assertIn("fictional character dialogue", bubble.get_attribute("aria-label").casefold())
        self.assertEqual(bubble.evaluate("element => element.closest('button.character')?.dataset.agent"), "agent-0")
        self.assertEqual(bubble.evaluate("element => getComputedStyle(element).animationDuration"), "5.5s")
        self.assertEqual(bubble.evaluate("element => getComputedStyle(element).position"), "absolute")
        self.assertNotEqual(bubble.evaluate("element => getComputedStyle(element).borderRadius"), "0px")
        self.assertNotEqual(bubble.evaluate("element => getComputedStyle(element).boxShadow"), "none")
        self.assertNotEqual(bubble.evaluate("element => getComputedStyle(element, '::after').content"), "none")
        self.assertTrue(self.page.locator("button.character[data-agent='agent-0'] > .status-chip").is_visible())
        self.assertEqual(bubble.evaluate("element => element.textContent"), "Taking a quiet moment.")
        self.page.evaluate("uiTest.drawOffice(document, uiTest.state, null, uiTest.view)")
        self.assertTrue(self.page.evaluate("firstDialogueBubble === document.querySelector('.dialogue-bubble')"))
        self.assertEqual(self.page.locator(".dialogue-bubble").count(), 1)
        self.assertEqual(bubble.evaluate("element => getComputedStyle(element).animationName"), "dialogue-pop")
        self.page.emulate_media(reduced_motion="reduce")
        self.assertEqual(bubble.evaluate("element => getComputedStyle(element).animationName"), "none")
        self.page.set_viewport_size({"width": 390, "height": 1100})
        self.assertLessEqual(self.page.evaluate("document.documentElement.scrollWidth"), 390)

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
        self.assertEqual(self.page.locator(".session-cluster .cluster-heading h3").first.inner_text(), "")

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
        self.page.wait_for_function("document.querySelector('button.character[data-agent=agent-0]')?.getAttribute('aria-description')?.includes('Server-authored chat')")
        self.page.evaluate("officeIntervals.get(1000)()")
        self.assertEqual(self.page.locator(".scene-badge").count(), 0)
        self.assertIn("Fictional office scene: Server-authored chat", self.page.locator('button.character[data-agent="agent-0"]').get_attribute("aria-description"))
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
        self.assertIn("Session unavailable", self.page.locator(".session-cluster").first.inner_text())
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
                participants:view.characters.map(c => c.agentId), route:[{kind:'zone',zoneId:'common-table'}], phase:'walking', startedAt:1000, endsAt:5000, fictional:true}];
            view.characters.forEach((c, i) => {
                c.position = {x:host.position.x + 160 + i * 30, y:host.position.y + 40};
                c.sceneId = 'social'; c.pose = 'vignette';
            });
            uiTest.drawOffice(document, uiTest.state, null, view);
        }""")

    def test_cross_cluster_gathering_cleanup_and_return(self):
        self.page.emulate_media(reduced_motion="no-preference")
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
                desk_scroll = self.page.evaluate("window.scrollY")
                factual = status.bounding_box()
                feed = self.page.locator("#feed").inner_text()
                self.stage_scene()
                self.page.wait_for_timeout(600)
                moved = actor.bounding_box()
                floor = self.page.locator("#office-floor").bounding_box()
                self.assertGreater(abs(moved["x"] - desk["x"]) + abs(moved["y"] - desk["y"]), 100)
                self.assertTrue(floor["x"] <= moved["x"] <= floor["x"] + floor["width"] - moved["width"])
                self.assertTrue(floor["y"] <= moved["y"] <= floor["y"] + floor["height"] - moved["height"])
                self.assertEqual(status.bounding_box()["x"], factual["x"])
                self.assertTrue(status.is_visible())
                self.assertIn("Idle", status.inner_text())
                self.assertEqual(self.page.locator('button.character[data-agent="agent-1"] > .character-provider').count(), 0)
                self.assertEqual(self.page.locator('button.character[data-agent="agent-1"] > .freshness').count(), 0)
                self.assertGreater(actor.evaluate("el => el.getAnimations().filter(animation => animation.id === 'office-walk-route').length"), 0)
                self.page.locator('button.character[data-agent="agent-1"]').click()
                self.assertTrue(self.page.locator("#details .provider-tag").is_visible())
                self.page.locator("#details .technical-details summary").click()
                self.assertIn("Codex ·", self.page.locator("#details").inner_text())
                self.assertIn("fresh · connected", self.page.locator("#details").inner_text())
                self.assertEqual(self.page.locator("#feed").inner_text(), feed)
                self.assertTrue(self.page.locator("#agent-layer img").evaluate_all("images => images.every(image => new URL(image.src).pathname.startsWith('/assets/'))"))
                self.page.evaluate("""() => {
                    const {view} = uiTest; const target = view.characters[1];
                    view.props = [{id:'paper', spaceId:target.spaceId, deskIndex:target.deskIndex,
                        kind:'paper', position:{...target.deskPosition}, createdAt:1000,
                        cleanupSceneId:null, fictional:true}];
                    uiTest.drawOffice(document, uiTest.state, null, view);
                    window.persistentProp = document.querySelector('[data-prop="paper"]');
                    view.props[0].cleanupSceneId='social';
                    view.scenes[0].kind='cleanup'; view.scenes[0].label='Tidying';
                    view.scenes[0].route=[{kind:'desk',agentId:target.agentId}];
                    view.scenes[0].phase='acting';
                    view.characters.forEach(c => {c.position={...target.deskPosition}; c.pose='cleanup';});
                    uiTest.drawOffice(document, uiTest.state, null, view);
                }""")
                prop = self.page.locator('[data-prop="paper"]')
                self.assertTrue(prop.is_visible())
                self.assertTrue(self.page.evaluate("persistentProp === document.querySelector('[data-prop=paper]')"))
                self.assertIn("being picked up", prop.get_attribute("aria-label"))
                cleaner = self.page.locator('button.character[data-agent="agent-0"] > .pixel-person')
                self.assertLess(abs(cleaner.bounding_box()["y"] - prop.bounding_box()["y"]), 65)
                self.page.evaluate("""() => {
                    uiTest.view.props=[]; uiTest.view.scenes=[];
                    uiTest.view.characters.forEach(c => {c.sceneId=null; c.position={...c.deskPosition};});
                    uiTest.drawOffice(document, uiTest.state, null, uiTest.view);
                }""")
                self.assertEqual(self.page.locator('[data-prop="paper"]').count(), 0)
                self.page.wait_for_timeout(750)
                returned = actor.bounding_box()
                return_scroll = self.page.evaluate("window.scrollY")
                self.assertAlmostEqual(returned["x"], desk["x"], delta=1)
                self.assertAlmostEqual(returned["y"] + return_scroll, desk["y"] + desk_scroll, delta=1)
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
