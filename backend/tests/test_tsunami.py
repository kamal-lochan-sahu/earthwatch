import time
from datetime import datetime, timedelta, timezone

import pytest
import requests
from fastapi.testclient import TestClient

import data.cache as cache_module
import data.hazards.tsunami as tsu
from main import app

client = TestClient(app)


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def hours_ago(h):
    return datetime.now(timezone.utc) - timedelta(hours=h)


def entry(when, title="65 miles SW of Port Alice, British Columbia", lat="49.293", lon="-127.676",
          category="Information", magnitude="4.7(Ml)", note=" * There is NO tsunami danger from this earthquake.",
          code="WEAK53", centre="PAAQ", with_fields=True):
    fields = ""
    if with_fields:
        cat = f"<strong>Category:</strong> {category}<br/>" if category is not None else ""
        mag = f"<strong>Preliminary Magnitude: </strong>{magnitude}<br/>" if magnitude is not None else ""
        fields = (f"{cat}<strong>Bulletin Issue Time: </strong> {when:%Y.%m.%d %H:%M:%S} UTC <br/>{mag}"
                  f"<strong>Lat/Lon: </strong>{lat} / {lon}<br/><strong>Affected Region: </strong>{title}<br/>"
                  f"<b>Note:</b> {note}<br/><strong>Definition: </strong>An information statement indicates that an "
                  f"earthquake has occurred, but does not pose a tsunami threat, or that a tsunami warning, advisory, "
                  f"or watch has been issued for another section of the ocean. ")
    base = f"https://www.tsunami.gov/events/{centre}/{when:%Y/%m/%d}/abc{when:%H%M}/1/{code}"
    return (f'<entry><title>{title}</title><updated>{iso(when)}</updated><geo:lat>{lat}</geo:lat>'
            f'<geo:long>{lon}</geo:long><summary type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml">{fields}'
            f'<a href="{base}/{code}.txt">View bulletin</a></div></summary><id>urn:uuid:{when:%H%M}</id>'
            f'<link rel="related" title="CapXML document" href="{base}/{centre}CAP.xml" type="application/cap+xml" />'
            f'<link rel="alternate" title="Bulletin" href="{base}/{code}.txt" type="application/xml" /></entry>')


def feed(title, *entries):
    return ('<?xml version="1.0" encoding="UTF-8"?>\n    <feed xmlns="http://www.w3.org/2005/Atom" '
            'xmlns:geo="http://www.w3.org/2003/01/geo/wgs84_pos#" xmlns:georss="http://www.georss.org/georss">'
            f"<id>urn:uuid:x</id><title>        {title}        </title><updated>2026-11-11T01:51:32Z</updated>"
            f"<author><name>NWS</name></author>{''.join(entries)}</feed>").encode()


def fake_get(ntwc=None, ptwc=None, status=200, raises=None):
    calls = []

    def get(url, headers=None, timeout=None):
        calls.append(url)
        if raises:
            raise raises
        r = type("R", (), {})()
        r.status_code = status
        body = ntwc if "PAAQ" in url else ptwc
        r.content = body if body is not None else feed("Tsunami Information Statement Number 1")
        return r

    get.calls = calls
    return get


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    monkeypatch.setattr(tsu.time, "sleep", lambda s: None)


def get_body():
    r = client.get("/api/tsunamis")
    assert r.status_code == 200, r.text
    return r.json()


def test_classify():
    assert tsu.classify("Information") == "information"
    assert tsu.classify("TSUNAMI WARNING NUMBER 3") == "warning"
    assert tsu.classify("Tsunami Watch") == "watch"
    assert tsu.classify("Tsunami Threat Message") == "threat"
    assert tsu.classify("Advisory") == "advisory"
    assert tsu.classify("Tsunami Cancellation") == "cancellation"
    assert tsu.classify("something else") is None and tsu.classify(None) is None


