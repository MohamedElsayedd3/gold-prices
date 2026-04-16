const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function scrapePrices() {
    console.log('Starting Scraper (Final Precision Match Mode)...');
    
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    const currenciesToFetch = ['USD', 'EUR', 'GBP', 'SAR', 'AED', 'KWD', 'QAR', 'JOD', 'BHD', 'OMR', 'TRY', 'CAD'];
    const currencyRates = {};

    try {
        // 1. Fetch Precise Currencies from Google Finance
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

        var currentUSDToEGP = currencyRates['USD'] || 52.0;

        // 2. Fetch Gold Data from eDahab (Direct Scraping for Pound & Ounce USD)
        console.log('Fetching gold from eDahab...');
        await page.goto('https://edahabapp.com/', { waitUntil: 'networkidle2', timeout: 60000 });
        const scrapedData = await page.evaluate(function() {
            var data = { gold: {}, goldPound: "0", ounceUSD: 0 };
            
            function cleanNum(txt) {
                var num = parseInt(txt.replace(/[^0-9]/g, ''));
                return isNaN(num) ? 0 : num;
            }

            var tags = document.querySelectorAll('div, span, p');
            for (var k = 0; k < tags.length; k++) {
                var el = tags[k];
                if (el && el.innerText) {
                    var txt = el.innerText.trim();
                    if (txt.includes('الجنيه الذهب') && data.goldPound === "0") {
                        var pEl = el.parentElement.querySelector('.number-font') || el.querySelector('.number-font');
                        if (pEl) data.goldPound = cleanNum(pEl.innerText).toString();
                    }
                    if ((txt.includes('الأوقية') || txt.includes('أونصة')) && data.ounceUSD === 0) {
                        var pEl = el.parentElement.querySelector('.number-font') || el.querySelector('.number-font');
                        if (pEl) {
                            var matches = pEl.innerText.match(/\d{4}(\.\d+)?/);
                            if (matches) data.ounceUSD = parseFloat(matches[0]);
                        }
                    }
                }
            }

            var items = document.querySelectorAll('.price-item');
            items.forEach(function(item) {
                var t = item.innerText;
                var nums = item.querySelectorAll('.number-font');
                if (nums && nums.length >= 1) {
                    var s = cleanNum(nums[0].innerText);
                    if (t.includes('24') && !t.includes('2024')) data.gold['24'] = { sell: s.toString(), buy: (s-20).toString() };
                    else if (t.includes('21')) data.gold['21'] = { sell: s.toString(), buy: (s-15).toString() };
                    else if (t.includes('18')) data.gold['18'] = { sell: s.toString(), buy: (s-10).toString() };
                    else if (t.includes('14')) data.gold['14'] = { sell: s.toString(), buy: (s-10).toString() };
                }
            });
            return data;
        });

        // 3. Final Calculations
        var finalOunceEGP = "0";
        if (scrapedData.ounceUSD > 0) {
            finalOunceEGP = Math.round(scrapedData.ounceUSD * currentUSDToEGP).toString();
        } else if (scrapedData.gold['24']) {
            finalOunceEGP = Math.round(parseInt(scrapedData.gold['24'].sell) * 31.1035).toString();
        }

        const finalOutput = {
            gold: scrapedData.gold,
            goldPound: { price: scrapedData.goldPound },
            goldOunce: { price: finalOunceEGP },
            currencyRates: currencyRates,
            lastUpdate: new Date().toISOString()
        };

        fs.writeFileSync(path.join(__dirname, 'prices.json'), JSON.stringify(finalOutput, null, 4));
        console.log('Update Successful (Pound: ' + scrapedData.goldPound + ', Ounce: ' + finalOunceEGP + ')');

    } catch (error) { console.error(error); process.exit(1); }
    finally { await browser.close(); }
}
scrapePrices();
