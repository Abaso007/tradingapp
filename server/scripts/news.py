import requests
import yfinance as yf
from GoogleNews import GoogleNews
import json
import datetime
import time
import os
from dotenv import load_dotenv


load_dotenv("../config/.env")

STOCKNEWS_API_KEY = os.getenv("STOCKNEWS_API_KEY")


# Before running this file you need to update the session cookies for degiro and IB
# IB: filter requests on "search" in the browser network tab copy the curl command and paste it in Postman
    # paste the header section from Postman
# degiro: filter requests on "news" in the browser network tab copy the curl command and paste it in Postman
    # paste the sessionId from Postman




# Debugging tool to print curl commands from Python requests
def print_curl_command(request):
    command = "curl '{uri}' -X {method} -H {headers} {data}"
    method = request.method
    uri = request.url
    data = "-d '{0}'".format(request.body) if request.body else ""
    headers = ['"{0}: {1}"'.format(k, v) for k, v in request.headers.items()]
    headers = " -H ".join(headers)
    print(command.format(uri=uri, method=method, headers=headers, data=data))
# To use:   
# print_curl_command(response.request)



# # Degiro API
# Paste the code from Postman to get the updated session ID

def fetch_degiro_news(ticker='AAPL'):
    try:
        print("Fetching data from Degiro API...")
        url = 'https://trader.degiro.nl/dgtbxdsservice/newsfeed/v2/news-by-company' 
        stock = yf.Ticker(ticker)
        isin = stock.isin
        headers = {
            'authority': 'trader.degiro.nl',
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
            'cache-control': 'no-cache',
            'cookie': 'CookieConsent={stamp:%27g2rvM5TK90YFjtxdtmCTe3UfQvtokA5c28JlKZpJzqjq3nnUwLTN1w==%27%2Cnecessary:true%2Cpreferences:true%2Cstatistics:true%2Cmarketing:true%2Cmethod:%27explicit%27%2Cver:1%2Cutc:1683845362852%2Cregion:%27fr%27}; _gcl_au=1.1.456115840.1683845363; _rdt_uuid=1683845363879.c53ff580-c912-4cdc-b863-3a4882c034d0; _fbp=fb.1.1683845364454.322248438; _scid=d29ee0a9-a3bd-4eaa-a84f-09676cb062b6; _hjSessionUser_2703461=eyJpZCI6IjUxZjNmMTI2LWY0OTItNWEyOS05NmVmLTE4MWM1ODNlMDIyOSIsImNyZWF0ZWQiOjE2ODM4NDU0NjAyMDgsImV4aXN0aW5nIjp0cnVlfQ==; ln_or=eyIzNDUyNzg2IjoiZCJ9; _gid=GA1.2.234993630.1685341238; ab.storage.deviceId.48ef29a6-8098-447b-84fd-73dcf7ca322a=%7B%22g%22%3A%22d8bcdcca-2571-02d4-f20f-d81ffd537654%22%2C%22c%22%3A1608135359471%2C%22l%22%3A1685366933636%7D; ab.storage.userId.48ef29a6-8098-447b-84fd-73dcf7ca322a=%7B%22g%22%3A%22761567%22%2C%22c%22%3A1608135359466%2C%22l%22%3A1685366933637%7D; JSESSIONID=266A5E29C20056274A73AE01889B81E4.prod_b_128_5; _gat_UA-29259433-5=1; _ga_L69XHC4W9Q=GS1.1.1685365876.9.1.1685367688.57.0.0; ab.storage.sessionId.48ef29a6-8098-447b-84fd-73dcf7ca322a=%7B%22g%22%3A%22cc1ec20e-d6ec-5b9c-ab35-0f633da71680%22%2C%22e%22%3A1685369492335%2C%22c%22%3A1685366933635%2C%22l%22%3A1685367692335%7D; _scid_r=d29ee0a9-a3bd-4eaa-a84f-09676cb062b6; _uetsid=eef6af40fde811edbbbc5f037ae5afa8; _uetvid=1357a620f04e11edb6e2c3935d0e7d31; _ga_DK0QHRVZ0H=GS1.1.1685365876.11.1.1685367693.52.0.0; _ga=GA1.1.687530578.1683845398',
            'pragma': 'no-cache',
            'referer': 'https://trader.degiro.nl/trader/',
            'sec-ch-ua': '"Google Chrome";v="113", "Chromium";v="113", "Not-A.Brand";v="24"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"macOS"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin',
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36',
        }
        params = {
            'isin': isin, 
            'limit': 10, 
            'offset': 0,
            'sessionId': '73960D8F6429810BA87A4AA009AB9FA3.prod_b_128_5',
            'languages': 'en,fr' 
        }

        response = requests.get(url, headers=headers, params=params)
        print_curl_command(response.request)
        degiro_news_raw = response.json()['data']['items']
        # print("degiro_news", degiro_news)
        degiro_news_raw = [n for n in degiro_news_raw  if n['title'].strip()]
        degiro_news = []
        for news in degiro_news_raw:
            degiro_news.append({
                'id': news.get('id'),
                'title': news.get('title'),
                'date': datetime.datetime.strptime(news.get('date'), "%Y-%m-%dT%H:%M:%SZ"),
                'category': news.get('category'),
                'tickers': news.get('isins'),
                'sentiment': None,
                'source': 'degiro_news'
            })


        print("Data fetched successfully from Degiro API.")
        return degiro_news
    except Exception as e:
        print(f"Session ID expired. Please update it - {e}")
        return []