def test_information_statement_is_a_low_severity_dot(monkeypatch):
    when = hours_ago(5)
    monkeypatch.setattr(tsu.requests, "get", fake_get(ntwc=feed("Tsunami Information Statement Number 1", entry(when))))
    body = get_body()
    assert body["layer"] == "tsunamis" and body["source"] == "NOAA NTWC / PTWC" and body["count"] == 1
    it = body["items"][0]
    assert it["severity"] == "info" and it["kind"] == "information" and it["category"] == "tsunami"
    assert it["lat"] == 49.293 and it["lon"] == -127.676
    assert it["value"] == 4.7 and it["unit"] == "M" and it["magnitude_type"] == "Ml"
    assert it["title"] == "Tsunami information statement · 65 miles SW of Port Alice, British Columbia"
    assert it["region"] == "65 miles SW of Port Alice, British Columbia"
    assert it["note"] == "There is NO tsunami danger from this earthquake."
    assert it["message"] == "Tsunami Information Statement Number 1"      # surrounding whitespace removed
    assert it["centre"] == "NTWC" and it["source"] == "NOAA NTWC" and it["product"] == "WEAK53"
    assert it["id"] == f"PAAQ/{when:%Y/%m/%d}/abc{when:%H%M}/1/WEAK53"
    assert it["url"].startswith("https://www.tsunami.gov/events/PAAQ/") and it["url"].endswith("WEAK53.txt")
    assert it["time"] == iso(when).replace(f"{when:%S}", f"{when:%S}")
    c = body["counts"]
    assert c["active"] == 0 and c["last_48h"] == 1 and c["feeds_ok"] == 2 and c["highest"] == "info"
    assert body["stale"] is False


def test_nothing_recent_is_the_normal_empty_state(monkeypatch):
    old = feed("Tsunami Information Statement Number 1", entry(hours_ago(80)))
    monkeypatch.setattr(tsu.requests, "get", fake_get(ntwc=old, ptwc=old))
    body = get_body()
    assert body["items"] == [] and body["count"] == 0
    assert body["counts"]["active"] == 0 and body["counts"]["highest"] is None and body["stale"] is False


@pytest.mark.parametrize("category,kind,severity", [
    ("Advisory", "advisory", "mild"),
    ("Watch", "watch", "moderate"),
    ("Threat", "threat", "moderate"),
    ("Warning", "warning", "extreme"),
    ("Cancellation", "cancellation", "info"),
])
def test_alert_categories(monkeypatch, category, kind, severity):
    e = entry(hours_ago(1), category=category, note="", code="WEHW40", centre="PHEB")
    monkeypatch.setattr(tsu.requests, "get", fake_get(ptwc=feed(f"Tsunami {category} Number 2", e)))
    body = get_body()
    it = body["items"][0]
    assert it["kind"] == kind and it["severity"] == severity and it["centre"] == "PTWC"
    assert it["note"] is None and it["product"] == "WEHW40"
    assert body["counts"]["active"] == (0 if severity == "info" else 1)


def test_the_definition_text_cannot_turn_an_information_statement_into_a_warning(monkeypatch):
    # the real Information summary mentions "warning, advisory, or watch" in its Definition
    monkeypatch.setattr(tsu.requests, "get", fake_get(ntwc=feed("Tsunami Information Statement Number 1", entry(hours_ago(2)))))
    assert get_body()["items"][0]["severity"] == "info"


def test_without_a_category_the_feed_title_decides(monkeypatch):
    e = entry(hours_ago(1), category=None, code="WEGM40", centre="PHEB")
    monkeypatch.setattr(tsu.requests, "get", fake_get(ptwc=feed("TSUNAMI WARNING NUMBER 1", e)))
    assert get_body()["items"][0]["kind"] == "warning"


def test_without_category_or_title_the_product_code_decides(monkeypatch):
    info = entry(hours_ago(1), category=None, code="WEHW42", centre="PHEB")
    alert = entry(hours_ago(2), category=None, code="WEHW40", centre="PHEB", lat="20.0", lon="-155.0")
    monkeypatch.setattr(tsu.requests, "get", fake_get(ptwc=feed("Message Number 1", info, alert)))
    kinds = {it["product"]: it["kind"] for it in get_body()["items"]}
    assert kinds == {"WEHW42": "information", "WEHW40": "other"}     # unknown alert types are shown, not hidden


def test_most_severe_first_then_newest(monkeypatch):
    items = [entry(hours_ago(1), category="Information", lat="1", lon="1"),
             entry(hours_ago(10), category="Warning", lat="2", lon="2", code="WEHW40", centre="PHEB"),
             entry(hours_ago(3), category="Information", lat="3", lon="3")]
    monkeypatch.setattr(tsu.requests, "get", fake_get(ptwc=feed("Tsunami Message", *items)))
    body = get_body()
    assert [it["lat"] for it in body["items"]] == [2.0, 1.0, 3.0]
    assert body["counts"]["highest"] == "extreme" and body["counts"]["active"] == 1


