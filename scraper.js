const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function scrapePrices() {
    console.log('Starting Robust Scraper (Gold & Precise Ounce Logic)...');
    
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
                console.log('Fetching ' + symbol + '-EGP...');
                await page.goto('https://www.google.com/finance/quote/' + symbol + '-EGP', { waitUntil: 'domcontentloaded', timeout: 30000 });
                const rate = await page.evaluate(function() {
                    var el = document.querySelector('[data-last-price]');
                    return el ? parseFloat(el.getAttribute('data-last-price')) : null;
                });
                if (rate) currencyRates[symbol] = rate;
            } catch (e) { console.warn('Err fetching ' + symbol); }
        }

        // Fetch Global Gold Ounce (XAU-USD)
        try {
            console.log('Fetching Global Ounce (XAU-USD)...');
            await page.goto('https://www.google.com/finance/quote/XAU-USD', { waitUntil: 'domcontentloaded' });
            globalOunceUSD = await page.evaluate(function() {
                var el = document.querySelector('[data-last-price]');
                return el ? parseFloat(el.getAttribute('data-last-price')) : null;
            });
        } catch (e) { console.warn('Err fetching XAU-USD'); }

        // 2. Fetch Gold Prices from eDahab (Special focus on Karat 14)
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
                    var sell = cleanNum(nums[0].innerText);
                    var buy = nums[1] ? cleanNum(nums[1].innerText) : (sell - 20);
                    
                    if (text.indexOf('24') !== -1) data.gold['24'] = { sell: sell.toString(), buy: buy.toString() };
                    else if (text.indexOf('21') !== -1) data.gold['21'] = { sell: sell.toString(), buy: buy.toString() };
                    else if (text.indexOf('18') !== -1) data.gold['18'] = { sell: sell.toString(), buy: buy.toString() };
                    else if (text.indexOf('14') !== -1) data.gold['14'] = { sell: sell.toString(), buy: buy.toString() };
                }
            }
            return data;
        });

        // 3. Final Calculations
        var currentUSDToEGP = currencyRates['USD'] || 50;
        
        // Gold Ounce = (Global USD Price from Google) * (USD/EGP Rate from Google)
        if (globalOunceUSD > 0) {
            goldData.goldOunce = { price: Math.round(globalOunceUSD * currentUSDToEGP).toString() };
        } else if (goldData.gold['24']) {
            goldData.goldOunce = { price: Math.round(parseInt(goldData.gold['24'].sell) * 31.1035).toString() };
        }
// Gold Pound = 8g of 21K
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
        console.log('Update Successful (Precise Google-based Logic)!');

    } catch (error) {
        console.error('Fatal Error:', error);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

scrapePrices();