# # StockNews API 
# 100 calls per month for free
# https://stocknewsapi.com/documentation
def fetch_stocknews_news(ticker='AAPL'):
    try:
        print("Fetching data from StockNews API...")
        url = 'https://stocknewsapi.com/api/v1/trending-headlines'
        params = {
            'tickers': ticker,
            'page': 1, 
            'token': STOCKNEWS_API_KEY 
        }
        response = requests.get(url, params=params)
        print_curl_command(response.request)

        stocknews_news_raw = response.json()['data']
        stocknews_news_raw = [n for n in stocknews_news_raw if n['title'].strip()]
        stocknews_news = []
        for news in stocknews_news_raw:
            stocknews_news.append({
                'id': None,
                'title': news.get('title'),
                'date': datetime.datetime.strptime(news.get('date'), "%a, %d %b %Y %H:%M:%S %z"),
                'category': None,
                'tickers': news.get('tickers'),
                'sentiment': news.get('sentiment'),
                'source': 'stocknews_news'
            })
        # print("stocknews_news :", stocknews_news)
        print("Data fetched successfully from StockNews API.")
        return stocknews_news
    except Exception as e:
        print(f"An error occurred while fetching data from StockNews API: {e}")
        return []



# # TickerTick API
#  30 requests per minute from the same IP address
def fetch_tickertick_news(ticker='AAPL'):
    try:
        print("Fetching data from TickerTick API...")
        base_url = 'https://api.tickertick.com/feed'
        query = f'(diff (and tt:{ticker}) (or s:reddit s:phonearena s:slashgear)) (or T:fin_news T:analysis T:industry T:earning T:curated)'
        params = f'?q={query}&n=10'
        url = base_url + params
        response = requests.get(url)
        print_curl_command(response.request)

        tickertick_news_raw = response.json()['stories']
        tickertick_news_raw = [n for n in tickertick_news_raw if n['title'].strip()]
        tickertick_news = []
        for news in tickertick_news_raw:
            tickertick_news.append({
                'id': news.get('id'),
                'title': news.get('title'),
                'date': datetime.datetime.fromtimestamp(news.get('time') / 1000),
                'category': None,
                'tickers': news.get('tickers'),
                'sentiment': None,
                'source': 'tickertick_news'
            })
        # print("tickertick_news :", tickertick_news)
        print("Data fetched successfully from TickerTick API.")
        return tickertick_news
    except Exception as e:
        print(f"An error occurred while fetching data from TickerTick API: {e}")
        return []