def test_magnitude_forms_and_missing(monkeypatch):
    items = [entry(hours_ago(1), magnitude="7.1(Mww)", lat="1", lon="1"),
             entry(hours_ago(2), magnitude="6.4", lat="2", lon="2"),
             entry(hours_ago(3), magnitude=None, lat="3", lon="3"),
             entry(hours_ago(4), magnitude="n/a", lat="4", lon="4")]
    monkeypatch.setattr(tsu.requests, "get", fake_get(ntwc=feed("Tsunami Information Statement Number 1", *items)))
    by_lat = {it["lat"]: it for it in get_body()["items"]}
    assert (by_lat[1.0]["value"], by_lat[1.0]["unit"], by_lat[1.0]["magnitude_type"]) == (7.1, "M", "Mww")
    assert by_lat[2.0]["value"] == 6.4 and by_lat[2.0]["magnitude_type"] is None
    assert by_lat[3.0]["value"] is None and by_lat[3.0]["unit"] is None
    assert by_lat[4.0]["value"] is None


def test_bad_entries_are_skipped(monkeypatch):
    items = [entry(hours_ago(1), lat="95", lon="0"), entry(hours_ago(1), lat="abc", lon="0"),
             entry(hours_ago(1), lat="10", lon="200"), entry(hours_ago(1), lat="12", lon="13")]
    monkeypatch.setattr(tsu.requests, "get", fake_get(ntwc=feed("Tsunami Information Statement Number 1", *items)))
    body = get_body()
    assert [it["lat"] for it in body["items"]] == [12.0]


def test_entry_without_summary_fields_still_works(monkeypatch):
    e = entry(hours_ago(1), with_fields=False)
    monkeypatch.setattr(tsu.requests, "get", fake_get(ntwc=feed("Tsunami Information Statement Number 1", e)))
    it = get_body()["items"][0]
    assert it["kind"] == "information" and it["value"] is None and it["note"] is None
    assert it["region"] == "65 miles SW of Port Alice, British Columbia"


def test_only_https_bulletin_links_pass(monkeypatch):
    e = entry(hours_ago(1)).replace("https://www.tsunami.gov/events/PAAQ", "javascript:alert(1)//PAAQ")
    monkeypatch.setattr(tsu.requests, "get", fake_get(ntwc=feed("Tsunami Information Statement Number 1", e)))
    assert get_body()["items"][0]["url"] == tsu.SOURCE_URL


def test_one_feed_down_is_served_but_flagged_stale(monkeypatch):
    real = fake_get(ntwc=feed("Tsunami Information Statement Number 1", entry(hours_ago(1))))

    def get(url, headers=None, timeout=None):
        if "PHEB" in url:
            raise requests.ConnectionError()
        return real(url, headers=headers, timeout=timeout)

    monkeypatch.setattr(tsu.requests, "get", get)
    body = get_body()
    assert body["count"] == 1 and body["stale"] is True
    assert body["counts"]["feeds_ok"] == 1 and body["counts"]["feeds_total"] == 2


@pytest.mark.parametrize("junk", [b"", b"<html>nope</html>", b"not xml at all", b"<feed", b"<?xml version='1.0'?><rss/>"])
def test_unreadable_feed_counts_as_down(monkeypatch, junk):
    monkeypatch.setattr(tsu.requests, "get", fake_get(ntwc=junk, ptwc=junk))
    r = client.get("/api/tsunamis")
    assert r.status_code == 502 and "unavailable" in r.json()["detail"]


def test_entity_tricks_are_refused(monkeypatch):
    bomb = (b'<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY a "aaaa">]><feed xmlns="http://www.w3.org/2005/Atom">'
            b"<title>&a;</title></feed>")
    monkeypatch.setattr(tsu.requests, "get", fake_get(ntwc=bomb, ptwc=bomb))
    assert client.get("/api/tsunamis").status_code == 502


def test_oversized_feed_is_refused(monkeypatch):
    big = b"<feed xmlns='http://www.w3.org/2005/Atom'>" + b" " * (tsu.MAX_FEED_BYTES + 1) + b"</feed>"
    monkeypatch.setattr(tsu.requests, "get", fake_get(ntwc=big, ptwc=big))
    assert client.get("/api/tsunamis").status_code == 502


def test_both_feeds_down_is_a_502(monkeypatch):
    monkeypatch.setattr(tsu.requests, "get", fake_get(status=503))
    assert client.get("/api/tsunamis").status_code == 502
    monkeypatch.setattr(tsu.requests, "get", fake_get(raises=requests.Timeout()))
    cache_module._store.clear()
    assert client.get("/api/tsunamis").status_code == 502


def test_a_client_error_is_not_retried(monkeypatch):
    getter = fake_get(status=404)
    monkeypatch.setattr(tsu.requests, "get", getter)
    assert client.get("/api/tsunamis").status_code == 502
    assert len(getter.calls) == 2          # one try per feed, no retry


