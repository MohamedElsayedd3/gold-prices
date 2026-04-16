const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function scrapePrices() {
    console.log('Restoring Stable Scraper Logic...');
    
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    const currenciesToFetch = ['USD', 'EUR', 'GBP', 'SAR', 'AED', 'KWD', 'QAR', 'JOD', 'BHD', 'OMR', 'TRY', 'CAD'];
    const currencyRates = {};

    try {
        // 1. Currency from Google Finance (Working)
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

        // 2. Gold from eDahab (Simple Price-Item Method)
        console.log('Fetching gold prices from eDahab...');
        await page.goto('https://edahabapp.com/', { waitUntil: 'networkidle2', timeout: 60000 });
        const goldData = await page.evaluate(function() {
            var data = { gold: {}, goldPound: { price: "0" } };
            function cleanNum(txt) {
                var num = parseInt(txt.replace(/[^0-9]/g, ''));
                return isNaN(num) ? 0 : num;
            }

            var items = document.querySelectorAll('.price-item');
            items.forEach(function(item) {
                var t = item.innerText;
                var nums = item.querySelectorAll('.number-font');
                if (nums.length >= 1) {
                    var sell = cleanNum(nums[0].innerText).toString();
                    if (t.includes('24') && !t.includes('2024')) data.gold['24'] = { sell: sell, buy: (parseInt(sell)-20).toString() };
                    else if (t.includes('21')) data.gold['21'] = { sell: sell, buy: (parseInt(sell)-15).toString() };
                    else if (t.includes('18')) data.gold['18'] = { sell: sell, buy: (parseInt(sell)-10).toString() };
                    else if (t.includes('14')) data.gold['14'] = { sell: sell, buy: (parseInt(sell)-10).toString() };
                }
            });

            // Direct Pound scraping (Refined)
            var all = document.querySelectorAll('div, span, p');
            for (var k = 0; k < all.length; k++) {
                if (all[k].innerText.includes('الجنيه الذهب')) {
                    var pEl = all[k].parentElement.querySelector('.number-font');
                    if (pEl) data.goldPound.price = cleanNum(pEl.innerText).toString();
                }
            }
            return data;
        });

        // 3. Finalization
        if (goldData.goldPound.price === "0" && goldData.gold['21']) {
            goldData.goldPound.price = (parseInt(goldData.gold['21'].sell) * 8).toString();
        }
        
        var ouncePrice = "0";
        if (goldData.gold['24']) {
            ouncePrice = Math.round(parseInt(goldData.gold['24'].sell) * 31.1035).toString();
        }

        const finalOutput = {
            gold: goldData.gold,
            goldPound: goldData.goldPound,
            goldOunce: { price: ouncePrice },
            currencyRates: currencyRates,
            lastUpdate: new Date().toISOString()
        };

        fs.writeFileSync(path.join(__dirname, 'prices.json'), JSON.stringify(finalOutput, null, 4));
        console.log('Update Successful (Reverted to stable version)!');

    } catch (error) {
        console.error('Fatal Error:', error);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

scrapePrices();