# # Yahoo Finance 
def fetch_yahoo_news(ticker='AAPL'):
    try:
        print("Fetching data from Yahoo Finance...")
        stock = yf.Ticker(ticker)
        yahoo_news_raw = stock.news
        yahoo_news_raw  = [n for n in yahoo_news_raw  if n['title'].strip()]
        yahoo_news = []
        for news in yahoo_news_raw:
            yahoo_news.append({
                'id': news.get('uuid'),
                'title': news.get('title'),
                'date': datetime.datetime.fromtimestamp(news.get('providerPublishTime')),
                'category': None,
                'tickers': news.get('relatedTickers'),
                'sentiment': None,
                'source': 'yahoo_news'
            })
        # print("yahoo_news :", yahoo_news)
        print("Data fetched successfully from Yahoo Finance.")
        return yahoo_news
    except Exception as e:
        print(f"An error occurred while fetching data from Yahoo Finance : {e}")
        return []
  

# Interactive Brokers API
# Paste the code from Postman to get the updated cookie
def fetch_ib_news(ticker='AAPL'):

# Get the contract number from the ticker
    try:
        url = "https://www.interactivebrokers.co.uk/portal.proxy/v1/portal/iserver/secdef/search"

        payload = f'{{"symbol":"{ticker}","pattern":true,"referrer":"onebar"}}'
        headers = {
        'authority': 'www.interactivebrokers.co.uk',
        'accept': '*/*',
        'accept-language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
        'cache-control': 'no-cache',
        'content-type': 'application/json; charset=utf-8',
        'cookie': 'SBID=qlku8ucrw2olhj2l78s; IB_PRIV_PREFS=0%7C0%7C0; web=1038835950; persistPickerEntry=-975354114; ROUTEIDD=.ny5japp2; PHPSESSID=1uatb4ikep5o234kpc05k956t1; _gcl_au=1.1.1159424871.1683845124; _ga=GA1.1.1577574560.1683845124; IB_LGN=T; _fbp=fb.2.1683845124910.2067711817; _tt_enable_cookie=1; _ttp=KwcgLD3IO-uMJr9oPKCG2dtx7yM; pastandalone=""; ROUTEID=.zh4www2-internet; credrecovery.web.session=36fb301f70cf85a0839df3622cdc2229; _uetsid=ed7f5a60fdf511edbe389b7bccaa0c57; _uetvid=849ca6d0f04d11eda4f6136e3642cc6b; _ga_V74YNFMQMQ=GS1.1.1685385602.8.0.1685385607.0.0.0; URL_PARAM="RL=1"; AKA_A2=A; XYZAB_AM.LOGIN=d90c5d5b0b194796999f89cfc50dc07d5366fa4a; XYZAB=d90c5d5b0b194796999f89cfc50dc07d5366fa4a; USERID=102719436; IS_MASTER=true; cp.eu=63891bba3d28defbbc55fa9bdad78e7e; ibcust=22dc43d8adb4b4bc5b61d137f42c261e; RT="z=1&dm=www.interactivebrokers.co.uk&si=e3e1ccec-d396-4feb-812d-b90d1172b25b&ss=liajnfh0&sl=3&tt=5f7&obo=1&rl=1"',
        'origin': 'https://www.interactivebrokers.co.uk',
        'pragma': 'no-cache',
        'referer': 'https://www.interactivebrokers.co.uk/portal/',
        'sec-ch-ua': '"Google Chrome";v="113", "Chromium";v="113", "Not-A.Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36',
        'x-ccp-session-id': '64757af3.00000089',
        'x-embedded-in': 'web',
        'x-request-id': '17',
        'x-service': 'AM.LOGIN',
        'x-session-id': 'e1cd1c9c-638e-4139-9dc6-cf0de318e047',
        'x-wa-version': '61d75d4,Mon, 15 May 2023 07:09:01 -0400/2023-05-15T15:42:00.639Z',
        'x-xyzab': 'd90c5d5b0b194796999f89cfc50dc07d5366fa4a'
        }


        response = requests.request("POST", url, headers=headers, data=payload)
        # print_curl_command(response.request)

        ib_contracts = response.json()[0]['conid']



        # print("ib_contracts",  ib_contracts)


    except Exception as e:
        print(f"Cookies expired. Please update it -  {e}")
        return []