def test_serves_last_good_copy_and_flags_it_stale(monkeypatch):
    monkeypatch.setattr(tsu.requests, "get", fake_get(ntwc=feed("Tsunami Warning Number 1", entry(hours_ago(1), category="Warning", code="WEAK51"))))
    assert get_body()["stale"] is False
    (key,) = [k for k in cache_module._store if k[0] == "fetch_tsunami_messages"]
    stamp, value = cache_module._store[key]
    old = time.time() - (tsu.STALE_AFTER_SECONDS + 600)
    value["fetched_at"] = old
    cache_module._store[key] = (old, value)
    monkeypatch.setattr(tsu.requests, "get", fake_get(status=503))
    body = get_body()
    assert body["stale"] is True and body["counts"]["active"] == 1       # the warning is not forgotten


def test_one_fetch_per_ttl(monkeypatch):
    getter = fake_get()
    monkeypatch.setattr(tsu.requests, "get", getter)
    for _ in range(3):
        assert client.get("/api/tsunamis").status_code == 200
    assert len(getter.calls) == 2


def test_real_world_samples_parse():
    """The two live feeds as NOAA published them (2026-11-08 PTWC, 2026-11-11 NTWC)."""
    ptwc = b'''<?xml version="1.0" encoding="UTF-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom" xmlns:geo="http://www.w3.org/2003/01/geo/wgs84_pos#" xmlns:georss="http://www.georss.org/georss">
    <id>urn:uuid:db2683b9</id><title>        TSUNAMI INFORMATION STATEMENT NUMBER   1        </title>
    <updated>2026-11-08T06:34:57Z</updated>
    <author>
      <name>NWS PACIFIC TSUNAMI WARNING CENTER HONOLULU HI</name>
<uri>https://www.tsunami.gov/</uri>
     <email>ntwc@noaa.gov</email>
    </author>
<icon>https://www.tsunami.gov/images/favicon.ico</icon>
<link type="application/atom+xml" rel="self" title="self" href="https://www.tsunami.gov/events/xml/PAAQAtom.xml"/>
 <link rel="related" title="Energy Map" href="https://www.tsunami.gov/events/PHEB/2026/11/08/26312050/1/WECA42/ " type="image/jpeg" />

   <entry>

    <title>ABOUT 72 MILES NORTHWEST OF PUERTO RICO</title><updated>2026-11-08T06:34:57Z</updated>
<geo:lat>19.344</geo:lat>
<geo:long>-67.794</geo:long>
<summary type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml">
     <strong>Category:</strong> Information<br/><strong>Bulletin Issue Time: </strong> 2026.11.08 06:34:57 UTC <br/><strong>Preliminary Magnitude: </strong>4.6(Ml)<br/><strong>Lat/Lon: </strong>19.344 / -67.794<br/><strong>Affected Region: </strong>ABOUT 72 MILES NORTHWEST OF PUERTO RICO<br/><b>Note:</b>  <br/><strong>Definition: </strong><a href="https://www.tsunami.gov/events/PHEB/2026/11/08/26312050/1/WECA42/WECA42.txt">View bulletin</a><img src="https://www.tsunami.gov/events/PHEB/2026/11/08/26312050/1/WECA42/ " alt="Energy Map" /> 
 </div></summary>
    <id>urn:uuid:96d4cecd-e727-4c5c-92d1-096abbd0d07e</id><link rel="related" title="CapXML document" href="https://www.tsunami.gov/events/PHEB/2026/11/08/26312050/1/WECA42/PHEBCAP.xml" type="application/cap+xml" />
<link rel="alternate" title="Bulletin" href="https://www.tsunami.gov/events/PHEB/2026/11/08/26312050/1/WECA42/WECA42.txt" type="application/xml" />
</entry>
</feed>
'''
    feed_def = tsu.FEEDS[1]
    now_ms = tsu.parse_iso_ms("2026-11-09T00:00:00Z")
    (it,) = tsu.parse_feed(ptwc, feed_def, now_ms)
    assert it["id"] == "PHEB/2026/11/08/26312050/1/WECA42" and it["product"] == "WECA42"
    assert it["kind"] == "information" and it["severity"] == "info" and it["centre"] == "PTWC"
    assert (it["lat"], it["lon"], it["value"], it["magnitude_type"]) == (19.344, -67.794, 4.6, "Ml")
    assert it["region"] == "ABOUT 72 MILES NORTHWEST OF PUERTO RICO" and it["note"] is None
    assert it["message"] == "TSUNAMI INFORMATION STATEMENT NUMBER 1"
    assert it["time"] == "2026-11-08T06:34:57Z"
    assert tsu.parse_feed(ptwc, feed_def, tsu.parse_iso_ms("2026-11-12T00:00:00Z")) == []     # > 48 h old
