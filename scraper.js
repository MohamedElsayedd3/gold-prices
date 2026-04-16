const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function scrapePrices() {
    console.log('Starting Stable Scraper (Currencies: Google Finance, Gold: eDahab)...');
    
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    const currenciesToFetch = ['USD', 'EUR', 'GBP', 'SAR', 'AED', 'KWD', 'QAR', 'JOD', 'BHD', 'OMR', 'TRY', 'CAD'];
    const currencyRates = {};
    let globalOunceUSD = 0;

    try {
        // 1. Fetch Currency Rates + Global Gold Ounce USD from Google Finance
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

        try {
            await page.goto('https://www.google.com/finance/quote/XAU-USD', { waitUntil: 'domcontentloaded' });
            globalOunceUSD = await page.evaluate(function() {
                var el = document.querySelector('[data-last-price]');
                return el ? parseFloat(el.getAttribute('data-last-price')) : null;
            });
        } catch (e) { }

        // 2. Fetch Gold Prices from eDahab (Standard price-item method)
        console.log('Fetching gold prices from eDahab...');
        await page.goto('https://edahabapp.com/', { waitUntil: 'networkidle2', timeout: 60000 });
        const goldData = await page.evaluate(function() {
            var data = { gold: {} };
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
                    
                    if (text.indexOf('24') !== -1) data.gold['24'] = { sell: sell, buy: buy };
                    else if (text.indexOf('21') !== -1) data.gold['21'] = { sell: sell, buy: buy };
                    else if (text.indexOf('18') !== -1) data.gold['18'] = { sell: sell, buy: buy };
                    else if (text.indexOf('14') !== -1) data.gold['14'] = { sell: sell, buy: buy };
                }
            }
            return data;
        });

        // 3. Final Logical Calculations
        var usdRate = currencyRates['USD'] || 50;
        
        // Ounce = Global USD * Google USD rate
        if (globalOunceUSD > 0) {
            goldData.goldOunce = { price: Math.round(globalOunceUSD * usdRate).toString() };
        } else if (goldData.gold['24']) {
            goldData.goldOunce = { price: Math.round(parseInt(goldData.gold['24'].sell) * 31.1035).toString() };
        }

        // Pound = 21K * 8
        if (goldData.gold['21']) {
            goldData.goldPound = { price: (parseInt(goldData.gold['21'].sell) * 8).toString() };
        }

        const finalOutput = {
            gold: goldData.gold,
            goldPound: goldData.goldPound,
            goldOunce: goldData.goldOunce,
            currencyRates: currencyRates,
            lastUpdate: new Date().toISOString()
        };

        fs.writeFileSync(path.join(__dirname, 'prices.json'), JSON.stringify(finalOutput, null, 4));
        console.log('Update Successful (Reverted to Stable Logic)!');

    } catch (error) {
        console.error('Fatal Error:', error);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

scrapePrices();
