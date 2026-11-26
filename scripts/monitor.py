"""Scan HKEX issuer filings for the signed-in iPhone research account."""
import datetime as dt
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HKEX = "https://www1.hkexnews.hk"
RULES = [
    ("業績指引", r"盈利警告|盈利預警|盈利預告|正面盈利預告|業績指引"),
    ("業績", r"(全年|年度|中期|季度|季度|季度及中期|三個月|六個月|九個月|十二個月|半年).{0,12}業績|業績公[佈布]"),
    ("重大交易", r"非常重大.{0,12}(收購|出售)|重大(收購|出售|交易)|特別交易|關連及主要交易|主要交易|全面要約|私有化"),
    ("監管變動", r"撤銷上市地位|取消上市地位|監管處分|監管機構.{0,8}(處罰|調查)"),
]
ROUTINE = r"董事會會議|會議通告|翌日披露|月報表|代表委任|投票結果|業績(簡報|演示)|登記安排|寄發通知"


def request(url, headers=None, body=None):
    hdr = {"User-Agent": "iPhone-HK-Research/1.0", **(headers or {})}
    data = None
    if body is not None:
        hdr["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=hdr), timeout=40) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            if exc.code not in (429, 502, 503, 504) or attempt == 2:
                raise
        except (TimeoutError, urllib.error.URLError):
            if attempt == 2:
                raise
        time.sleep(2 ** attempt)


def filings(stock_id, start, end):
    for limit in (100, 500, 2000):
        args = dict(market="SEHK", stockId=stock_id, searchType=0, category=0,
                    fromDate=start, toDate=end, sortDir=0, sortByOptions="DateTime",
                    rowRange=limit, lang="zh", t1code=-2, t2Gcode=-2, t2code=-2)
        page = request(HKEX + "/search/titleSearchServlet.do?" + urllib.parse.urlencode(args))
        rows = json.loads(page["result"])
        if page["hasNextRow"] in (False, "false") and (not rows or int(rows[0].get("TOTAL_COUNT", len(rows))) <= len(rows)):
            return rows
    raise ValueError("公告數量超出查閱範圍")


def candidate(code, row):
    title = html.unescape(re.sub("<[^>]+>", " ", row["TITLE"])).strip()
    category = html.unescape(re.sub("<[^>]+>", " ", row["LONG_TEXT"]))
    if re.search(ROUTINE, title) or code.zfill(5) not in re.findall(r"\b\d{5}\b", re.sub("<[^>]+>", " ", row["STOCK_CODE"])):
        return
    kind = next((k for k, pattern in RULES if re.search(pattern, title)), None)
    if not kind or not row["FILE_LINK"].startswith("/listedco/"):
        return
    day = dt.datetime.strptime(row["DATE_TIME"], "%d/%m/%Y %H:%M").date().isoformat()
    return dict(id="hkex-"+code+"-"+str(row["NEWS_ID"]), company=code, date=day,
                title=title, official=HKEX+row["FILE_LINK"], status="已確認",
                type=kind, importance="中", material=True, summary="港交所已刊登此公告。公告分類："+category,
                next="閱讀公告全文，核對對盈利、現金流或估值的實際影響。")


def run():
    base = os.environ["IPHONE_SUPABASE_URL"].rstrip("/")
    if not re.fullmatch(r"https://[a-z0-9-]+\.supabase\.co", base):
        raise ValueError("Supabase 網址格式有誤")
    headers = {"apikey": os.environ["IPHONE_PUBLISHABLE_KEY"]}
    login = request(base+"/auth/v1/token?grant_type=password", headers, {
        "email": os.environ["IPHONE_EMAIL"], "password": os.environ["IPHONE_PASSWORD"]})
    headers["Authorization"] = "Bearer "+login["access_token"]
    def rows(kind, columns):
        offset = 0
        while True:
            batch = request(base+"/rest/v1/iphone_research?kind=eq."+kind+"&select="+columns+
                            "&order=item&limit=100&offset="+str(offset), headers)
            yield from batch
            if len(batch)<100:
                return
            offset += 100
    active = [r["data"] for r in rows("watchlist","data") if r["data"].get("site") or r["data"].get("alerts")]
    if not active:
        return
    known = {r["item"] for r in rows("records","item")}
    ids = {s["c"]:s["i"] for s in request(HKEX+"/ncms/script/eds/activestock_sehk_c.json")}
    today = dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date()
    failed = 0
    for stock in active:
        try:
            code = stock["code"]
            batch = filings(ids[code.zfill(5)], (today-dt.timedelta(days=7)).strftime("%Y%m%d"), today.strftime("%Y%m%d"))
            for row in batch:
                entry = candidate(code,row)
                if entry and entry["id"] not in known:
                    request(base+"/rest/v1/rpc/save_iphone_research", headers,
                            {"k":"records","v":entry,"expected":0})
                    known.add(entry["id"])
        except Exception as exc:
            failed += 1
            print("公告檢查未完成", type(exc).__name__, getattr(exc,"code",""), file=sys.stderr)
    if failed:
        raise RuntimeError("部分公告檢查未完成")


if __name__ == "__main__":
    run()
