"""Offline tests for crawl.py: parsers on saved pages in crawler/fixtures/, no network.

    python crawler/test_crawl.py
"""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import crawl  # noqa: E402

FIX = Path(__file__).resolve().parent / "fixtures"
ROOT = FIX.parent.parent


def fixture(name):
    return (FIX / name).read_text(encoding="utf-8")


class CatalogTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.camps = crawl.build_catalog(fixture("engine.html"), fixture("camping-index.html"))
        cls.by_id = {c["id"]: c for c in cls.camps}

    def test_eighteen_campsites_all_matched(self):
        self.assertEqual(len(self.camps), 18)
        self.assertTrue(all(c["url"].startswith("https://www.parks.org.il/camping/") for c in self.camps))
        self.assertEqual(len({c["url"] for c in self.camps}), 18)  # one slug each

    def test_beerot_and_achziv(self):
        b, a = self.by_id[13], self.by_id[23]
        self.assertEqual((b["region"], b["name"]), ("דרום", "חניון לילה חאן בארות – מכתש רמון"))
        self.assertEqual(a["region"], "צפון")
        self.assertIn("חאן-בארות", b["url"])
        self.assertIn("אכזיב", a["url"])

    def test_tricky_matches(self):
        # spelling differs between the engine and the slug
        self.assertIn("חי-בר-יוטבתה", self.by_id[21]["url"])
        self.assertIn("ירקון", self.by_id[22]["url"])
        self.assertIn("הקסטל", self.by_id[20]["url"])

    def test_sorted_by_region_then_name(self):
        keys = [(c["region"], c["name"]) for c in self.camps]
        self.assertEqual(keys, sorted(keys))

    def test_unmatched_fails_loudly(self):
        camps = crawl.parse_engine(fixture("engine.html"))
        with self.assertRaises(ValueError):
            crawl.match_slugs(camps, ["חניון-לילה-חאן-בארות-מכתש-רמון"])


class InfoTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.beerot = crawl.parse_info(fixture("info-beerot.html"))
        cls.achziv = crawl.parse_info(fixture("info-achziv.html"))

    def test_beerot_rates(self):
        r = self.beerot["rates"]
        self.assertEqual((r["adult"], r["child"]), (64, 47))
        self.assertEqual((r["matmonAdult"], r["matmonChild"]), (48, 35))
        self.assertEqual((r["reserveAdult"], r["reserveChild"]), (54, 40))
        self.assertEqual((r["soldier"], r["student"], r["senior"], r["idfDisabled"]), (47, 53, 32, 32))
        self.assertEqual((r["groupAdult"], r["groupChild"]), (54, 40))

    def test_achziv_rates_equal_prices_js(self):
        # the numbers in prices.js (checked 30/09/2026)
        expected = {"adult": 76, "child": 58, "matmonAdult": 57, "matmonChild": 44, "reserveAdult": 65,
                    "reserveChild": 49, "soldier": 58, "student": 65, "senior": 38, "groupAdult": 65,
                    "groupChild": 49, "idfDisabled": 38}
        self.assertEqual(self.achziv["rates"], expected)

    def test_beerot_fields(self):
        b = self.beerot
        self.assertEqual(len(b["facilities"]), 24)
        self.assertIn("תאורה חלקית", b["facilities"])
        self.assertEqual(b["serviceHours"], "בימים א-שבת 08:00 ועד 22:00")
        self.assertIn("15:00 עד השעה 22:00", b["hours"]["summer"])
        self.assertIn("15:00 עד השעה 21:00", b["hours"]["winter"])
        self.assertNotIn("שבת", b["hours"]["winter"])  # the paragraphs after the seasons are not winter hours
        self.assertTrue(any("שומרי השבת" in x for x in b["hours"]["other"]))
        self.assertIn("11:00", b["hours"]["checkout"])
        self.assertIn("כביש 40", b["directions"])
        self.assertEqual(b["waze"], "חניון לילה חאן בארות – מכתש רמון")
        self.assertEqual(b["contact"]["whatsapp"], "https://wa.me/972549642434")
        self.assertEqual(b["contact"]["phone"], "3639*")
        self.assertEqual(b["ages"], {"adult": "גיל 18 ומעלה", "child": "מגיל 5 ועד 18"})
        self.assertEqual(b["rentals"][0]["label"], "השכרת מזרן ללילה")
        self.assertEqual(b["rentals"][0]["price"], 12)
        self.assertEqual(len(b["priceTabs"]), 9)
        self.assertEqual(b["errors"], [])
        labels = [x["label"] for x in b["lodging"]]
        self.assertTrue(any("מאהל גדול קבוע" in x for x in labels))
        self.assertFalse(any("לינת שטח" in x for x in labels))

    def test_achziv_fields(self):
        a = self.achziv
        self.assertTrue(any(f.startswith("חניון צפוני: ") for f in a["facilities"]))
        self.assertTrue(any(f.startswith("חניון דרומי: ") for f in a["facilities"]))
        self.assertEqual(a["serviceHours"], "על פי הצורך")
        self.assertIsNone(a["hours"]["summer"])  # no seasons on this page
        self.assertIn("19:00", a["hours"]["entry"])
        self.assertIn("12:00", a["hours"]["checkout"])
        self.assertEqual(a["contact"]["email"], "gl-achziv-h@npa.org.il")
        self.assertIn("04-9823263", a["contact"]["phone"])
        self.assertEqual(a["waze"], "חניון לילה גן לאומי אכזיב וחוף אכזיב")

    def test_zero_width_chars_and_whatsapp_only_phone(self):
        # live quirks: an invisible char inside the heading, and a chat link instead of a number
        html = ("<div class='infoInner'><div class='infoContent'><h3>מה בח​ניון?</h3><ul><li>מקלחות (3)</li></ul>"
                "</div></div><div class='infoArrive'><span class='holidHour'>טלפון:<p><a href='https://wa.me/1'>"
                "*3639 לחץ כאן</a>, 04-6942440, 04-6942360</p></span></div>")
        r = crawl.parse_info(html)
        self.assertEqual(r["facilities"], ["מקלחות (3)"])
        self.assertEqual(r["contact"]["phone"], "04-6942440, 04-6942360")

    def test_garbage_page_does_not_crash(self):
        r = crawl.parse_info("<html><body>nothing here</body></html>")
        self.assertIn("no price tabs found", r["errors"])
        self.assertTrue(all(v is None for v in r["rates"].values()))


class ResultsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.comps = crawl.parse_results(fixture("results-beerot-2026-11-12.html"))

    def test_two_compositions(self):
        self.assertEqual(len(self.comps), 2)

    def test_first_composition_tent(self):
        tent = self.comps[0]["lodging"][0]
        self.assertEqual(tent["name"], "לינת שטח באוהלים פרטיים")
        self.assertEqual(tent["fromPerNight"], 201)
        rates = {r["label"]: r["total"] for r in tent["rates"]}
        self.assertEqual(rates["לינת שטח באוהלים פרטיים - מחיר רגיל"], 538)  # 2 nights x (2x64 + 3x47)
        self.assertEqual(rates["לינת שטח באוהלים פרטיים - מחיר מנוי מטמון"], 402)
        self.assertEqual(rates["לינת שטח באוהלים פרטיים - מחיר משרת מילואים פעיל"], 456)
        self.assertEqual(rates["לינת שטח באוהלים פרטיים - מחיר חייל בשירות חובה ושירות לאומי"], 470)
        self.assertFalse(self.comps[0]["soldOutHint"])

    def test_lodging_types_listed(self):
        names = [l["name"] for l in self.comps[0]["lodging"]]
        self.assertEqual(len(names), 6)
        self.assertIn("מאהל גדול קבוע מחיצה 02", names)

    def test_second_composition(self):
        tent = self.comps[1]["lodging"][0]
        self.assertEqual(tent["fromPerNight"], 131)

    def test_sold_out_page(self):
        page = ("<html><body><div class='order-details'>סיכום</div>"
                "<div id='body'>יתכן שסוג הלינה המבוקש אזל מהמלאי</div></body></html>")
        self.assertEqual(crawl.parse_results(page), [{"lodging": [], "soldOutHint": True}])

    def test_foreign_page_is_an_error_not_sold_out(self):
        with self.assertRaises(ValueError):
            crawl.parse_results("<html><body>Just a moment...</body></html>")

    def test_deep_link(self):
        self.assertEqual(
            crawl.results_url(13, "2026-11-12", "2026-11-14", (2, 3, 1)),
            "https://secure-hotels.net/INPA/BE_Results.aspx?lang=heb&hotel=13&in=2026-11-12&out=2026-11-14"
            "&rooms=1&ad1=2&ch1=3&inf1=1")


