const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function scrapePrices() {
    console.log('Starting Scraper (Ounce Selection Fix Mode)...');
    
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    const currenciesToFetch = ['USD', 'EUR', 'GBP', 'SAR', 'AED', 'KWD', 'QAR', 'JOD', 'BHD', 'OMR', 'TRY', 'CAD'];
    const currencyRates = {};

    try {
        // 1. Fetch Currency Rates from Google
        for (var i = 0; i < currenciesToFetch.length; i++) {
            var symbol = currenciesToFetch[i];
            try {
                await page.goto('https://www.google.com/finance/quote/' + symbol + '-EGP', { waitUntil: 'domcontentloaded', timeout: 20000 });
                const rate = await page.evaluate(function() {
                    var el = document.querySelector('[data-last-price]');
                    return el ? parseFloat(el.getAttribute('data-last-price')) : null;
                });
                if (rate) currencyRates[symbol] = rate;
            } catch (e) { }
        }

        // 2. Fetch Gold Prices & Ounce from eDahab
        console.log('Fetching gold data...');
        await page.goto('https://edahabapp.com/', { waitUntil: 'networkidle2', timeout: 60000 });
        const scrapedData = await page.evaluate(function() {
            var data = { gold: {}, ounceUSD: 0 };
            function cleanNum(txt) {
                var num = parseInt(txt.replace(/[^0-9]/g, ''));
                if (isNaN(num)) return 0;
                return Math.round(num / 5) * 5;
            }

            var items = document.querySelectorAll('.price-item');
            for (var j = 0; j < items.length; j++) {
                var item = items[j];
                var text = item.innerText;
                var nums = item.querySelectorAll('.number-font');
                if (nums.length >= 1) {
                    var sell = cleanNum(nums[0].innerText).toString();
                    var buy = (nums[1] ? cleanNum(nums[1].innerText) : cleanNum(nums[0].innerText) - 20).toString();
                    if (text.includes('عيار 24')) data.gold['24'] = { sell: sell, buy: buy };
                    else if (text.includes('عيار 21')) data.gold['21'] = { sell: sell, buy: buy };
                    else if (text.includes('عيار 18')) data.gold['18'] = { sell: sell, buy: buy };
                    else if (text.includes('عيار 14')) data.gold['14'] = { sell: sell, buy: buy };
                }
            }

            // Precise Ounce Extraction: Ignore '1' and find the actual price > 1000
            var allElements = document.querySelectorAll('div, span, p');
            for (var k = 0; k < allElements.length; k++) {
                var el = allElements[k];
                var txt = el.innerText;
                if (txt.includes('الأوقية') || txt.includes('أونصة')) {
                    var matches = txt.match(/\d+(\.\d+)?/g);
                    if (matches) {
                        for (var m = 0; m < matches.length; m++) {
                            var val = parseFloat(matches[m]);
                            if (val > 1000) { 
                                data.ounceUSD = val;
                                break;
                            }
                        }
                    }
                    if (data.ounceUSD > 0) break;
                }
            }
            return data;
        });

        // 3. Final Output Generation
        var usdRate = currencyRates['USD'] || 50;
        var finalOunceEGP = "0";
        if (scrapedData.ounceUSD > 0) {
            finalOunceEGP = Math.round(scrapedData.ounceUSD * usdRate).toString();
        } else if (scrapedData.gold['24']) {
            finalOunceEGP = Math.round(parseInt(scrapedData.gold['24'].sell) * 31.1035).toString();
        }

        const finalOutput = {
            gold: scrapedData.gold,
            goldPound: scrapedData.gold['21'] ? (parseInt(scrapedData.gold['21'].sell) * 8).toString() : "0",
            goldOunce: { price: finalOunceEGP },
            currencyRates: currencyRates,
            lastUpdate: new Date().toISOString()
        };

        fs.writeFileSync(path.join(__dirname, 'prices.json'), JSON.stringify(finalOutput, null, 4));
        console.log('Update Successful (Ounce extraction logic improved)!');

    } catch (error) {
        console.error('Fatal Error:', error);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

scrapePrices();
