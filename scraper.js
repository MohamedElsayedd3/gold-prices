const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function scrapePrices() {
    console.log('Starting Scraper (Safe & Robust Mode)...');
    
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    const currenciesToFetch = ['USD', 'EUR', 'GBP', 'SAR', 'AED', 'KWD', 'QAR', 'JOD', 'BHD', 'OMR', 'TRY', 'CAD'];
    const currencyRates = {};

    try {
        // 1. Fetch currencies with safety checks
        for (var i = 0; i < currenciesToFetch.length; i++) {
            var symbol = currenciesToFetch[i];
            try {
                await page.goto('https://www.google.com/finance/quote/' + symbol + '-EGP', { waitUntil: 'domcontentloaded', timeout: 20000 });
                const rate = await page.evaluate(function() {
                    var el = document.querySelector('[data-last-price]');
                    if (el && el.getAttribute('data-last-price')) {
                        return parseFloat(el.getAttribute('data-last-price'));
                    }
                    return null;
                });
                if (rate) currencyRates[symbol] = rate;
            } catch (e) { }
        }

        var currentUSDToEGP = currencyRates['USD'] || 52.0;

        // 2. Scraping with null-safety
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
                        var pEl = el.parentElement.querySelector('.number-font');
                        if (pEl) data.goldPound = cleanNum(pEl.innerText).toString();
                    }
                    if ((txt.includes('الأوقية') || txt.includes('أونصة')) && data.ounceUSD === 0) {
                        var pEl = el.parentElement.querySelector('.number-font');
                        if (pEl) {
                            var val = parseFloat(pEl.innerText.replace(/[^0-9.]/g, ''));
                            if (val > 1000) data.ounceUSD = val;
                        }
                    }
                }
            }

            var items = document.querySelectorAll('.price-item');
            items.forEach(function(item) {
                if (item && item.innerText) {
                    var t = item.innerText;
                    var nums = item.querySelectorAll('.number-font');
                    if (nums && nums.length >= 1) {
                        var s = cleanNum(nums[0].innerText);
                        if (t.includes('عيار 24')) data.gold['24'] = { sell: s.toString(), buy: (s-20).toString() };
                        else if (t.includes('عيار 21')) data.gold['21'] = { sell: s.toString(), buy: (s-15).toString() };
                        else if (t.includes('عيار 18')) data.gold['18'] = { sell: s.toString(), buy: (s-10).toString() };
                        else if (t.includes('عيار 14')) data.gold['14'] = { sell: s.toString(), buy: (s-10).toString() };
                    }
                }
            });
            return data;
        });

        // 3. Calculation Logic
        var finalOunceEGP = "0";
        if (scrapedData.ounceUSD > 0) finalOunceEGP = Math.round(scrapedData.ounceUSD * currentUSDToEGP).toString();
        else if (scrapedData.gold['24']) finalOunceEGP = Math.round(parseInt(scrapedData.gold['24'].sell) * 31.1035).toString();

        var finalPoundEGP = scrapedData.goldPound;
        if (finalPoundEGP === "0" && scrapedData.gold['21']) finalPoundEGP = (parseInt(scrapedData.gold['21'].sell) * 8).toString();

        const finalOutput = {
            gold: scrapedData.gold,
            goldPound: { price: finalPoundEGP },
            goldOunce: { price: finalOunceEGP },
            currencyRates: currencyRates,
            lastUpdate: new Date().toISOString()
        };

        fs.writeFileSync(path.join(__dirname, 'prices.json'), JSON.stringify(finalOutput, null, 4));
        console.log('Update Successful (Robust Fix)!');

    } catch (error) {
        console.error('Fatal Error:', error);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

scrapePrices();