class DiffLogicTest(unittest.TestCase):
    """commit only when data changed beyond `checkedAt`."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self.tmp.name)
        self.old_root = crawl.ROOT
        crawl.ROOT = self.repo
        self.git("init", "-q")
        self.git("config", "user.email", "t@example.com")
        self.git("config", "user.name", "t")
        (self.repo / "data").mkdir()
        self.write({"checkedAt": "2026-10-13T05:30:00+03:00", "campsites": [{"id": 1, "checkedAt": "x", "rates": {"adult": 64}}]})
        self.git("add", "data")
        self.git("commit", "-q", "-m", "base")

    def tearDown(self):
        crawl.ROOT = self.old_root
        self.tmp.cleanup()

    def git(self, *a):
        subprocess.run(["git", "-C", str(self.repo), *a], check=True, capture_output=True)

    def write(self, obj):
        (self.repo / "data" / "campsites.json").write_text(json.dumps(obj), encoding="utf-8")

    def test_strip_checked(self):
        self.assertEqual(crawl.strip_checked({"checkedAt": 1, "a": [{"checkedAt": 2, "b": 3}]}), {"a": [{"b": 3}]})

    def test_timestamp_only_is_not_a_change(self):
        self.write({"checkedAt": "2026-10-14T05:30:00+03:00", "campsites": [{"id": 1, "checkedAt": "y", "rates": {"adult": 64}}]})
        self.git("add", "data")
        self.assertEqual(crawl.data_changed_beyond_timestamps(), [])

    def test_price_change_is_a_change(self):
        self.write({"checkedAt": "2026-10-14T05:30:00+03:00", "campsites": [{"id": 1, "checkedAt": "y", "rates": {"adult": 66}}]})
        self.git("add", "data")
        self.assertEqual(crawl.data_changed_beyond_timestamps(), ["data/campsites.json"])

    def test_new_file_is_a_change(self):
        (self.repo / "data" / "availability.json").write_text("{}", encoding="utf-8")
        self.git("add", "data")
        self.assertEqual(crawl.data_changed_beyond_timestamps(), ["data/availability.json"])

    def test_commit_and_push_skips_timestamp_only(self):
        self.write({"checkedAt": "2999-01-01T00:00:00+03:00", "campsites": [{"id": 1, "checkedAt": "y", "rates": {"adult": 64}}]})
        # base commit is fresh, so no heartbeat either: nothing is committed
        crawl.HEARTBEAT_HOURS, old = 10 ** 6, crawl.HEARTBEAT_HOURS
        try:
            changed, err = crawl.commit_and_push()
        finally:
            crawl.HEARTBEAT_HOURS = old
        self.assertEqual((changed, err), (False, None))
        log = subprocess.run(["git", "-C", str(self.repo), "log", "--oneline"], capture_output=True, text=True).stdout
        self.assertEqual(len(log.strip().splitlines()), 1)


class DataFilesTest(unittest.TestCase):
    def test_js_wrapper_is_same_content(self):
        with tempfile.TemporaryDirectory() as t:
            p = Path(t) / "x.js"
            obj = {"b": "אכזיב", "a": [1, 2]}
            crawl.write_js(p, "CAMPSITES", obj)
            text = p.read_text(encoding="utf-8")
            self.assertTrue(text.startswith("window.CAMPSITES = "))
            self.assertTrue(text.rstrip().endswith("};"))
            self.assertIn("אכזיב", text)  # ensure_ascii=False
            self.assertEqual(json.loads(text[len("window.CAMPSITES = "):].rstrip().rstrip(";")), obj)


if __name__ == "__main__":
    unittest.main(verbosity=1)
