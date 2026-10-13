"""Run: python tests/test_trip.py — tools/trip.py turns a crawled campsite into window.CAMP.

Pinned to Achziv: generating the October trip from the crawl must give the 30/09/2026 hand-written prices
(tests/fixtures/prices-achziv.js) in every category field, so the generator says what a person checked by hand.
"""
import json, os, subprocess, sys, unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import trip  # noqa: E402

FIXTURE = os.path.join(ROOT, 'tests', 'fixtures', 'prices-achziv.js')


def fixture_camp():
    js = "global.window = {}; require(process.argv[1]); process.stdout.write(JSON.stringify(window.CAMP))"
    out = subprocess.run(['node', '-e', js, FIXTURE], capture_output=True, text=True, encoding='utf-8', check=True)
    return json.loads(out.stdout)


def achziv_trip():
    t = trip.load(trip.TRIP_JSON)
    past = next(p for p in t['past'] if p['id'] == 'achziv-2026-10')
    a = {k: v for k, v in t.items() if k != 'past'}
    a.update(past, dateRangeStart='2026-10-01', dateRangeEnd='2026-10-20')
    return a


class AchzivTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.old = fixture_camp()
        cls.new, _ = trip.build(achziv_trip(), trip.load(trip.CAMPSITES_JSON))

    def test_same_categories_in_order(self):
        self.assertEqual([c['id'] for c in self.new['categories']], [c['id'] for c in self.old['categories']])

    def test_every_category_field(self):
        for old in self.old['categories']:
            new = next(c for c in self.new['categories'] if c['id'] == old['id'])
            self.assertEqual(new, old, old['id'])

    def test_mattress(self):
        self.assertEqual([(e['id'], e['price']) for e in self.new['extras']], [('mattress', 12)])

    def test_trip_fields(self):
        self.assertEqual((self.new['tripId'], self.new['campsiteId'], self.new['defaultFrom'], self.new['defaultTo']),
                         ('achziv-2026-10', 23, '2026-10-06', '2026-10-13'))


class RulesTest(unittest.TestCase):
    def test_age_bounds(self):
        self.assertEqual(trip.age_bounds({'adult': 'גיל 18 ומעלה', 'child': 'מגיל 5 ועד 18'}), (18, 5))
        self.assertEqual(trip.age_bounds({}), (None, None))

    def test_missing_rate_hides_category_and_no_ages_text(self):
        site = {'rates': {'adult': 60, 'child': 40}, 'rentals': []}
        cats = trip.categories(site, 30)
        self.assertEqual([c['id'] for c in cats], ['adult', 'child', 'toddler', 'escort'])
        self.assertNotIn('ages', cats[0])
        self.assertNotIn('groupPrice', cats[0])
        self.assertNotIn('note', cats[0])

    def test_unknown_campsite_fails_loudly(self):
        with self.assertRaises(SystemExit):
            trip.build(dict(achziv_trip(), campsiteId=999), {'campsites': []})

    def test_check_ignores_crawl_date_only(self):
        camp, _ = trip.build(achziv_trip(), trip.load(trip.CAMPSITES_JSON))
        text = trip.render('CAMP', trip.HEAD_PRICES, dict(camp, checked='01/01/2000'))
        self.assertEqual({**trip.parse_js(text), 'checked': None}, {**camp, 'checked': None})
        self.assertIsNone(trip.parse_js('window.CAMP = { categories: [] };'))  # hand-written JS is "stale"


if __name__ == '__main__':
    unittest.main()