# Get the news from the contract number
    try:
        print("Fetching data from Interactive Brokers API...")


        url = "https://www.interactivebrokers.co.uk/tws.proxy/news2/search2?lang=en_US&tzone="

        payload = f'{{"modKeywords":[],"categories":[],"contracts":["{ib_contracts}"],"content_type":[],"contract_filter_type":[]}}'
        headers = headers

        response = requests.request("POST", url, headers=headers, data=payload)

        print_curl_command(response.request)

        ib_news_raw = response.json()['results']
        # print("ib_news_raw", ib_news_raw)
        ib_news_raw = [n for n in ib_news_raw if n['headLineContent'].strip()]
        ib_news = []
        for news in ib_news_raw:
            ib_news.append({
                'id': news.get('newsId'),
                'title': news.get('headLineContent'),
                'date': datetime.datetime.fromtimestamp(news.get('time') / 1000),
                'category': None,
                'tickers': [news.get('main_conid')],
                'sentiment': news.get('sentiment'),
                'source': 'ib_news'
            })
        print("Data fetched successfully from Interactive Brokers API.")
        return ib_news
    except Exception as e:
        print(f"An error occurred while fetching data from Interactive Brokers API : {e}")
        return []


# # Google News 
class DateTimeEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, datetime.datetime):
            return o.isoformat()
        return super(DateTimeEncoder, self).default(o)



def fetch_google_news(ticker='AAPL'):
    try:
        print("Fetching data from Google News...")

        # Get the current date and the date a week ago
        end_date = datetime.datetime.now()
        start_date = end_date - datetime.timedelta(days=7)
        formatted_start_date = start_date.strftime("%m/%d/%Y")
        formatted_end_date = end_date.strftime("%m/%d/%Y")

        # Create a GoogleNews object with the current date as the start and end date
        google_news_raw = GoogleNews(start=formatted_start_date, end=formatted_end_date)

        # Search for news related to the ticker and the ticker stock
        google_news_raw.search(f'{ticker}')
        google_news_results = google_news_raw.result()
        google_news_raw.search(f'{ticker} stock')
        google_news_results += google_news_raw.result()

        print("google_news_results", google_news_results)

        # Process the results
        google_news = []
        for news in google_news_results:
            if news.get('title').strip():  # Exclude news with empty title
                google_news.append({
                    'id': None,
                    'title': news.get('title'),
                    'date': news.get('datetime'),  # Use the date from the news article
                    'brief': None,
                    'category': None,
                    'tickers': None,
                    'sentiment': None,
                    'source': 'google_news_results_dict'
                })

        print("Data fetched successfully from Google News.")
        return google_news

    except Exception as e:
        print(f"An error occurred while fetching data from Google News : {e}")
        return []



def print_news_headlines(degiro_news, stocknews_news, tickertick_news, yahoo_news, ib_news,  google_news):
    try:
        print("Printing news headlines...")

        # Debug
        # print("IB news:", ib_news)

        for n in degiro_news: 
            print("Degiro",  n['title'])
        for n in stocknews_news: 
            print("Stocknews",  n['title']) 
        for n in tickertick_news:
            print("TickerTick",  n['title'])
        for n in yahoo_news:
            print("Yahoo",  n['title'])
        for n in ib_news:
            print("IB",  n['title'])   
        for n in google_news:
            print("Google",  n['title'])
        print("News headlines printed successfully.")
    except Exception as e:
        print(f"An error occurred while printing news headlines: {e}")

def main(ticker='AAPL'):
    degiro_news = fetch_degiro_news(ticker)
    stocknews_news = fetch_stocknews_news(ticker)
    tickertick_news = fetch_tickertick_news(ticker)
    yahoo_news = fetch_yahoo_news(ticker)
    ib_news = fetch_ib_news(ticker)
    google_news = fetch_google_news(ticker)
    print_news_headlines(degiro_news, stocknews_news, tickertick_news, yahoo_news, ib_news, google_news)


if __name__ == "__main__":
    main()



# from stocksight import News  
# from googlenews import GoogleNews


# # Stocksight (not working currently)
# try:
#     print("Fetching data from Stocksight...")
#     news = News('AAPL')
#     print("Data fetched successfully from Stocksight.")
# except Exception as e:
#     print(f"An error occurred while fetching data from Stocksight : {e}")  